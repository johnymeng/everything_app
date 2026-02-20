import { config } from "../config";

type QuoteProviderName = "stooq" | "yahoo" | "none";

function clampConcurrency(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  return Math.min(Math.floor(value), 20);
}

async function fetchText(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Helps avoid some bot-protection false positives.
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
      }
    });

    if (!response.ok) {
      throw new Error(`Quote request failed: ${response.status} ${response.statusText}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
      }
    });

    if (!response.ok) {
      throw new Error(`Quote request failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function parseSimpleCsvLine(line: string): string[] {
  // Stooq returns simple CSV without quoted commas; keep parsing minimal.
  return line.split(",").map((field) => field.trim());
}

function normalizeSuffixForStooq(suffix: string): string {
  const normalized = suffix.trim();
  if (!normalized) {
    return "";
  }

  return normalized.toLowerCase();
}

function normalizeSymbolForStooq(input: string, defaultSuffix: string): string {
  const raw = input.trim();
  if (!raw) {
    return raw;
  }

  // Stooq uses lowercase and TSX suffix ".to" (not ".TO").
  const lower = raw.toLowerCase();
  if (lower.includes(".")) {
    return lower;
  }

  const suffix = normalizeSuffixForStooq(defaultSuffix);
  if (!suffix) {
    return lower;
  }

  if (!suffix.startsWith(".")) {
    return `${lower}.${suffix}`;
  }

  return `${lower}${suffix}`;
}

async function fetchStooqLastPrice(symbol: string): Promise<number> {
  const defaultSuffix = config.quotes.defaultSuffix;
  const normalized = normalizeSymbolForStooq(symbol, defaultSuffix);
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(normalized)}&f=sd2t2ohlcv&h&e=csv`;
  const csv = await fetchText(url, config.quotes.timeoutMs);
  const lines = csv
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error(`Unexpected quote CSV for ${symbol}`);
  }

  const header = parseSimpleCsvLine(lines[0]);
  const row = parseSimpleCsvLine(lines[1]);

  const closeIndex = header.findIndex((field) => field.toLowerCase() === "close");
  if (closeIndex < 0 || closeIndex >= row.length) {
    throw new Error(`Quote CSV missing close for ${symbol}`);
  }

  const close = row[closeIndex];
  if (!close || close.toUpperCase() === "N/A") {
    throw new Error(`No quote available for ${symbol}`);
  }

  const price = Number.parseFloat(close);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`Invalid quote for ${symbol}`);
  }

  return price;
}

async function runWithConcurrency<TInput>(
  items: TInput[],
  concurrency: number,
  handler: (item: TInput) => Promise<void>
): Promise<void> {
  const limit = clampConcurrency(concurrency);
  let index = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const nextIndex = index;
      index += 1;
      if (nextIndex >= items.length) {
        return;
      }

      await handler(items[nextIndex]);
    }
  });

  await Promise.all(workers);
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

async function fetchYahooLastPrices(symbols: string[]): Promise<Map<string, number>> {
  const uniqueSymbols = Array.from(new Set(symbols.map((symbol) => symbol.trim()).filter(Boolean)));
  const prices = new Map<string, number>();

  if (uniqueSymbols.length === 0) {
    return prices;
  }

  // Yahoo supports comma-separated symbols in a single request.
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(uniqueSymbols.join(","))}`;
  const payload = await fetchJson(url, config.quotes.timeoutMs);
  const root = asObject(payload);
  const quoteResponse = root ? asObject(root.quoteResponse) : null;
  const result = quoteResponse && Array.isArray(quoteResponse.result) ? (quoteResponse.result as unknown[]) : [];

  const byUpper = new Map<string, number>();

  for (const item of result) {
    const quote = asObject(item);
    if (!quote) {
      continue;
    }

    const symbol = typeof quote.symbol === "string" ? quote.symbol : "";
    const price = quote.regularMarketPrice;

    if (!symbol || typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
      continue;
    }

    byUpper.set(symbol.toUpperCase(), price);
  }

  for (const requested of uniqueSymbols) {
    const matched = byUpper.get(requested.toUpperCase());
    if (matched !== undefined) {
      prices.set(requested, matched);
    }
  }

  return prices;
}

export async function fetchLastPrices(symbols: string[]): Promise<Map<string, number>> {
  const provider = (config.quotes.provider ?? "stooq").trim().toLowerCase() as QuoteProviderName;

  const uniqueSymbols = Array.from(new Set(symbols.map((symbol) => symbol.trim()).filter(Boolean)));

  const prices = new Map<string, number>();

  if (provider === "none") {
    return prices;
  }

  if (provider === "yahoo") {
    return await fetchYahooLastPrices(uniqueSymbols);
  }

  if (provider !== "stooq") {
    throw new Error(`Unsupported QUOTE_PROVIDER '${config.quotes.provider}'. Use 'stooq', 'yahoo', or 'none'.`);
  }

  await runWithConcurrency(uniqueSymbols, config.quotes.maxConcurrency, async (symbol) => {
    const price = await fetchStooqLastPrice(symbol);
    prices.set(symbol, price);
  });

  return prices;
}
