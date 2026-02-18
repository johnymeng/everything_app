import crypto from "node:crypto";
import {
  Account,
  Connection,
  FinanceSummary,
  Holding,
  Liability,
  Provider,
  providers,
  Transaction
} from "../models";
import { JsonStore } from "../store";
import { getConnectorByProvider, listConnectors } from "../connectors";

const assetTypeSet = new Set(["cash", "chequing", "savings", "investment", "other"]);
const liquidityTypeSet = new Set(["cash", "chequing", "savings"]);
const liabilityTypeSet = new Set(["credit_card", "loan", "line_of_credit", "mortgage"]);

function scopedId(connectionId: string, scope: string, externalId: string): string {
  return `${connectionId}:${scope}:${externalId}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sum(values: number[]): number {
  return Number(values.reduce((total, value) => total + value, 0).toFixed(2));
}

function accountInvestmentValue(account: Account, holdings: Holding[]): number {
  const accountHoldings = holdings.filter((holding) => holding.accountId === account.id);

  if (accountHoldings.length > 0) {
    return sum(accountHoldings.map((holding) => holding.value));
  }

  return Math.max(account.balance, 0);
}

export class FinanceService {
  constructor(private readonly store: JsonStore) {}

  listProviders(): Array<{ provider: Provider; displayName: string; status: string; mode: string }> {
    return listConnectors().map((connector) => ({
      provider: connector.provider,
      displayName: connector.displayName,
      status: "available",
      mode: connector.mode
    }));
  }

  listConnections(userId?: string): Connection[] {
    const state = this.store.read();

    if (!userId) {
      return state.connections;
    }

    return state.connections.filter((connection) => connection.userId === userId);
  }

  async connectProvider(userId: string, provider: Provider): Promise<Connection> {
    const state = this.store.read();
    const existingConnection = state.connections.find(
      (connection) => connection.userId === userId && connection.provider === provider && connection.status === "connected"
    );

    if (existingConnection) {
      return existingConnection;
    }

    const connector = getConnectorByProvider(provider);
    const connectResult = await connector.connect(userId);
    const timestamp = nowIso();

    const connection: Connection = {
      id: crypto.randomUUID(),
      userId,
      provider,
      status: "connected",
      displayName: connectResult.displayName,
      metadata: connectResult.metadata,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    state.connections.push(connection);
    this.store.write(state);

    return connection;
  }

  async syncConnection(connectionId: string): Promise<{
    connection: Connection;
    synced: { accounts: number; holdings: number; liabilities: number; transactions: number };
  }> {
    const state = this.store.read();
    const connectionIndex = state.connections.findIndex((item) => item.id === connectionId);

    if (connectionIndex < 0) {
      throw new Error(`Connection '${connectionId}' was not found.`);
    }

    const connection = state.connections[connectionIndex];
    const connector = getConnectorByProvider(connection.provider);
    const payload = await connector.sync(connection.id, connection.userId);
    const syncedAt = nowIso();

    state.accounts = state.accounts.filter((account) => account.connectionId !== connection.id);
    state.holdings = state.holdings.filter((holding) => !holding.id.startsWith(`${connection.id}:holding:`));
    state.liabilities = state.liabilities.filter((liability) => !liability.id.startsWith(`${connection.id}:liability:`));
    state.transactions = state.transactions.filter(
      (transaction) => !transaction.id.startsWith(`${connection.id}:transaction:`)
    );

    const accounts: Account[] = payload.accounts.map((syncedAccount) => ({
      id: scopedId(connection.id, "account", syncedAccount.externalId),
      connectionId: connection.id,
      provider: connection.provider,
      name: syncedAccount.name,
      type: syncedAccount.type,
      currency: syncedAccount.currency,
      balance: syncedAccount.balance,
      institutionName: syncedAccount.institutionName,
      lastSyncedAt: syncedAt
    }));

    const accountIdByExternalId = new Map(
      payload.accounts.map((syncedAccount) => [
        syncedAccount.externalId,
        scopedId(connection.id, "account", syncedAccount.externalId)
      ])
    );

    const holdings: Holding[] = payload.holdings.map((syncedHolding) => ({
      id: scopedId(connection.id, "holding", syncedHolding.externalId),
      accountId: accountIdByExternalId.get(syncedHolding.accountExternalId) ?? "",
      symbol: syncedHolding.symbol,
      name: syncedHolding.name,
      quantity: syncedHolding.quantity,
      unitPrice: syncedHolding.unitPrice,
      value: syncedHolding.value,
      currency: syncedHolding.currency,
      lastPriceAt: syncedAt
    }));

    const liabilities: Liability[] = payload.liabilities.map((syncedLiability) => ({
      id: scopedId(connection.id, "liability", syncedLiability.externalId),
      accountId: accountIdByExternalId.get(syncedLiability.accountExternalId) ?? "",
      provider: connection.provider,
      kind: syncedLiability.kind,
      name: syncedLiability.name,
      balance: syncedLiability.balance,
      interestRate: syncedLiability.interestRate,
      minimumPayment: syncedLiability.minimumPayment,
      currency: syncedLiability.currency,
      dueDate: syncedLiability.dueDate,
      lastSyncedAt: syncedAt
    }));

    const transactions: Transaction[] = payload.transactions.map((syncedTransaction) => ({
      id: scopedId(connection.id, "transaction", syncedTransaction.externalId),
      accountId: accountIdByExternalId.get(syncedTransaction.accountExternalId) ?? "",
      provider: connection.provider,
      date: syncedTransaction.date,
      description: syncedTransaction.description,
      category: syncedTransaction.category,
      amount: syncedTransaction.amount,
      direction: syncedTransaction.direction,
      currency: syncedTransaction.currency
    }));

    state.accounts.push(...accounts);
    state.holdings.push(...holdings.filter((item) => item.accountId));
    state.liabilities.push(...liabilities.filter((item) => item.accountId));
    state.transactions.push(...transactions.filter((item) => item.accountId));

    state.connections[connectionIndex] = {
      ...connection,
      updatedAt: syncedAt,
      status: "connected"
    };

    this.store.write(state);

    return {
      connection: state.connections[connectionIndex],
      synced: {
        accounts: accounts.length,
        holdings: holdings.length,
        liabilities: liabilities.length,
        transactions: transactions.length
      }
    };
  }

  async syncAllConnections(userId: string): Promise<
    Array<{ connectionId: string; provider: Provider; status: "ok" | "error"; message?: string }>
  > {
    const connections = this.listConnections(userId);

    const results: Array<{ connectionId: string; provider: Provider; status: "ok" | "error"; message?: string }> = [];

    for (const connection of connections) {
      try {
        await this.syncConnection(connection.id);
        results.push({ connectionId: connection.id, provider: connection.provider, status: "ok" });
      } catch (error) {
        results.push({
          connectionId: connection.id,
          provider: connection.provider,
          status: "error",
          message: error instanceof Error ? error.message : "Unknown sync error"
        });
      }
    }

    return results;
  }

  getAccounts(userId: string): Account[] {
    const state = this.store.read();
    const userConnectionIds = new Set(this.listConnections(userId).map((connection) => connection.id));

    return state.accounts
      .filter((account) => userConnectionIds.has(account.connectionId))
      .sort((left, right) => right.lastSyncedAt.localeCompare(left.lastSyncedAt));
  }

  getHoldings(userId: string): Holding[] {
    const accounts = this.getAccounts(userId);
    const accountIds = new Set(accounts.map((account) => account.id));
    const state = this.store.read();

    return state.holdings.filter((holding) => accountIds.has(holding.accountId));
  }

  getLiabilities(userId: string): Liability[] {
    const accounts = this.getAccounts(userId);
    const accountIds = new Set(accounts.map((account) => account.id));
    const state = this.store.read();

    return state.liabilities.filter((liability) => accountIds.has(liability.accountId));
  }

  getTransactions(userId: string, limit = 100): Transaction[] {
    const accounts = this.getAccounts(userId);
    const accountIds = new Set(accounts.map((account) => account.id));
    const state = this.store.read();

    return state.transactions
      .filter((transaction) => accountIds.has(transaction.accountId))
      .sort((left, right) => right.date.localeCompare(left.date))
      .slice(0, limit);
  }

  getSummary(userId: string): FinanceSummary {
    const accounts = this.getAccounts(userId);
    const holdings = this.getHoldings(userId);
    const liabilities = this.getLiabilities(userId);
    const transactions = this.getTransactions(userId, 5000);

    const cashAndSavings = sum(
      accounts
        .filter((account) => liquidityTypeSet.has(account.type))
        .map((account) => Math.max(account.balance, 0))
    );

    const investmentAccounts = accounts.filter((account) => account.type === "investment");
    const investments = sum(investmentAccounts.map((account) => accountInvestmentValue(account, holdings)));

    const otherAssets = sum(
      accounts
        .filter((account) => assetTypeSet.has(account.type) && !liquidityTypeSet.has(account.type) && account.type !== "investment")
        .map((account) => Math.max(account.balance, 0))
    );

    const accountBasedLiabilities = sum(
      accounts
        .filter((account) => liabilityTypeSet.has(account.type))
        .map((account) => Math.max(account.balance, 0))
    );

    const explicitLiabilities = sum(liabilities.map((liability) => Math.max(liability.balance, 0)));
    const debt = explicitLiabilities > 0 ? explicitLiabilities : accountBasedLiabilities;

    const assets = sum([cashAndSavings, investments, otherAssets]);
    const netWorth = Number((assets - debt).toFixed(2));

    const providerBreakdown = providers.map((provider) => {
      const providerAccounts = accounts.filter((account) => account.provider === provider);
      const providerLiabilities = liabilities.filter((liability) => liability.provider === provider);

      const providerAssetCash = sum(
        providerAccounts
          .filter((account) => assetTypeSet.has(account.type) && account.type !== "investment")
          .map((account) => Math.max(account.balance, 0))
      );

      const providerInvestment = sum(
        providerAccounts
          .filter((account) => account.type === "investment")
          .map((account) => accountInvestmentValue(account, holdings))
      );

      const providerDebtFromLiabilities = sum(providerLiabilities.map((liability) => Math.max(liability.balance, 0)));
      const providerDebtFromAccounts = sum(
        providerAccounts
          .filter((account) => liabilityTypeSet.has(account.type))
          .map((account) => Math.max(account.balance, 0))
      );

      return {
        provider,
        assets: Number((providerAssetCash + providerInvestment).toFixed(2)),
        liabilities: Number((providerDebtFromLiabilities || providerDebtFromAccounts).toFixed(2))
      };
    });

    return {
      totals: {
        assets,
        cashAndSavings,
        investments,
        liabilities: debt,
        debt,
        netWorth
      },
      providers: providerBreakdown,
      counts: {
        connections: this.listConnections(userId).length,
        accounts: accounts.length,
        liabilities: liabilities.length,
        transactions: transactions.length
      }
    };
  }
}
