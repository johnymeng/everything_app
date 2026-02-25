import {
  Account,
  AccountType,
  Connection,
  ConnectionCredential,
  FinanceSummary,
  Holding,
  Provider,
  providers
} from "../models";
import { PostgresRepository } from "../db/postgresRepository";
import { getConnectorByProvider, listConnectors } from "../connectors";
import { ManualHoldingsConnector } from "../connectors/manualHoldingsConnector";
import { decryptString, encryptString } from "../security/encryption";
import { parseStatementCsv } from "./csvStatementParser";
import { detectWealthsimpleCsvFormat } from "./wealthsimpleCsvPortfolioBuilder";
import { parseWealthsimpleHoldingsReportCsv } from "./wealthsimpleHoldingsReportCsvParser";

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

const providerDisplayName: Record<Provider, string> = {
  eq_bank: "EQ Bank",
  wealthsimple: "Wealthsimple",
  td: "TD Canada Trust",
  amex: "American Express",
  manual_csv: "Manual CSV Import"
};

export interface ImportCsvStatementInput {
  provider?: Provider;
  csvText: string;
  institutionName?: string;
  defaultAccountName?: string;
  defaultAccountType?: AccountType;
  defaultCurrency?: string;
  dayFirst?: boolean;
}

export class FinanceService {
  constructor(private readonly repository: PostgresRepository) {}

  private async recordPortfolioSnapshot(userId: string, capturedAt: string): Promise<void> {
    const [accounts, holdings, liabilities] = await Promise.all([
      this.repository.getAccounts(userId),
      this.repository.getHoldings(userId),
      this.repository.getLiabilities(userId)
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

    const totalAssets = sum([cashAndSavings, investments, otherAssets]);
    const netWorth = Number((totalAssets - debt).toFixed(2));

    const currencies = Array.from(new Set(accounts.map((account) => account.currency).filter(Boolean)));
    const currency = currencies.length === 1 ? currencies[0] : "MIXED";

    const snapshotAccounts = accounts.map((account) => {
      const value =
        account.type === "investment"
          ? accountInvestmentValue(account, holdings)
          : liabilityTypeSet.has(account.type)
            ? -Math.max(account.balance, 0)
            : Math.max(account.balance, 0);

      return {
        accountId: account.id,
        provider: account.provider,
        name: account.name,
        type: account.type,
        currency: account.currency,
        value: Number(value.toFixed(2)),
        lastSyncedAt: account.lastSyncedAt
      };
    });

    await this.repository.insertPortfolioSnapshot({
      userId,
      capturedAt,
      currency,
      totalAssets,
      investments,
      netWorth,
      accounts: snapshotAccounts
    });
  }

  listProviders(): Array<{ provider: Provider; displayName: string; status: string; mode: string }> {
    return listConnectors().map((connector) => ({
      provider: connector.provider,
      displayName: connector.displayName,
      status: connector.mode === "disabled" ? "disabled" : "available",
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

  async resetUserData(userId: string): Promise<{
    connections: number;
    portfolioSnapshots: number;
    healthConnections: number;
    fitnessSamples: number;
    fitnessTargets: number;
    remaining: {
      connections: number;
      accounts: number;
      holdings: number;
      liabilities: number;
      transactions: number;
      portfolioSnapshots: number;
      healthConnections: number;
      fitnessSamples: number;
      fitnessTargets: number;
    };
  }> {
    return this.repository.resetUserData(userId);
  }

  async getUserDataCounts(userId: string): Promise<{
    connections: number;
    accounts: number;
    holdings: number;
    liabilities: number;
    transactions: number;
    portfolioSnapshots: number;
    healthConnections: number;
    fitnessSamples: number;
    fitnessTargets: number;
  }> {
    return this.repository.getUserDataCounts(userId);
  }

  async syncConnection(
    userId: string,
    connectionId: string,
    options?: { recordSnapshot?: boolean }
  ): Promise<{
    connection: Connection;
    synced: { accounts: number; holdings: number; liabilities: number; transactions: number };
  }> {
    const connection = await this.repository.getConnectionById(userId, connectionId);

    if (!connection) {
      throw new Error(`Connection '${connectionId}' was not found.`);
    }

    if (connection.provider === "manual_csv") {
      return {
        connection,
        synced: {
          accounts: 0,
          holdings: 0,
          liabilities: 0,
          transactions: 0
        }
      };
    }

    const encryptedCredential = await this.repository.getConnectionCredential(userId, connectionId);

    if (!encryptedCredential) {
      await this.repository.markConnectionStatus(userId, connectionId, "error");
      throw new Error(`Connection '${connectionId}' is missing provider credentials.`);
    }

    const credential = JSON.parse(decryptString(encryptedCredential)) as ConnectionCredential;
    const connector =
      connection.provider === "wealthsimple" && connection.metadata?.mode === "manual_holdings"
        ? new ManualHoldingsConnector("wealthsimple", "Wealthsimple")
        : getConnectorByProvider(connection.provider);

    try {
      const payload = await connector.sync(connection, credential);
      const syncedAt = new Date().toISOString();
      const synced = await this.repository.replaceConnectionData(connection, payload, syncedAt);

      const updatedConnection = await this.repository.getConnectionById(userId, connectionId);

      if (!updatedConnection) {
        throw new Error("Connection disappeared after sync.");
      }

      if (options?.recordSnapshot !== false) {
        await this.recordPortfolioSnapshot(userId, syncedAt);
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
      if (connection.provider === "manual_csv") {
        results.push({
          connectionId: connection.id,
          provider: connection.provider,
          status: "ok",
          message: "Manual CSV connection is refreshed via CSV import."
        });
        continue;
      }

      try {
        await this.syncConnection(userId, connection.id, { recordSnapshot: false });
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

    await this.recordPortfolioSnapshot(userId, new Date().toISOString());

    return results;
  }

  async importStatementCsv(
    userId: string,
    input: ImportCsvStatementInput
  ): Promise<{
    connection: Connection;
    imported: {
      rowsRead: number;
      rowsImported: number;
      rowsSkipped: number;
      accounts: number;
      holdings: number;
      transactions: number;
    };
    detectedColumns: Record<string, unknown>;
  }> {
    const provider = input.provider ?? "manual_csv";

    if (provider !== "manual_csv") {
      throw new Error("CSV import currently supports only provider 'manual_csv'.");
    }

    const format = detectWealthsimpleCsvFormat(input.csvText);

    if (format === "holdings_report") {
      const parsed = parseWealthsimpleHoldingsReportCsv(input.csvText);
      const payload = {
        accounts: parsed.accounts.map((account) => ({
          externalId: account.externalId,
          name: account.name,
          currency: account.currency,
          cash: account.cash,
          holdings: account.holdings.map((holding) => ({
            symbol: holding.symbol,
            name: holding.name,
            quantity: holding.quantity,
            quoteSymbol: holding.quoteSymbol,
            unitPrice: holding.unitPrice,
            costBasis: holding.costBasis
          }))
        }))
      };

      const holdingsCredential: ConnectionCredential = {
        accessToken: JSON.stringify(payload),
        institutionId: "manual_holdings",
        itemId: `manual_holdings:holdings_report:${Date.now()}`
      };

      const connection = await this.repository.upsertConnection({
        userId,
        provider: "wealthsimple",
        status: "connected",
        displayName: "Wealthsimple",
        metadata: {
          source: "wealthsimple_holdings_report",
          mode: "manual_holdings",
          asOf: parsed.asOf ?? "",
          importedAt: new Date().toISOString(),
          accounts: String(payload.accounts.length)
        },
        encryptedCredential: encryptString(JSON.stringify(holdingsCredential)),
        institutionId: holdingsCredential.institutionId,
        itemId: holdingsCredential.itemId
      });

      const connector = new ManualHoldingsConnector("wealthsimple", "Wealthsimple");
      const syncedAt = new Date().toISOString();
      const syncPayload = await connector.sync(connection, holdingsCredential);
      const synced = await this.repository.replaceConnectionData(connection, syncPayload, syncedAt);

      const updatedConnection = await this.repository.getConnectionById(userId, connection.id);

      if (!updatedConnection) {
        throw new Error("Connection disappeared after holdings import.");
      }

      await this.recordPortfolioSnapshot(userId, syncedAt);

      return {
        connection: updatedConnection,
        imported: {
          rowsRead: parsed.rowsRead,
          rowsImported: parsed.rowsParsed,
          rowsSkipped: parsed.rowsSkipped,
          accounts: synced.accounts,
          holdings: synced.holdings,
          transactions: 0
        },
        detectedColumns: {
          format: "wealthsimple_holdings_report",
          holdingsTotal: parsed.costBasisStats?.holdingsTotal ?? 0,
          holdingsWithCostBasis: parsed.costBasisStats?.holdingsWithCostBasis ?? 0,
          costBasisSources: parsed.costBasisStats?.sourceCounts ?? {},
          indices: parsed.detectedColumns?.indices ?? {}
        }
      };
    }

    const parsed = parseStatementCsv({
      csvText: input.csvText,
      institutionName: input.institutionName,
      defaultAccountName: input.defaultAccountName,
      defaultAccountType: input.defaultAccountType,
      defaultCurrency: input.defaultCurrency,
      dayFirst: input.dayFirst
    });

    const connection = await this.repository.upsertConnection({
      userId,
      provider,
      status: "connected",
      displayName: input.institutionName?.trim() || providerDisplayName[provider],
      metadata: {
        source: "csv_import",
        rowsImported: String(parsed.rowsImported),
        importedAt: new Date().toISOString()
      }
    });

    const syncedAt = new Date().toISOString();
    const imported = await this.repository.upsertImportedConnectionData(
      connection,
      {
        accounts: parsed.accounts,
        transactions: parsed.transactions
      },
      syncedAt
    );

    const updatedConnection = await this.repository.getConnectionById(userId, connection.id);

    if (!updatedConnection) {
      throw new Error("Connection disappeared after CSV import.");
    }

    await this.recordPortfolioSnapshot(userId, syncedAt);

    return {
      connection: updatedConnection,
      imported: {
        rowsRead: parsed.rowsRead,
        rowsImported: parsed.rowsImported,
        rowsSkipped: parsed.rowsSkipped,
        accounts: imported.accounts,
        holdings: 0,
        transactions: imported.transactions
      },
      detectedColumns: parsed.detectedColumns
    };
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

  async getPortfolioHistory(input: {
    userId: string;
    from: string;
    to: string;
    metric: "investments" | "netWorth" | "totalAssets";
    maxPoints?: number;
  }): Promise<{
    metric: "investments" | "netWorth" | "totalAssets";
    currency: string;
    from: string;
    to: string;
    points: Array<{ capturedAt: string; value: number }>;
  }> {
    const points = await this.repository.listPortfolioSnapshotPoints({
      userId: input.userId,
      from: input.from,
      to: input.to,
      limit: 20000
    });

    const metric = input.metric;
    const selected = points.map((point) => ({
      capturedAt: point.capturedAt,
      value:
        metric === "investments" ? point.investments : metric === "netWorth" ? point.netWorth : point.totalAssets
    }));

    const maxPoints = Math.max(25, Math.min(input.maxPoints ?? 500, 2000));

    const downsampled =
      selected.length <= maxPoints
        ? selected
        : selected.filter((_point, index) => index % Math.ceil(selected.length / maxPoints) === 0);

    const currency = points.length > 0 ? points[0].currency : "CAD";

    return {
      metric,
      currency,
      from: input.from,
      to: input.to,
      points: downsampled
    };
  }

  async listPortfolioSnapshots(input: { userId: string; from?: string; to?: string; limit?: number }) {
    return this.repository.listPortfolioSnapshots(input);
  }

  async getPortfolioSnapshotById(userId: string, snapshotId: string) {
    return this.repository.getPortfolioSnapshotById(userId, snapshotId);
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
