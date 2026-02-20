/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    i += 1;
  }

  const input = String(args.input || "");
  const out = String(args.out || "apple-health-samples.json");
  const days = Number.parseInt(String(args.days || "90"), 10);
  const post = Boolean(args.post);
  const apiBase = String(args.api || "http://localhost:4000");
  const token = String(args.token || process.env.FINANCE_TRACKER_TOKEN || "");

  if (!input) {
    throw new Error("Missing --input /path/to/export.xml");
  }

  if (!Number.isFinite(days) || days <= 0) {
    throw new Error("--days must be a positive integer");
  }

  if (post && !token) {
    throw new Error("Missing --token (or FINANCE_TRACKER_TOKEN) for --post");
  }

  return { input, out, days, post, apiBase, token };
}

function normalizeOffset(offset) {
  if (!/^[+-]\d{4}$/.test(offset)) {
    return "Z";
  }

  return `${offset.slice(0, 3)}:${offset.slice(3)}`;
}

function parseAppleDate(value) {
  if (!value) {
    return null;
  }

  // Apple Health export uses `YYYY-MM-DD HH:mm:ss Z` (example: `2026-02-18 07:00:00 -0500`)
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.\d+)? ([+-]\d{4})$/
  );

  if (!match) {
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  const [, year, month, day, hour, minute, second, offset] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}${normalizeOffset(offset)}`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function localDayFromAppleDate(value) {
  if (!value) {
    return null;
  }

  const match = value.match(/^(\d{4}-\d{2}-\d{2}) /);
  return match ? match[1] : null;
}

function parseAttributes(xmlLine) {
  const attrs = {};
  const regex = /([A-Za-z_][A-Za-z0-9_:-]*)=\"([^\"]*)\"/g;

  for (const match of xmlLine.matchAll(regex)) {
    attrs[match[1]] = match[2];
  }

  return attrs;
}

function toNumber(input) {
  if (!input) {
    return null;
  }

  const value = Number.parseFloat(input);
  return Number.isFinite(value) ? value : null;
}

function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}

function convertBodyMassKg(value, unit) {
  if (unit === "kg") {
    return { value, unit: "kg" };
  }

  if (unit === "lb") {
    return { value: value * 0.45359237, unit: "kg" };
  }

  if (unit === "g") {
    return { value: value / 1000, unit: "kg" };
  }

  return null;
}

function convertHrvMs(value, unit) {
  if (unit === "ms") {
    return { value, unit: "ms" };
  }

  if (unit === "s") {
    return { value: value * 1000, unit: "ms" };
  }

  return null;
}

function convertWorkoutMinutes(value, unit) {
  if (unit === "min") {
    return { value, unit: "min" };
  }

  if (unit === "hr") {
    return { value: value * 60, unit: "min" };
  }

  if (unit === "s") {
    return { value: value / 60, unit: "min" };
  }

  return null;
}

const sumMetrics = new Set(["steps", "sleep_hours", "workout_minutes"]);

function upsertAggregate(
  store,
  key,
  entry
) {
  const existing = store.get(key);
  const isSum = sumMetrics.has(entry.metric);

  if (!existing) {
    store.set(key, {
      kind: isSum ? "sum" : "latest",
      metric: entry.metric,
      unit: entry.unit,
      value: entry.value,
      latestAt: entry.at
    });
    return;
  }

  if (existing.metric !== entry.metric) {
    throw new Error(`Aggregate key collision for ${key}`);
  }

  if (existing.kind === "sum") {
    existing.value += entry.value;
    if (entry.at.getTime() > existing.latestAt.getTime()) {
      existing.latestAt = entry.at;
    }
    return;
  }

  if (entry.at.getTime() > existing.latestAt.getTime()) {
    existing.value = entry.value;
    existing.unit = entry.unit;
    existing.latestAt = entry.at;
  }
}

function recordToMetric(attrs) {
  const type = attrs.type;

  // For day bucketing: use endDate when present, else startDate.
  const dayKey = localDayFromAppleDate(attrs.endDate ?? attrs.startDate);
  const at = parseAppleDate(attrs.endDate ?? attrs.startDate);

  if (!type || !dayKey || !at) {
    return null;
  }

  if (type === "HKCategoryTypeIdentifierSleepAnalysis") {
    const sleepValue = attrs.value ?? "";
    if (!sleepValue.includes("Asleep")) {
      return null;
    }

    // For sleep, use endDate day since sleep usually ends in the morning.
    const sleepDay = localDayFromAppleDate(attrs.endDate) ?? dayKey;
    const start = parseAppleDate(attrs.startDate);
    const end = parseAppleDate(attrs.endDate);
    if (!sleepDay || !start || !end) {
      return null;
    }

    const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    if (!Number.isFinite(durationHours) || durationHours <= 0 || durationHours > 24) {
      return null;
    }

    return { metric: "sleep_hours", value: durationHours, unit: "hours", at: end, dayKey: sleepDay };
  }

  const rawValue = toNumber(attrs.value);
  if (rawValue === null) {
    return null;
  }

  if (type === "HKQuantityTypeIdentifierVO2Max") {
    return { metric: "vo2_max", value: rawValue, unit: "ml/kg/min", at, dayKey };
  }

  if (type === "HKQuantityTypeIdentifierRestingHeartRate") {
    return { metric: "resting_heart_rate", value: rawValue, unit: "bpm", at, dayKey };
  }

  if (type === "HKQuantityTypeIdentifierHeartRateVariabilitySDNN") {
    const unit = attrs.unit ?? "ms";
    const converted = convertHrvMs(rawValue, unit);
    if (!converted) {
      return null;
    }
    return { metric: "heart_rate_variability", value: converted.value, unit: converted.unit, at, dayKey };
  }

  if (type === "HKQuantityTypeIdentifierBodyMass") {
    const unit = attrs.unit ?? "kg";
    const converted = convertBodyMassKg(rawValue, unit);
    if (!converted) {
      return null;
    }
    return { metric: "body_weight", value: converted.value, unit: converted.unit, at, dayKey };
  }

  if (type === "HKQuantityTypeIdentifierStepCount") {
    return { metric: "steps", value: rawValue, unit: "steps", at, dayKey };
  }

  return null;
}

function workoutToMetric(attrs) {
  const duration = toNumber(attrs.duration);
  const durationUnit = attrs.durationUnit ?? "min";
  const end = parseAppleDate(attrs.endDate);
  const dayKey = localDayFromAppleDate(attrs.startDate ?? attrs.endDate);

  if (duration === null || !dayKey || !end) {
    return null;
  }

  const converted = convertWorkoutMinutes(duration, durationUnit);
  if (!converted) {
    return null;
  }

  return { metric: "workout_minutes", value: converted.value, unit: converted.unit, at: end, dayKey };
}

async function main() {
  const { input, out, days, post, apiBase, token } = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(input);
  const outPath = path.resolve(out);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const since = Date.now() - days * 24 * 60 * 60 * 1000;

  const aggregates = new Map();
  let parsedLines = 0;
  let parsedRecords = 0;
  let parsedWorkouts = 0;

  const stream = fs.createReadStream(inputPath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    parsedLines += 1;

    if (line.includes("<Record ")) {
      const attrs = parseAttributes(line);
      const metric = recordToMetric(attrs);
      if (!metric) {
        continue;
      }

      if (metric.at.getTime() < since) {
        continue;
      }

      const key = `${metric.dayKey}:${metric.metric}`;
      upsertAggregate(aggregates, key, metric);
      parsedRecords += 1;
      continue;
    }

    if (line.includes("<Workout ")) {
      const attrs = parseAttributes(line);
      const metric = workoutToMetric(attrs);
      if (!metric) {
        continue;
      }

      if (metric.at.getTime() < since) {
        continue;
      }

      const key = `${metric.dayKey}:${metric.metric}`;
      upsertAggregate(aggregates, key, metric);
      parsedWorkouts += 1;
    }
  }

  const samples = [];

  for (const entry of aggregates.values()) {
    samples.push({
      metric: entry.metric,
      value: round(entry.value, entry.metric === "steps" ? 0 : 2),
      unit: entry.unit,
      recordedAt: entry.latestAt.toISOString()
    });
  }

  samples.sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
  fs.writeFileSync(outPath, JSON.stringify({ samples }, null, 2), "utf8");

  console.log(`Parsed lines: ${parsedLines.toLocaleString()}`);
  console.log(`Matched records: ${parsedRecords.toLocaleString()}, workouts: ${parsedWorkouts.toLocaleString()}`);
  console.log(`Generated samples: ${samples.length.toLocaleString()}`);
  console.log(`Wrote: ${outPath}`);

  if (!post) {
    return;
  }

  const url = new URL("/api/fitness/apple-health/sync", apiBase);
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ samples })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`POST ${url} failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  console.log(`Posted to API. Imported: ${payload?.imported ?? "?"}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
