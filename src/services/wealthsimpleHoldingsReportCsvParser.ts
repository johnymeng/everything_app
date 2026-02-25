import crypto from "node:crypto";
import { config } from "../config";

export interface WealthsimpleHoldingPosition {
  symbol: string;
  name?: string;
  quantity: number;
  quoteSymbol?: string;
  unitPrice?: number;
  costBasis?: number;
}

export interface WealthsimpleHoldingsReportAccount {
  externalId: string;
  name: string;
  currency: string;
  cash: number;
  holdings: WealthsimpleHoldingPosition[];
}

export interface WealthsimpleHoldingsReportParseResult {
  accounts: WealthsimpleHoldingsReportAccount[];
  asOf?: string;
  rowsRead: number;
  rowsParsed: number;
  rowsSkipped: number;
  detectedColumns?: {
    headers: string[];
    indices: Record<string, number>;
  };
  costBasisStats?: {
    holdingsTotal: number;
    holdingsWithCostBasis: number;
    sourceCounts: Record<string, number>;
    sample: Array<{
      symbol: string;
      quantity: number;
      marketPrice: number | null;
      marketValue: number | null;
      unrealized: number | null;
      bookValueCad: number | null;
      bookValueMarket: number | null;
      parsedCostBasis: number | null;
      derivedCostBasis: number | null;
      resolvedCostBasis: number | null;
      source: string;
    }>;
  };
}

function detectDelimiter(text: string): string {
  const sampleLine =
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? "";
  const commaCount = (sampleLine.match(/,/g) ?? []).length;
  const semicolonCount = (sampleLine.match(/;/g) ?? []).length;
  const tabCount = (sampleLine.match(/\t/g) ?? []).length;

  if (semicolonCount > commaCount && semicolonCount >= tabCount) {
    return ";";
  }

  if (tabCount > commaCount && tabCount > semicolonCount) {
    return "\t";
  }

  return ",";
}

function normalizeHeaderKey(value: string): string {
  return value
    .replace(/\u00A0/g, " ")
    .replace(/\u200B/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parseCsvRows(rawCsv: string): string[][] {
  const delimiter = detectDelimiter(rawCsv);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < rawCsv.length; index += 1) {
    const char = rawCsv[index];

    if (char === "\"") {
      if (inQuotes && rawCsv[index + 1] === "\"") {
        field += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(field);
      field = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && rawCsv[index + 1] === "\n") {
        index += 1;
      }

      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows
    .map((parsedRow) => parsedRow.map((value) => value.trim()))
    .filter((parsedRow) => parsedRow.some((value) => value !== ""));
}

function sha(input: string): string {
  return crypto.createHash("sha1").update(input).digest("hex");
}

function stableAccountExternalId(accountNumber: string): string {
  // Avoid leaking raw account numbers in downstream storage/JSON.
  return `ws-${sha(accountNumber.trim()).slice(0, 18)}`;
}

function normalizeCurrency(value: string | undefined, fallback: string): string {
  const upper = (value ?? "").trim().toUpperCase();
  if (!upper) {
    return fallback;
  }

  return upper.length > 3 ? upper.slice(0, 3) : upper;
}

function parseNumber(raw: string | undefined): number | null {
  if (!raw) {
    return null;
  }

  let value = raw.trim();
  if (!value) {
    return null;
  }

  // Normalize negative values like "(123.45)".
  let isNegative = false;
  const parenMatch = value.match(/^\((.*)\)$/);
  if (parenMatch) {
    isNegative = true;
    value = parenMatch[1] ?? "";
  }

  // Remove thousands separators, currency symbols, and stray text, keeping digits, dot, and minus.
  value = value.replace(/,/g, "");
  value = value.replace(/[^\d.-]/g, "");

  // If multiple minus signs exist, keep only the leading one.
  if (value.includes("-")) {
    value = value.replace(/(?!^)-/g, "");
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (isNegative && parsed > 0) {
    return -parsed;
  }

  return parsed;
}

function pickTotalBookValue(params: {
  bookValue: number;
  quantity: number;
  derivedCostBasis: number | null;
  marketPrice: number | null;
}): number {
  const quantityAbs = Math.abs(Number(params.quantity));
  const bookValue = Number(params.bookValue);
  if (!Number.isFinite(quantityAbs) || quantityAbs <= 0 || !Number.isFinite(bookValue)) {
    return bookValue;
  }

  const totalCandidate = bookValue;
  const perUnitAsTotalCandidate = bookValue * quantityAbs;

  // If we can derive cost basis from market value - unrealized, choose whichever book value interpretation is closer.
  if (params.derivedCostBasis !== null && Number.isFinite(params.derivedCostBasis)) {
    const derived = Number(params.derivedCostBasis);
    const totalError = Math.abs(totalCandidate - derived);
    const perUnitError = Math.abs(perUnitAsTotalCandidate - derived);
    if (perUnitError < totalError * 0.45) {
      return perUnitAsTotalCandidate;
    }
    return totalCandidate;
  }

  // Heuristic: if a "book value" looks like a per-unit price, convert to total.
  const marketPrice = params.marketPrice;
  if (marketPrice !== null && Number.isFinite(marketPrice) && quantityAbs > 1.5) {
    const perUnitLike = Math.abs(totalCandidate - marketPrice) / Math.max(1, Math.abs(marketPrice)) < 0.25;
    if (perUnitLike) {
      return perUnitAsTotalCandidate;
    }
  }

  return totalCandidate;
}

function findHeaderIndex(indexByHeader: Map<string, number>, candidates: string[]): number {
  for (const candidate of candidates) {
    const found = indexByHeader.get(normalizeHeaderKey(candidate));
    if (typeof found === "number" && found >= 0) {
      return found;
    }
  }
  return -1;
}

function findHeaderIndexByPrefix(indexByHeader: Map<string, number>, prefixes: string[]): number {
  const normalizedPrefixes = prefixes.map((prefix) => normalizeHeaderKey(prefix)).filter(Boolean);
  if (normalizedPrefixes.length === 0) {
    return -1;
  }

  for (const [header, index] of indexByHeader.entries()) {
    if (typeof index !== "number" || index < 0) {
      continue;
    }

    const normalized = header.trim().toLowerCase();
    for (const prefix of normalizedPrefixes) {
      if (normalized.startsWith(prefix)) {
        return index;
      }
    }
  }

  return -1;
}

function appendSuffixIfMissing(symbol: string, suffix: string): string {
  const trimmed = symbol.trim();
  if (!trimmed) {
    return trimmed;
  }

  // Yahoo symbols like "BTC-CAD" already include a dash.
  if (trimmed.includes(".") || trimmed.includes("-")) {
    return trimmed;
  }

  const normalizedSuffix = suffix.trim();
  if (!normalizedSuffix) {
    return trimmed;
  }

  if (!normalizedSuffix.startsWith(".")) {
    return `${trimmed}.${normalizedSuffix}`;
  }

  return `${trimmed}${normalizedSuffix}`;
}

function buildYahooQuoteSymbol(params: {
  symbol: string;
  exchange: string;
  mic: string;
  securityType: string;
  name: string;
  priceCurrency: string;
}): string | undefined {
  const symbol = params.symbol.trim().toUpperCase();
  if (!symbol) {
    return undefined;
  }

  const securityType = params.securityType.trim().toUpperCase();
  const name = params.name.trim();
  const mic = params.mic.trim().toUpperCase();
  const exchange = params.exchange.trim().toUpperCase();
  const currency = params.priceCurrency.trim().toUpperCase();

  if (securityType === "CRYPTOCURRENCY") {
    const quoteCurrency = normalizeCurrency(currency, "CAD");
    return `${symbol}-${quoteCurrency}`;
  }

  // Wealthsimple CDRs are typically NEO listed and use the ".NE" suffix on Yahoo.
  if (/\bcdr\b/i.test(name)) {
    return appendSuffixIfMissing(symbol, config.quotes.cdrSuffix);
  }

  // NEO exchange MIC codes: NEOE (NEO), XNEO.
  if (mic === "NEOE" || mic === "XNEO" || exchange.includes("NEO") || exchange.includes("CBOE")) {
    return appendSuffixIfMissing(symbol, config.quotes.cdrSuffix);
  }

  // Default: TSX / Canadian listings.
  return appendSuffixIfMissing(symbol, config.quotes.defaultSuffix);
}

function isHoldingsReportHeader(headers: string[]): boolean {
  const normalized = headers.map((value) => normalizeHeaderKey(value));
  return (
    normalized.includes("account name") &&
    normalized.includes("account number") &&
    normalized.includes("symbol") &&
    normalized.includes("quantity") &&
    normalized.includes("market price")
  );
}

export function parseWealthsimpleHoldingsReportCsv(csvTextRaw: string): WealthsimpleHoldingsReportParseResult {
  const csvText = csvTextRaw.replace(/^\uFEFF/, "");
  const rows = parseCsvRows(csvText);

  if (rows.length < 2) {
    throw new Error("Holdings report CSV must include headers plus at least one row.");
  }

  const headers = rows[0];
  if (!isHoldingsReportHeader(headers)) {
    throw new Error("CSV does not look like a Wealthsimple holdings report export.");
  }

  const indexByHeader = new Map(headers.map((header, index) => [normalizeHeaderKey(header), index]));
  const idx = {
    accountName: indexByHeader.get("account name") ?? -1,
    accountNumber: indexByHeader.get("account number") ?? -1,
    symbol: indexByHeader.get("symbol") ?? -1,
    exchange: indexByHeader.get("exchange") ?? -1,
    mic: indexByHeader.get("mic") ?? -1,
    name: indexByHeader.get("name") ?? -1,
    securityType: indexByHeader.get("security type") ?? -1,
    quantity: indexByHeader.get("quantity") ?? -1,
    positionDirection: indexByHeader.get("position direction") ?? -1,
    marketPrice: indexByHeader.get("market price") ?? -1,
    marketPriceCurrency: indexByHeader.get("market price currency") ?? -1,
    marketValue: indexByHeader.get("market value") ?? -1,
    marketUnrealizedReturns: indexByHeader.get("market unrealized returns") ?? -1,
    costBasis: findHeaderIndex(indexByHeader, [
      "cost basis",
      "book cost",
      "adjusted cost base",
      "acb"
    ]),
    bookValueMarket: findHeaderIndex(indexByHeader, ["book value (market)"]),
    bookValueCad: findHeaderIndex(indexByHeader, ["book value (cad)"]),
    // Back-compat: some exports have a single "Book Value" column.
    bookValueFallback: findHeaderIndexByPrefix(indexByHeader, ["book value"])
  };

  if (idx.accountName < 0 || idx.accountNumber < 0 || idx.symbol < 0 || idx.quantity < 0) {
    throw new Error("Holdings report CSV missing required columns.");
  }

  const accounts = new Map<string, WealthsimpleHoldingsReportAccount>();
  const rowCount = rows.length - 1;
  let parsedRows = 0;
  let skippedRows = 0;
  let asOf: string | undefined;
  let holdingsTotal = 0;
  let holdingsWithCostBasis = 0;
  const sourceCounts: Record<string, number> = {};
  const sample: Array<{
    symbol: string;
    quantity: number;
    marketPrice: number | null;
    marketValue: number | null;
    unrealized: number | null;
    bookValueCad: number | null;
    bookValueMarket: number | null;
    parsedCostBasis: number | null;
    derivedCostBasis: number | null;
    resolvedCostBasis: number | null;
    source: string;
  }> = [];

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];

    // Some exports append an "As of ..." footer row (single column). Ignore it.
    if (row.length === 1) {
      const footer = row[0] ?? "";
      const match = footer.match(/As of\s+(?<date>\d{4}-\d{2}-\d{2})/i);
      if (match?.groups?.date) {
        asOf = match.groups.date;
      }
      skippedRows += 1;
      continue;
    }

    const accountName = (row[idx.accountName] ?? "").trim();
    const accountNumber = (row[idx.accountNumber] ?? "").trim();
    const symbol = (row[idx.symbol] ?? "").trim().toUpperCase();
    const securityName = idx.name >= 0 ? (row[idx.name] ?? "").trim() : "";
    const securityType = idx.securityType >= 0 ? (row[idx.securityType] ?? "").trim() : "";
    const exchange = idx.exchange >= 0 ? (row[idx.exchange] ?? "").trim() : "";
    const mic = idx.mic >= 0 ? (row[idx.mic] ?? "").trim() : "";
    const priceCurrency = idx.marketPriceCurrency >= 0 ? (row[idx.marketPriceCurrency] ?? "").trim() : "CAD";

    const quantityRaw = parseNumber(row[idx.quantity]);
    if (!accountName || !accountNumber || !symbol || quantityRaw === null) {
      skippedRows += 1;
      continue;
    }

    const direction = idx.positionDirection >= 0 ? (row[idx.positionDirection] ?? "").trim().toUpperCase() : "LONG";
    const quantity = direction === "SHORT" ? -Math.abs(quantityRaw) : quantityRaw;

    if (quantity === 0) {
      skippedRows += 1;
      continue;
    }

    const marketPrice = idx.marketPrice >= 0 ? parseNumber(row[idx.marketPrice]) : null;
    const parsedCostBasis = idx.costBasis >= 0 ? parseNumber(row[idx.costBasis]) : null;
    const bookValueMarket = idx.bookValueMarket >= 0 ? parseNumber(row[idx.bookValueMarket]) : null;
    const bookValueCad = idx.bookValueCad >= 0 ? parseNumber(row[idx.bookValueCad]) : null;
    const fallbackBookValue =
      idx.bookValueFallback >= 0 && !normalizeHeaderKey(String(headers[idx.bookValueFallback] ?? "")).includes("currency")
        ? parseNumber(row[idx.bookValueFallback])
        : null;

    const marketValue = idx.marketValue >= 0 ? parseNumber(row[idx.marketValue]) : null;
    const unrealized = idx.marketUnrealizedReturns >= 0 ? parseNumber(row[idx.marketUnrealizedReturns]) : null;

    const derivedCostBasis = marketValue !== null && unrealized !== null ? marketValue - unrealized : null;
    let costBasis: number | null = null;
    let costBasisSource = "missing";

    if (bookValueMarket !== null) {
      costBasis = pickTotalBookValue({ bookValue: bookValueMarket, quantity, derivedCostBasis, marketPrice });
      costBasisSource = "book_value_market";
    } else if (bookValueCad !== null) {
      costBasis = pickTotalBookValue({ bookValue: bookValueCad, quantity, derivedCostBasis, marketPrice });
      costBasisSource = "book_value_cad";
    } else if (fallbackBookValue !== null) {
      costBasis = pickTotalBookValue({ bookValue: fallbackBookValue, quantity, derivedCostBasis, marketPrice });
      costBasisSource = "book_value_fallback";
    } else if (derivedCostBasis !== null) {
      costBasis = derivedCostBasis;
      costBasisSource = "derived_market_minus_unrealized";
    } else if (parsedCostBasis !== null) {
      costBasis = parsedCostBasis;
      costBasisSource = "cost_basis_column";
    }

    const accountExternalId = stableAccountExternalId(accountNumber);
    const account = accounts.get(accountExternalId) ?? {
      externalId: accountExternalId,
      name: accountName,
      currency: "CAD",
      cash: 0,
      holdings: []
    };

    account.name = account.name || accountName;

    const quoteSymbol = buildYahooQuoteSymbol({
      symbol,
      exchange,
      mic,
      securityType,
      name: securityName,
      priceCurrency
    });

    account.holdings.push({
      symbol,
      name: securityName || undefined,
      quantity: Number(quantity.toFixed(6)),
      quoteSymbol,
      unitPrice: marketPrice === null ? undefined : Number(marketPrice.toFixed(6)),
      costBasis: costBasis === null ? undefined : Number(costBasis.toFixed(2))
    });

    accounts.set(accountExternalId, account);
    parsedRows += 1;

    holdingsTotal += 1;
    if (costBasis !== null && Number.isFinite(costBasis) && costBasis !== 0) {
      holdingsWithCostBasis += 1;
    }
    sourceCounts[costBasisSource] = (sourceCounts[costBasisSource] ?? 0) + 1;

    if (sample.length < 6) {
      sample.push({
        symbol,
        quantity,
        marketPrice,
        marketValue,
        unrealized,
        bookValueCad,
        bookValueMarket,
        parsedCostBasis,
        derivedCostBasis,
        resolvedCostBasis: costBasis,
        source: costBasisSource
      });
    }
  }

  // De-dupe holdings by symbol within each account by summing quantities (rare but safer).
  const normalizedAccounts = Array.from(accounts.values()).map((account) => {
    const bySymbol = new Map<string, WealthsimpleHoldingPosition>();
    for (const holding of account.holdings) {
      const existing = bySymbol.get(holding.symbol);
      if (!existing) {
        bySymbol.set(holding.symbol, { ...holding });
        continue;
      }

      existing.quantity = Number((existing.quantity + holding.quantity).toFixed(6));
      existing.name = existing.name ?? holding.name;
      existing.quoteSymbol = existing.quoteSymbol ?? holding.quoteSymbol;
      existing.unitPrice = existing.unitPrice ?? holding.unitPrice;
      if (typeof holding.costBasis === "number" && Number.isFinite(holding.costBasis)) {
        existing.costBasis = Number(((existing.costBasis ?? 0) + holding.costBasis).toFixed(2));
      }
      bySymbol.set(holding.symbol, existing);
    }

    return {
      ...account,
      holdings: Array.from(bySymbol.values()).filter((holding) => holding.quantity !== 0)
    };
  });

  return {
    accounts: normalizedAccounts,
    asOf,
    rowsRead: rowCount,
    rowsParsed: parsedRows,
    rowsSkipped: skippedRows,
    detectedColumns: {
      headers,
      indices: Object.fromEntries(Object.entries(idx).map(([key, value]) => [key, typeof value === "number" ? value : -1]))
    },
    costBasisStats: {
      holdingsTotal,
      holdingsWithCostBasis,
      sourceCounts,
      sample
    }
  };
}

export function buildManualHoldingsPayloadFromHoldingsReportCsv(csvText: string): {
  accounts: Array<{ externalId: string; name: string; currency: string; cash: number; holdings: WealthsimpleHoldingPosition[] }>;
} {
  const parsed = parseWealthsimpleHoldingsReportCsv(csvText);
  return {
    accounts: parsed.accounts.map((account) => ({
      externalId: account.externalId,
      name: account.name,
      currency: account.currency,
      cash: account.cash,
      holdings: account.holdings
    }))
  };
}
