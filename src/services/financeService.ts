import {
  Account,
  Connection,
  ConnectionCredential,
  FinanceSummary,
  Holding,
  Provider,
  providers
} from "../models";
import { PostgresRepository } from "../db/postgresRepository";
import { getConnectorByProvider, listConnectors } from "../connectors";
import { decryptString, encryptString } from "../security/encryption";

const assetTypeSet = new Set(["cash", "chequing", "savings", "investment", "other"]);
const liquidityTypeSet = new Set(["cash", "chequing", "savings"]);
const liabilityTypeSet = new Set(["credit_card", "loan", "line_of_credit", "mortgage"]);

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
  constructor(private readonly repository: PostgresRepository) {}

  listProviders(): Array<{ provider: Provider; displayName: string; status: string; mode: string }> {
    return listConnectors().map((connector) => ({
      provider: connector.provider,
      displayName: connector.displayName,
      status: "available",
      mode: connector.mode
    }));
  }

  async createLinkToken(userId: string, provider: Provider): Promise<{ linkToken: string; mode: string }> {
    const connector = getConnectorByProvider(provider);
    const result = await connector.createLinkToken(userId);

    return {
      linkToken: result.linkToken,
      mode: result.mode
    };
  }

  async exchangePublicToken(userId: string, provider: Provider, publicToken: string): Promise<Connection> {
    const connector = getConnectorByProvider(provider);
    const result = await connector.exchangePublicToken(userId, publicToken);
    const encryptedCredential = encryptString(JSON.stringify(result.credential));

    const connection = await this.repository.upsertConnection({
      userId,
      provider,
      status: "connected",
      displayName: result.displayName,
      metadata: result.metadata,
      encryptedCredential,
      institutionId: result.credential.institutionId,
      itemId: result.credential.itemId
    });

    return connection;
  }

  async listConnections(userId: string): Promise<Connection[]> {
    return this.repository.listConnections(userId);
  }

  async syncConnection(userId: string, connectionId: string): Promise<{
    connection: Connection;
    synced: { accounts: number; holdings: number; liabilities: number; transactions: number };
  }> {
    const connection = await this.repository.getConnectionById(userId, connectionId);

    if (!connection) {
      throw new Error(`Connection '${connectionId}' was not found.`);
    }

    const encryptedCredential = await this.repository.getConnectionCredential(userId, connectionId);

    if (!encryptedCredential) {
      await this.repository.markConnectionStatus(userId, connectionId, "error");
      throw new Error(`Connection '${connectionId}' is missing provider credentials.`);
    }

    const credential = JSON.parse(decryptString(encryptedCredential)) as ConnectionCredential;
    const connector = getConnectorByProvider(connection.provider);

    try {
      const payload = await connector.sync(connection, credential);
      const syncedAt = new Date().toISOString();
      const synced = await this.repository.replaceConnectionData(connection, payload, syncedAt);

      const updatedConnection = await this.repository.getConnectionById(userId, connectionId);

      if (!updatedConnection) {
        throw new Error("Connection disappeared after sync.");
      }

      return {
        connection: updatedConnection,
        synced
      };
    } catch (error) {
      await this.repository.markConnectionStatus(userId, connectionId, "error");
      throw error;
    }
  }

  async syncAllConnections(userId: string): Promise<
    Array<{ connectionId: string; provider: Provider; status: "ok" | "error"; message?: string }>
  > {
    const connections = await this.repository.listConnections(userId);

    const results: Array<{ connectionId: string; provider: Provider; status: "ok" | "error"; message?: string }> = [];

    for (const connection of connections) {
      try {
        await this.syncConnection(userId, connection.id);
        results.push({
          connectionId: connection.id,
          provider: connection.provider,
          status: "ok"
        });
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

  async getAccounts(userId: string): Promise<Account[]> {
    return this.repository.getAccounts(userId);
  }

  async getHoldings(userId: string) {
    return this.repository.getHoldings(userId);
  }

  async getLiabilities(userId: string) {
    return this.repository.getLiabilities(userId);
  }

  async getTransactions(userId: string, limit = 100) {
    return this.repository.getTransactions(userId, limit);
  }

  async getSummary(userId: string): Promise<FinanceSummary> {
    const [connections, accounts, holdings, liabilities, transactions] = await Promise.all([
      this.repository.listConnections(userId),
      this.repository.getAccounts(userId),
      this.repository.getHoldings(userId),
      this.repository.getLiabilities(userId),
      this.repository.getTransactions(userId, 5000)
    ]);

    const cashAndSavings = sum(
      accounts
        .filter((account) => liquidityTypeSet.has(account.type))
        .map((account) => Math.max(account.balance, 0))
    );

    const investmentAccounts = accounts.filter((account) => account.type === "investment");
    const investments = sum(investmentAccounts.map((account) => accountInvestmentValue(account, holdings)));

    const otherAssets = sum(
      accounts
        .filter(
          (account) =>
            assetTypeSet.has(account.type) &&
            !liquidityTypeSet.has(account.type) &&
            account.type !== "investment"
        )
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

      const providerDebtFromLiabilities = sum(
        providerLiabilities.map((liability) => Math.max(liability.balance, 0))
      );

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
        connections: connections.length,
        accounts: accounts.length,
        liabilities: liabilities.length,
        transactions: transactions.length
      }
    };
  }
}
