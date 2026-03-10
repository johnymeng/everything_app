import dotenv from "dotenv";

dotenv.config();

function parseList(input: string | undefined, fallback: string[]): string[] {
  if (!input) {
    return fallback;
  }

  return input
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseBoolean(input: string | undefined, fallback: boolean): boolean {
  if (!input) {
    return fallback;
  }

  const normalized = input.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

export const config = {
  port: Number.parseInt(process.env.PORT ?? "4000", 10),
  appName: process.env.APP_NAME ?? "Finance Tracker",
  dataFile: process.env.DATA_FILE ?? "data/store.json",
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  databaseUrl: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/finance_tracker",
  llm: {
    // OpenAI-compatible chat endpoint settings.
    // Prefer LLM_* env vars; fall back to OPENAI_API_KEY for convenience.
    apiKey: process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
    baseUrl: process.env.LLM_BASE_URL ?? "https://api.openai.com/v1",
    model: process.env.LLM_MODEL ?? "gpt-4o-mini",
    timeoutMs: Number.parseInt(process.env.LLM_TIMEOUT_MS ?? "20000", 10)
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? "dev-jwt-secret",
    expiresIn: process.env.JWT_EXPIRES_IN ?? "12h"
  },
  encryption: {
    key: process.env.APP_ENCRYPTION_KEY ?? "dev-encryption-key-change-me"
  },
  integrations: {
    eqBankMode: process.env.EQ_BANK_MODE ?? "disabled",
    wealthsimpleMode: process.env.WEALTHSIMPLE_MODE ?? "disabled",
    tdMode: process.env.TD_MODE ?? "disabled",
    amexMode: process.env.AMEX_MODE ?? "disabled"
  },
  quotes: {
    // Free, keyless quote providers are inherently less reliable than paid APIs.
    provider: process.env.QUOTE_PROVIDER ?? "yahoo",
    defaultSuffix: process.env.QUOTE_DEFAULT_SUFFIX ?? ".TO",
    cdrSuffix: process.env.QUOTE_CDR_SUFFIX ?? ".NE",
    timeoutMs: Number.parseInt(process.env.QUOTE_TIMEOUT_MS ?? "8000", 10),
    maxConcurrency: Number.parseInt(process.env.QUOTE_MAX_CONCURRENCY ?? "6", 10)
  },
  jobs: {
    // Runs best for single-user/self-host. Keep disabled by default.
    autoSyncIntervalMinutes: Number.parseInt(process.env.AUTO_SYNC_INTERVAL_MINUTES ?? "0", 10)
  },
  eqBank: {
    baseUrl: process.env.EQ_BANK_API_BASE_URL ?? "https://mobile-api.eqbank.ca/mobile/v1.1/",
    authorization:
      process.env.EQ_BANK_API_AUTHORIZATION ??
      "Basic NjdjZjI5Yjc3MmIwNGI3NGFiYTcxYmViOGQzOTljMjQ6N2VBMDUzNjczMjdjNDU2M0IwQzRiYkQ5MDkzQkFBZjU=",
    clientOS: process.env.EQ_BANK_CLIENT_OS ?? "android",
    clientVersion: process.env.EQ_BANK_CLIENT_VERSION ?? "2.3.34",
    trustDevice: parseBoolean(process.env.EQ_BANK_TRUST_DEVICE, true)
  },
  plaid: {
    clientId: process.env.PLAID_CLIENT_ID ?? "",
    secret: process.env.PLAID_SECRET ?? "",
    env: process.env.PLAID_ENV ?? "sandbox",
    countryCodes: parseList(process.env.PLAID_COUNTRY_CODES, ["CA", "US"]),
    redirectUri: process.env.PLAID_REDIRECT_URI
  },
  snaptrade: {
    clientId: process.env.SNAPTRADE_CLIENT_ID ?? "",
    consumerKey: process.env.SNAPTRADE_CONSUMER_KEY ?? "",
    baseUrl: process.env.SNAPTRADE_BASE_URL ?? "https://api.snaptrade.com/api/v1"
  }
};
