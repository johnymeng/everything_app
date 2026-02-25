import crypto from "node:crypto";
import { Pool, PoolClient } from "pg";
import {
  Account,
  Connection,
  ConnectionStatus,
  DailyPhotoMeta,
  FitnessMetric,
  FitnessSample,
  FitnessSampleSource,
  FitnessTarget,
  Habit,
  HabitLogEntry,
  HealthConnection,
  HealthConnectionMode,
  Holding,
  Liability,
  LearningInterestArea,
  LearningPreference,
  LearningProgress,
  Provider,
  Transaction,
  User,
  UserAuthRecord
} from "../models";
import { SyncPayload } from "../connectors/types";

interface UpsertConnectionInput {
  userId: string;
  provider: Provider;
  status: ConnectionStatus;
  displayName: string;
  metadata?: Record<string, string>;
  encryptedCredential?: string;
  institutionId?: string;
  itemId?: string;
}

interface UpsertHealthConnectionInput {
  userId: string;
  provider: "apple_health";
  status: ConnectionStatus;
  mode: HealthConnectionMode;
  metadata?: Record<string, string>;
  lastSyncedAt?: string;
}

interface InsertFitnessSampleInput {
  userId: string;
  metric: FitnessMetric;
  value: number;
  unit: string;
  source: FitnessSampleSource;
  recordedAt: string;
}

interface UpsertFitnessTargetInput {
  userId: string;
  metric: FitnessMetric;
  label: string;
  targetValue: number;
  unit: string;
  dueDate?: string;
}

interface UpsertLearningPreferenceInput {
  userId: string;
  interestArea: LearningInterestArea;
}

interface UpsertLearningCompletionInput {
  userId: string;
  topicKey: string;
  interestArea: LearningInterestArea;
  learnedAt: string;
  nextReviewAt: string;
}

interface UpdateLearningReviewInput {
  userId: string;
  topicKey: string;
  reviewStage: number;
  nextReviewAt: string;
  lastReviewedAt: string;
  correctStreak: number;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS connections (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  display_name TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  encrypted_credential TEXT,
  institution_id TEXT,
  item_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  currency TEXT NOT NULL,
  balance NUMERIC(18,2) NOT NULL,
  institution_name TEXT NOT NULL,
  last_synced_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS holdings (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity NUMERIC(18,6) NOT NULL,
  unit_price NUMERIC(18,6) NOT NULL,
  value NUMERIC(18,2) NOT NULL,
  cost_basis NUMERIC(18,2),
  currency TEXT NOT NULL,
  last_price_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE holdings ADD COLUMN IF NOT EXISTS cost_basis NUMERIC(18,2);

CREATE TABLE IF NOT EXISTS liabilities (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  balance NUMERIC(18,2) NOT NULL,
  interest_rate NUMERIC(10,4),
  minimum_payment NUMERIC(18,2),
  currency TEXT NOT NULL,
  due_date DATE,
  last_synced_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  direction TEXT NOT NULL,
  currency TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ NOT NULL,
  currency TEXT NOT NULL,
  total_assets NUMERIC(18,2) NOT NULL,
  investments NUMERIC(18,2) NOT NULL,
  net_worth NUMERIC(18,2) NOT NULL,
  accounts JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS health_connections (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  mode TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

CREATE TABLE IF NOT EXISTS fitness_samples (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  value NUMERIC(18,4) NOT NULL,
  unit TEXT NOT NULL,
  source TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fitness_targets (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  label TEXT NOT NULL,
  target_value NUMERIC(18,4) NOT NULL,
  unit TEXT NOT NULL,
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, metric)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fitness_samples_dedupe
  ON fitness_samples(user_id, metric, recorded_at, value, source);

CREATE TABLE IF NOT EXISTS habits (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#18d18c',
  sort_order INT NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, name),
  UNIQUE(id, user_id)
);

CREATE TABLE IF NOT EXISTS habit_logs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  habit_id UUID NOT NULL,
  date DATE NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, habit_id, date),
  FOREIGN KEY (habit_id, user_id) REFERENCES habits(id, user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_connections_user ON connections(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_connection ON accounts(connection_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_user_time ON portfolio_snapshots(user_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_connections_user ON health_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_fitness_samples_user ON fitness_samples(user_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_fitness_targets_user ON fitness_targets(user_id);
CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id, sort_order ASC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_habit_logs_user_date ON habit_logs(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_habit_logs_user_habit ON habit_logs(user_id, habit_id, date DESC);

CREATE TABLE IF NOT EXISTS daily_photos (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date_key DATE NOT NULL,
  taken_at TIMESTAMPTZ NOT NULL,
  content_type TEXT NOT NULL,
  caption TEXT,
  image BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date_key)
);

CREATE INDEX IF NOT EXISTS idx_daily_photos_user_date ON daily_photos(user_id, date_key DESC);

CREATE TABLE IF NOT EXISTS learning_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  interest_area TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS learning_progress (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_key TEXT NOT NULL,
  interest_area TEXT NOT NULL,
  learned_at TIMESTAMPTZ NOT NULL,
  review_stage INT NOT NULL DEFAULT 0,
  next_review_at TIMESTAMPTZ NOT NULL,
  last_reviewed_at TIMESTAMPTZ,
  review_count INT NOT NULL DEFAULT 0,
  correct_streak INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, topic_key)
);

CREATE INDEX IF NOT EXISTS idx_learning_progress_user_next_review ON learning_progress(user_id, next_review_at);
CREATE INDEX IF NOT EXISTS idx_learning_progress_user_learned ON learning_progress(user_id, learned_at DESC);
`;

function toNumber(value: string | number | null): number {
  if (value === null) {
    return 0;
  }

  return Number.parseFloat(String(value));
}

function mapConnectionRow(row: Record<string, unknown>): Connection {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    provider: row.provider as Provider,
    status: row.status as ConnectionStatus,
    displayName: String(row.display_name),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    metadata: ((row.metadata as Record<string, string> | null) ?? undefined) || undefined
  };
}

function mapHealthConnectionRow(row: Record<string, unknown>): HealthConnection {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    provider: row.provider as "apple_health",
    status: row.status as ConnectionStatus,
    mode: row.mode as HealthConnectionMode,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    lastSyncedAt: row.last_synced_at ? new Date(String(row.last_synced_at)).toISOString() : undefined,
    metadata: ((row.metadata as Record<string, string> | null) ?? undefined) || undefined
  };
}

function mapFitnessSampleRow(row: Record<string, unknown>): FitnessSample {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    metric: row.metric as FitnessMetric,
    value: toNumber(row.value as string),
    unit: String(row.unit),
    source: row.source as FitnessSampleSource,
    recordedAt: new Date(String(row.recorded_at)).toISOString()
  };
}

function mapFitnessTargetRow(row: Record<string, unknown>): FitnessTarget {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    metric: row.metric as FitnessMetric,
    label: String(row.label),
    targetValue: toNumber(row.target_value as string),
    unit: String(row.unit),
    dueDate: row.due_date ? new Date(String(row.due_date)).toISOString().slice(0, 10) : undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

function mapHabitRow(row: Record<string, unknown>): Habit {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    color: String(row.color),
    sortOrder: Number(row.sort_order ?? 0),
    archivedAt: row.archived_at ? new Date(String(row.archived_at)).toISOString() : undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

function mapHabitLogRow(row: Record<string, unknown>): HabitLogEntry {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    habitId: String(row.habit_id),
    date: new Date(String(row.date)).toISOString().slice(0, 10),
    completed: Boolean(row.completed),
    note: row.note ? String(row.note) : undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

function mapDailyPhotoRow(row: Record<string, unknown>): DailyPhotoMeta {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    date: new Date(String(row.date_key)).toISOString().slice(0, 10),
    takenAt: new Date(String(row.taken_at)).toISOString(),
    contentType: String(row.content_type),
    caption: row.caption ? String(row.caption) : undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

function mapUserRow(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

function mapLearningPreferenceRow(row: Record<string, unknown>): LearningPreference {
  return {
    userId: String(row.user_id),
    interestArea: row.interest_area as LearningInterestArea,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

function mapLearningProgressRow(row: Record<string, unknown>): LearningProgress {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    topicKey: String(row.topic_key),
    interestArea: row.interest_area as LearningInterestArea,
    learnedAt: new Date(String(row.learned_at)).toISOString(),
    reviewStage: Number(row.review_stage ?? 0),
    nextReviewAt: new Date(String(row.next_review_at)).toISOString(),
    lastReviewedAt: row.last_reviewed_at ? new Date(String(row.last_reviewed_at)).toISOString() : undefined,
    reviewCount: Number(row.review_count ?? 0),
    correctStreak: Number(row.correct_streak ?? 0),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

export class PostgresRepository {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async listUserIds(): Promise<string[]> {
    const result = await this.pool.query(`SELECT id FROM users ORDER BY created_at ASC`);
    return result.rows.map((row: Record<string, unknown>) => String(row.id));
  }

  async insertPortfolioSnapshot(input: {
    userId: string;
    capturedAt: string;
    currency: string;
    totalAssets: number;
    investments: number;
    netWorth: number;
    accounts: unknown[];
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO portfolio_snapshots (
         id, user_id, captured_at, currency, total_assets, investments, net_worth, accounts
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        crypto.randomUUID(),
        input.userId,
        input.capturedAt,
        input.currency,
        input.totalAssets,
        input.investments,
        input.netWorth,
        JSON.stringify(input.accounts ?? [])
      ]
    );
  }

  async listPortfolioSnapshotPoints(input: {
    userId: string;
    from: string;
    to: string;
    limit?: number;
  }): Promise<Array<{ capturedAt: string; currency: string; totalAssets: number; investments: number; netWorth: number }>> {
    const limit = Math.max(1, Math.min(input.limit ?? 5000, 20000));

    const result = await this.pool.query(
      `SELECT captured_at, currency, total_assets, investments, net_worth
       FROM portfolio_snapshots
       WHERE user_id = $1 AND captured_at >= $2 AND captured_at <= $3
       ORDER BY captured_at ASC
       LIMIT $4`,
      [input.userId, input.from, input.to, limit]
    );

    return result.rows.map((row: Record<string, unknown>) => ({
      capturedAt: new Date(String(row.captured_at)).toISOString(),
      currency: String(row.currency),
      totalAssets: toNumber(row.total_assets as string),
      investments: toNumber(row.investments as string),
      netWorth: toNumber(row.net_worth as string)
    }));
  }

  async listPortfolioSnapshots(input: {
    userId: string;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<Array<{ id: string; capturedAt: string; currency: string; totalAssets: number; investments: number; netWorth: number }>> {
    const limit = Math.max(1, Math.min(input.limit ?? 250, 1000));
    const from = input.from ?? "1970-01-01T00:00:00.000Z";
    const to = input.to ?? new Date().toISOString();

    const result = await this.pool.query(
      `SELECT id, captured_at, currency, total_assets, investments, net_worth
       FROM portfolio_snapshots
       WHERE user_id = $1 AND captured_at >= $2 AND captured_at <= $3
       ORDER BY captured_at DESC
       LIMIT $4`,
      [input.userId, from, to, limit]
    );

    return result.rows.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      capturedAt: new Date(String(row.captured_at)).toISOString(),
      currency: String(row.currency),
      totalAssets: toNumber(row.total_assets as string),
      investments: toNumber(row.investments as string),
      netWorth: toNumber(row.net_worth as string)
    }));
  }

  async getPortfolioSnapshotById(userId: string, snapshotId: string): Promise<{
    id: string;
    capturedAt: string;
    currency: string;
    totalAssets: number;
    investments: number;
    netWorth: number;
    accounts: unknown[];
  } | null> {
    const result = await this.pool.query(
      `SELECT id, captured_at, currency, total_assets, investments, net_worth, accounts
       FROM portfolio_snapshots
       WHERE id = $1 AND user_id = $2
       LIMIT 1`,
      [snapshotId, userId]
    );

    if (result.rowCount === 0) {
      return null;
    }

    const row = result.rows[0] as Record<string, unknown>;
    return {
      id: String(row.id),
      capturedAt: new Date(String(row.captured_at)).toISOString(),
      currency: String(row.currency),
      totalAssets: toNumber(row.total_assets as string),
      investments: toNumber(row.investments as string),
      netWorth: toNumber(row.net_worth as string),
      accounts: (row.accounts as unknown[]) ?? []
    };
  }

  async initialize(): Promise<void> {
    await this.pool.query(SCHEMA_SQL);
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
    const [
      connections,
      accounts,
      holdings,
      liabilities,
      transactions,
      portfolioSnapshots,
      healthConnections,
      fitnessSamples,
      fitnessTargets
    ] = await Promise.all([
      this.pool.query(`SELECT COUNT(*)::int AS count FROM connections WHERE user_id = $1`, [userId]),
      this.pool.query(
        `SELECT COUNT(*)::int AS count
         FROM accounts a
         INNER JOIN connections c ON c.id = a.connection_id
         WHERE c.user_id = $1`,
        [userId]
      ),
      this.pool.query(
        `SELECT COUNT(*)::int AS count
         FROM holdings h
         INNER JOIN accounts a ON a.id = h.account_id
         INNER JOIN connections c ON c.id = a.connection_id
         WHERE c.user_id = $1`,
        [userId]
      ),
      this.pool.query(
        `SELECT COUNT(*)::int AS count
         FROM liabilities l
         INNER JOIN accounts a ON a.id = l.account_id
         INNER JOIN connections c ON c.id = a.connection_id
         WHERE c.user_id = $1`,
        [userId]
      ),
      this.pool.query(
        `SELECT COUNT(*)::int AS count
         FROM transactions t
         INNER JOIN accounts a ON a.id = t.account_id
         INNER JOIN connections c ON c.id = a.connection_id
         WHERE c.user_id = $1`,
        [userId]
      ),
      this.pool.query(`SELECT COUNT(*)::int AS count FROM portfolio_snapshots WHERE user_id = $1`, [userId]),
      this.pool.query(`SELECT COUNT(*)::int AS count FROM health_connections WHERE user_id = $1`, [userId]),
      this.pool.query(`SELECT COUNT(*)::int AS count FROM fitness_samples WHERE user_id = $1`, [userId]),
      this.pool.query(`SELECT COUNT(*)::int AS count FROM fitness_targets WHERE user_id = $1`, [userId])
    ]);

    const get = (result: { rows: Array<{ count: number }>; rowCount: number | null }) =>
      result.rowCount && result.rows[0] ? Number(result.rows[0].count || 0) : 0;

    return {
      connections: get(connections as any),
      accounts: get(accounts as any),
      holdings: get(holdings as any),
      liabilities: get(liabilities as any),
      transactions: get(transactions as any),
      portfolioSnapshots: get(portfolioSnapshots as any),
      healthConnections: get(healthConnections as any),
      fitnessSamples: get(fitnessSamples as any),
      fitnessTargets: get(fitnessTargets as any)
    };
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
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const portfolioSnapshots = await client.query(`DELETE FROM portfolio_snapshots WHERE user_id = $1`, [userId]);
      const fitnessSamples = await client.query(`DELETE FROM fitness_samples WHERE user_id = $1`, [userId]);
      const fitnessTargets = await client.query(`DELETE FROM fitness_targets WHERE user_id = $1`, [userId]);
      const healthConnections = await client.query(`DELETE FROM health_connections WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM learning_progress WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM learning_preferences WHERE user_id = $1`, [userId]);
      const connections = await client.query(`DELETE FROM connections WHERE user_id = $1`, [userId]);

      await client.query("COMMIT");

      const remaining = await this.getUserDataCounts(userId);
      return {
        connections: connections.rowCount ?? 0,
        portfolioSnapshots: portfolioSnapshots.rowCount ?? 0,
        healthConnections: healthConnections.rowCount ?? 0,
        fitnessSamples: fitnessSamples.rowCount ?? 0,
        fitnessTargets: fitnessTargets.rowCount ?? 0,
        remaining
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async findUserByEmail(email: string): Promise<UserAuthRecord | null> {
    const result = await this.pool.query(
      `SELECT id, email, name, password_hash, created_at, updated_at FROM users WHERE email = $1 LIMIT 1`,
      [email.toLowerCase()]
    );

    if (result.rowCount === 0) {
      return null;
    }

    const user = mapUserRow(result.rows[0]);

    return {
      ...user,
      passwordHash: String(result.rows[0].password_hash)
    };
  }

  async findUserById(userId: string): Promise<User | null> {
    const result = await this.pool.query(
      `SELECT id, email, name, created_at, updated_at FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return mapUserRow(result.rows[0]);
  }

  async createUser(email: string, name: string, passwordHash: string): Promise<User> {
    const id = crypto.randomUUID();
    const normalizedEmail = email.toLowerCase();

    const result = await this.pool.query(
      `INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, created_at, updated_at`,
      [id, normalizedEmail, name, passwordHash]
    );

    return mapUserRow(result.rows[0]);
  }

  async getLearningPreference(userId: string): Promise<LearningPreference | null> {
    const result = await this.pool.query(
      `SELECT user_id, interest_area, created_at, updated_at
       FROM learning_preferences
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return mapLearningPreferenceRow(result.rows[0]);
  }

  async upsertLearningPreference(userId: string, interestArea: LearningInterestArea): Promise<LearningPreference> {
    return this.upsertLearningPreferenceInternal({ userId, interestArea });
  }

  private async upsertLearningPreferenceInternal(input: UpsertLearningPreferenceInput): Promise<LearningPreference> {
    const result = await this.pool.query(
      `INSERT INTO learning_preferences (user_id, interest_area)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET
         interest_area = EXCLUDED.interest_area,
         updated_at = NOW()
       RETURNING user_id, interest_area, created_at, updated_at`,
      [input.userId, input.interestArea]
    );

    return mapLearningPreferenceRow(result.rows[0]);
  }

  async listLearningTopicKeys(userId: string, interestArea?: LearningInterestArea): Promise<string[]> {
    const result = interestArea
      ? await this.pool.query(
          `SELECT topic_key FROM learning_progress WHERE user_id = $1 AND interest_area = $2`,
          [userId, interestArea]
        )
      : await this.pool.query(`SELECT topic_key FROM learning_progress WHERE user_id = $1`, [userId]);

    return result.rows.map((row) => String(row.topic_key));
  }

  async getLearningProgress(userId: string, topicKey: string): Promise<LearningProgress | null> {
    const result = await this.pool.query(
      `SELECT *
       FROM learning_progress
       WHERE user_id = $1 AND topic_key = $2
       LIMIT 1`,
      [userId, topicKey]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return mapLearningProgressRow(result.rows[0]);
  }

  async upsertLearningCompletion(input: UpsertLearningCompletionInput): Promise<LearningProgress> {
    const id = crypto.randomUUID();
    const result = await this.pool.query(
      `INSERT INTO learning_progress (id, user_id, topic_key, interest_area, learned_at, review_stage, next_review_at)
       VALUES ($1, $2, $3, $4, $5, 0, $6)
       ON CONFLICT (user_id, topic_key) DO UPDATE SET
         interest_area = EXCLUDED.interest_area,
         learned_at = EXCLUDED.learned_at,
         review_stage = 0,
         next_review_at = EXCLUDED.next_review_at,
         updated_at = NOW()
       RETURNING *`,
      [id, input.userId, input.topicKey, input.interestArea, input.learnedAt, input.nextReviewAt]
    );

    return mapLearningProgressRow(result.rows[0]);
  }

  async updateLearningReview(input: UpdateLearningReviewInput): Promise<LearningProgress> {
    const result = await this.pool.query(
      `UPDATE learning_progress
       SET review_stage = $3,
           next_review_at = $4,
           last_reviewed_at = $5,
           review_count = review_count + 1,
           correct_streak = $6,
           updated_at = NOW()
       WHERE user_id = $1 AND topic_key = $2
       RETURNING *`,
      [input.userId, input.topicKey, input.reviewStage, input.nextReviewAt, input.lastReviewedAt, input.correctStreak]
    );

    if (result.rowCount === 0) {
      throw new Error("Learning progress not found.");
    }

    return mapLearningProgressRow(result.rows[0]);
  }

  async listDueLearningReviews(
    userId: string,
    limit: number,
    interestArea?: LearningInterestArea
  ): Promise<LearningProgress[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : 25;
    const result = interestArea
      ? await this.pool.query(
          `SELECT *
           FROM learning_progress
           WHERE user_id = $1 AND interest_area = $2 AND next_review_at <= NOW()
           ORDER BY next_review_at ASC
           LIMIT $3`,
          [userId, interestArea, safeLimit]
        )
      : await this.pool.query(
          `SELECT *
           FROM learning_progress
           WHERE user_id = $1 AND next_review_at <= NOW()
           ORDER BY next_review_at ASC
           LIMIT $2`,
          [userId, safeLimit]
        );

    return result.rows.map(mapLearningProgressRow);
  }

  async listRecentLearningProgress(userId: string, limit: number): Promise<LearningProgress[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(50, Math.floor(limit))) : 5;
    const result = await this.pool.query(
      `SELECT * FROM learning_progress WHERE user_id = $1 ORDER BY learned_at DESC LIMIT $2`,
      [userId, safeLimit]
    );
    return result.rows.map(mapLearningProgressRow);
  }

  async listConnections(userId: string): Promise<Connection[]> {
    const result = await this.pool.query(
      `SELECT id, user_id, provider, status, display_name, metadata, created_at, updated_at
       FROM connections WHERE user_id = $1 ORDER BY updated_at DESC`,
      [userId]
    );

    return result.rows.map((row: Record<string, unknown>) => mapConnectionRow(row));
  }

  async getConnectionById(userId: string, connectionId: string): Promise<Connection | null> {
    const result = await this.pool.query(
      `SELECT id, user_id, provider, status, display_name, metadata, created_at, updated_at
       FROM connections WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [connectionId, userId]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return mapConnectionRow(result.rows[0]);
  }

  async getConnectionByProvider(userId: string, provider: Provider): Promise<Connection | null> {
    const result = await this.pool.query(
      `SELECT id, user_id, provider, status, display_name, metadata, created_at, updated_at
       FROM connections WHERE user_id = $1 AND provider = $2 LIMIT 1`,
      [userId, provider]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return mapConnectionRow(result.rows[0]);
  }

  async getConnectionCredential(userId: string, connectionId: string): Promise<string | null> {
    const result = await this.pool.query(
      `SELECT encrypted_credential FROM connections WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [connectionId, userId]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return (result.rows[0].encrypted_credential as string | null) ?? null;
  }

  async upsertConnection(input: UpsertConnectionInput): Promise<Connection> {
    const existing = await this.getConnectionByProvider(input.userId, input.provider);

    if (!existing) {
      const result = await this.pool.query(
        `INSERT INTO connections (
          id, user_id, provider, status, display_name, metadata, encrypted_credential, institution_id, item_id
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
        RETURNING id, user_id, provider, status, display_name, metadata, created_at, updated_at`,
        [
          crypto.randomUUID(),
          input.userId,
          input.provider,
          input.status,
          input.displayName,
          JSON.stringify(input.metadata ?? {}),
          input.encryptedCredential ?? null,
          input.institutionId ?? null,
          input.itemId ?? null
        ]
      );

      return mapConnectionRow(result.rows[0]);
    }

    const result = await this.pool.query(
      `UPDATE connections
       SET status = $1,
           display_name = $2,
           metadata = $3::jsonb,
           encrypted_credential = COALESCE($4, encrypted_credential),
           institution_id = COALESCE($5, institution_id),
           item_id = COALESCE($6, item_id),
           updated_at = NOW()
       WHERE id = $7
       RETURNING id, user_id, provider, status, display_name, metadata, created_at, updated_at`,
      [
        input.status,
        input.displayName,
        JSON.stringify(input.metadata ?? {}),
        input.encryptedCredential ?? null,
        input.institutionId ?? null,
        input.itemId ?? null,
        existing.id
      ]
    );

    return mapConnectionRow(result.rows[0]);
  }

  async markConnectionStatus(userId: string, connectionId: string, status: ConnectionStatus): Promise<void> {
    await this.pool.query(
      `UPDATE connections SET status = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3`,
      [status, connectionId, userId]
    );
  }

  async replaceConnectionData(
    connection: Connection,
    payload: SyncPayload,
    syncedAt: string
  ): Promise<{ accounts: number; holdings: number; liabilities: number; transactions: number }> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM accounts WHERE connection_id = $1`, [connection.id]);

      const accountIdByExternalId = new Map<string, string>();
      let accountCount = 0;
      let holdingCount = 0;
      let liabilityCount = 0;
      let transactionCount = 0;

      for (const account of payload.accounts) {
        const id = `${connection.id}:account:${account.externalId}`;
        accountIdByExternalId.set(account.externalId, id);

        await client.query(
          `INSERT INTO accounts (
            id, connection_id, provider, name, type, currency, balance, institution_name, last_synced_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            id,
            connection.id,
            connection.provider,
            account.name,
            account.type,
            account.currency,
            account.balance,
            account.institutionName,
            syncedAt
          ]
        );

        accountCount += 1;
      }

      for (const holding of payload.holdings) {
        const accountId = accountIdByExternalId.get(holding.accountExternalId);

        if (!accountId) {
          continue;
        }

        await client.query(
          `INSERT INTO holdings (
            id, account_id, symbol, name, quantity, unit_price, value, cost_basis, currency, last_price_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            `${connection.id}:holding:${holding.externalId}`,
            accountId,
            holding.symbol,
            holding.name,
            holding.quantity,
            holding.unitPrice,
            holding.value,
            holding.costBasis ?? null,
            holding.currency,
            syncedAt
          ]
        );

        holdingCount += 1;
      }

      for (const liability of payload.liabilities) {
        const accountId = accountIdByExternalId.get(liability.accountExternalId);

        if (!accountId) {
          continue;
        }

        await client.query(
          `INSERT INTO liabilities (
            id, account_id, provider, kind, name, balance, interest_rate, minimum_payment, currency, due_date, last_synced_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            `${connection.id}:liability:${liability.externalId}`,
            accountId,
            connection.provider,
            liability.kind,
            liability.name,
            liability.balance,
            liability.interestRate ?? null,
            liability.minimumPayment ?? null,
            liability.currency,
            liability.dueDate ?? null,
            syncedAt
          ]
        );

        liabilityCount += 1;
      }

      for (const transaction of payload.transactions) {
        const accountId = accountIdByExternalId.get(transaction.accountExternalId);

        if (!accountId) {
          continue;
        }

        await client.query(
          `INSERT INTO transactions (
            id, account_id, provider, date, description, category, amount, direction, currency
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            `${connection.id}:transaction:${transaction.externalId}`,
            accountId,
            connection.provider,
            transaction.date,
            transaction.description,
            transaction.category,
            transaction.amount,
            transaction.direction,
            transaction.currency
          ]
        );

        transactionCount += 1;
      }

      await client.query(`UPDATE connections SET updated_at = NOW(), status = 'connected' WHERE id = $1`, [connection.id]);
      await client.query("COMMIT");

      return {
        accounts: accountCount,
        holdings: holdingCount,
        liabilities: liabilityCount,
        transactions: transactionCount
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async upsertImportedConnectionData(
    connection: Connection,
    payload: Pick<SyncPayload, "accounts" | "transactions">,
    syncedAt: string
  ): Promise<{ accounts: number; transactions: number }> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const accountIdByExternalId = new Map<string, string>();
      const accountIds: string[] = [];
      let accountCount = 0;
      let transactionCount = 0;

      for (const account of payload.accounts) {
        const accountId = `${connection.id}:account:${account.externalId}`;
        accountIdByExternalId.set(account.externalId, accountId);
        accountIds.push(accountId);

        await client.query(
          `INSERT INTO accounts (
             id, connection_id, provider, name, type, currency, balance, institution_name, last_synced_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id)
           DO UPDATE SET
             provider = EXCLUDED.provider,
             name = EXCLUDED.name,
             type = EXCLUDED.type,
             currency = EXCLUDED.currency,
             balance = EXCLUDED.balance,
             institution_name = EXCLUDED.institution_name,
             last_synced_at = EXCLUDED.last_synced_at`,
          [
            accountId,
            connection.id,
            connection.provider,
            account.name,
            account.type,
            account.currency,
            account.balance,
            account.institutionName,
            syncedAt
          ]
        );

        accountCount += 1;
      }

      if (accountIds.length > 0) {
        await client.query(`DELETE FROM transactions WHERE account_id = ANY($1::text[])`, [accountIds]);
        await client.query(`DELETE FROM holdings WHERE account_id = ANY($1::text[])`, [accountIds]);
        await client.query(`DELETE FROM liabilities WHERE account_id = ANY($1::text[])`, [accountIds]);
      }

      for (const transaction of payload.transactions) {
        const accountId = accountIdByExternalId.get(transaction.accountExternalId);

        if (!accountId) {
          continue;
        }

        await client.query(
          `INSERT INTO transactions (
             id, account_id, provider, date, description, category, amount, direction, currency
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id)
           DO UPDATE SET
             account_id = EXCLUDED.account_id,
             provider = EXCLUDED.provider,
             date = EXCLUDED.date,
             description = EXCLUDED.description,
             category = EXCLUDED.category,
             amount = EXCLUDED.amount,
             direction = EXCLUDED.direction,
             currency = EXCLUDED.currency`,
          [
            `${connection.id}:transaction:${transaction.externalId}`,
            accountId,
            connection.provider,
            transaction.date,
            transaction.description,
            transaction.category,
            transaction.amount,
            transaction.direction,
            transaction.currency
          ]
        );

        transactionCount += 1;
      }

      await client.query(`UPDATE connections SET updated_at = NOW(), status = 'connected' WHERE id = $1`, [connection.id]);
      await client.query("COMMIT");

      return {
        accounts: accountCount,
        transactions: transactionCount
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getAccounts(userId: string): Promise<Account[]> {
    const result = await this.pool.query(
      `SELECT a.id, a.connection_id, a.provider, a.name, a.type, a.currency, a.balance, a.institution_name, a.last_synced_at
       FROM accounts a
       INNER JOIN connections c ON c.id = a.connection_id
       WHERE c.user_id = $1
       ORDER BY a.last_synced_at DESC`,
      [userId]
    );

    return result.rows.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      connectionId: String(row.connection_id),
      provider: row.provider as Provider,
      name: String(row.name),
      type: row.type as Account["type"],
      currency: String(row.currency),
      balance: toNumber(row.balance as string),
      institutionName: String(row.institution_name),
      lastSyncedAt: new Date(String(row.last_synced_at)).toISOString()
    }));
  }

  async getHoldings(userId: string): Promise<Holding[]> {
    const result = await this.pool.query(
      `SELECT h.id, h.account_id, h.symbol, h.name, h.quantity, h.unit_price, h.value, h.cost_basis, h.currency, h.last_price_at
       FROM holdings h
       INNER JOIN accounts a ON a.id = h.account_id
       INNER JOIN connections c ON c.id = a.connection_id
       WHERE c.user_id = $1`,
      [userId]
    );

    return result.rows.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      accountId: String(row.account_id),
      symbol: String(row.symbol),
      name: String(row.name),
      quantity: toNumber(row.quantity as string),
      unitPrice: toNumber(row.unit_price as string),
      value: toNumber(row.value as string),
      costBasis: row.cost_basis === null ? undefined : toNumber(row.cost_basis as string),
      currency: String(row.currency),
      lastPriceAt: new Date(String(row.last_price_at)).toISOString()
    }));
  }

  async getLiabilities(userId: string): Promise<Liability[]> {
    const result = await this.pool.query(
      `SELECT l.id, l.account_id, l.provider, l.kind, l.name, l.balance, l.interest_rate, l.minimum_payment, l.currency, l.due_date, l.last_synced_at
       FROM liabilities l
       INNER JOIN accounts a ON a.id = l.account_id
       INNER JOIN connections c ON c.id = a.connection_id
       WHERE c.user_id = $1`,
      [userId]
    );

    return result.rows.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      accountId: String(row.account_id),
      provider: row.provider as Provider,
      kind: row.kind as Liability["kind"],
      name: String(row.name),
      balance: toNumber(row.balance as string),
      interestRate: row.interest_rate === null ? undefined : toNumber(row.interest_rate as string),
      minimumPayment: row.minimum_payment === null ? undefined : toNumber(row.minimum_payment as string),
      currency: String(row.currency),
      dueDate: row.due_date ? new Date(String(row.due_date)).toISOString().slice(0, 10) : undefined,
      lastSyncedAt: new Date(String(row.last_synced_at)).toISOString()
    }));
  }

  async getTransactions(userId: string, limit: number): Promise<Transaction[]> {
    const result = await this.pool.query(
      `SELECT t.id, t.account_id, t.provider, t.date, t.description, t.category, t.amount, t.direction, t.currency
       FROM transactions t
       INNER JOIN accounts a ON a.id = t.account_id
       INNER JOIN connections c ON c.id = a.connection_id
       WHERE c.user_id = $1
       ORDER BY t.date DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      accountId: String(row.account_id),
      provider: row.provider as Provider,
      date: new Date(String(row.date)).toISOString().slice(0, 10),
      description: String(row.description),
      category: String(row.category),
      amount: toNumber(row.amount as string),
      direction: row.direction as Transaction["direction"],
      currency: String(row.currency)
    }));
  }

  async getHealthConnection(userId: string, provider: "apple_health"): Promise<HealthConnection | null> {
    const result = await this.pool.query(
      `SELECT id, user_id, provider, status, mode, metadata, last_synced_at, created_at, updated_at
       FROM health_connections
       WHERE user_id = $1 AND provider = $2
       LIMIT 1`,
      [userId, provider]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return mapHealthConnectionRow(result.rows[0]);
  }

  async upsertHealthConnection(input: UpsertHealthConnectionInput): Promise<HealthConnection> {
    const result = await this.pool.query(
      `INSERT INTO health_connections (
         id, user_id, provider, status, mode, metadata, last_synced_at
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       ON CONFLICT (user_id, provider)
       DO UPDATE SET
         status = EXCLUDED.status,
         mode = EXCLUDED.mode,
         metadata = EXCLUDED.metadata,
         last_synced_at = EXCLUDED.last_synced_at,
         updated_at = NOW()
       RETURNING id, user_id, provider, status, mode, metadata, last_synced_at, created_at, updated_at`,
      [
        crypto.randomUUID(),
        input.userId,
        input.provider,
        input.status,
        input.mode,
        JSON.stringify(input.metadata ?? {}),
        input.lastSyncedAt ?? null
      ]
    );

    return mapHealthConnectionRow(result.rows[0]);
  }

  async insertFitnessSamples(samples: InsertFitnessSampleInput[]): Promise<number> {
    if (samples.length === 0) {
      return 0;
    }

    const client = await this.pool.connect();
    let inserted = 0;

    try {
      await client.query("BEGIN");

      for (const sample of samples) {
        const result = await client.query(
          `INSERT INTO fitness_samples (
             id, user_id, metric, value, unit, source, recorded_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (user_id, metric, recorded_at, value, source) DO NOTHING`,
          [
            crypto.randomUUID(),
            sample.userId,
            sample.metric,
            sample.value,
            sample.unit,
            sample.source,
            sample.recordedAt
          ]
        );

        inserted += result.rowCount ?? 0;
      }

      await client.query("COMMIT");
      return inserted;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createFitnessSample(input: InsertFitnessSampleInput): Promise<FitnessSample> {
    const result = await this.pool.query(
      `INSERT INTO fitness_samples (
         id, user_id, metric, value, unit, source, recorded_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, user_id, metric, value, unit, source, recorded_at`,
      [crypto.randomUUID(), input.userId, input.metric, input.value, input.unit, input.source, input.recordedAt]
    );

    return mapFitnessSampleRow(result.rows[0]);
  }

  async listFitnessSamples(userId: string, limit = 1000): Promise<FitnessSample[]> {
    const result = await this.pool.query(
      `SELECT id, user_id, metric, value, unit, source, recorded_at
       FROM fitness_samples
       WHERE user_id = $1
       ORDER BY recorded_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows.map((row: Record<string, unknown>) => mapFitnessSampleRow(row));
  }

  async upsertFitnessTarget(input: UpsertFitnessTargetInput): Promise<FitnessTarget> {
    const result = await this.pool.query(
      `INSERT INTO fitness_targets (
         id, user_id, metric, label, target_value, unit, due_date
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, metric)
       DO UPDATE SET
         label = EXCLUDED.label,
         target_value = EXCLUDED.target_value,
         unit = EXCLUDED.unit,
         due_date = EXCLUDED.due_date,
         updated_at = NOW()
       RETURNING id, user_id, metric, label, target_value, unit, due_date, created_at, updated_at`,
      [
        crypto.randomUUID(),
        input.userId,
        input.metric,
        input.label,
        input.targetValue,
        input.unit,
        input.dueDate ?? null
      ]
    );

    return mapFitnessTargetRow(result.rows[0]);
  }

  async listFitnessTargets(userId: string): Promise<FitnessTarget[]> {
    const result = await this.pool.query(
      `SELECT id, user_id, metric, label, target_value, unit, due_date, created_at, updated_at
       FROM fitness_targets
       WHERE user_id = $1
       ORDER BY label ASC`,
      [userId]
    );

    return result.rows.map((row: Record<string, unknown>) => mapFitnessTargetRow(row));
  }

  async deleteFitnessTarget(userId: string, targetId: string): Promise<boolean> {
    const result = await this.pool.query(`DELETE FROM fitness_targets WHERE id = $1 AND user_id = $2`, [targetId, userId]);
    return (result.rowCount ?? 0) > 0;
  }

  async listHabits(userId: string, includeArchived = false): Promise<Habit[]> {
    const result = await this.pool.query(
      `SELECT id, user_id, name, color, sort_order, archived_at, created_at, updated_at
       FROM habits
       WHERE user_id = $1 AND ($2::boolean OR archived_at IS NULL)
       ORDER BY sort_order ASC, updated_at DESC`,
      [userId, includeArchived]
    );

    return result.rows.map((row: Record<string, unknown>) => mapHabitRow(row));
  }

  async createHabit(userId: string, input: { name: string; color: string }): Promise<Habit> {
    const result = await this.pool.query(
      `INSERT INTO habits (id, user_id, name, color, sort_order)
       VALUES (
         $1,
         $2,
         $3,
         $4,
         (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM habits WHERE user_id = $2)
       )
       RETURNING id, user_id, name, color, sort_order, archived_at, created_at, updated_at`,
      [crypto.randomUUID(), userId, input.name, input.color]
    );

    return mapHabitRow(result.rows[0]);
  }

  async updateHabit(
    userId: string,
    habitId: string,
    patch: { name?: string; color?: string; sortOrder?: number; archived?: boolean }
  ): Promise<Habit | null> {
    const result = await this.pool.query(
      `UPDATE habits
       SET name = COALESCE($1, name),
           color = COALESCE($2, color),
           sort_order = COALESCE($3, sort_order),
           archived_at = CASE
             WHEN $4::boolean IS NULL THEN archived_at
             WHEN $4 = true THEN NOW()
             ELSE NULL
           END,
           updated_at = NOW()
       WHERE user_id = $5 AND id = $6
       RETURNING id, user_id, name, color, sort_order, archived_at, created_at, updated_at`,
      [patch.name ?? null, patch.color ?? null, patch.sortOrder ?? null, patch.archived ?? null, userId, habitId]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return mapHabitRow(result.rows[0]);
  }

  async listHabitLogs(userId: string, input: { from: string; to: string }): Promise<HabitLogEntry[]> {
    const result = await this.pool.query(
      `SELECT id, user_id, habit_id, date, completed, note, created_at, updated_at
       FROM habit_logs
       WHERE user_id = $1 AND date >= $2 AND date <= $3
       ORDER BY date ASC`,
      [userId, input.from, input.to]
    );

    return result.rows.map((row: Record<string, unknown>) => mapHabitLogRow(row));
  }

  async upsertHabitLogsForDate(
    userId: string,
    input: { date: string; entries: Array<{ habitId: string; completed: boolean; note?: string }> }
  ): Promise<HabitLogEntry[]> {
    if (input.entries.length === 0) {
      return [];
    }

    return await this.withTransaction(async (client) => {
      const results: HabitLogEntry[] = [];

      for (const entry of input.entries) {
        const result = await client.query(
          `INSERT INTO habit_logs (id, user_id, habit_id, date, completed, note)
           SELECT $1, $2, $3, $4, $5, $6
           WHERE EXISTS (SELECT 1 FROM habits WHERE id = $3 AND user_id = $2)
           ON CONFLICT (user_id, habit_id, date)
           DO UPDATE SET
             completed = EXCLUDED.completed,
             note = EXCLUDED.note,
             updated_at = NOW()
           RETURNING id, user_id, habit_id, date, completed, note, created_at, updated_at`,
          [crypto.randomUUID(), userId, entry.habitId, input.date, entry.completed, entry.note ?? null]
        );

        if ((result.rowCount ?? 0) > 0) {
          results.push(mapHabitLogRow(result.rows[0]));
        }
      }

      return results;
    });
  }

  async upsertDailyPhoto(input: {
    userId: string;
    date: string;
    takenAt: string;
    contentType: string;
    caption?: string;
    image: Buffer;
  }): Promise<DailyPhotoMeta> {
    const result = await this.pool.query(
      `INSERT INTO daily_photos (
         id, user_id, date_key, taken_at, content_type, caption, image
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, date_key)
       DO UPDATE SET
         taken_at = EXCLUDED.taken_at,
         content_type = EXCLUDED.content_type,
         caption = EXCLUDED.caption,
         image = EXCLUDED.image,
         updated_at = NOW()
       RETURNING id, user_id, date_key, taken_at, content_type, caption, created_at, updated_at`,
      [
        crypto.randomUUID(),
        input.userId,
        input.date,
        input.takenAt,
        input.contentType,
        input.caption ?? null,
        input.image
      ]
    );

    return mapDailyPhotoRow(result.rows[0]);
  }

  async listDailyPhotos(input: {
    userId: string;
    from: string;
    to: string;
    limit?: number;
  }): Promise<DailyPhotoMeta[]> {
    const limit = Math.max(1, Math.min(input.limit ?? 370, 5000));
    const result = await this.pool.query(
      `SELECT id, user_id, date_key, taken_at, content_type, caption, created_at, updated_at
       FROM daily_photos
       WHERE user_id = $1 AND date_key >= $2 AND date_key <= $3
       ORDER BY date_key ASC
       LIMIT $4`,
      [input.userId, input.from, input.to, limit]
    );

    return result.rows.map((row: Record<string, unknown>) => mapDailyPhotoRow(row));
  }

  async getDailyPhotoForDate(userId: string, date: string): Promise<DailyPhotoMeta | null> {
    const result = await this.pool.query(
      `SELECT id, user_id, date_key, taken_at, content_type, caption, created_at, updated_at
       FROM daily_photos
       WHERE user_id = $1 AND date_key = $2
       LIMIT 1`,
      [userId, date]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return mapDailyPhotoRow(result.rows[0]);
  }

  async getDailyPhotoImage(userId: string, photoId: string): Promise<{ contentType: string; image: Buffer } | null> {
    const result = await this.pool.query(
      `SELECT content_type, image
       FROM daily_photos
       WHERE user_id = $1 AND id = $2
       LIMIT 1`,
      [userId, photoId]
    );

    if (result.rowCount === 0) {
      return null;
    }

    const row = result.rows[0] as Record<string, unknown>;
    const image = row.image as Buffer | null;
    if (!image) {
      return null;
    }

    return { contentType: String(row.content_type), image };
  }

  async deleteDailyPhotoForDate(userId: string, date: string): Promise<boolean> {
    const result = await this.pool.query(`DELETE FROM daily_photos WHERE user_id = $1 AND date_key = $2`, [userId, date]);
    return (result.rowCount ?? 0) > 0;
  }

  async withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
