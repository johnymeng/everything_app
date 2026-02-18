import crypto from "node:crypto";
import { config } from "../config";
import { AccountType, Connection, ConnectionCredential, Provider } from "../models";
import {
  ExchangeResult,
  LinkTokenResult,
  ProviderConnector,
  SyncedAccount,
  SyncedHolding,
  SyncedTransaction,
  SyncPayload
} from "./types";

interface PendingSnapUser {
  snaptradeUserId: string;
  snaptradeUserSecret: string;
}

interface SnapAccount {
  id: string;
  name?: string;
  number?: string;
  type?: string;
  currency?: string;
  institution_name?: string;
  sync_status?: string;
  balance?: {
    total?: number;
  };
}

interface SnapPosition {
  symbol?: {
    symbol?: string;
    description?: string;
    currency?: { code?: string };
  };
  units?: number;
  price?: number;
  market_value?: number;
}

interface SnapActivity {
  id?: string;
  trade_date?: string;
  settlement_date?: string;
  type?: string;
  description?: string;
  amount?: number;
  currency?: { code?: string };
}

function createSnapUserId(appUserId: string): string {
  const hash = crypto.createHash("sha256").update(appUserId).digest("hex").slice(0, 10);
  const nonce = crypto.randomBytes(4).toString("hex");
  return `ws_${hash}_${nonce}`;
}

function mapAccountType(rawType: string | undefined): AccountType {
  const normalized = (rawType ?? "").toLowerCase();

  if (normalized.includes("tfsa") || normalized.includes("rrsp") || normalized.includes("invest")) {
    return "investment";
  }

  if (normalized.includes("cash")) {
    return "cash";
  }

  return "investment";
}

function toDateString(value: string | undefined): string {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }

  return parsed.toISOString().slice(0, 10);
}

export class SnapTradeConnector implements ProviderConnector {
  readonly mode = "snaptrade";
  private readonly pendingByUserId = new Map<string, PendingSnapUser>();

  constructor(
    readonly provider: Provider,
    readonly displayName: string
  ) {
    if (!config.snaptrade.clientId || !config.snaptrade.consumerKey) {
      throw new Error("SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY are required when mode=snaptrade.");
    }
  }

  async createLinkToken(userId: string): Promise<LinkTokenResult> {
    const snaptradeUserId = createSnapUserId(userId);

    const registerPayload = await this.request<{ userSecret: string }>("POST", "/snapTrade/registerUser", {
      userId: snaptradeUserId
    });

    const snaptradeUserSecret = registerPayload.userSecret;

    this.pendingByUserId.set(userId, {
      snaptradeUserId,
      snaptradeUserSecret
    });

    const loginPayload = await this.request<{ redirectURI: string }>("POST", "/snapTrade/login", {
      userId: snaptradeUserId,
      userSecret: snaptradeUserSecret,
      broker: "WEALTHSIMPLE"
    });

    return {
      linkToken: loginPayload.redirectURI,
      mode: this.mode
    };
  }

  async exchangePublicToken(userId: string, _publicToken: string): Promise<ExchangeResult> {
    const pending = this.pendingByUserId.get(userId);

    if (!pending) {
      throw new Error("Missing pending SnapTrade session. Generate a new connection link and retry.");
    }

    return {
      displayName: this.displayName,
      metadata: {
        mode: this.mode,
        snaptradeUserId: pending.snaptradeUserId
      },
      credential: {
        accessToken: "snaptrade",
        itemId: pending.snaptradeUserId,
        institutionId: "wealthsimple",
        snaptradeUserId: pending.snaptradeUserId,
        snaptradeUserSecret: pending.snaptradeUserSecret
      }
    };
  }

  async sync(_connection: Connection, credential: ConnectionCredential): Promise<SyncPayload> {
    if (!credential.snaptradeUserId || !credential.snaptradeUserSecret) {
      throw new Error("Missing SnapTrade credentials for Wealthsimple connection.");
    }

    const accounts = await this.request<SnapAccount[]>("GET", "/accounts", undefined, {
      userId: credential.snaptradeUserId,
      userSecret: credential.snaptradeUserSecret
    });

    const wealthsimpleAccounts = accounts.filter((account) => {
      const institution = (account.institution_name ?? "").toLowerCase();
      return institution.includes("wealthsimple") || institution.length === 0;
    });

    const syncedAccounts: SyncedAccount[] = wealthsimpleAccounts.map((account) => ({
      externalId: account.id,
      name: account.name ?? account.number ?? "Wealthsimple Account",
      type: mapAccountType(account.type),
      currency: account.currency ?? "CAD",
      balance: Number(account.balance?.total ?? 0),
      institutionName: account.institution_name ?? "Wealthsimple"
    }));

    const holdings: SyncedHolding[] = [];
    const transactions: SyncedTransaction[] = [];

    for (const account of wealthsimpleAccounts) {
      const positions = await this.request<SnapPosition[]>("GET", `/accounts/${account.id}/positions`, undefined, {
        userId: credential.snaptradeUserId,
        userSecret: credential.snaptradeUserSecret
      });

      for (let index = 0; index < positions.length; index += 1) {
        const position = positions[index];
        const quantity = Number(position.units ?? 0);
        const unitPrice = Number(position.price ?? 0);
        const value = Number(position.market_value ?? quantity * unitPrice);

        holdings.push({
          externalId: `${account.id}:pos:${index}`,
          accountExternalId: account.id,
          symbol: position.symbol?.symbol ?? "N/A",
          name: position.symbol?.description ?? position.symbol?.symbol ?? "Holding",
          quantity,
          unitPrice,
          value,
          currency: position.symbol?.currency?.code ?? account.currency ?? "CAD"
        });
      }

      const activities = await this.request<SnapActivity[]>("GET", `/accounts/${account.id}/activities`, undefined, {
        userId: credential.snaptradeUserId,
        userSecret: credential.snaptradeUserSecret
      });

      for (const activity of activities.slice(0, 250)) {
        const amount = Number(activity.amount ?? 0);

        transactions.push({
          externalId: activity.id ?? `${account.id}:${activity.trade_date ?? Date.now()}:${activity.type ?? "activity"}`,
          accountExternalId: account.id,
          date: toDateString(activity.trade_date ?? activity.settlement_date),
          description: activity.description ?? activity.type ?? "Activity",
          category: activity.type ?? "activity",
          amount: Math.abs(amount),
          direction: amount >= 0 ? "credit" : "debit",
          currency: activity.currency?.code ?? account.currency ?? "CAD"
        });
      }
    }

    return {
      accounts: syncedAccounts,
      holdings,
      liabilities: [],
      transactions
    };
  }

  private async request<T>(
    method: "GET" | "POST",
    route: string,
    body?: Record<string, unknown>,
    query?: Record<string, string>
  ): Promise<T> {
    const url = new URL(`${config.snaptrade.baseUrl}${route}`);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const queryEntries = Object.entries(query ?? {}).sort(([left], [right]) => left.localeCompare(right));
    const queryParams = new URLSearchParams();

    for (const [key, value] of queryEntries) {
      queryParams.set(key, value);
    }

    queryParams.set("clientId", config.snaptrade.clientId);
    queryParams.set("timestamp", timestamp);
    url.search = queryParams.toString();

    const signaturePayload = JSON.stringify({
      content: body ?? {},
      path: url.pathname,
      query: queryParams.toString()
    });

    const signature = crypto
      .createHmac("sha256", encodeURI(config.snaptrade.consumerKey))
      .update(signaturePayload)
      .digest("base64");

    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Signature: signature
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`SnapTrade API error (${response.status}): ${details}`);
    }

    return (await response.json()) as T;
  }
}
