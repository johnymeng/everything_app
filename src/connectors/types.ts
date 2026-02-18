import {
  AccountType,
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

export interface ConnectResult {
  displayName: string;
  metadata?: Record<string, string>;
}

export interface ProviderConnector {
  provider: Provider;
  displayName: string;
  mode: string;
  connect(userId: string): Promise<ConnectResult>;
  sync(connectionId: string, userId: string): Promise<SyncPayload>;
}
