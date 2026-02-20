export const providers = ["eq_bank", "wealthsimple", "td", "amex", "manual_csv"] as const;

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
  snaptradeUserId?: string;
  snaptradeUserSecret?: string;
  eqEmail?: string;
  eqPassword?: string;
  eqStepupType?: string;
  eqQuestionCode?: string;
  eqQuestionAnswer?: string;
  eqTrustDevice?: boolean;
  eqClientOS?: string;
  eqClientVersion?: string;
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
  healthConnections: HealthConnection[];
  fitnessSamples: FitnessSample[];
  fitnessTargets: FitnessTarget[];
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

export const fitnessMetrics = [
  "vo2_max",
  "resting_heart_rate",
  "heart_rate_variability",
  "sleep_hours",
  "steps",
  "workout_minutes",
  "body_weight",
  "squat_1rm",
  "bench_1rm",
  "deadlift_1rm",
  "mile_time"
] as const;

export type FitnessMetric = (typeof fitnessMetrics)[number];
export type FitnessSampleSource = "apple_health" | "manual";
export type HealthProvider = "apple_health";
export type HealthConnectionMode = "mock" | "shortcut_push";

export interface HealthConnection {
  id: string;
  userId: string;
  provider: HealthProvider;
  status: ConnectionStatus;
  mode: HealthConnectionMode;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt?: string;
  metadata?: Record<string, string>;
}

export interface FitnessSample {
  id: string;
  userId: string;
  metric: FitnessMetric;
  value: number;
  unit: string;
  source: FitnessSampleSource;
  recordedAt: string;
}

export interface FitnessTarget {
  id: string;
  userId: string;
  metric: FitnessMetric;
  label: string;
  targetValue: number;
  unit: string;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FitnessTargetProgress {
  target: FitnessTarget;
  currentValue?: number;
  gap?: number;
  status: "hit" | "on_track" | "off_track" | "no_data";
}

export interface SuggestedFitnessTarget {
  metric: FitnessMetric;
  label: string;
  targetValue: number;
  unit: string;
  reason: string;
}

export interface FitnessDashboard {
  connection: HealthConnection | null;
  latest: FitnessSample[];
  targetProgress: FitnessTargetProgress[];
  suggestedTargets: SuggestedFitnessTarget[];
  insights: string[];
}
