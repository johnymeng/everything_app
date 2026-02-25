import crypto from "node:crypto";
import { z } from "zod";
import { config } from "../config";
import { Connection, ConnectionCredential } from "../models";
import { fetchLastPrices } from "../services/quoteService";
import {
  ExchangeResult,
  LinkTokenResult,
  ProviderConnector,
  SyncPayload,
  SyncedAccount,
  SyncedHolding
} from "./types";

const CASH_BALANCE_SYMBOL = "__CASH_BALANCE__";

const manualHoldingSchema = z.object({
  symbol: z.string().min(1).max(32),
  quoteSymbol: z.string().min(1).max(64).optional(),
  name: z.string().min(1).max(120).optional(),
  quantity: z.number().finite(),
  // Total cost basis for this holding (optional; used for P/L and avg cost).
  costBasis: z.number().finite().optional(),
  // Optional fallback used when quotes are unavailable (ex: offline valuation from holdings report exports).
  unitPrice: z.number().finite().optional()
});

const manualAccountSchema = z.object({
  externalId: z.string().min(1).max(80).optional(),
  name: z.string().min(1).max(120),
  currency: z
    .string()
    .min(3)
    .max(3)
    .transform((value) => value.toUpperCase())
    .optional(),
  cash: z.number().finite().optional(),
  holdings: z.array(manualHoldingSchema).default([])
});

const manualHoldingsPayloadSchema = z.object({
  accounts: z.array(manualAccountSchema).min(1)
});

type ManualHoldingsPayload = z.infer<typeof manualHoldingsPayloadSchema>;

function decodeBase64Utf8(value: string): string {
  return Buffer.from(value, "base64").toString("utf8");
}

function stableExternalIdFromName(name: string): string {
  // Deterministic ID so the same account name overwrites cleanly on re-sync.
  const normalized = name.trim().toLowerCase();
  const hash = crypto.createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 24);
  return `acct_${hash}`;
}

function toMoney(value: number): number {
  return Number(value.toFixed(2));
}

function normalizeQuoteSymbol(input: string, defaultSuffix: string): string {
  const raw = input.trim();
  if (!raw) {
    return raw;
  }

  if (raw.includes(".")) {
    return raw;
  }

  const suffix = defaultSuffix.trim();
  if (!suffix) {
    return raw;
  }

  if (!suffix.startsWith(".")) {
    return `${raw}.${suffix}`;
  }

  return `${raw}${suffix}`;
}

function parsePublicToken(publicToken: string): ManualHoldingsPayload {
  const prefix = "manual-holdings:";
  if (!publicToken.startsWith(prefix)) {
    throw new Error("Manual holdings token is missing expected prefix.");
  }

  const base64 = publicToken.slice(prefix.length).trim();
  if (!base64) {
    throw new Error("Manual holdings token payload is empty.");
  }

  const json = decodeBase64Utf8(base64);
  const parsed = JSON.parse(json) as unknown;
  return manualHoldingsPayloadSchema.parse(parsed);
}

export class ManualHoldingsConnector implements ProviderConnector {
  readonly mode = "manual_holdings";

  constructor(
    readonly provider: ProviderConnector["provider"],
    readonly displayName: string
  ) {}

  async createLinkToken(_userId: string): Promise<LinkTokenResult> {
    return {
      linkToken: "manual-holdings",
      mode: this.mode
    };
  }

  async exchangePublicToken(_userId: string, publicToken: string): Promise<ExchangeResult> {
    const payload = parsePublicToken(publicToken);

    const credential: ConnectionCredential = {
      accessToken: JSON.stringify(payload),
      institutionId: "manual_holdings",
      itemId: `manual_holdings:${Date.now()}`
    };

    const accountNames = payload.accounts.map((account) => account.name).join(", ");
    return {
      displayName: `Wealthsimple (Manual holdings: ${accountNames})`,
      metadata: {
        mode: this.mode,
        accounts: String(payload.accounts.length),
        holdings: String(payload.accounts.reduce((total, account) => total + (account.holdings?.length ?? 0), 0))
      },
      credential
    };
  }

  async sync(_connection: Connection, credential: ConnectionCredential): Promise<SyncPayload> {
    if (!credential.accessToken) {
      throw new Error("Missing manual holdings payload.");
    }

    const payload = manualHoldingsPayloadSchema.parse(JSON.parse(credential.accessToken) as unknown);
    const quoteSymbols: string[] = [];

    for (const account of payload.accounts) {
      for (const holding of account.holdings) {
        if (holding.symbol === CASH_BALANCE_SYMBOL) {
          continue;
        }

        const effectiveQuoteSymbol = holding.quoteSymbol ?? normalizeQuoteSymbol(holding.symbol, config.quotes.defaultSuffix);
        quoteSymbols.push(effectiveQuoteSymbol);
      }
    }

    const pricesByQuoteSymbol = await fetchLastPrices(quoteSymbols);

    const accounts: SyncedAccount[] = [];
    const holdings: SyncedHolding[] = [];

    for (const account of payload.accounts) {
      const accountExternalId = account.externalId?.trim() || stableExternalIdFromName(account.name);
      const currency = (account.currency ?? "CAD").toUpperCase();
      const cash = Number(account.cash ?? 0);
      let accountValue = 0;

      const syncedAccount: SyncedAccount = {
        externalId: accountExternalId,
        name: account.name,
        type: "investment",
        currency,
        balance: 0,
        institutionName: "Wealthsimple"
      };

      accounts.push(syncedAccount);

      if (cash > 0) {
        accountValue += cash;
        holdings.push({
          externalId: `${accountExternalId}:${CASH_BALANCE_SYMBOL}`,
          accountExternalId,
          symbol: CASH_BALANCE_SYMBOL,
          name: "Cash",
          quantity: 1,
          unitPrice: toMoney(cash),
          value: toMoney(cash),
          currency
        });
      }

      for (const holding of account.holdings) {
        if (holding.symbol === CASH_BALANCE_SYMBOL) {
          continue;
        }

        const effectiveQuoteSymbol =
          holding.quoteSymbol ?? normalizeQuoteSymbol(holding.symbol, config.quotes.defaultSuffix);
        const quotedPrice = pricesByQuoteSymbol.get(effectiveQuoteSymbol);
        const unitPrice = quotedPrice ?? holding.unitPrice;
        if (!unitPrice) {
          throw new Error(`Missing quote for ${holding.symbol} (${effectiveQuoteSymbol}).`);
        }

        const value = toMoney(unitPrice * holding.quantity);
        accountValue += value;

        holdings.push({
          externalId: `${accountExternalId}:${holding.symbol}`,
          accountExternalId,
          symbol: holding.symbol,
          name: holding.name ?? holding.symbol,
          quantity: holding.quantity,
          unitPrice: toMoney(unitPrice),
          value,
          costBasis: holding.costBasis === undefined ? undefined : toMoney(holding.costBasis),
          currency
        });
      }

      syncedAccount.balance = toMoney(accountValue);
    }

    return {
      accounts,
      holdings,
      liabilities: [],
      transactions: []
    };
  }
}
