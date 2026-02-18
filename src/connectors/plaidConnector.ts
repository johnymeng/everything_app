import {
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  Products
} from "plaid";
import { config } from "../config";
import { AccountType, Connection, ConnectionCredential, LiabilityKind, Provider } from "../models";
import {
  ExchangeResult,
  LinkTokenResult,
  ProviderConnector,
  SyncedAccount,
  SyncedHolding,
  SyncedLiability,
  SyncedTransaction,
  SyncPayload
} from "./types";

function plaidEnvironmentFromConfig(env: string) {
  switch (env) {
    case "production":
      return PlaidEnvironments.production;
    case "development":
      return PlaidEnvironments.development;
    default:
      return PlaidEnvironments.sandbox;
  }
}

function buildPlaidClient(): PlaidApi {
  if (!config.plaid.clientId || !config.plaid.secret) {
    throw new Error("PLAID_CLIENT_ID and PLAID_SECRET are required when provider mode is plaid.");
  }

  const basePath = plaidEnvironmentFromConfig(config.plaid.env);
  const plaidConfig = new Configuration({
    basePath,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": config.plaid.clientId,
        "PLAID-SECRET": config.plaid.secret
      }
    }
  });

  return new PlaidApi(plaidConfig);
}

function providerProducts(provider: Provider): Products[] {
  if (provider === "wealthsimple") {
    return [Products.Investments, Products.Transactions];
  }

  if (provider === "amex") {
    return [Products.Transactions, Products.Liabilities];
  }

  if (provider === "eq_bank") {
    return [Products.Auth, Products.Transactions];
  }

  return [Products.Auth, Products.Transactions, Products.Liabilities];
}

function mapAccountType(type?: string, subtype?: string): AccountType {
  if (type === "depository") {
    if (subtype === "savings") {
      return "savings";
    }

    if (subtype === "checking") {
      return "chequing";
    }

    return "cash";
  }

  if (type === "credit") {
    return "credit_card";
  }

  if (type === "loan") {
    if (subtype === "mortgage") {
      return "mortgage";
    }

    if (subtype === "line of credit") {
      return "line_of_credit";
    }

    return "loan";
  }

  if (type === "investment") {
    return "investment";
  }

  return "other";
}

function normalizeLiabilityKind(accountType: AccountType): LiabilityKind {
  if (accountType === "credit_card") {
    return "credit_card";
  }

  if (accountType === "line_of_credit") {
    return "line_of_credit";
  }

  if (accountType === "mortgage") {
    return "mortgage";
  }

  if (accountType === "loan") {
    return "loan";
  }

  return "other";
}

export class PlaidConnector implements ProviderConnector {
  readonly mode = "plaid";
  private readonly plaid: PlaidApi;

  constructor(
    readonly provider: Provider,
    readonly displayName: string
  ) {
    this.plaid = buildPlaidClient();
  }

  async createLinkToken(userId: string): Promise<LinkTokenResult> {
    const countryCodes = config.plaid.countryCodes.map((code) => code.toUpperCase() as CountryCode);

    const request: Record<string, unknown> = {
      client_name: config.appName,
      language: "en",
      user: {
        client_user_id: `${userId}:${this.provider}`
      },
      country_codes: countryCodes,
      products: providerProducts(this.provider)
    };

    if (config.plaid.redirectUri) {
      request.redirect_uri = config.plaid.redirectUri;
    }

    const result = await this.plaid.linkTokenCreate(request as never);

    return {
      linkToken: result.data.link_token,
      expiration: result.data.expiration,
      mode: this.mode
    };
  }

  async exchangePublicToken(_userId: string, publicToken: string): Promise<ExchangeResult> {
    const exchange = await this.plaid.itemPublicTokenExchange({ public_token: publicToken });
    const accessToken = exchange.data.access_token;
    const itemId = exchange.data.item_id;

    const item = await this.plaid.itemGet({ access_token: accessToken });
    const institutionId = item.data.item.institution_id ?? undefined;

    let institutionName = this.displayName;

    if (institutionId) {
      try {
        const institution = await this.plaid.institutionsGetById({
          institution_id: institutionId,
          country_codes: [CountryCode.Ca, CountryCode.Us]
        });
        institutionName = institution.data.institution.name;
      } catch (_error) {
        institutionName = this.displayName;
      }
    }

    return {
      displayName: institutionName,
      metadata: {
        mode: this.mode,
        itemId,
        institutionId: institutionId ?? ""
      },
      credential: {
        accessToken,
        itemId,
        institutionId
      }
    };
  }

  async sync(connection: Connection, credential: ConnectionCredential): Promise<SyncPayload> {
    const accessToken = credential.accessToken;
    const accountResponse = await this.plaid.accountsGet({ access_token: accessToken });

    const syncedAccounts: SyncedAccount[] = accountResponse.data.accounts.map((account) => ({
      externalId: account.account_id,
      name: account.name,
      type: mapAccountType(account.type, account.subtype ?? undefined),
      currency: account.balances.iso_currency_code ?? account.balances.unofficial_currency_code ?? "CAD",
      balance: Number(account.balances.current ?? 0),
      institutionName: connection.displayName
    }));

    const accountById = new Map(accountResponse.data.accounts.map((account) => [account.account_id, account]));

    const holdings: SyncedHolding[] = [];

    try {
      const holdingsResponse = await this.plaid.investmentsHoldingsGet({ access_token: accessToken });
      const securityById = new Map(
        holdingsResponse.data.securities.map((security) => [security.security_id, security])
      );

      for (const holding of holdingsResponse.data.holdings) {
        const security = securityById.get(holding.security_id);
        const unitPrice = Number(holding.institution_price ?? 0);
        const quantity = Number(holding.quantity ?? 0);
        const value = Number(holding.institution_value ?? quantity * unitPrice);

        holdings.push({
          externalId: `${holding.account_id}:${holding.security_id}`,
          accountExternalId: holding.account_id,
          symbol: security?.ticker_symbol ?? "N/A",
          name: security?.name ?? "Unknown security",
          quantity,
          unitPrice,
          value,
          currency:
            security?.iso_currency_code ?? security?.unofficial_currency_code ?? "CAD"
        });
      }
    } catch (_error) {
      // Accounts without the Investments product are expected to fail this call.
    }

    const liabilities: SyncedLiability[] = [];

    try {
      const liabilitiesResponse = await this.plaid.liabilitiesGet({ access_token: accessToken });

      for (const credit of liabilitiesResponse.data.liabilities.credit ?? []) {
        if (!credit.account_id) {
          continue;
        }

        const account = accountById.get(credit.account_id);
        const accountType = mapAccountType(account?.type, account?.subtype ?? undefined);
        const accountBalance = Math.abs(Number(account?.balances.current ?? 0));

        liabilities.push({
          externalId: `${credit.account_id}:credit`,
          accountExternalId: credit.account_id,
          kind: normalizeLiabilityKind(accountType),
          name: account?.name ?? "Credit account",
          balance: Number(credit.last_statement_balance ?? accountBalance),
          interestRate: credit.aprs?.[0]?.apr_percentage ?? undefined,
          minimumPayment: credit.minimum_payment_amount ?? undefined,
          currency: account?.balances.iso_currency_code ?? account?.balances.unofficial_currency_code ?? "CAD",
          dueDate: credit.next_payment_due_date ?? undefined
        });
      }

      for (const mortgage of liabilitiesResponse.data.liabilities.mortgage ?? []) {
        if (!mortgage.account_id) {
          continue;
        }

        const account = accountById.get(mortgage.account_id);
        const accountBalance = Math.abs(Number(account?.balances.current ?? 0));

        liabilities.push({
          externalId: `${mortgage.account_id}:mortgage`,
          accountExternalId: mortgage.account_id,
          kind: "mortgage",
          name: account?.name ?? "Mortgage",
          balance: accountBalance,
          interestRate: mortgage.interest_rate?.percentage ?? undefined,
          minimumPayment: mortgage.last_payment_amount ?? undefined,
          currency: account?.balances.iso_currency_code ?? account?.balances.unofficial_currency_code ?? "CAD",
          dueDate: mortgage.next_payment_due_date ?? undefined
        });
      }

      for (const student of liabilitiesResponse.data.liabilities.student ?? []) {
        if (!student.account_id) {
          continue;
        }

        const account = accountById.get(student.account_id);
        const accountBalance = Math.abs(Number(account?.balances.current ?? 0));

        liabilities.push({
          externalId: `${student.account_id}:student`,
          accountExternalId: student.account_id,
          kind: "loan",
          name: account?.name ?? student.loan_name ?? "Loan",
          balance: accountBalance,
          interestRate: student.interest_rate_percentage ?? undefined,
          minimumPayment: student.minimum_payment_amount ?? undefined,
          currency: account?.balances.iso_currency_code ?? account?.balances.unofficial_currency_code ?? "CAD",
          dueDate: student.expected_payoff_date ?? undefined
        });
      }
    } catch (_error) {
      // Accounts without liabilities access are expected to fail this call.
    }

    const transactions: SyncedTransaction[] = [];

    try {
      const endDate = new Date();
      const startDate = new Date(endDate);
      startDate.setDate(endDate.getDate() - 90);

      const transactionResponse = await this.plaid.transactionsGet({
        access_token: accessToken,
        start_date: startDate.toISOString().slice(0, 10),
        end_date: endDate.toISOString().slice(0, 10),
        options: {
          count: 500,
          offset: 0
        }
      });

      for (const transaction of transactionResponse.data.transactions) {
        const direction = transaction.amount >= 0 ? "debit" : "credit";

        transactions.push({
          externalId: transaction.transaction_id,
          accountExternalId: transaction.account_id,
          date: transaction.date,
          description: transaction.name,
          category: transaction.personal_finance_category?.primary || transaction.category?.[0] || "uncategorized",
          amount: Math.abs(Number(transaction.amount)),
          direction,
          currency: transaction.iso_currency_code ?? transaction.unofficial_currency_code ?? "CAD"
        });
      }
    } catch (_error) {
      // If transactions are unavailable we still keep accounts/holdings/liabilities.
    }

    return {
      accounts: syncedAccounts,
      holdings,
      liabilities,
      transactions
    };
  }
}
