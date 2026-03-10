import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { fitnessMetrics, learningInterestAreas } from "../models";
import { AuthService } from "../auth/authService";
import { AuthenticatedRequest, createAuthMiddleware } from "../auth/middleware";
import { FinanceService } from "../services/financeService";
import { FitnessService } from "../services/fitnessService";
import { HabitService } from "../services/habitService";
import { LearningService } from "../services/learningService";
import { LearningTutorService } from "../services/learningTutorService";
import { PhotoService } from "../services/photoService";

const connectableProviders = ["eq_bank", "wealthsimple", "td", "amex"] as const;

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  name: z.string().min(1).max(120).optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const providerParamSchema = z.object({
  provider: z.enum(connectableProviders)
});

const exchangeSchema = z.object({
  publicToken: z.string().min(1)
});

const transactionQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional()
});

const portfolioMetricSchema = z.enum(["investments", "netWorth", "totalAssets"]);
const portfolioRangeSchema = z.enum(["1d", "1m", "3m", "6m", "1y", "5y"]);

const portfolioHistoryQuerySchema = z.object({
  metric: portfolioMetricSchema.optional(),
  range: portfolioRangeSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  maxPoints: z.coerce.number().int().min(25).max(2000).optional()
});

const portfolioSnapshotsQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional()
});

const portfolioSnapshotParamSchema = z.object({
  snapshotId: z.string().uuid()
});

const fitnessMetricSchema = z.enum(fitnessMetrics);

const appleHealthSyncSchema = z.object({
  samples: z.array(
    z.object({
      metric: fitnessMetricSchema,
      value: z.number().finite(),
      unit: z.string().min(1).max(24).optional(),
      recordedAt: z.string().datetime().optional()
    })
  )
});

const upsertFitnessTargetSchema = z.object({
  metric: fitnessMetricSchema,
  label: z.string().min(1).max(80).optional(),
  targetValue: z.number().finite(),
  unit: z.string().min(1).max(24).optional(),
  dueDate: z.string().date().optional()
});

const addManualFitnessSampleSchema = z.object({
  metric: fitnessMetricSchema,
  value: z.number().finite(),
  unit: z.string().min(1).max(24).optional(),
  recordedAt: z.string().datetime().optional()
});

const fitnessHistoryRangeSchema = z.enum(["1m", "3m", "6m", "1y", "all"]);

const fitnessHistoryQuerySchema = z.object({
  metric: fitnessMetricSchema,
  range: fitnessHistoryRangeSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  maxPoints: z.coerce.number().int().min(10).max(5000).optional()
});

const habitColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex code like #18d18c.");

const habitDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD.");

const habitCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: habitColorSchema.optional()
});

const habitIdParamSchema = z.object({
  habitId: z.string().uuid()
});

const habitUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  color: habitColorSchema.optional(),
  sortOrder: z.coerce.number().int().min(0).max(100000).optional(),
  archived: z.boolean().optional()
});

const habitLogQuerySchema = z.object({
  from: habitDateSchema,
  to: habitDateSchema
});

const habitLogsUpsertSchema = z.object({
  entries: z
    .array(
      z.object({
        habitId: z.string().uuid(),
        completed: z.boolean(),
        note: z.string().trim().max(500).optional()
      })
    )
    .max(200)
});

const photoListQuerySchema = z.object({
  from: habitDateSchema,
  to: habitDateSchema,
  limit: z.coerce.number().int().min(1).max(5000).optional()
});

const photoDateParamSchema = z.object({
  date: habitDateSchema
});

const photoIdParamSchema = z.object({
  photoId: z.string().uuid()
});

const photoDeleteParamSchema = z.object({
  photoIdOrDate: z.string().trim().min(1).max(40)
});

const photoCreateSchema = z.object({
  date: habitDateSchema,
  takenAt: z.string().datetime(),
  contentType: z.string().trim().min(3).max(80),
  imageBase64: z.string().min(1),
  caption: z.string().trim().max(300).optional()
});

const learningInterestAreaSchema = z.enum(learningInterestAreas);

const upsertLearningPreferenceSchema = z.object({
  interestArea: learningInterestAreaSchema
});

const completeLearningTopicSchema = z.object({
  topicKey: z.string().min(1).max(160)
});

const reviewLearningTopicSchema = z.object({
  topicKey: z.string().min(1).max(160),
  rating: z.enum(["again", "hard", "good", "easy"])
});

const tutorChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(8000)
});

const tutorChatSchema = z.object({
  topic: z.string().trim().min(1).max(200).optional(),
  topicKey: z.string().trim().min(1).max(160).optional(),
  messages: z.array(tutorChatMessageSchema).max(20).optional()
});

const publicFlightLookupQuerySchema = z.object({
  flightCode: z.string().trim().min(2).max(12),
  flightDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
});

const publicImageNormalizeSchema = z.object({
  contentType: z.string().trim().min(3).max(80),
  imageBase64: z.string().min(1)
});

const accountTypeSchema = z.enum([
  "cash",
  "chequing",
  "savings",
  "investment",
  "credit_card",
  "loan",
  "line_of_credit",
  "mortgage",
  "other"
]);

const csvImportSchema = z.object({
  provider: z.enum(["manual_csv"]).optional(),
  csvText: z.string().min(1),
  institutionName: z.string().min(1).max(120).optional(),
  defaultAccountName: z.string().min(1).max(120).optional(),
  defaultAccountType: accountTypeSchema.optional(),
  defaultCurrency: z
    .string()
    .min(3)
    .max(3)
    .transform((value) => value.toUpperCase())
    .optional(),
  dayFirst: z.boolean().optional()
});

function asyncHandler(handler: (request: Request, response: Response) => Promise<void>) {
  return (request: Request, response: Response, next: NextFunction): void => {
    handler(request, response).catch(next);
  };
}

function currentUserId(request: Request): string {
  return (request as AuthenticatedRequest).user.id;
}

function buildLearningTopicContext(topic: { title: string; overview: string; plan: string[]; takeaways: string[]; quizPrompts: string[] }): string {
  return [
    `Title: ${topic.title}`,
    `Overview: ${topic.overview}`,
    "",
    "15-minute plan:",
    ...(topic.plan || []).map((step) => `- ${step}`),
    "",
    "Key takeaways:",
    ...(topic.takeaways || []).map((takeaway) => `- ${takeaway}`),
    "",
    "Self-quiz prompts:",
    ...(topic.quizPrompts || []).map((prompt) => `- ${prompt}`)
  ]
    .join("\n")
    .trim();
}

function normalizeFlightCode(value: string): string {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

function deriveFlightCodeFromAviationStackEntry(entry: Record<string, unknown>, fallback: string): string {
  const flight = entry.flight && typeof entry.flight === "object" ? (entry.flight as Record<string, unknown>) : {};
  const airline = entry.airline && typeof entry.airline === "object" ? (entry.airline as Record<string, unknown>) : {};

  const direct = normalizeFlightCode(String(flight.iata || ""));
  if (direct) {
    return direct;
  }

  const airlineIata = String(airline.iata || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const flightNumber = String(flight.number || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const combined = normalizeFlightCode(`${airlineIata}${flightNumber}`);

  return combined || fallback;
}

function normalizeFlightDate(value: string | undefined): string {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }
  return new Date().toISOString().slice(0, 10);
}

function dateToUtcMidnight(value: string): number | null {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIsoSeconds(value: number): string {
  return new Date(value).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function closestDateDistanceDays(flightDate: string, timestamps: Array<number | null>): number | null {
  const targetDate = dateToUtcMidnight(flightDate);
  if (targetDate === null) {
    return null;
  }

  let bestDistance = Number.POSITIVE_INFINITY;
  for (const timestamp of timestamps) {
    if (timestamp === null) continue;
    const dayString = new Date(timestamp).toISOString().slice(0, 10);
    const dayTime = dateToUtcMidnight(dayString);
    if (dayTime === null) continue;
    const distance = Math.abs(dayTime - targetDate) / 86400000;
    if (distance < bestDistance) {
      bestDistance = distance;
    }
  }

  return Number.isFinite(bestDistance) ? bestDistance : null;
}

function splitFlightCode(flightCode: string): { carrier: string; flightNumber: string } | null {
  const normalized = normalizeFlightCode(flightCode);
  const match = normalized.match(/^([A-Z]{2,3})(\d{1,4}[A-Z]?)$/);
  if (!match) {
    return null;
  }

  return {
    carrier: match[1],
    flightNumber: match[2]
  };
}

function normalizeFlightNumberToken(value: unknown): string {
  const raw = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const match = raw.match(/^0*(\d{1,4})([A-Z]?)$/);
  if (!match) {
    return raw;
  }

  const numeric = String(Number(match[1] || "0"));
  return `${numeric}${match[2] || ""}`;
}

function doesFlightAwareEntryMatchFlightCode(entry: Record<string, unknown>, requestedFlightCode: string): boolean {
  const normalizedRequested = normalizeFlightCode(requestedFlightCode);
  if (!normalizedRequested) {
    return false;
  }

  const requestedParts = splitFlightCode(normalizedRequested);
  const requestedNumber = requestedParts ? normalizeFlightNumberToken(requestedParts.flightNumber) : "";

  const candidateCodes = [
    normalizeFlightCode(String(entry.ident_iata || entry.identIata || "")),
    normalizeFlightCode(String(entry.actual_ident_iata || entry.actualIdentIata || "")),
    normalizeFlightCode(
      `${String(entry.operator_iata || entry.operatorIata || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")}${String(entry.flight_number || entry.flightNumber || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")}`
    )
  ].filter(Boolean);

  if (candidateCodes.includes(normalizedRequested)) {
    return true;
  }

  const entryNumber = normalizeFlightNumberToken(entry.flight_number || entry.flightNumber || "");
  if (requestedNumber && entryNumber && requestedNumber === entryNumber) {
    return true;
  }

  for (const candidateCode of candidateCodes) {
    const parts = splitFlightCode(candidateCode);
    if (!parts) continue;
    if (normalizeFlightNumberToken(parts.flightNumber) === requestedNumber) {
      return true;
    }
  }

  return false;
}

const airlineIataToIcaoCallsign: Record<string, string> = {
  AA: "AAL",
  AC: "ACA",
  AF: "AFR",
  AS: "ASA",
  AZ: "ITY",
  BA: "BAW",
  B6: "JBU",
  BR: "EVA",
  CX: "CPA",
  DL: "DAL",
  EI: "EIN",
  EK: "UAE",
  ET: "ETH",
  F9: "FFT",
  HA: "HAL",
  IB: "IBE",
  JL: "JAL",
  KL: "KLM",
  LH: "DLH",
  LO: "LOT",
  LX: "SWR",
  MU: "CES",
  NH: "ANA",
  NK: "NKS",
  NZ: "ANZ",
  OS: "AUA",
  PR: "PAL",
  QF: "QFA",
  QR: "QTR",
  SK: "SAS",
  SQ: "SIA",
  TK: "THY",
  UA: "UAL",
  VS: "VIR",
  WN: "SWA",
  WS: "WJA"
};

const airlineIcaoToIataCallsign: Record<string, string> = Object.fromEntries(
  Object.entries(airlineIataToIcaoCallsign).map(([iata, icao]) => [icao, iata])
);

function buildAdsbCallsignCandidates(flightCode: string): string[] {
  const normalized = normalizeFlightCode(flightCode);
  if (!normalized) {
    return [];
  }

  const candidates: string[] = [normalized];
  const parsed = splitFlightCode(normalized);
  if (!parsed) {
    return candidates;
  }

  if (parsed.carrier.length === 2) {
    const mappedCarrier = airlineIataToIcaoCallsign[parsed.carrier];
    if (mappedCarrier) {
      candidates.push(`${mappedCarrier}${parsed.flightNumber}`);
      const numericMatch = parsed.flightNumber.match(/^(\d{1,4})([A-Z]?)$/);
      if (numericMatch) {
        const paddedNumber = `${numericMatch[1].padStart(4, "0")}${numericMatch[2] || ""}`;
        candidates.push(`${mappedCarrier}${paddedNumber}`);
      }
    }
  }

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key = normalizeFlightCode(candidate);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(key);
  }

  return deduped;
}

function safeNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeAircraftCode(value: unknown): string {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

const commonAircraftByCode: Record<string, string> = {
  A221: "Airbus A220-100",
  A223: "Airbus A220-300",
  A318: "Airbus A318",
  A319: "Airbus A319",
  A320: "Airbus A320",
  A20N: "Airbus A320neo",
  A321: "Airbus A321",
  A21N: "Airbus A321neo",
  A332: "Airbus A330-200",
  A333: "Airbus A330-300",
  A339: "Airbus A330-900neo",
  A359: "Airbus A350-900",
  A35K: "Airbus A350-1000",
  B712: "Boeing 717-200",
  B37M: "Boeing 737 MAX 7",
  B38M: "Boeing 737 MAX 8",
  B39M: "Boeing 737 MAX 9",
  B3XM: "Boeing 737 MAX 10",
  B737: "Boeing 737-700",
  B738: "Boeing 737-800",
  B739: "Boeing 737-900",
  B744: "Boeing 747-400",
  B748: "Boeing 747-8",
  B752: "Boeing 757-200",
  B753: "Boeing 757-300",
  B763: "Boeing 767-300",
  B764: "Boeing 767-400",
  B772: "Boeing 777-200",
  B77L: "Boeing 777-200LR",
  B77W: "Boeing 777-300ER",
  B788: "Boeing 787-8",
  B789: "Boeing 787-9",
  B78X: "Boeing 787-10",
  BCS1: "Airbus A220-100",
  BCS3: "Airbus A220-300",
  CS100: "Airbus A220-100",
  CS300: "Airbus A220-300",
  CRJ2: "Bombardier CRJ200",
  CRJ7: "Bombardier CRJ700",
  CRJ9: "Bombardier CRJ900",
  DH8D: "De Havilland Dash 8 Q400",
  E170: "Embraer 170",
  E145: "Embraer ERJ-145",
  E175: "Embraer 175",
  E190: "Embraer 190",
  E195: "Embraer 195"
};

function toCommonAircraftName(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) {
    return "Unknown aircraft";
  }

  const normalized = normalizeAircraftCode(raw);
  if (normalized) {
    const mapped = commonAircraftByCode[normalized];
    if (mapped) {
      return mapped;
    }
  }

  return raw;
}

const knownAirportDirectory: Record<string, { name: string; city: string; country: string; lat: number; lon: number }> = {
  YYJ: {
    name: "Victoria International Airport",
    city: "Victoria",
    country: "Canada",
    lat: 48.6469,
    lon: -123.426
  },
  YYZ: {
    name: "Toronto Pearson International Airport",
    city: "Toronto",
    country: "Canada",
    lat: 43.6777,
    lon: -79.6248
  },
  YVR: {
    name: "Vancouver International Airport",
    city: "Vancouver",
    country: "Canada",
    lat: 49.1947,
    lon: -123.1792
  },
  HNL: {
    name: "Daniel K. Inouye International Airport",
    city: "Honolulu",
    country: "United States",
    lat: 21.3245,
    lon: -157.9251
  },
  SEA: {
    name: "Seattle-Tacoma International Airport",
    city: "Seattle",
    country: "United States",
    lat: 47.4502,
    lon: -122.3088
  },
  YUL: {
    name: "Montréal-Trudeau International Airport",
    city: "Montreal",
    country: "Canada",
    lat: 45.4706,
    lon: -73.7408
  },
  YWG: {
    name: "Winnipeg Richardson International Airport",
    city: "Winnipeg",
    country: "Canada",
    lat: 49.910,
    lon: -97.2399
  }
};

function parseIsoTime(value: unknown): number | null {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function delayMinutesFromLeg(leg: unknown): number | null {
  const source = leg && typeof leg === "object" ? (leg as Record<string, unknown>) : {};
  const direct = safeNumber(source.delay);
  const scheduledTime = parseIsoTime(source.scheduled);
  const actualTime = parseIsoTime(source.actual) ?? parseIsoTime(source.estimated);
  const derived = scheduledTime !== null && actualTime !== null ? Math.max(0, Math.round((actualTime - scheduledTime) / 60000)) : null;

  if (direct === null && derived === null) {
    return null;
  }

  if (direct === null) {
    return derived;
  }

  if (derived === null) {
    return Math.max(0, Math.round(direct));
  }

  return Math.max(0, Math.round(Math.max(direct, derived)));
}

function toAirportPayload(airport: unknown): {
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number | null;
  lon: number | null;
} {
  const source = airport && typeof airport === "object" ? (airport as Record<string, unknown>) : {};
  const iata = String(source.iata_code || source.iata || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
  const knownAirport = iata ? knownAirportDirectory[iata] : undefined;
  const name = String(source.name || source.airport || source.icao_code || knownAirport?.name || iata || "Unknown airport").trim();
  const city = String(source.municipality || source.city || source.city_name || knownAirport?.city || "").trim();
  const country = String(source.country_name || source.country || knownAirport?.country || "").trim();
  const lat = safeNumber(source.latitude ?? source.lat) ?? (knownAirport ? knownAirport.lat : null);
  const lon = safeNumber(source.longitude ?? source.lon) ?? (knownAirport ? knownAirport.lon : null);

  return { iata, name, city, country, lat, lon };
}

function normalizeAirportCode(value: unknown): string {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
}

function deriveFlightCodeFromFlightAwareEntry(entry: Record<string, unknown>, fallback: string): string {
  const directIata = normalizeFlightCode(String(entry.ident_iata || entry.identIata || ""));
  if (directIata) {
    return directIata;
  }

  const operatorIata = String(entry.operator_iata || entry.operatorIata || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const flightNumber = String(entry.flight_number || entry.flightNumber || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const combined = normalizeFlightCode(`${operatorIata}${flightNumber}`);
  if (combined) {
    return combined;
  }

  return normalizeFlightCode(fallback);
}

function deriveFlightCodeFromFlightAwareScheduleEntry(entry: Record<string, unknown>, fallback: string): string {
  const directIata = normalizeFlightCode(String(entry.ident_iata || entry.actual_ident_iata || ""));
  if (directIata) {
    return directIata;
  }

  const ident = normalizeFlightCode(String(entry.ident || entry.actual_ident || ""));
  const parsedIdent = splitFlightCode(ident);
  if (parsedIdent && parsedIdent.carrier.length === 3) {
    const iataCarrier = airlineIcaoToIataCallsign[parsedIdent.carrier];
    if (iataCarrier) {
      return normalizeFlightCode(`${iataCarrier}${parsedIdent.flightNumber}`);
    }
  }

  return normalizeFlightCode(fallback);
}

function doesFlightAwareScheduleEntryMatchFlightCode(entry: Record<string, unknown>, requestedFlightCode: string): boolean {
  const normalizedRequested = normalizeFlightCode(requestedFlightCode);
  if (!normalizedRequested) {
    return false;
  }

  const directMatches = [
    normalizeFlightCode(String(entry.ident_iata || "")),
    normalizeFlightCode(String(entry.actual_ident_iata || "")),
    deriveFlightCodeFromFlightAwareScheduleEntry(entry, "")
  ].filter(Boolean);

  if (directMatches.includes(normalizedRequested)) {
    return true;
  }

  const requestedParts = splitFlightCode(normalizedRequested);
  const requestedNumber = requestedParts ? normalizeFlightNumberToken(requestedParts.flightNumber) : "";
  if (!requestedNumber) {
    return false;
  }

  const candidateNumbers = [
    splitFlightCode(normalizeFlightCode(String(entry.ident_iata || entry.ident || "")))?.flightNumber,
    splitFlightCode(normalizeFlightCode(String(entry.actual_ident_iata || entry.actual_ident || "")))?.flightNumber,
    entry.flight_number
  ]
    .map((value) => normalizeFlightNumberToken(value || ""))
    .filter(Boolean);

  return candidateNumbers.includes(requestedNumber);
}

function toFlightAwareAirportPayload(airport: unknown): ReturnType<typeof toAirportPayload> {
  if (typeof airport === "string") {
    const code = normalizeAirportCode(airport);
    return toAirportPayload({
      iata_code: code.length === 3 ? code : "",
      name: code || "Unknown airport"
    });
  }

  const source = airport && typeof airport === "object" ? (airport as Record<string, unknown>) : {};
  const codeIata = normalizeAirportCode(source.code_iata ?? source.iata ?? source.iata_code);
  const code = normalizeAirportCode(source.code ?? source.fs ?? source.icao ?? source.code_icao);
  const iata = codeIata || (code.length === 3 ? code : "");
  return toAirportPayload({
    iata_code: iata,
    name: (source.name ?? source.airport_name ?? source.airport ?? code) || "Unknown airport",
    city: source.city ?? source.city_name ?? source.municipality,
    country_name: source.country_name ?? source.country,
    latitude: source.latitude ?? source.lat,
    longitude: source.longitude ?? source.lon
  });
}

function toFlightAwareScheduleAirportPayload(entry: Record<string, unknown>, direction: "origin" | "destination"): ReturnType<typeof toAirportPayload> {
  const iata = normalizeAirportCode(entry[`${direction}_iata`]);
  const icao = normalizeAirportCode(entry[`${direction}_icao`] ?? entry[direction]);

  return toAirportPayload({
    iata_code: iata || (icao.length === 3 ? icao : ""),
    icao_code: icao,
    name: iata || icao || "Unknown airport"
  });
}

const flightAwareAirportPayloadCache = new Map<string, ReturnType<typeof toAirportPayload>>();

function airportPayloadHasCoordinates(airport: ReturnType<typeof toAirportPayload>): boolean {
  return airport.lat !== null && airport.lon !== null;
}

function pickBestFlightAwareAirportEntry(payload: Record<string, unknown>, requestedCode: string): Record<string, unknown> {
  const alternativesRaw = Array.isArray(payload.alternatives) ? payload.alternatives : [];
  const alternatives = alternativesRaw.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
  const candidates: Record<string, unknown>[] = [payload, ...alternatives];
  const normalizedRequested = normalizeAirportCode(requestedCode);

  if (!normalizedRequested) {
    return candidates[0] || payload;
  }

  let best = candidates[0] || payload;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const airportCode = normalizeAirportCode(candidate.airport_code);
    const codeIcao = normalizeAirportCode(candidate.code_icao);
    const codeIata = normalizeAirportCode(candidate.code_iata);
    const altCode = normalizeAirportCode(candidate.alternate_ident ?? candidate.code_lid);
    let score = 0;

    if (airportCode === normalizedRequested) score += 6;
    if (codeIcao === normalizedRequested) score += 6;
    if (codeIata === normalizedRequested) score += 6;
    if (altCode === normalizedRequested) score += 4;
    if (normalizedRequested.length === 4 && codeIcao) score += 1;
    if (normalizedRequested.length === 3 && (codeIata || altCode)) score += 1;

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

function toFlightAwareLookupAirportPayload(entry: Record<string, unknown>): ReturnType<typeof toAirportPayload> {
  const iata = normalizeAirportCode(entry.code_iata ?? entry.alternate_ident ?? entry.code_lid);
  const icao = normalizeAirportCode(entry.code_icao ?? entry.airport_code);
  const fallbackName = iata || icao || "Unknown airport";
  const name = String(entry.name ?? entry.airport_name ?? fallbackName);

  return toAirportPayload({
    iata_code: iata || (icao.length === 3 ? icao : ""),
    icao_code: icao,
    name,
    city: entry.city ?? entry.city_name,
    country_name: entry.country_name ?? entry.country_code,
    latitude: entry.latitude ?? entry.lat,
    longitude: entry.longitude ?? entry.lon
  });
}

async function lookupFlightAwareAirportPayload(apiKey: string, airportCode: string): Promise<ReturnType<typeof toAirportPayload> | null> {
  const key = String(apiKey || "").trim();
  const normalizedCode = normalizeAirportCode(airportCode);
  if (!key || !normalizedCode) {
    return null;
  }

  const cached = flightAwareAirportPayloadCache.get(normalizedCode);
  if (cached) {
    return cached;
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 4500);

  try {
    const response = await fetch(`https://aeroapi.flightaware.com/aeroapi/airports/${encodeURIComponent(normalizedCode)}`, {
      headers: {
        accept: "application/json",
        "x-apikey": key
      },
      signal: abortController.signal
    });

    if (response.status === 401 || response.status === 403 || response.status === 404) {
      return null;
    }
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const bestEntry = pickBestFlightAwareAirportEntry(payload, normalizedCode);
    const airport = toFlightAwareLookupAirportPayload(bestEntry);

    const cacheKeys = [
      normalizedCode,
      normalizeAirportCode(bestEntry.airport_code),
      normalizeAirportCode(bestEntry.code_icao),
      normalizeAirportCode(bestEntry.code_iata),
      normalizeAirportCode(bestEntry.alternate_ident ?? bestEntry.code_lid)
    ];
    for (const cacheKey of cacheKeys) {
      if (cacheKey) {
        flightAwareAirportPayloadCache.set(cacheKey, airport);
      }
    }

    return airport;
  } catch (_error) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function enrichAirportWithFlightAwareLookup(
  apiKey: string,
  airport: ReturnType<typeof toAirportPayload>,
  preferredCode: string
): Promise<ReturnType<typeof toAirportPayload>> {
  if (airportPayloadHasCoordinates(airport)) {
    return airport;
  }

  const candidates = [
    normalizeAirportCode(preferredCode),
    normalizeAirportCode(airport.iata)
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = await lookupFlightAwareAirportPayload(apiKey, candidate);
    if (!resolved) continue;

    if (airportPayloadHasCoordinates(resolved)) {
      return {
        ...airport,
        ...resolved,
        iata: airport.iata || resolved.iata
      };
    }
  }

  return airport;
}

function buildFlightAwareScheduleAirlineCandidates(flightCode: string): string[] {
  const parsed = splitFlightCode(flightCode);
  if (!parsed) {
    return [];
  }

  const candidates: string[] = [];
  if (parsed.carrier.length === 3) {
    candidates.push(parsed.carrier);
  } else if (parsed.carrier.length === 2) {
    const mappedIcao = airlineIataToIcaoCallsign[parsed.carrier];
    if (mappedIcao) {
      candidates.push(mappedIcao);
    }
    candidates.push(parsed.carrier);
  }

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const normalized = String(candidate || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 3);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(normalized);
  }

  return deduped;
}

function delayMinutesFromFlightAwareEntry(entry: Record<string, unknown>): number | null {
  const directDelayKeys = [
    "departure_delay",
    "departure_delay_minutes",
    "arrival_delay",
    "arrival_delay_minutes",
    "delay",
    "delay_minutes"
  ];

  const directDelays: number[] = [];
  for (const key of directDelayKeys) {
    const parsed = safeNumber(entry[key]);
    if (parsed !== null) {
      // FlightAware delay fields are reported in seconds.
      directDelays.push(Math.max(0, Math.round(parsed / 60)));
    }
  }

  const timestampPairs: Array<[string, string, string]> = [
    ["scheduled_out", "actual_out", "estimated_out"],
    ["scheduled_off", "actual_off", "estimated_off"],
    ["scheduled_on", "actual_on", "estimated_on"],
    ["scheduled_in", "actual_in", "estimated_in"]
  ];

  const derivedDelays: number[] = [];
  for (const [scheduledKey, actualKey, estimatedKey] of timestampPairs) {
    const scheduledTime = parseIsoTime(entry[scheduledKey]);
    const actualTime = parseIsoTime(entry[actualKey]) ?? parseIsoTime(entry[estimatedKey]);
    if (scheduledTime === null || actualTime === null) continue;
    derivedDelays.push(Math.max(0, Math.round((actualTime - scheduledTime) / 60000)));
  }

  const directMax = directDelays.length > 0 ? Math.max(...directDelays) : null;
  const derivedMax = derivedDelays.length > 0 ? Math.max(...derivedDelays) : null;

  if (directMax === null && derivedMax === null) {
    return null;
  }

  return Math.max(directMax ?? 0, derivedMax ?? 0);
}

type PublicFlightLookupRecord = {
  flightCode: string;
  flightDate: string;
  origin: ReturnType<typeof toAirportPayload>;
  destination: ReturnType<typeof toAirportPayload>;
  aircraft: string;
  distanceKm: number;
  delayMinutes: number;
};

async function lookupFlightAwareScheduledRecord(
  apiKey: string,
  flightCode: string,
  flightDate: string
): Promise<{
  source: string;
  record: PublicFlightLookupRecord;
} | null> {
  const key = String(apiKey || "").trim();
  if (!key) {
    return null;
  }

  const referenceDate = dateToUtcMidnight(flightDate);
  if (referenceDate === null) {
    return null;
  }
  const parsedFlightCode = splitFlightCode(flightCode);
  if (!parsedFlightCode) {
    return null;
  }

  // FlightAware schedules currently retain about 3 months of historical data.
  const scheduleLookbackFloor = Date.now() - 90 * 24 * 60 * 60 * 1000;
  if (referenceDate < scheduleLookbackFloor) {
    return null;
  }

  const startIso = toIsoSeconds(referenceDate - 18 * 60 * 60 * 1000);
  const endIso = toIsoSeconds(referenceDate + 42 * 60 * 60 * 1000);
  const airlineCandidates = buildFlightAwareScheduleAirlineCandidates(flightCode);
  if (airlineCandidates.length === 0) {
    return null;
  }

  for (const airline of airlineCandidates) {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 6500);

    try {
      const params = new URLSearchParams({
        airline,
        flight_number: parsedFlightCode.flightNumber,
        max_pages: "1"
      });

      const endpoint = `https://aeroapi.flightaware.com/aeroapi/schedules/${encodeURIComponent(startIso)}/${encodeURIComponent(endIso)}?${params.toString()}`;
      const scheduleResponse = await fetch(endpoint, {
        headers: {
          accept: "application/json",
          "x-apikey": key
        },
        signal: abortController.signal
      });

      if (scheduleResponse.status === 401 || scheduleResponse.status === 403) {
        break;
      }

      if (!scheduleResponse.ok) {
        continue;
      }

      const payload = (await scheduleResponse.json()) as Record<string, unknown>;
      const rows = Array.isArray(payload.scheduled) ? payload.scheduled : [];
      if (rows.length === 0) {
        continue;
      }

      const candidates: Array<{
        record: PublicFlightLookupRecord;
        originCode: string;
        destinationCode: string;
        score: number;
      }> = [];

      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const entry = row as Record<string, unknown>;
        if (!doesFlightAwareScheduleEntryMatchFlightCode(entry, flightCode)) {
          continue;
        }

        const origin = toFlightAwareScheduleAirportPayload(entry, "origin");
        const destination = toFlightAwareScheduleAirportPayload(entry, "destination");
        const originCode = normalizeAirportCode(entry.origin_icao ?? entry.origin ?? entry.origin_iata ?? origin.iata);
        const destinationCode = normalizeAirportCode(entry.destination_icao ?? entry.destination ?? entry.destination_iata ?? destination.iata);
        const aircraftRaw = String(entry.aircraft_type || "").trim() || "Unknown aircraft";
        const aircraft = toCommonAircraftName(aircraftRaw);
        const distanceKm = calculateRouteDistanceKm(origin, destination);
        const candidateTimestamps = [parseIsoTime(entry.scheduled_out), parseIsoTime(entry.scheduled_in)];
        const dateDistanceDays = closestDateDistanceDays(flightDate, candidateTimestamps);

        let score = 0;
        if (aircraft !== "Unknown aircraft") score += 4;
        if (origin.iata && destination.iata) score += 2;
        if (distanceKm > 0) score += 1;
        if (String(entry.fa_flight_id || "").trim()) score += 1;
        if (normalizeFlightCode(String(entry.ident_iata || "")) === flightCode) score += 2;
        if (normalizeFlightCode(String(entry.actual_ident_iata || "")) === flightCode) score += 2;
        if (dateDistanceDays === 0) score += 4;
        else if (dateDistanceDays !== null && dateDistanceDays <= 1) score += 2;
        else if (dateDistanceDays !== null && dateDistanceDays <= 2) score += 1;
        else if (dateDistanceDays !== null) score -= 3;

        candidates.push({
          record: {
            flightCode,
            flightDate,
            origin,
            destination,
            aircraft,
            distanceKm,
            delayMinutes: 0
          },
          originCode,
          destinationCode,
          score
        });
      }

      if (candidates.length > 0) {
        candidates.sort((a, b) => b.score - a.score);
        const selected = candidates[0];
        const [resolvedOrigin, resolvedDestination] = await Promise.all([
          enrichAirportWithFlightAwareLookup(key, selected.record.origin, selected.originCode),
          enrichAirportWithFlightAwareLookup(key, selected.record.destination, selected.destinationCode)
        ]);
        const resolvedDistanceKm = calculateRouteDistanceKm(resolvedOrigin, resolvedDestination);
        return {
          source: "flightaware-schedules",
          record: {
            ...selected.record,
            origin: resolvedOrigin,
            destination: resolvedDestination,
            distanceKm: resolvedDistanceKm > 0 ? resolvedDistanceKm : selected.record.distanceKm
          }
        };
      }
    } catch (_error) {
      // Fall through to the next provider.
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

async function lookupFlightAwareScheduledAircraftHint(
  apiKey: string,
  flightCode: string,
  originIata: string,
  destinationIata: string
): Promise<string | null> {
  const key = String(apiKey || "").trim();
  if (!key) {
    return null;
  }

  const parsedFlightCode = splitFlightCode(flightCode);
  if (!parsedFlightCode) {
    return null;
  }

  const airlineCandidates = buildFlightAwareScheduleAirlineCandidates(flightCode);
  if (airlineCandidates.length === 0) {
    return null;
  }

  const now = Date.now();
  const startIso = toIsoSeconds(now - 12 * 60 * 60 * 1000);
  const endIso = toIsoSeconds(now + 14 * 24 * 60 * 60 * 1000);
  const normalizedOrigin = normalizeAirportCode(originIata);
  const normalizedDestination = normalizeAirportCode(destinationIata);

  let best: { aircraft: string; score: number } | null = null;
  for (const airline of airlineCandidates) {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 6500);

    try {
      const params = new URLSearchParams({
        airline,
        flight_number: parsedFlightCode.flightNumber,
        max_pages: "1"
      });

      const endpoint = `https://aeroapi.flightaware.com/aeroapi/schedules/${encodeURIComponent(startIso)}/${encodeURIComponent(endIso)}?${params.toString()}`;
      const response = await fetch(endpoint, {
        headers: {
          accept: "application/json",
          "x-apikey": key
        },
        signal: abortController.signal
      });

      if (response.status === 401 || response.status === 403) {
        break;
      }

      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as Record<string, unknown>;
      const rows = Array.isArray(payload.scheduled) ? payload.scheduled : [];
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const entry = row as Record<string, unknown>;
        if (!doesFlightAwareScheduleEntryMatchFlightCode(entry, flightCode)) {
          continue;
        }

        const aircraft = toCommonAircraftName(String(entry.aircraft_type || "").trim() || "Unknown aircraft");
        if (aircraft === "Unknown aircraft") {
          continue;
        }

        const origin = toFlightAwareScheduleAirportPayload(entry, "origin");
        const destination = toFlightAwareScheduleAirportPayload(entry, "destination");
        const originCode = normalizeAirportCode(origin.iata);
        const destinationCode = normalizeAirportCode(destination.iata);

        let score = 0;
        if (normalizeFlightCode(String(entry.ident_iata || "")) === flightCode) score += 2;
        if (normalizeFlightCode(String(entry.actual_ident_iata || "")) === flightCode) score += 2;
        if (originCode && normalizedOrigin && originCode === normalizedOrigin) score += 4;
        if (destinationCode && normalizedDestination && destinationCode === normalizedDestination) score += 4;
        if (originCode && destinationCode) score += 1;

        if (!best || score > best.score) {
          best = { aircraft, score };
        }
      }
    } catch (_error) {
      // Ignore schedule hint errors and continue to the next candidate.
    } finally {
      clearTimeout(timeout);
    }
  }

  return best ? best.aircraft : null;
}

async function lookupFlightAwareCurrentScheduledRecord(
  apiKey: string,
  flightCode: string,
  requestedFlightDate: string
): Promise<{ source: string; record: PublicFlightLookupRecord } | null> {
  const key = String(apiKey || "").trim();
  if (!key) {
    return null;
  }

  const parsedFlightCode = splitFlightCode(flightCode);
  if (!parsedFlightCode) {
    return null;
  }

  const airlineCandidates = buildFlightAwareScheduleAirlineCandidates(flightCode);
  if (airlineCandidates.length === 0) {
    return null;
  }

  const now = Date.now();
  // AeroAPI schedules requires a window shorter than 3 weeks.
  const startIso = toIsoSeconds(now - 6 * 60 * 60 * 1000);
  const endIso = toIsoSeconds(now + 13 * 24 * 60 * 60 * 1000);

  let best: { record: PublicFlightLookupRecord; score: number; originCode: string; destinationCode: string } | null = null;
  for (const airline of airlineCandidates) {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 6500);

    try {
      const params = new URLSearchParams({
        airline,
        flight_number: parsedFlightCode.flightNumber,
        max_pages: "1"
      });

      const endpoint = `https://aeroapi.flightaware.com/aeroapi/schedules/${encodeURIComponent(startIso)}/${encodeURIComponent(endIso)}?${params.toString()}`;
      const response = await fetch(endpoint, {
        headers: {
          accept: "application/json",
          "x-apikey": key
        },
        signal: abortController.signal
      });

      if (response.status === 401 || response.status === 403) {
        break;
      }

      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as Record<string, unknown>;
      const rows = Array.isArray(payload.scheduled) ? payload.scheduled : [];
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const entry = row as Record<string, unknown>;
        if (!doesFlightAwareScheduleEntryMatchFlightCode(entry, flightCode)) {
          continue;
        }

        const origin = toFlightAwareScheduleAirportPayload(entry, "origin");
        const destination = toFlightAwareScheduleAirportPayload(entry, "destination");
        const originCode = normalizeAirportCode(entry.origin_icao ?? entry.origin ?? entry.origin_iata ?? origin.iata);
        const destinationCode = normalizeAirportCode(entry.destination_icao ?? entry.destination ?? entry.destination_iata ?? destination.iata);
        const aircraft = toCommonAircraftName(String(entry.aircraft_type || "").trim() || "Unknown aircraft");
        const distanceKm = calculateRouteDistanceKm(origin, destination);

        let score = 0;
        if (normalizeFlightCode(String(entry.ident_iata || "")) === flightCode) score += 3;
        if (normalizeFlightCode(String(entry.actual_ident_iata || "")) === flightCode) score += 3;
        if (aircraft !== "Unknown aircraft") score += 4;
        if (origin.iata && destination.iata) score += 2;
        if (distanceKm > 0) score += 1;
        if (String(entry.fa_flight_id || "").trim()) score += 1;

        const candidateRecord: PublicFlightLookupRecord = {
          flightCode,
          flightDate: requestedFlightDate,
          origin,
          destination,
          aircraft,
          distanceKm,
          delayMinutes: 0
        };

        if (!best || score > best.score) {
          best = {
            record: candidateRecord,
            score,
            originCode,
            destinationCode
          };
        }
      }
    } catch (_error) {
      // Ignore current-schedule fallback errors and continue.
    } finally {
      clearTimeout(timeout);
    }
  }

  if (!best) {
    return null;
  }

  const [resolvedOrigin, resolvedDestination] = await Promise.all([
    enrichAirportWithFlightAwareLookup(key, best.record.origin, best.originCode),
    enrichAirportWithFlightAwareLookup(key, best.record.destination, best.destinationCode)
  ]);
  const resolvedDistanceKm = calculateRouteDistanceKm(resolvedOrigin, resolvedDestination);

  return {
    source: "flightaware-schedules-current",
    record: {
      ...best.record,
      origin: resolvedOrigin,
      destination: resolvedDestination,
      distanceKm: resolvedDistanceKm > 0 ? resolvedDistanceKm : best.record.distanceKm
    }
  };
}

async function applyCurrentAircraftHintIfUnknown(apiKey: string, record: PublicFlightLookupRecord): Promise<PublicFlightLookupRecord> {
  const key = String(apiKey || "").trim();
  if (!key) {
    return record;
  }

  const normalizedAircraft = toCommonAircraftName(record.aircraft);
  if (normalizedAircraft !== "Unknown aircraft") {
    if (normalizedAircraft === record.aircraft) {
      return record;
    }
    return {
      ...record,
      aircraft: normalizedAircraft
    };
  }

  const hintedAircraft = await lookupFlightAwareScheduledAircraftHint(
    key,
    normalizeFlightCode(record.flightCode),
    record.origin.iata,
    record.destination.iata
  );
  if (!hintedAircraft || hintedAircraft === "Unknown aircraft") {
    return {
      ...record,
      aircraft: normalizedAircraft
    };
  }

  return {
    ...record,
    aircraft: hintedAircraft
  };
}

async function lookupRecentFlightAwareAircraftHint(
  apiKey: string,
  flightCode: string,
  originIata: string,
  destinationIata: string,
  identCandidates: string[],
  referenceDate: number
): Promise<{ aircraft: string; delayMinutes: number | null } | null> {
  const key = String(apiKey || "").trim();
  if (!key) {
    return null;
  }

  const now = Date.now();
  const flightAwarePastFloor = now - 10 * 24 * 60 * 60 * 1000;
  const flightAwareFutureCeiling = now + 2 * 24 * 60 * 60 * 1000;
  const desiredReference = Number.isFinite(referenceDate) ? referenceDate : now;

  let startMs = Math.max(flightAwarePastFloor, desiredReference - 18 * 60 * 60 * 1000);
  let endMs = Math.min(flightAwareFutureCeiling, desiredReference + 42 * 60 * 60 * 1000);
  if (!(endMs > startMs)) {
    startMs = Math.max(flightAwarePastFloor, now - 2 * 24 * 60 * 60 * 1000);
    endMs = Math.min(flightAwareFutureCeiling, now + 42 * 60 * 60 * 1000);
  }

  const startIso = toIsoSeconds(startMs);
  const endIso = toIsoSeconds(endMs);
  const normalizedOrigin = normalizeAirportCode(originIata);
  const normalizedDestination = normalizeAirportCode(destinationIata);
  const requestedParts = splitFlightCode(flightCode);
  const requestedNumber = requestedParts ? normalizeFlightNumberToken(requestedParts.flightNumber) : "";

  let best: { aircraft: string; delayMinutes: number | null; score: number } | null = null;
  for (const ident of identCandidates.slice(0, 3)) {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 5000);

    try {
      const params = new URLSearchParams({
        start: startIso,
        end: endIso,
        max_pages: "1"
      });

      const response = await fetch(`https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(ident)}?${params.toString()}`, {
        headers: {
          accept: "application/json",
          "x-apikey": key
        },
        signal: abortController.signal
      });

      if (response.status === 401 || response.status === 403) {
        break;
      }

      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as Record<string, unknown>;
      const rows = Array.isArray(payload.flights) ? payload.flights : [];
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const entry = row as Record<string, unknown>;
        if (!doesFlightAwareEntryMatchFlightCode(entry, flightCode)) {
          continue;
        }

        const aircraft = toCommonAircraftName(String(entry.aircraft_type || entry.aircraftType || "").trim() || "Unknown aircraft");
        const delayMinutes = delayMinutesFromFlightAwareEntry(entry);
        if (aircraft === "Unknown aircraft" && delayMinutes === null) {
          continue;
        }

        const origin = toFlightAwareAirportPayload(entry.origin);
        const destination = toFlightAwareAirportPayload(entry.destination);
        const originCode = normalizeAirportCode(origin.iata);
        const destinationCode = normalizeAirportCode(destination.iata);
        const statusText = String(entry.status || entry.flight_status || "").toLowerCase().trim();
        const entryNumber = normalizeFlightNumberToken(entry.flight_number || entry.flightNumber || "");

        let score = 0;
        if (originCode && originCode === normalizedOrigin) score += 4;
        if (destinationCode && destinationCode === normalizedDestination) score += 4;
        if (requestedNumber && entryNumber && requestedNumber === entryNumber) score += 3;
        if (delayMinutes !== null) score += 2;
        if (aircraft !== "Unknown aircraft") score += 3;
        if (statusText.includes("cancel")) score -= 3;
        score += 2;

        if (!best || score > best.score) {
          best = { aircraft, delayMinutes, score };
        }
      }
    } catch (_error) {
      // Ignore enrichment errors and continue with next fallback path.
    } finally {
      clearTimeout(timeout);
    }
  }

  const scheduledAircraftHint = await lookupFlightAwareScheduledAircraftHint(key, flightCode, originIata, destinationIata);

  if (best) {
    const aircraft = best.aircraft !== "Unknown aircraft" ? best.aircraft : scheduledAircraftHint || best.aircraft;
    if (aircraft !== "Unknown aircraft" || best.delayMinutes !== null) {
      return { aircraft, delayMinutes: best.delayMinutes };
    }
  }

  if (scheduledAircraftHint) {
    return { aircraft: scheduledAircraftHint, delayMinutes: null };
  }

  return null;
}

function buildCiriumAirportLookup(appendix: unknown): Map<string, Record<string, unknown>> {
  const lookup = new Map<string, Record<string, unknown>>();
  const appendixSource = appendix && typeof appendix === "object" ? (appendix as Record<string, unknown>) : {};
  const airports = Array.isArray(appendixSource.airports) ? appendixSource.airports : [];

  for (const item of airports) {
    if (!item || typeof item !== "object") continue;
    const airport = item as Record<string, unknown>;
    const fs = normalizeAirportCode(airport.fs);
    const iata = normalizeAirportCode(airport.iata);

    if (fs) lookup.set(fs, airport);
    if (iata) lookup.set(iata, airport);
  }

  return lookup;
}

function buildCiriumEquipmentLookup(appendix: unknown): Map<string, string> {
  const lookup = new Map<string, string>();
  const appendixSource = appendix && typeof appendix === "object" ? (appendix as Record<string, unknown>) : {};
  const equipments = Array.isArray(appendixSource.equipments) ? appendixSource.equipments : [];

  for (const item of equipments) {
    if (!item || typeof item !== "object") continue;
    const equipment = item as Record<string, unknown>;
    const name = String(equipment.name || equipment.shortName || "").trim();
    if (!name) continue;

    const keys = [equipment.iata, equipment.icao, equipment.code];
    for (const key of keys) {
      const normalized = normalizeAirportCode(key);
      if (normalized) {
        lookup.set(normalized, name);
      }
    }
  }

  return lookup;
}

function toCiriumAirportPayload(airport: unknown, fallbackCode: string): ReturnType<typeof toAirportPayload> {
  const source = airport && typeof airport === "object" ? (airport as Record<string, unknown>) : {};
  return toAirportPayload({
    iata_code: source.iata ?? source.fs ?? source.fsCode ?? fallbackCode,
    name: source.name ?? source.airportName,
    city: source.city ?? source.cityName ?? source.municipality,
    country_name: source.countryName ?? source.country,
    latitude: source.latitude ?? source.lat,
    longitude: source.longitude ?? source.lon
  });
}

function parseCiriumDate(value: unknown): number | null {
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    return parseIsoTime(source.dateUtc) ?? parseIsoTime(source.dateLocal) ?? parseIsoTime(source.utc) ?? parseIsoTime(source.local);
  }

  return parseIsoTime(value);
}

function delayMinutesFromCiriumStatus(status: Record<string, unknown>): number | null {
  const delays = status.delays && typeof status.delays === "object" ? (status.delays as Record<string, unknown>) : {};
  const explicitDelayKeys = [
    "arrivalGateDelayMinutes",
    "arrivalRunwayDelayMinutes",
    "departureGateDelayMinutes",
    "departureRunwayDelayMinutes",
    "arrivalMinutes",
    "departureMinutes"
  ];
  const componentDelayKeys = [
    "lateAircraftMinutes",
    "carrierMinutes",
    "weatherMinutes",
    "securityMinutes",
    "nationalAviationSystemMinutes"
  ];

  const explicitDelays: number[] = [];
  for (const key of explicitDelayKeys) {
    const parsed = safeNumber(delays[key]);
    if (parsed !== null) {
      explicitDelays.push(Math.max(0, Math.round(parsed)));
    }
  }

  const explicitMax = explicitDelays.length > 0 ? Math.max(...explicitDelays) : null;
  if (explicitMax !== null && explicitMax > 0) {
    return explicitMax;
  }

  let componentSum = 0;
  let hasComponentDelay = false;
  for (const key of componentDelayKeys) {
    const parsed = safeNumber(delays[key]);
    if (parsed !== null) {
      hasComponentDelay = true;
      componentSum += Math.max(0, Math.round(parsed));
    }
  }

  if (hasComponentDelay && componentSum > 0) {
    return componentSum;
  }

  const operationalTimes =
    status.operationalTimes && typeof status.operationalTimes === "object" ? (status.operationalTimes as Record<string, unknown>) : {};

  const scheduledArrival = parseCiriumDate(operationalTimes.scheduledGateArrival) ?? parseCiriumDate(operationalTimes.scheduledRunwayArrival);
  const actualArrival =
    parseCiriumDate(operationalTimes.actualGateArrival) ??
    parseCiriumDate(operationalTimes.estimatedGateArrival) ??
    parseCiriumDate(operationalTimes.actualRunwayArrival) ??
    parseCiriumDate(operationalTimes.estimatedRunwayArrival);

  if (scheduledArrival !== null && actualArrival !== null) {
    return Math.max(0, Math.round((actualArrival - scheduledArrival) / 60000));
  }

  const scheduledDeparture =
    parseCiriumDate(operationalTimes.scheduledGateDeparture) ?? parseCiriumDate(operationalTimes.scheduledRunwayDeparture);
  const actualDeparture =
    parseCiriumDate(operationalTimes.actualGateDeparture) ??
    parseCiriumDate(operationalTimes.estimatedGateDeparture) ??
    parseCiriumDate(operationalTimes.actualRunwayDeparture) ??
    parseCiriumDate(operationalTimes.estimatedRunwayDeparture);

  if (scheduledDeparture !== null && actualDeparture !== null) {
    return Math.max(0, Math.round((actualDeparture - scheduledDeparture) / 60000));
  }

  if (explicitMax !== null) {
    return explicitMax;
  }

  return null;
}

function calculateRouteDistanceKm(origin: ReturnType<typeof toAirportPayload>, destination: ReturnType<typeof toAirportPayload>): number {
  if (origin.lat === null || origin.lon === null || destination.lat === null || destination.lon === null) {
    return 0;
  }

  return Math.max(0, Math.round(haversineKm(origin.lat, origin.lon, destination.lat, destination.lon)));
}

function degToRad(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 6371;
  const dLat = degToRad(lat2 - lat1);
  const dLon = degToRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(degToRad(lat1)) * Math.cos(degToRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return r * c;
}

export function createApiRouter(
  financeService: FinanceService,
  fitnessService: FitnessService,
  habitService: HabitService,
  learningService: LearningService,
  photoService: PhotoService,
  authService: AuthService
): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware(authService);
  const tutorService = new LearningTutorService();

  router.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  router.get(
    "/public/flight-lookup",
    asyncHandler(async (request, response) => {
      const query = publicFlightLookupQuerySchema.parse(request.query ?? {});
      const flightCode = normalizeFlightCode(query.flightCode);
      const flightDate = normalizeFlightDate(query.flightDate);

      if (!flightCode) {
        response.status(400).json({ error: "Invalid flight code." });
        return;
      }

      if (flightDate < "2000-01-01") {
        response.status(400).json({ error: "flightDate must be 2000-01-01 or later." });
        return;
      }

      const flightAwareApiKey = String(process.env.FLIGHTAWARE_AEROAPI_KEY || process.env.FLIGHTAWARE_API_KEY || "").trim();
      const referenceDate = dateToUtcMidnight(flightDate) ?? Date.now();
      const flightAwareDateFloor = Date.now() - 10 * 24 * 60 * 60 * 1000;
      const canUseFlightAwareWindow = referenceDate >= flightAwareDateFloor;
      if (flightAwareApiKey && canUseFlightAwareWindow) {
        const startIso = toIsoSeconds(referenceDate - 6 * 60 * 60 * 1000);
        const endIso = toIsoSeconds(referenceDate + 42 * 60 * 60 * 1000);
        const identCandidates = buildAdsbCallsignCandidates(flightCode);

        const candidates: Array<{
          record: {
            flightCode: string;
            flightDate: string;
            origin: ReturnType<typeof toAirportPayload>;
            destination: ReturnType<typeof toAirportPayload>;
            aircraft: string;
            distanceKm: number;
            delayMinutes: number;
          };
          score: number;
        }> = [];

        for (const ident of identCandidates) {
          const flightAwareAbortController = new AbortController();
          const flightAwareTimeout = setTimeout(() => flightAwareAbortController.abort(), 6000);

          try {
            const params = new URLSearchParams({
              start: startIso,
              end: endIso,
              max_pages: "1"
            });

            const flightAwareResponse = await fetch(
              `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(ident)}?${params.toString()}`,
              {
                headers: {
                  accept: "application/json",
                  "x-apikey": flightAwareApiKey
                },
                signal: flightAwareAbortController.signal
              }
            );

            if (flightAwareResponse.status === 401 || flightAwareResponse.status === 403) {
              break;
            }

            if (flightAwareResponse.status === 404) {
              continue;
            }

            if (!flightAwareResponse.ok) {
              continue;
            }

            const payload = (await flightAwareResponse.json()) as Record<string, unknown>;
            const rows = Array.isArray(payload.flights) ? payload.flights : [];
            if (rows.length === 0) {
              continue;
            }

            for (const row of rows) {
              if (!row || typeof row !== "object") continue;
              const entry = row as Record<string, unknown>;
              if (!doesFlightAwareEntryMatchFlightCode(entry, flightCode)) {
                continue;
              }

              const origin = toFlightAwareAirportPayload(entry.origin);
              const destination = toFlightAwareAirportPayload(entry.destination);

              const aircraftRaw =
                String(entry.aircraft_type || entry.aircraftType || "").trim() ||
                String(entry.registration || entry.tailnumber || "").trim() ||
                "Unknown aircraft";
              const aircraft = toCommonAircraftName(aircraftRaw);
              const delayDerived = delayMinutesFromFlightAwareEntry(entry);
              const delayMinutes = Math.max(0, delayDerived ?? 0);
              const distanceKm = calculateRouteDistanceKm(origin, destination);
              const statusText = String(entry.status || entry.flight_status || "").toLowerCase().trim();

              const candidateTimestamps = [
                parseIsoTime(entry.scheduled_out),
                parseIsoTime(entry.actual_out),
                parseIsoTime(entry.estimated_out),
                parseIsoTime(entry.scheduled_off),
                parseIsoTime(entry.actual_off),
                parseIsoTime(entry.estimated_off),
                parseIsoTime(entry.scheduled_in),
                parseIsoTime(entry.actual_in),
                parseIsoTime(entry.estimated_in),
                parseIsoTime(entry.scheduled_on),
                parseIsoTime(entry.actual_on),
                parseIsoTime(entry.estimated_on)
              ];
              const dateDistanceDays = closestDateDistanceDays(flightDate, candidateTimestamps);

              let score = 0;
              if (statusText.includes("arriv") || statusText.includes("landed")) score += 4;
              if (statusText.includes("en route") || statusText.includes("depart")) score += 2;
              if (statusText.includes("cancel")) score -= 4;
              if (delayDerived !== null) score += 3;
              if (origin.iata && destination.iata) score += 2;
              if (distanceKm > 0) score += 1;
              if (dateDistanceDays === 0) score += 4;
              else if (dateDistanceDays !== null && dateDistanceDays <= 1) score += 2;
              else if (dateDistanceDays !== null && dateDistanceDays <= 2) score += 1;
              else if (dateDistanceDays !== null) score -= 2;

              candidates.push({
                record: {
                  flightCode,
                  flightDate,
                  origin,
                  destination,
                  aircraft,
                  distanceKm,
                  delayMinutes
                },
                score
              });
            }
          } catch (_error) {
            // Fall through to other providers when FlightAware lookup fails.
          } finally {
            clearTimeout(flightAwareTimeout);
          }
        }

        if (candidates.length > 0) {
          candidates.sort((a, b) => b.score - a.score);
          const enrichedRecord = await applyCurrentAircraftHintIfUnknown(flightAwareApiKey, candidates[0].record);
          response.json({
            source: "flightaware",
            record: enrichedRecord
          });
          return;
        }
      }

      if (flightAwareApiKey) {
        const scheduleLookup = await lookupFlightAwareScheduledRecord(flightAwareApiKey, flightCode, flightDate);
        if (scheduleLookup) {
          const enrichedRecord = await applyCurrentAircraftHintIfUnknown(flightAwareApiKey, scheduleLookup.record);
          response.json({
            source: scheduleLookup.source,
            record: enrichedRecord
          });
          return;
        }
      }

      const ciriumAppId = String(process.env.CIRIUM_APP_ID || process.env.FLIGHTSTATS_APP_ID || "").trim();
      const ciriumAppKey = String(process.env.CIRIUM_APP_KEY || process.env.FLIGHTSTATS_APP_KEY || "").trim();
      const parsedFlightCode = splitFlightCode(flightCode);

      if (ciriumAppId && ciriumAppKey && parsedFlightCode) {
        const [year, month, day] = flightDate.split("-");
        const ciriumParams = new URLSearchParams({
          appId: ciriumAppId,
          appKey: ciriumAppKey,
          utc: "false",
          codeType: "IATA",
          extendedOptions: "useInlinedReferences"
        }).toString();

        const ciriumEndpoints = [
          `https://api.flightstats.com/flex/flightstatus/rest/v2/json/flight/status/${encodeURIComponent(parsedFlightCode.carrier)}/${encodeURIComponent(parsedFlightCode.flightNumber)}/dep/${year}/${month}/${day}`,
          `https://api.flightstats.com/flex/flightstatus/rest/v2/json/flight/status/${encodeURIComponent(parsedFlightCode.carrier)}/${encodeURIComponent(parsedFlightCode.flightNumber)}/arr/${year}/${month}/${day}`,
          `https://api.flightstats.com/flex/flightstatus/historical/rest/v3/json/flight/status/${encodeURIComponent(parsedFlightCode.carrier)}/${encodeURIComponent(parsedFlightCode.flightNumber)}/dep/${year}/${month}/${day}`,
          `https://api.flightstats.com/flex/flightstatus/historical/rest/v3/json/flight/status/${encodeURIComponent(parsedFlightCode.carrier)}/${encodeURIComponent(parsedFlightCode.flightNumber)}/arr/${year}/${month}/${day}`
        ];

        for (const endpoint of ciriumEndpoints) {
          const ciriumAbortController = new AbortController();
          const ciriumTimeout = setTimeout(() => ciriumAbortController.abort(), 4500);

          try {
            const ciriumResponse = await fetch(`${endpoint}?${ciriumParams}`, {
              headers: {
                accept: "application/json"
              },
              signal: ciriumAbortController.signal
            });

            if (ciriumResponse.status === 401 || ciriumResponse.status === 403) {
              break;
            }

            if (!ciriumResponse.ok) {
              continue;
            }

            const payload = (await ciriumResponse.json()) as Record<string, unknown>;
            const rows = Array.isArray(payload.flightStatuses) ? payload.flightStatuses : [];
            if (rows.length === 0) {
              continue;
            }

            const airportLookup = buildCiriumAirportLookup(payload.appendix);
            const equipmentLookup = buildCiriumEquipmentLookup(payload.appendix);

            const candidates: Array<{
              record: {
                flightCode: string;
                flightDate: string;
                origin: ReturnType<typeof toAirportPayload>;
                destination: ReturnType<typeof toAirportPayload>;
                aircraft: string;
                distanceKm: number;
                delayMinutes: number;
              };
              score: number;
            }> = [];

            for (const row of rows) {
              if (!row || typeof row !== "object") continue;
              const status = row as Record<string, unknown>;
              const carrierCode = String(status.carrierFsCode || parsedFlightCode.carrier)
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, "");
              const number = String(status.flightNumber || parsedFlightCode.flightNumber)
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, "");
              const normalizedCode = normalizeFlightCode(`${carrierCode}${number}`);
              if (normalizedCode !== flightCode) {
                continue;
              }

              const departureAirportInline =
                status.departureAirport && typeof status.departureAirport === "object"
                  ? (status.departureAirport as Record<string, unknown>)
                  : undefined;
              const arrivalAirportInline =
                status.arrivalAirport && typeof status.arrivalAirport === "object"
                  ? (status.arrivalAirport as Record<string, unknown>)
                  : undefined;

              const departureCode = normalizeAirportCode(status.departureAirportFsCode ?? departureAirportInline?.fs ?? departureAirportInline?.iata);
              const arrivalCode = normalizeAirportCode(status.arrivalAirportFsCode ?? arrivalAirportInline?.fs ?? arrivalAirportInline?.iata);
              if (!departureCode || !arrivalCode) {
                continue;
              }

              const origin = toCiriumAirportPayload((departureCode ? airportLookup.get(departureCode) : undefined) ?? departureAirportInline, departureCode);
              const destination = toCiriumAirportPayload(
                (arrivalCode ? airportLookup.get(arrivalCode) : undefined) ?? arrivalAirportInline,
                arrivalCode
              );

              const flightEquipment =
                status.flightEquipment && typeof status.flightEquipment === "object"
                  ? (status.flightEquipment as Record<string, unknown>)
                  : {};
              const actualEquipmentCode = normalizeAirportCode(
                flightEquipment.actualEquipmentIataCode ?? flightEquipment.actualEquipmentCode ?? flightEquipment.actualEquipment
              );
              const scheduledEquipmentCode = normalizeAirportCode(
                flightEquipment.scheduledEquipmentIataCode ?? flightEquipment.scheduledEquipmentCode ?? flightEquipment.scheduledEquipment
              );
              const aircraftRaw =
                String(flightEquipment.actualEquipmentName || "").trim() ||
                (actualEquipmentCode ? String(equipmentLookup.get(actualEquipmentCode) || "").trim() : "") ||
                String(flightEquipment.scheduledEquipmentName || "").trim() ||
                (scheduledEquipmentCode ? String(equipmentLookup.get(scheduledEquipmentCode) || "").trim() : "") ||
                "Unknown aircraft";
              const aircraft = toCommonAircraftName(aircraftRaw);

              const delayDerived = delayMinutesFromCiriumStatus(status);
              const delayMinutes = Math.max(0, delayDerived ?? 0);
              const distanceKm = calculateRouteDistanceKm(origin, destination);
              const statusText = String(status.status || "").toLowerCase().trim();

              let score = 0;
              if (statusText === "l" || statusText === "a" || statusText === "active" || statusText === "landed" || statusText === "arrived") {
                score += 4;
              }
              if (statusText === "c" || statusText.includes("cancel")) {
                score -= 4;
              }
              if (delayDerived !== null) score += 3;
              if (origin.iata && destination.iata) score += 2;
              if (distanceKm > 0) score += 1;

              candidates.push({
                record: {
                  flightCode: normalizedCode,
                  flightDate,
                  origin,
                  destination,
                  aircraft,
                  distanceKm,
                  delayMinutes
                },
                score
              });
            }

            if (candidates.length > 0) {
              candidates.sort((a, b) => b.score - a.score);
              const enrichedRecord = await applyCurrentAircraftHintIfUnknown(flightAwareApiKey, candidates[0].record);
              response.json({
                source: "cirium",
                record: enrichedRecord
              });
              return;
            }
          } catch (_error) {
            // Fall through to other providers when Cirium lookup fails.
          } finally {
            clearTimeout(ciriumTimeout);
          }
        }
      }

      const aviationstackKey = String(process.env.AVIATIONSTACK_API_KEY || "").trim();
      if (aviationstackKey) {
        const liveLookupAbortController = new AbortController();
        const liveLookupTimeout = setTimeout(() => liveLookupAbortController.abort(), 6500);

        try {
          const params = new URLSearchParams({
            access_key: aviationstackKey,
            flight_iata: flightCode,
            flight_date: flightDate,
            limit: "50"
          });

          const aviationResponse = await fetch(`https://api.aviationstack.com/v1/flights?${params.toString()}`, {
            headers: {
              accept: "application/json"
            },
            signal: liveLookupAbortController.signal
          });

          if (aviationResponse.ok) {
            const payload = (await aviationResponse.json()) as Record<string, unknown>;
            const apiError = payload.error && typeof payload.error === "object" ? (payload.error as Record<string, unknown>) : null;
            const rows = Array.isArray(payload.data) ? payload.data : [];

            if (!apiError && rows.length > 0) {
              const candidates: Array<{
                record: {
                  flightCode: string;
                  flightDate: string;
                  origin: ReturnType<typeof toAirportPayload>;
                  destination: ReturnType<typeof toAirportPayload>;
                  aircraft: string;
                  distanceKm: number;
                  delayMinutes: number;
                };
                score: number;
              }> = [];

              for (const row of rows) {
                const entry = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
                const normalizedCode = deriveFlightCodeFromAviationStackEntry(entry, flightCode);
                if (normalizedCode !== flightCode) {
                  continue;
                }

                const departure = entry.departure && typeof entry.departure === "object" ? (entry.departure as Record<string, unknown>) : {};
                const arrival = entry.arrival && typeof entry.arrival === "object" ? (entry.arrival as Record<string, unknown>) : {};
                const origin = toAirportPayload(departure);
                const destination = toAirportPayload(arrival);
                if (!origin.name || !destination.name) {
                  continue;
                }

                const arrivalDelay = delayMinutesFromLeg(arrival);
                const departureDelay = delayMinutesFromLeg(departure);
                const delayMinutes = Math.max(0, arrivalDelay ?? 0, departureDelay ?? 0);

                const aircraftObj = entry.aircraft && typeof entry.aircraft === "object" ? (entry.aircraft as Record<string, unknown>) : {};
                const aircraftRaw = String(aircraftObj.iata || aircraftObj.icao || aircraftObj.registration || "Unknown aircraft").trim() || "Unknown aircraft";
                const aircraft = toCommonAircraftName(aircraftRaw);

                const distanceKm =
                  origin.lat !== null && origin.lon !== null && destination.lat !== null && destination.lon !== null
                    ? Math.max(0, Math.round(haversineKm(origin.lat, origin.lon, destination.lat, destination.lon)))
                    : 0;

                const flightStatus = String(entry.flight_status || "").toLowerCase().trim();
                let score = 0;
                if (flightStatus === "landed" || flightStatus === "active") score += 4;
                if (arrivalDelay !== null || departureDelay !== null) score += 3;
                if (origin.iata && destination.iata) score += 2;
                if (distanceKm > 0) score += 1;

                candidates.push({
                  record: {
                    flightCode: normalizedCode,
                    flightDate,
                    origin,
                    destination,
                    aircraft,
                    distanceKm,
                    delayMinutes
                  },
                  score
                });
              }

              if (candidates.length > 0) {
                candidates.sort((a, b) => b.score - a.score);
                const enrichedRecord = await applyCurrentAircraftHintIfUnknown(flightAwareApiKey, candidates[0].record);
                response.json({
                  source: "aviationstack",
                  record: enrichedRecord
                });
                return;
              }
            }
          }
        } catch (_error) {
          // Fall through to ADSBdb fallback when Aviationstack fails.
        } finally {
          clearTimeout(liveLookupTimeout);
        }
      }

      if (flightAwareApiKey) {
        const currentScheduleFallback = await lookupFlightAwareCurrentScheduledRecord(flightAwareApiKey, flightCode, flightDate);
        if (currentScheduleFallback) {
          const enrichedRecord = await applyCurrentAircraftHintIfUnknown(flightAwareApiKey, currentScheduleFallback.record);
          response.json({
            source: currentScheduleFallback.source,
            record: enrichedRecord
          });
          return;
        }
      }

      const fallbackCallsignCandidates = buildAdsbCallsignCandidates(flightCode);
      let sawProviderFailure = false;

      for (const callsignCandidate of fallbackCallsignCandidates) {
        const fallbackAbortController = new AbortController();
        const fallbackTimeout = setTimeout(() => fallbackAbortController.abort(), 4500);

        try {
          const fallbackResponse = await fetch(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsignCandidate)}`, {
            headers: {
              accept: "application/json"
            },
            signal: fallbackAbortController.signal
          });

          if (fallbackResponse.status === 404) {
            continue;
          }

          if (!fallbackResponse.ok) {
            sawProviderFailure = true;
            continue;
          }

          const payload = (await fallbackResponse.json()) as Record<string, unknown>;
          const upstreamResponse = payload.response && typeof payload.response === "object" ? (payload.response as Record<string, unknown>) : {};
          const route =
            upstreamResponse.flightroute && typeof upstreamResponse.flightroute === "object"
              ? (upstreamResponse.flightroute as Record<string, unknown>)
              : null;

          if (!route) {
            continue;
          }

          const origin = toAirportPayload(route.origin);
          const destination = toAirportPayload(route.destination);
          const distanceKm =
            origin.lat !== null && origin.lon !== null && destination.lat !== null && destination.lon !== null
              ? haversineKm(origin.lat, origin.lon, destination.lat, destination.lon)
              : 0;
          const callsignIata = String(route.callsign_iata || "").trim();

          const responseFlightCode = normalizeFlightCode(callsignIata || flightCode);
          let aircraft = "Unknown aircraft";
          let source = "adsbdb";
          let delayMinutes = 0;

          if (flightAwareApiKey) {
            const hintCandidates = buildAdsbCallsignCandidates(responseFlightCode || flightCode);
            const hint = await lookupRecentFlightAwareAircraftHint(
              flightAwareApiKey,
              responseFlightCode || flightCode,
              origin.iata,
              destination.iata,
              hintCandidates,
              referenceDate
            );

            if (hint) {
              const hasAircraftHint = Boolean(hint.aircraft && hint.aircraft !== "Unknown aircraft");
              const hasDelayHint = hint.delayMinutes !== null;

              if (hint.aircraft && hint.aircraft !== "Unknown aircraft") {
                aircraft = hint.aircraft;
              }
              if (hint.delayMinutes !== null) {
                delayMinutes = Math.max(0, hint.delayMinutes);
              }
              if (hasAircraftHint && hasDelayHint) {
                source = "adsbdb+flightaware-enriched";
              } else if (hasAircraftHint) {
                source = "adsbdb+flightaware-aircraft";
              } else if (hasDelayHint) {
                source = "adsbdb+flightaware-enriched";
              }
            }
          }

          const enrichedRecord = await applyCurrentAircraftHintIfUnknown(flightAwareApiKey, {
            flightCode: responseFlightCode,
            flightDate,
            origin,
            destination,
            aircraft,
            distanceKm: Math.max(0, Math.round(distanceKm)),
            delayMinutes
          });

          if (source === "adsbdb" && enrichedRecord.aircraft !== "Unknown aircraft") {
            source = "adsbdb+flightaware-aircraft";
          }

          response.json({
            source,
            record: enrichedRecord
          });
          return;
        } catch (_error) {
          sawProviderFailure = true;
        } finally {
          clearTimeout(fallbackTimeout);
        }
      }

      if (sawProviderFailure) {
        response.status(502).json({ error: "Flight lookup provider unavailable." });
        return;
      }

      response.status(404).json({ error: "Flight code not found." });
    })
  );

  router.post(
    "/public/image-normalize",
    asyncHandler(async (request, response) => {
      const body = publicImageNormalizeSchema.parse(request.body ?? {});
      const normalized = await photoService.normalizeUploadedImage(body);
      response.json(normalized);
    })
  );

  router.post(
    "/auth/register",
    asyncHandler(async (request, response) => {
      const body = registerSchema.parse(request.body);
      const result = await authService.register(body.email, body.password, body.name);
      response.status(201).json(result);
    })
  );

  router.post(
    "/auth/login",
    asyncHandler(async (request, response) => {
      const body = loginSchema.parse(request.body);
      const result = await authService.login(body.email, body.password);
      response.json(result);
    })
  );

  router.get(
    "/auth/me",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json((request as AuthenticatedRequest).user);
    })
  );

  router.get(
    "/providers",
    requireAuth,
    asyncHandler(async (_request, response) => {
      response.json(financeService.listProviders());
    })
  );

  router.post(
    "/providers/:provider/link-token",
    requireAuth,
    asyncHandler(async (request, response) => {
      const params = providerParamSchema.parse(request.params);
      const result = await financeService.createLinkToken(currentUserId(request), params.provider);
      response.json(result);
    })
  );

  router.post(
    "/providers/:provider/exchange",
    requireAuth,
    asyncHandler(async (request, response) => {
      const params = providerParamSchema.parse(request.params);
      const body = exchangeSchema.parse(request.body);
      const connection = await financeService.exchangePublicToken(
        currentUserId(request),
        params.provider,
        body.publicToken
      );

      response.status(201).json(connection);
    })
  );

  router.get(
    "/connections",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json(await financeService.listConnections(currentUserId(request)));
    })
  );

  router.post(
    "/connections/:connectionId/sync",
    requireAuth,
    asyncHandler(async (request, response) => {
      const result = await financeService.syncConnection(currentUserId(request), request.params.connectionId);
      response.json(result);
    })
  );

  router.post(
    "/sync-all",
    requireAuth,
    asyncHandler(async (request, response) => {
      const results = await financeService.syncAllConnections(currentUserId(request));
      response.json({ results });
    })
  );

  router.post(
    "/reset",
    requireAuth,
    asyncHandler(async (request, response) => {
      const result = await financeService.resetUserData(currentUserId(request));
      response.json({ ok: true, deleted: result });
    })
  );

  router.get(
    "/debug/user-counts",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json(await financeService.getUserDataCounts(currentUserId(request)));
    })
  );

  router.get(
    "/accounts",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json(await financeService.getAccounts(currentUserId(request)));
    })
  );

  router.get(
    "/holdings",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json(await financeService.getHoldings(currentUserId(request)));
    })
  );

  router.get(
    "/liabilities",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json(await financeService.getLiabilities(currentUserId(request)));
    })
  );

  router.get(
    "/transactions",
    requireAuth,
    asyncHandler(async (request, response) => {
      const query = transactionQuerySchema.parse(request.query);
      const limit = query.limit ?? 100;
      response.json(await financeService.getTransactions(currentUserId(request), limit));
    })
  );

  router.get(
    "/summary",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json(await financeService.getSummary(currentUserId(request)));
    })
  );

  router.get(
    "/portfolio/history",
    requireAuth,
    asyncHandler(async (request, response) => {
      const query = portfolioHistoryQuerySchema.parse(request.query ?? {});
      const metric = query.metric ?? "investments";
      const to = query.to ?? new Date().toISOString();
      const toTime = Date.parse(to);

      if (Number.isNaN(toTime)) {
        throw new Error("Invalid 'to' datetime.");
      }

      const range = query.range ?? "1m";
      const rangeDays = range === "1d" ? 1 : range === "1m" ? 30 : range === "3m" ? 90 : range === "6m" ? 180 : range === "1y" ? 365 : 365 * 5;
      const from = query.from ?? new Date(toTime - rangeDays * 24 * 60 * 60 * 1000).toISOString();

      response.json(
        await financeService.getPortfolioHistory({
          userId: currentUserId(request),
          from,
          to,
          metric,
          maxPoints: query.maxPoints
        })
      );
    })
  );

  router.get(
    "/portfolio/snapshots",
    requireAuth,
    asyncHandler(async (request, response) => {
      const query = portfolioSnapshotsQuerySchema.parse(request.query ?? {});
      response.json(
        await financeService.listPortfolioSnapshots({
          userId: currentUserId(request),
          from: query.from,
          to: query.to,
          limit: query.limit
        })
      );
    })
  );

  router.get(
    "/portfolio/snapshots/:snapshotId",
    requireAuth,
    asyncHandler(async (request, response) => {
      const params = portfolioSnapshotParamSchema.parse(request.params);
      const snapshot = await financeService.getPortfolioSnapshotById(currentUserId(request), params.snapshotId);

      if (!snapshot) {
        response.status(404).json({ error: "Snapshot not found" });
        return;
      }

      response.json(snapshot);
    })
  );

  router.post(
    "/import/csv",
    requireAuth,
    asyncHandler(async (request, response) => {
      const body = csvImportSchema.parse(request.body ?? {});
      const result = await financeService.importStatementCsv(currentUserId(request), body);
      response.status(201).json(result);
    })
  );

  router.get(
    "/fitness/metrics",
    requireAuth,
    asyncHandler(async (_request, response) => {
      response.json(fitnessService.listMetricCatalog());
    })
  );

  router.get(
    "/fitness/dashboard",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json(await fitnessService.getDashboard(currentUserId(request)));
    })
  );

  router.get(
    "/fitness/history",
    requireAuth,
    asyncHandler(async (request, response) => {
      const query = fitnessHistoryQuerySchema.parse(request.query ?? {});

      const to = query.to ?? new Date().toISOString();
      const toTime = Date.parse(to);
      if (Number.isNaN(toTime)) {
        throw new Error("Invalid 'to' datetime.");
      }

      const range = query.range ?? "6m";
      const rangeDays = range === "1m" ? 30 : range === "3m" ? 90 : range === "6m" ? 180 : range === "1y" ? 365 : 0;
      const from =
        query.from ?? (range === "all" ? new Date(0).toISOString() : new Date(toTime - rangeDays * 24 * 60 * 60 * 1000).toISOString());

      response.json(
        await fitnessService.getMetricHistory({
          userId: currentUserId(request),
          metric: query.metric,
          from,
          to,
          maxPoints: query.maxPoints
        })
      );
    })
  );

  router.post(
    "/fitness/apple-health/sync",
    requireAuth,
    asyncHandler(async (request, response) => {
      const body = appleHealthSyncSchema.parse(request.body ?? {});
      response.json(await fitnessService.syncAppleHealth(currentUserId(request), body.samples));
    })
  );

  router.post(
    "/fitness/samples",
    requireAuth,
    asyncHandler(async (request, response) => {
      const body = addManualFitnessSampleSchema.parse(request.body ?? {});
      const created = await fitnessService.addManualSample(currentUserId(request), body);
      response.status(201).json(created);
    })
  );

  router.post(
    "/fitness/targets",
    requireAuth,
    asyncHandler(async (request, response) => {
      const body = upsertFitnessTargetSchema.parse(request.body ?? {});
      const target = await fitnessService.upsertTarget(currentUserId(request), body);
      response.status(201).json(target);
    })
  );

  router.delete(
    "/fitness/targets/:targetId",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json(await fitnessService.deleteTarget(currentUserId(request), request.params.targetId));
    })
  );

  router.get(
    "/habits",
    requireAuth,
    asyncHandler(async (request, response) => {
      const includeArchived = typeof request.query.includeArchived === "string" && request.query.includeArchived === "true";
      response.json(await habitService.listHabits(currentUserId(request), { includeArchived }));
    })
  );

  router.post(
    "/habits",
    requireAuth,
    asyncHandler(async (request, response) => {
      const body = habitCreateSchema.parse(request.body ?? {});
      const habit = await habitService.createHabit(currentUserId(request), body);
      response.status(201).json(habit);
    })
  );

  router.patch(
    "/habits/:habitId",
    requireAuth,
    asyncHandler(async (request, response) => {
      const params = habitIdParamSchema.parse(request.params ?? {});
      const body = habitUpdateSchema.parse(request.body ?? {});
      const habit = await habitService.updateHabit(currentUserId(request), params.habitId, body);

      if (!habit) {
        response.status(404).json({ error: "Habit not found" });
        return;
      }

      response.json(habit);
    })
  );

  router.get(
    "/habits/logs",
    requireAuth,
    asyncHandler(async (request, response) => {
      const query = habitLogQuerySchema.parse(request.query ?? {});
      response.json(await habitService.listLogs(currentUserId(request), query));
    })
  );

  router.put(
    "/habits/logs/:date",
    requireAuth,
    asyncHandler(async (request, response) => {
      const date = habitDateSchema.parse(request.params.date);
      const body = habitLogsUpsertSchema.parse(request.body ?? {});
      response.json(await habitService.upsertLogsForDate(currentUserId(request), date, body.entries));
    })
  );

  router.get(
    "/photos",
    requireAuth,
    asyncHandler(async (request, response) => {
      const query = photoListQuerySchema.parse(request.query ?? {});
      const photos = await photoService.listDailyPhotos(currentUserId(request), query);
      response.json({ photos });
    })
  );

  router.get(
    "/photos/by-date/:date",
    requireAuth,
    asyncHandler(async (request, response) => {
      const params = photoDateParamSchema.parse(request.params ?? {});
      const photos = await photoService.getDailyPhotosForDate(currentUserId(request), params.date);
      response.json({ photos, photo: photos[0] ?? null });
    })
  );

  router.post(
    "/photos",
    requireAuth,
    asyncHandler(async (request, response) => {
      const body = photoCreateSchema.parse(request.body ?? {});
      const photo = await photoService.createDailyPhoto(currentUserId(request), body);
      response.status(201).json({ photo });
    })
  );

  router.get(
    "/photos/:photoId/image",
    requireAuth,
    asyncHandler(async (request, response) => {
      const params = photoIdParamSchema.parse(request.params ?? {});
      const result = await photoService.getDailyPhotoImage(currentUserId(request), params.photoId);
      if (!result) {
        response.status(404).json({ error: "Photo not found" });
        return;
      }

      response.setHeader("Content-Type", result.contentType);
      response.setHeader("Cache-Control", "no-store");
      response.end(result.image);
    })
  );

  router.delete(
    "/photos/:photoIdOrDate",
    requireAuth,
    asyncHandler(async (request, response) => {
      const params = photoDeleteParamSchema.parse(request.params ?? {});
      const maybeDate = habitDateSchema.safeParse(params.photoIdOrDate);
      if (maybeDate.success) {
        const deletedByDate = await photoService.deleteDailyPhotoForDate(currentUserId(request), maybeDate.data);
        response.json({ deleted: deletedByDate });
        return;
      }

      const maybePhotoId = photoIdParamSchema.safeParse({ photoId: params.photoIdOrDate });
      if (!maybePhotoId.success) {
        response.status(400).json({ error: "Invalid photo id or date." });
        return;
      }

      const deleted = await photoService.deleteDailyPhoto(currentUserId(request), maybePhotoId.data.photoId);
      response.json({ deleted });
    })
  );

  router.delete(
    "/photos/by-date/:date",
    requireAuth,
    asyncHandler(async (request, response) => {
      const params = photoDateParamSchema.parse(request.params ?? {});
      const deleted = await photoService.deleteDailyPhotoForDate(currentUserId(request), params.date);
      response.json({ deleted });
    })
  );

  router.get(
    "/learning/dashboard",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json(await learningService.getDashboardSummary(currentUserId(request)));
    })
  );

  router.get(
    "/learning/preferences",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json(await learningService.getPreference(currentUserId(request)));
    })
  );

  router.put(
    "/learning/preferences",
    requireAuth,
    asyncHandler(async (request, response) => {
      const body = upsertLearningPreferenceSchema.parse(request.body ?? {});
      response.json(await learningService.setPreference(currentUserId(request), body.interestArea));
    })
  );

  router.get(
    "/learning/suggest",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json(await learningService.getSuggestion(currentUserId(request)));
    })
  );

  router.get(
    "/learning/topics/:topicKey",
    requireAuth,
    asyncHandler(async (request, response) => {
      response.json(learningService.getTopicOrThrow(request.params.topicKey));
    })
  );

  router.post(
    "/learning/complete",
    requireAuth,
    asyncHandler(async (request, response) => {
      const body = completeLearningTopicSchema.parse(request.body ?? {});
      const progress = await learningService.completeTopic(currentUserId(request), body.topicKey);
      response.status(201).json(progress);
    })
  );

  router.get(
    "/learning/reviews/due",
    requireAuth,
    asyncHandler(async (request, response) => {
      const limit = request.query?.limit ? Number(request.query.limit) : 25;
      response.json(await learningService.listDue(currentUserId(request), limit));
    })
  );

  router.post(
    "/learning/reviews",
    requireAuth,
    asyncHandler(async (request, response) => {
      const body = reviewLearningTopicSchema.parse(request.body ?? {});
      response.json(await learningService.reviewTopic(currentUserId(request), body.topicKey, body.rating));
    })
  );

  router.post(
    "/learning/tutor",
    requireAuth,
    asyncHandler(async (request, response) => {
      if (!tutorService.isConfigured()) {
        response.status(400).json({
          error:
            "AI tutor isn't configured. Set LLM_API_KEY (or OPENAI_API_KEY) for OpenAI, or set LLM_BASE_URL to a local OpenAI-compatible server (LM Studio / Ollama) and set LLM_MODEL."
        });
        return;
      }

      const body = tutorChatSchema.parse(request.body ?? {});
      const userId = currentUserId(request);

      let topic = body.topic?.trim() ?? "";
      let topicContext = "";

      if (body.topicKey) {
        const learningTopic = learningService.getTopicOrThrow(body.topicKey);
        topic = learningTopic.title;
        topicContext = buildLearningTopicContext(learningTopic);
      }

      if (!topic) {
        const suggestion = await learningService.getSuggestion(userId);
        topic = suggestion.topic.title;
        topicContext = buildLearningTopicContext(suggestion.topic);
      }

      const reply = await tutorService.chat({
        topic,
        topicContext,
        messages: body.messages ?? []
      });

      response.json({ topic, reply });
    })
  );

  return router;
}
