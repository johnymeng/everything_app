import {
  FitnessDashboard,
  FitnessMetric,
  fitnessMetrics,
  FitnessSample,
  FitnessTarget,
  FitnessTargetProgress,
  SuggestedFitnessTarget
} from "../models";
import { PostgresRepository } from "../db/postgresRepository";

interface MetricCatalogItem {
  metric: FitnessMetric;
  label: string;
  defaultUnit: string;
  goalDirection: "increase" | "decrease";
}

interface SyncSampleInput {
  metric: FitnessMetric;
  value: number;
  unit?: string;
  recordedAt?: string;
}

interface UpsertTargetInput {
  metric: FitnessMetric;
  label?: string;
  targetValue: number;
  unit?: string;
  dueDate?: string;
}

interface AddManualSampleInput {
  metric: FitnessMetric;
  value: number;
  unit?: string;
  recordedAt?: string;
}

const metricCatalog: MetricCatalogItem[] = [
  { metric: "vo2_max", label: "VO2 max", defaultUnit: "ml/kg/min", goalDirection: "increase" },
  { metric: "resting_heart_rate", label: "Resting heart rate", defaultUnit: "bpm", goalDirection: "decrease" },
  { metric: "heart_rate_variability", label: "Heart rate variability", defaultUnit: "ms", goalDirection: "increase" },
  { metric: "sleep_hours", label: "Sleep", defaultUnit: "hours", goalDirection: "increase" },
  { metric: "steps", label: "Steps", defaultUnit: "steps", goalDirection: "increase" },
  { metric: "workout_minutes", label: "Workout minutes", defaultUnit: "min", goalDirection: "increase" },
  { metric: "body_weight", label: "Body weight", defaultUnit: "kg", goalDirection: "decrease" },
  { metric: "squat_1rm", label: "Squat 1RM", defaultUnit: "kg", goalDirection: "increase" },
  { metric: "bench_1rm", label: "Bench 1RM", defaultUnit: "kg", goalDirection: "increase" },
  { metric: "deadlift_1rm", label: "Deadlift 1RM", defaultUnit: "kg", goalDirection: "increase" },
  { metric: "mile_time", label: "Mile time", defaultUnit: "s", goalDirection: "decrease" }
];

const metricByKey = new Map(metricCatalog.map((item) => [item.metric, item]));
const trendThresholdByMetric: Record<FitnessMetric, number> = {
  vo2_max: 0.4,
  resting_heart_rate: 1,
  heart_rate_variability: 2,
  sleep_hours: 0.25,
  steps: 450,
  workout_minutes: 8,
  body_weight: 0.4,
  squat_1rm: 1.2,
  bench_1rm: 1,
  deadlift_1rm: 1.5,
  mile_time: 4
};

function nowIso(): string {
  return new Date().toISOString();
}

function toIsoOrNow(value: string | undefined): string {
  if (!value) {
    return nowIso();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return nowIso();
  }

  return parsed.toISOString();
}

function toFixedNumber(value: number, decimals = 2): number {
  return Number(value.toFixed(decimals));
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function sortSamplesDescending(samples: FitnessSample[]): FitnessSample[] {
  return [...samples].sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
}

function latestSampleByMetric(samples: FitnessSample[]): Map<FitnessMetric, FitnessSample> {
  const sorted = sortSamplesDescending(samples);
  const latest = new Map<FitnessMetric, FitnessSample>();

  for (const sample of sorted) {
    if (!latest.has(sample.metric)) {
      latest.set(sample.metric, sample);
    }
  }

  return latest;
}

function metricDirection(metric: FitnessMetric): "increase" | "decrease" {
  return metricByKey.get(metric)?.goalDirection ?? "increase";
}

function metricLabel(metric: FitnessMetric): string {
  return metricByKey.get(metric)?.label ?? metric;
}

function metricUnit(metric: FitnessMetric): string {
  return metricByKey.get(metric)?.defaultUnit ?? "";
}

function computeTrend(samples: FitnessSample[], metric: FitnessMetric): { direction: "up" | "down" | "flat"; delta: number } | null {
  const metricValues = sortSamplesDescending(samples)
    .filter((sample) => sample.metric === metric)
    .slice(0, 8)
    .map((sample) => sample.value);

  if (metricValues.length < 4) {
    return null;
  }

  const middle = Math.floor(metricValues.length / 2);
  const recent = metricValues.slice(0, middle);
  const baseline = metricValues.slice(middle);
  const delta = average(recent) - average(baseline);
  const threshold = trendThresholdByMetric[metric] ?? 0.1;

  if (Math.abs(delta) <= threshold) {
    return { direction: "flat", delta: toFixedNumber(delta, 2) };
  }

  return {
    direction: delta > 0 ? "up" : "down",
    delta: toFixedNumber(delta, 2)
  };
}

function targetProgress(target: FitnessTarget, current: FitnessSample | undefined): FitnessTargetProgress {
  if (!current) {
    return { target, status: "no_data" };
  }

  const direction = metricDirection(target.metric);

  if (direction === "decrease") {
    if (current.value <= target.targetValue) {
      return { target, currentValue: current.value, gap: 0, status: "hit" };
    }

    const gap = toFixedNumber(current.value - target.targetValue, 2);
    if (current.value <= target.targetValue * 1.1) {
      return { target, currentValue: current.value, gap, status: "on_track" };
    }

    return { target, currentValue: current.value, gap, status: "off_track" };
  }

  if (current.value >= target.targetValue) {
    return { target, currentValue: current.value, gap: 0, status: "hit" };
  }

  const gap = toFixedNumber(target.targetValue - current.value, 2);
  if (current.value >= target.targetValue * 0.9) {
    return { target, currentValue: current.value, gap, status: "on_track" };
  }

  return { target, currentValue: current.value, gap, status: "off_track" };
}

function makeSuggestedTargets(
  latestByMetric: Map<FitnessMetric, FitnessSample>,
  existingTargetMetrics: Set<FitnessMetric>
): SuggestedFitnessTarget[] {
  const suggestions: SuggestedFitnessTarget[] = [];

  const maybePush = (metric: FitnessMetric, targetValue: number, reason: string): void => {
    if (existingTargetMetrics.has(metric) || !latestByMetric.has(metric)) {
      return;
    }

    suggestions.push({
      metric,
      label: metricLabel(metric),
      targetValue,
      unit: metricUnit(metric),
      reason
    });
  };

  const vo2 = latestByMetric.get("vo2_max");
  if (vo2) {
    maybePush("vo2_max", toFixedNumber(vo2.value * 1.06, 1), "Progressive 6% aerobic improvement goal.");
  }

  const squat = latestByMetric.get("squat_1rm");
  if (squat) {
    maybePush("squat_1rm", toFixedNumber(squat.value * 1.05, 1), "Small strength progression target.");
  }

  const bench = latestByMetric.get("bench_1rm");
  if (bench) {
    maybePush("bench_1rm", toFixedNumber(bench.value * 1.05, 1), "Small strength progression target.");
  }

  const deadlift = latestByMetric.get("deadlift_1rm");
  if (deadlift) {
    maybePush("deadlift_1rm", toFixedNumber(deadlift.value * 1.05, 1), "Small strength progression target.");
  }

  const mileTime = latestByMetric.get("mile_time");
  if (mileTime) {
    maybePush("mile_time", Math.max(1, toFixedNumber(mileTime.value * 0.97, 1)), "3% mile PR improvement target.");
  }

  return suggestions.slice(0, 5);
}

function buildInsights(
  samples: FitnessSample[],
  latestByMetric: Map<FitnessMetric, FitnessSample>,
  progress: FitnessTargetProgress[]
): string[] {
  const insights: string[] = [];

  const vo2Trend = computeTrend(samples, "vo2_max");
  if (vo2Trend?.direction === "up") {
    insights.push(`VO2 max is trending up by ${Math.abs(vo2Trend.delta)} ml/kg/min.`);
  } else if (vo2Trend?.direction === "down") {
    insights.push(`VO2 max has dropped by ${Math.abs(vo2Trend.delta)} ml/kg/min. Consider adding more zone 2 work.`);
  }

  const rhrTrend = computeTrend(samples, "resting_heart_rate");
  const hrvTrend = computeTrend(samples, "heart_rate_variability");
  if (rhrTrend?.direction === "up" && hrvTrend?.direction === "down") {
    insights.push("Resting HR is rising while HRV is falling. This pattern often means recovery debt.");
  }

  const sleep = latestByMetric.get("sleep_hours");
  const workout = latestByMetric.get("workout_minutes");
  if (sleep && workout && sleep.value < 7 && workout.value >= 50) {
    insights.push("Training load is high relative to sleep. Add an easier day or extend sleep this week.");
  }

  const hitTargets = progress.filter((item) => item.status === "hit").map((item) => item.target.label);
  if (hitTargets.length > 0) {
    insights.push(`Targets hit: ${hitTargets.slice(0, 3).join(", ")}.`);
  }

  const offTrack = progress.filter((item) => item.status === "off_track").map((item) => item.target.label);
  if (offTrack.length > 0) {
    insights.push(`Off-track targets: ${offTrack.slice(0, 2).join(", ")}. Revisit weekly volume and recovery.`);
  }

  if (insights.length === 0) {
    insights.push("Not enough trend data yet. Sync more Apple Health records to unlock deeper coaching insights.");
  }

  return insights;
}

export class FitnessService {
  constructor(private readonly repository: PostgresRepository) {}

  listMetricCatalog(): MetricCatalogItem[] {
    return metricCatalog;
  }

  async syncAppleHealth(userId: string, samples?: SyncSampleInput[]): Promise<{ imported: number; dashboard: FitnessDashboard }> {
    const now = nowIso();
    const syncSamples = samples && samples.length > 0 ? samples : [];

    if (syncSamples.length === 0) {
      throw new Error("Apple Health sync requires a payload. Paste JSON samples into the Fitness page first.");
    }

    await this.repository.upsertHealthConnection({
      userId,
      provider: "apple_health",
      status: "connected",
      mode: "shortcut_push",
      metadata: {
        sampleCount: String(syncSamples.length)
      },
      lastSyncedAt: now
    });

    const imported = await this.repository.insertFitnessSamples(
      syncSamples.map((sample) => ({
        userId,
        metric: sample.metric,
        value: sample.value,
        unit: sample.unit ?? metricUnit(sample.metric),
        source: "apple_health",
        recordedAt: toIsoOrNow(sample.recordedAt)
      }))
    );

    return {
      imported,
      dashboard: await this.getDashboard(userId)
    };
  }

  async addManualSample(userId: string, input: AddManualSampleInput): Promise<FitnessSample> {
    return this.repository.createFitnessSample({
      userId,
      metric: input.metric,
      value: input.value,
      unit: input.unit ?? metricUnit(input.metric),
      source: "manual",
      recordedAt: toIsoOrNow(input.recordedAt)
    });
  }

  async upsertTarget(userId: string, input: UpsertTargetInput): Promise<FitnessTarget> {
    const label = input.label?.trim() || metricLabel(input.metric);
    const unit = input.unit?.trim() || metricUnit(input.metric);

    return this.repository.upsertFitnessTarget({
      userId,
      metric: input.metric,
      label,
      targetValue: input.targetValue,
      unit,
      dueDate: input.dueDate?.trim() || undefined
    });
  }

  async deleteTarget(userId: string, targetId: string): Promise<{ deleted: boolean }> {
    return {
      deleted: await this.repository.deleteFitnessTarget(userId, targetId)
    };
  }

  async getDashboard(userId: string): Promise<FitnessDashboard> {
    const [connection, samples, targets] = await Promise.all([
      this.repository.getHealthConnection(userId, "apple_health"),
      this.repository.listFitnessSamples(userId),
      this.repository.listFitnessTargets(userId)
    ]);

    const latestMap = latestSampleByMetric(samples);
    const latest = fitnessMetrics
      .map((metric) => latestMap.get(metric))
      .filter((sample): sample is FitnessSample => Boolean(sample));

    const progress = targets.map((target) => targetProgress(target, latestMap.get(target.metric)));
    const existingTargetMetrics = new Set(targets.map((target) => target.metric));
    const suggestedTargets = makeSuggestedTargets(latestMap, existingTargetMetrics);
    const insights = buildInsights(samples, latestMap, progress);

    return {
      connection,
      latest,
      targetProgress: progress,
      suggestedTargets,
      insights
    };
  }
}
