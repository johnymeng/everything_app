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
  costBasis?: number;
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
export type HealthConnectionMode = "shortcut_push";

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

export interface Habit {
  id: string;
  userId: string;
  name: string;
  color: string;
  sortOrder: number;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HabitLogEntry {
  id: string;
  userId: string;
  habitId: string;
  date: string;
  completed: boolean;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailyPhotoMeta {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD (local date key)
  takenAt: string; // ISO timestamp
  contentType: string;
  caption?: string;
  createdAt: string;
  updatedAt: string;
}

export const learningInterestAreas = ["software", "hardware", "trivia"] as const;
export type LearningInterestArea = (typeof learningInterestAreas)[number];

export interface LearningPreference {
  userId: string;
  interestArea: LearningInterestArea;
  createdAt: string;
  updatedAt: string;
}

export interface LearningTopic {
  key: string;
  interestArea: LearningInterestArea;
  title: string;
  overview: string;
  minutes: number;
  plan: string[];
  quizPrompts: string[];
  takeaways: string[];
  resources?: Array<{ label: string; url: string }>;
}

export interface LearningProgress {
  id: string;
  userId: string;
  topicKey: string;
  interestArea: LearningInterestArea;
  learnedAt: string;
  reviewStage: number;
  nextReviewAt: string;
  lastReviewedAt?: string;
  reviewCount: number;
  correctStreak: number;
  createdAt: string;
  updatedAt: string;
}

export interface LearningSuggestion {
  kind: "new" | "review";
  topic: LearningTopic;
}

export interface LearningDashboardSummary {
  preference: LearningPreference;
  suggestion: LearningSuggestion;
  dueCount: number;
  nextDueAt?: string;
  recent: LearningProgress[];
}
