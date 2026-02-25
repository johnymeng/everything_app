import {
  AccountType,
  Connection,
  ConnectionCredential,
  LiabilityKind,
  Provider,
  TransactionDirection
} from "../models";

export interface SyncedAccount {
  externalId: string;
  name: string;
  type: AccountType;
  currency: string;
  balance: number;
  institutionName: string;
}

export interface SyncedHolding {
  externalId: string;
  accountExternalId: string;
  symbol: string;
  name: string;
  quantity: number;
  unitPrice: number;
  value: number;
  costBasis?: number;
  currency: string;
}

export interface SyncedLiability {
  externalId: string;
  accountExternalId: string;
  kind: LiabilityKind;
  name: string;
  balance: number;
  interestRate?: number;
  minimumPayment?: number;
  currency: string;
  dueDate?: string;
}

export interface SyncedTransaction {
  externalId: string;
  accountExternalId: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  direction: TransactionDirection;
  currency: string;
}

export interface SyncPayload {
  accounts: SyncedAccount[];
  holdings: SyncedHolding[];
  liabilities: SyncedLiability[];
  transactions: SyncedTransaction[];
}

export interface LinkTokenResult {
  linkToken: string;
  expiration?: string;
  mode: string;
}

export interface ExchangeResult {
  displayName: string;
  metadata?: Record<string, string>;
  credential: ConnectionCredential;
}

export interface ProviderConnector {
  provider: Provider;
  displayName: string;
  mode: string;
  createLinkToken(userId: string): Promise<LinkTokenResult>;
  exchangePublicToken(userId: string, publicToken: string): Promise<ExchangeResult>;
  sync(connection: Connection, credential: ConnectionCredential): Promise<SyncPayload>;
}
