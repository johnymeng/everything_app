import path from "node:path";
import crypto from "node:crypto";
import { config } from "../config";

export interface WealthsimpleHoldingPosition {
  symbol: string;
  name?: string;
  quantity: number;
  quoteSymbol?: string;
}

export interface WealthsimpleAccountSnapshot {
  externalId: string;
  name: string;
  currency: "CAD";
  cash: number;
  holdings: WealthsimpleHoldingPosition[];
  asOfDate?: string;
}

export interface WealthsimpleCsvFileInput {
  csvText: string;
  fileName?: string;
  accountName?: string;
  accountExternalId?: string;
}

function parseNumber(raw: string | undefined): number | null {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
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

function inferAccountFromFileName(fileName: string): { name?: string; externalId?: string } {
  const base = path.basename(fileName);
  // Example: TFSA-monthly-statement-transactions-HQ4ZNKPK4CAD-2026-01-01.csv
  const match = base.match(/^(?<name>.+?)-monthly-statement-transactions-(?<id>[^-]+)-\d{4}-\d{2}-\d{2}\.csv$/i);
  if (!match?.groups) {
    return {};
  }

  const name = match.groups.name?.trim();
  const externalId = match.groups.id?.trim();
  return {
    name: name || undefined,
    externalId: externalId || undefined
  };
}

function stableExternalId(value: string): string {
  return `ws-${sha(value).slice(0, 18)}`;
}

function parseInstrumentFromDescription(description: string): { symbol: string; name?: string; isCdr: boolean } | null {
  const trimmed = description.trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/^(?<symbol>[A-Z0-9.\-]+)\s*-\s*(?<rest>.+)$/i);
  if (!match?.groups?.symbol) {
    return null;
  }

  const symbol = match.groups.symbol.trim().toUpperCase();
  const rest = match.groups.rest?.trim();
  const name = rest ? rest.split(":")[0]?.trim() : undefined;
  const isCdr = /\bcdr\b/i.test(trimmed);

  if (!symbol) {
    return null;
  }

  return { symbol, name, isCdr };
}

function parseTradeQuantity(description: string): { side: "BUY" | "SELL"; quantity: number } | null {
  const match = description.match(/\b(?<side>Bought|Sold)\s+(?<qty>\d+(?:\.\d+)?)\s+shares?\b/i);
  if (!match?.groups?.side || !match.groups.qty) {
    return null;
  }

  const side = match.groups.side.toLowerCase().startsWith("b") ? "BUY" : "SELL";
  const qty = Number.parseFloat(match.groups.qty);
  if (!Number.isFinite(qty) || qty <= 0) {
    return null;
  }

  return { side, quantity: qty };
}

export function buildWealthsimpleAccountSnapshotFromTransactionsCsv(input: WealthsimpleCsvFileInput): WealthsimpleAccountSnapshot {
  const csvText = input.csvText.replace(/^\uFEFF/, "");
  const rows = parseCsvRows(csvText);

  if (rows.length < 2) {
    throw new Error("Wealthsimple CSV must include headers plus at least one row.");
  }

  const headers = rows[0].map((value) => value.trim().toLowerCase());
  const indexByHeader = new Map(headers.map((header, index) => [header, index]));
  const dateIndex = indexByHeader.get("date") ?? -1;
  const transactionIndex = indexByHeader.get("transaction") ?? -1;
  const descriptionIndex = indexByHeader.get("description") ?? -1;
  const balanceIndex = indexByHeader.get("balance") ?? -1;
  const currencyIndex = indexByHeader.get("currency") ?? -1;

  if (dateIndex < 0 || transactionIndex < 0 || descriptionIndex < 0) {
    throw new Error("Wealthsimple CSV missing required columns (date, transaction, description).");
  }

  const inferred = input.fileName ? inferAccountFromFileName(input.fileName) : {};
  const accountName = (input.accountName ?? inferred.name ?? "Wealthsimple Account").trim();
  const externalIdSource = (input.accountExternalId ?? inferred.externalId ?? accountName).trim();
  const externalId = externalIdSource ? stableExternalId(externalIdSource) : stableExternalId("wealthsimple");

  const positions = new Map<string, WealthsimpleHoldingPosition>();
  const seen = new Set<string>();
  let cashBalance: number | null = null;
  let asOfDate: string | undefined;

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    const date = row[dateIndex]?.trim();
    const transaction = row[transactionIndex]?.trim().toUpperCase() ?? "";
    const description = row[descriptionIndex]?.trim() ?? "";
    const rowCurrency = currencyIndex >= 0 ? row[currencyIndex]?.trim().toUpperCase() ?? "" : "";

    if (date && (!asOfDate || date > asOfDate)) {
      asOfDate = date;
    }

    const signature = `${date}|${transaction}|${description}|${row.join("|")}`;
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);

    if (balanceIndex >= 0 && rowCurrency === "CAD") {
      const balance = parseNumber(row[balanceIndex]);
      if (balance !== null) {
        cashBalance = balance;
      }
    }

    if (transaction !== "BUY" && transaction !== "SELL") {
      continue;
    }

    const instrument = parseInstrumentFromDescription(description);
    const trade = parseTradeQuantity(description);
    if (!instrument || !trade) {
      continue;
    }

    const quantityDelta = trade.side === "BUY" ? trade.quantity : -trade.quantity;
    const existing = positions.get(instrument.symbol) ?? {
      symbol: instrument.symbol,
      name: instrument.name,
      quantity: 0,
      quoteSymbol: instrument.isCdr ? `${instrument.symbol}${config.quotes.cdrSuffix}` : undefined
    };

    existing.quantity = Number((existing.quantity + quantityDelta).toFixed(6));
    existing.name = existing.name ?? instrument.name;
    existing.quoteSymbol = existing.quoteSymbol ?? (instrument.isCdr ? `${instrument.symbol}${config.quotes.cdrSuffix}` : undefined);
    positions.set(instrument.symbol, existing);
  }

  const holdings = Array.from(positions.values()).filter((holding) => holding.quantity !== 0);

  return {
    externalId,
    name: accountName,
    currency: "CAD",
    cash: Number((cashBalance ?? 0).toFixed(2)),
    holdings,
    asOfDate
  };
}

export function buildManualHoldingsPayloadFromWealthsimpleCsvFiles(
  files: WealthsimpleCsvFileInput[]
): { accounts: Array<{ externalId: string; name: string; currency: string; cash: number; holdings: WealthsimpleHoldingPosition[] }> } {
  const byExternalId = new Map<string, WealthsimpleAccountSnapshot>();

  for (const file of files) {
    const snapshot = buildWealthsimpleAccountSnapshotFromTransactionsCsv(file);
    const existing = byExternalId.get(snapshot.externalId);

    if (!existing) {
      byExternalId.set(snapshot.externalId, snapshot);
      continue;
    }

    // Merge positions (sum quantities). Cash comes from the most recent file (by asOfDate).
    const mergedPositions = new Map<string, WealthsimpleHoldingPosition>();
    for (const holding of existing.holdings) {
      mergedPositions.set(holding.symbol, { ...holding });
    }
    for (const holding of snapshot.holdings) {
      const current = mergedPositions.get(holding.symbol);
      if (!current) {
        mergedPositions.set(holding.symbol, { ...holding });
        continue;
      }

      current.quantity = Number((current.quantity + holding.quantity).toFixed(6));
      current.name = current.name ?? holding.name;
      current.quoteSymbol = current.quoteSymbol ?? holding.quoteSymbol;
      mergedPositions.set(holding.symbol, current);
    }

    const pickCash = !existing.asOfDate || (snapshot.asOfDate && snapshot.asOfDate >= existing.asOfDate);

    byExternalId.set(snapshot.externalId, {
      ...existing,
      cash: pickCash ? snapshot.cash : existing.cash,
      asOfDate: pickCash ? snapshot.asOfDate : existing.asOfDate,
      holdings: Array.from(mergedPositions.values()).filter((holding) => holding.quantity !== 0)
    });
  }

  return {
    accounts: Array.from(byExternalId.values()).map((account) => ({
      externalId: account.externalId,
      name: account.name,
      currency: account.currency,
      cash: account.cash,
      holdings: account.holdings
    }))
  };
}

