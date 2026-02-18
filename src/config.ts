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

export const config = {
  port: Number.parseInt(process.env.PORT ?? "4000", 10),
  appName: process.env.APP_NAME ?? "Finance Tracker",
  dataFile: process.env.DATA_FILE ?? "data/store.json",
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  databaseUrl: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/finance_tracker",
  jwt: {
    secret: process.env.JWT_SECRET ?? "dev-jwt-secret",
    expiresIn: process.env.JWT_EXPIRES_IN ?? "12h"
  },
  encryption: {
    key: process.env.APP_ENCRYPTION_KEY ?? "dev-encryption-key-change-me"
  },
  integrations: {
    eqBankMode: process.env.EQ_BANK_MODE ?? "mock",
    wealthsimpleMode: process.env.WEALTHSIMPLE_MODE ?? "mock",
    tdMode: process.env.TD_MODE ?? "mock",
    amexMode: process.env.AMEX_MODE ?? "mock"
  },
  plaid: {
    clientId: process.env.PLAID_CLIENT_ID ?? "",
    secret: process.env.PLAID_SECRET ?? "",
    env: process.env.PLAID_ENV ?? "sandbox",
    countryCodes: parseList(process.env.PLAID_COUNTRY_CODES, ["CA", "US"]),
    redirectUri: process.env.PLAID_REDIRECT_URI
  }
};
