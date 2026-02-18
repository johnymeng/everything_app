export const providers = ["eq_bank", "wealthsimple", "td", "amex"] as const;

export type Provider = (typeof providers)[number];

export type AccountType =
  | "cash"
  | "chequing"
  | "savings"
  | "investment"
  | "credit_card"
  | "loan"
  | "line_of_credit"
  | "mortgage"
  | "other";

export type ConnectionStatus = "connected" | "disconnected" | "error";

export type LiabilityKind = "credit_card" | "loan" | "line_of_credit" | "mortgage" | "other";

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserAuthRecord extends User {
  passwordHash: string;
}

export interface Connection {
  id: string;
  userId: string;
  provider: Provider;
  status: ConnectionStatus;
  displayName: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, string>;
}

export interface ConnectionCredential {
  accessToken: string;
  itemId?: string;
  institutionId?: string;
}

export interface Account {
  id: string;
  connectionId: string;
  provider: Provider;
  name: string;
  type: AccountType;
  currency: string;
  balance: number;
  institutionName: string;
  lastSyncedAt: string;
}

export interface Holding {
  id: string;
  accountId: string;
  symbol: string;
  name: string;
  quantity: number;
  unitPrice: number;
  value: number;
  currency: string;
  lastPriceAt: string;
}

export interface Liability {
  id: string;
  accountId: string;
  provider: Provider;
  kind: LiabilityKind;
  name: string;
  balance: number;
  interestRate?: number;
  minimumPayment?: number;
  currency: string;
  dueDate?: string;
  lastSyncedAt: string;
}

export type TransactionDirection = "debit" | "credit";

export interface Transaction {
  id: string;
  accountId: string;
  provider: Provider;
  date: string;
  description: string;
  category: string;
  amount: number;
  direction: TransactionDirection;
  currency: string;
}

export interface FinanceStore {
  connections: Connection[];
  accounts: Account[];
  holdings: Holding[];
  liabilities: Liability[];
  transactions: Transaction[];
}

export interface ProviderSummary {
  provider: Provider;
  assets: number;
  liabilities: number;
}

export interface FinanceSummary {
  totals: {
    assets: number;
    cashAndSavings: number;
    investments: number;
    liabilities: number;
    debt: number;
    netWorth: number;
  };
  providers: ProviderSummary[];
  counts: {
    connections: number;
    accounts: number;
    liabilities: number;
    transactions: number;
  };
}
