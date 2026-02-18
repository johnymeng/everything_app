import crypto from "node:crypto";
import { config } from "../config";
import { AccountType, Connection, ConnectionCredential, Provider } from "../models";
import {
  ExchangeResult,
  LinkTokenResult,
  ProviderConnector,
  SyncedAccount,
  SyncedTransaction,
  SyncPayload
} from "./types";

const STEPUP_REQUIRED_PREFIX = "EQ Bank step-up required";

interface EqLoginBody extends Record<string, unknown> {
  TMSessionId: string;
  email: string;
  password: string;
}

interface EqStepupConfiguration {
  stepupType?: string;
  challengedQuestion?: string;
  questionCode?: string;
  channel?: string;
}

interface EqLoginResponse {
  accessToken?: string;
  isStepupRequired?: boolean;
  sessionReferenceId?: string;
  stepupConfiguration?: EqStepupConfiguration;
  error?: {
    variant?: string;
    message?: string;
    code?: string;
  };
}

interface EqDashboardAccount {
  accountNumber?: string;
  arrangementId?: string;
  accountName?: string;
  accountType?: string;
  productType?: string;
  currency?: string;
  currentBalance?: number;
  availableBalance?: number;
}

interface EqDashboardResponse {
  accounts?: Record<string, unknown>;
  error?: {
    variant?: string;
    message?: string;
    code?: string;
  };
}

interface EqRecentTransaction {
  amount?: number;
  date?: string;
  description?: string;
  type?: string;
}

interface EqRecentTransactionsResponse {
  transactions?: EqRecentTransaction[];
  error?: {
    variant?: string;
    message?: string;
    code?: string;
  };
}

interface EqAuthPublicTokenPayload {
  email: string;
  password: string;
  stepupType?: string;
  otpPin?: string;
  questionCode?: string;
  questionAnswer?: string;
  trustDevice?: boolean;
  clientOS?: string;
  clientVersion?: string;
}

interface EqLoginParams {
  email: string;
  password: string;
  stepupType?: string;
  otpPin?: string;
  questionCode?: string;
  questionAnswer?: string;
  trustDevice?: boolean;
  clientOS?: string;
  clientVersion?: string;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function parseEqPayload(publicToken: string): EqAuthPublicTokenPayload {
  const prefix = "eq-mobile-auth:";

  if (!publicToken.startsWith(prefix)) {
    throw new Error(
      "EQ mobile connector expects an auth payload token. Reconnect EQ and submit your login details."
    );
  }

  const encodedPayload = publicToken.slice(prefix.length);

  try {
    const raw = Buffer.from(encodedPayload, "base64").toString("utf8");
    const parsed = JSON.parse(raw) as Partial<EqAuthPublicTokenPayload>;

    if (!parsed.email || !parsed.password) {
      throw new Error("EQ auth payload is missing email or password.");
    }

    return {
      email: parsed.email.trim(),
      password: parsed.password,
      stepupType: parsed.stepupType?.trim(),
      otpPin: parsed.otpPin?.trim(),
      questionCode: parsed.questionCode?.trim(),
      questionAnswer: parsed.questionAnswer?.trim(),
      trustDevice: parsed.trustDevice,
      clientOS: parsed.clientOS?.trim(),
      clientVersion: parsed.clientVersion?.trim()
    };
  } catch (error) {
    throw new Error(
      `Unable to decode EQ auth payload: ${error instanceof Error ? error.message : "unknown error"}`
    );
  }
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function buildCorrelationId(): string {
  return crypto.randomUUID();
}

function buildTmSessionId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function eqErrorMessage(errorBody: { error?: { variant?: string; message?: string; code?: string } }): string {
  if (!errorBody.error) {
    return "Unknown EQ Bank API error";
  }

  const variant = errorBody.error.variant ? `${errorBody.error.variant}: ` : "";
  const message = errorBody.error.message ?? "Unknown EQ Bank API error";
  return `${variant}${message}`;
}

function mapEqAccountType(account: EqDashboardAccount): AccountType {
  const label = `${account.accountType ?? ""} ${account.productType ?? ""}`.toUpperCase();

  if (label.includes("HISA") || label.includes("SAV")) {
    return "savings";
  }

  if (label.includes("JOINT")) {
    return "chequing";
  }

  if (label.includes("GIC") || label.includes("TFSA") || label.includes("RRSP") || label.includes("INVEST")) {
    return "investment";
  }

  return "cash";
}

function normalizeStepupType(stepupType?: string): string | undefined {
  if (!stepupType) {
    return undefined;
  }

  const normalized = stepupType.trim().toUpperCase();

  if (normalized === "QUESTION") {
    return "CHALLENGED_QUESTION";
  }

  return normalized;
}

function isStepupRequiredError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith(STEPUP_REQUIRED_PREFIX);
}

export class EqBankMobileConnector implements ProviderConnector {
  readonly mode = "eq_mobile_api";
  private readonly baseUrl: string;

  constructor(
    readonly provider: Provider,
    readonly displayName: string
  ) {
    this.baseUrl = normalizeBaseUrl(config.eqBank.baseUrl);
  }

  async createLinkToken(userId: string): Promise<LinkTokenResult> {
    return {
      linkToken: `eq-mobile-link:${this.provider}:${userId}:${Date.now()}`,
      mode: this.mode
    };
  }

  async exchangePublicToken(_userId: string, publicToken: string): Promise<ExchangeResult> {
    const payload = parseEqPayload(publicToken);
    const login = await this.authenticate(payload);

    return {
      displayName: this.displayName,
      metadata: {
        mode: this.mode,
        authFlow: "eq_mobile_api",
        stepupType: login.stepupType ?? "",
        clientOS: payload.clientOS ?? config.eqBank.clientOS,
        clientVersion: payload.clientVersion ?? config.eqBank.clientVersion
      },
      credential: {
        accessToken: login.accessToken,
        eqEmail: payload.email,
        eqPassword: payload.password,
        eqStepupType: login.stepupType,
        eqQuestionCode: payload.questionCode,
        eqQuestionAnswer: payload.questionAnswer,
        eqTrustDevice: payload.trustDevice ?? config.eqBank.trustDevice,
        eqClientOS: payload.clientOS ?? config.eqBank.clientOS,
        eqClientVersion: payload.clientVersion ?? config.eqBank.clientVersion
      }
    };
  }

  async sync(connection: Connection, credential: ConnectionCredential): Promise<SyncPayload> {
    const email = credential.eqEmail;
    let accessToken = "";

    if (email && credential.eqPassword) {
      try {
        const login = await this.authenticate({
          email,
          password: credential.eqPassword,
          stepupType: credential.eqStepupType,
          questionCode: credential.eqQuestionCode,
          questionAnswer: credential.eqQuestionAnswer,
          trustDevice: credential.eqTrustDevice,
          clientOS: credential.eqClientOS,
          clientVersion: credential.eqClientVersion
        });
        accessToken = login.accessToken;
      } catch (error) {
        if (!credential.accessToken || !isStepupRequiredError(error)) {
          throw error;
        }

        accessToken = credential.accessToken;
      }
    } else if (credential.accessToken && email) {
      accessToken = credential.accessToken;
    } else {
      throw new Error(
        "Missing EQ credentials. Reconnect EQ Bank and provide your login details to refresh access."
      );
    }

    const accounts = await this.fetchAccounts(accessToken, email);
    const transactions: SyncedTransaction[] = [];

    for (const account of accounts) {
      if (!account.accountNumber) {
        continue;
      }

      const recentTransactions = await this.fetchRecentTransactions(accessToken, email, account.accountNumber);
      transactions.push(...mapTransactions(account, recentTransactions));
    }

    return {
      accounts: mapAccounts(accounts, connection.displayName),
      holdings: [],
      liabilities: [],
      transactions
    };
  }

  private async authenticate(params: EqLoginParams): Promise<{ accessToken: string; stepupType?: string }> {
    const login = await this.eqRequest<EqLoginResponse>("POST", "loginmgmt/v2.0.0/vs1/login", {
      body: {
        TMSessionId: buildTmSessionId(),
        email: params.email,
        password: params.password
      } as EqLoginBody,
      clientOS: params.clientOS,
      clientVersion: params.clientVersion
    });

    if (login.error) {
      throw new Error(`EQ login failed: ${eqErrorMessage(login)}`);
    }

    if (login.isStepupRequired) {
      const stepupType = normalizeStepupType(login.stepupConfiguration?.stepupType);

      if (!login.sessionReferenceId || !stepupType) {
        throw new Error(`${STEPUP_REQUIRED_PREFIX}, but the API response was incomplete.`);
      }

      if (stepupType === "OTP") {
        if (!params.otpPin) {
          const channel = login.stepupConfiguration?.channel ? ` via ${login.stepupConfiguration.channel}` : "";
          throw new Error(
            `${STEPUP_REQUIRED_PREFIX} (OTP${channel}). Reconnect and provide your OTP code.`
          );
        }

        const stepupOtp = await this.eqRequest<EqLoginResponse>("PUT", "loginmgmt/v2.0.0/vs1/login/stepup", {
          body: {
            email: params.email,
            sessionReferenceId: login.sessionReferenceId,
            stepupConfiguration: {
              PIN: params.otpPin,
              stepupType: "OTP",
              trustDevice: params.trustDevice ?? config.eqBank.trustDevice
            }
          },
          clientOS: params.clientOS,
          clientVersion: params.clientVersion
        });

        if (stepupOtp.error) {
          throw new Error(`EQ OTP step-up failed: ${eqErrorMessage(stepupOtp)}`);
        }

        if (!stepupOtp.accessToken) {
          throw new Error("EQ OTP step-up did not return an access token.");
        }

        return { accessToken: stepupOtp.accessToken, stepupType };
      }

      if (stepupType === "CHALLENGED_QUESTION") {
        const questionCode = params.questionCode ?? login.stepupConfiguration?.questionCode;

        if (!params.questionAnswer || !questionCode) {
          const challengedQuestion = login.stepupConfiguration?.challengedQuestion
            ? ` Question: ${login.stepupConfiguration.challengedQuestion}`
            : "";
          const codeHint = login.stepupConfiguration?.questionCode
            ? ` Code: ${login.stepupConfiguration.questionCode}.`
            : "";

          throw new Error(
            `${STEPUP_REQUIRED_PREFIX} (security question). Reconnect and provide question code + answer.${codeHint}${challengedQuestion}`
          );
        }

        const stepupQuestion = await this.eqRequest<EqLoginResponse>("PUT", "loginmgmt/v2.0.0/vs1/login/stepup", {
          body: {
            email: params.email,
            sessionReferenceId: login.sessionReferenceId,
            stepupConfiguration: {
              questionAnswer: params.questionAnswer,
              questionCode,
              trustDevice: params.trustDevice ?? config.eqBank.trustDevice
            }
          },
          clientOS: params.clientOS,
          clientVersion: params.clientVersion
        });

        if (stepupQuestion.error) {
          throw new Error(`EQ security-question step-up failed: ${eqErrorMessage(stepupQuestion)}`);
        }

        if (!stepupQuestion.accessToken) {
          throw new Error("EQ security-question step-up did not return an access token.");
        }

        return { accessToken: stepupQuestion.accessToken, stepupType };
      }

      throw new Error(`${STEPUP_REQUIRED_PREFIX} (${stepupType}) is not supported by this connector yet.`);
    }

    if (!login.accessToken) {
      throw new Error("EQ login did not return an access token.");
    }

    return {
      accessToken: login.accessToken,
      stepupType: normalizeStepupType(params.stepupType)
    };
  }

  private async fetchAccounts(accessToken: string, email: string): Promise<EqDashboardAccount[]> {
    const dashboard = await this.eqRequest<EqDashboardResponse>("GET", "dashboard", {
      accessToken,
      email
    });

    if (dashboard.error) {
      throw new Error(`EQ dashboard request failed: ${eqErrorMessage(dashboard)}`);
    }

    const accountsRoot = dashboard.accounts;

    if (!accountsRoot || typeof accountsRoot !== "object") {
      return [];
    }

    const accounts: EqDashboardAccount[] = [];

    for (const [group, value] of Object.entries(accountsRoot)) {
      if (!Array.isArray(value)) {
        continue;
      }

      for (const item of value) {
        if (!item || typeof item !== "object") {
          continue;
        }

        const account = item as EqDashboardAccount;

        accounts.push({
          ...account,
          productType: account.productType ?? group
        });
      }
    }

    return accounts;
  }

  private async fetchRecentTransactions(
    accessToken: string,
    email: string,
    accountNumber: string
  ): Promise<EqRecentTransaction[]> {
    const response = await this.eqRequest<EqRecentTransactionsResponse>("GET", "transaction/recent", {
      accessToken,
      email,
      headers: {
        accountId: accountNumber
      }
    });

    if (response.error) {
      throw new Error(`EQ recent transactions request failed: ${eqErrorMessage(response)}`);
    }

    return response.transactions ?? [];
  }

  private async eqRequest<T>(
    method: "GET" | "POST" | "PUT",
    path: string,
    options: {
      body?: Record<string, unknown>;
      accessToken?: string;
      email?: string;
      clientOS?: string;
      clientVersion?: string;
      headers?: Record<string, string>;
    }
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);
    const headers: Record<string, string> = {
      Authorization: config.eqBank.authorization,
      correlationId: buildCorrelationId(),
      clientOS: options.clientOS ?? config.eqBank.clientOS
    };

    const clientVersion = options.clientVersion ?? config.eqBank.clientVersion;

    if (clientVersion) {
      headers.clientVersion = clientVersion;
    }

    if (options.accessToken) {
      headers.accessToken = options.accessToken;
    }

    if (options.email) {
      headers.email = options.email;
    }

    if (options.body) {
      headers["Content-Type"] = "application/json";
    }

    Object.assign(headers, options.headers ?? {});

    const response = await fetch(url, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const raw = await response.text();
    const payload = raw ? (JSON.parse(raw) as T) : ({} as T);

    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "error" in payload
          ? eqErrorMessage(payload as { error?: { variant?: string; message?: string; code?: string } })
          : `${response.status} ${response.statusText}`;
      throw new Error(`EQ API request failed (${method} ${path}): ${message}`);
    }

    return payload;
  }
}

function mapAccounts(accounts: EqDashboardAccount[], institutionName: string): SyncedAccount[] {
  return accounts.map((account, index) => {
    const externalId = account.arrangementId ?? account.accountNumber ?? `eq-account-${index}`;
    const name = account.accountName ?? account.accountNumber ?? `EQ Account ${index + 1}`;
    const currency = account.currency ?? "CAD";
    const balance = toNumber(account.currentBalance ?? account.availableBalance ?? 0);

    return {
      externalId,
      name,
      type: mapEqAccountType(account),
      currency,
      balance,
      institutionName
    };
  });
}

function mapTransactions(
  account: EqDashboardAccount,
  transactions: EqRecentTransaction[]
): SyncedTransaction[] {
  const accountExternalId = account.arrangementId ?? account.accountNumber ?? "";

  if (!accountExternalId) {
    return [];
  }

  return transactions
    .filter((transaction) => Boolean(transaction.date))
    .map((transaction, index) => {
      const amount = Math.abs(toNumber(transaction.amount ?? 0));
      const direction = String(transaction.type ?? "").toUpperCase() === "CREDIT" ? "credit" : "debit";
      const description = transaction.description?.trim() || "EQ transaction";
      const date = String(transaction.date).slice(0, 10);
      const signature = `${accountExternalId}:${date}:${description}:${amount}:${direction}:${index}`;
      const hash = crypto.createHash("sha1").update(signature).digest("hex").slice(0, 24);

      return {
        externalId: `${accountExternalId}:${hash}`,
        accountExternalId,
        date,
        description,
        category: "banking",
        amount,
        direction,
        currency: account.currency ?? "CAD"
      };
    });
}
