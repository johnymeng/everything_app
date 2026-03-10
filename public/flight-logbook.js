import "./search.js";

const STORAGE_KEY = "everything_flight_logbook_v1";
const LOOKUP_CATALOG_VERSION = "20260309";
const LOOKUP_CATALOG_URL = `/data/flight-lookup-seed.json?v=${LOOKUP_CATALOG_VERSION}`;
const COUNTRY_GEOJSON_URL = "/data/world-countries.geojson";
const LIVE_LOOKUP_API_URL = "/api/public/flight-lookup";
const PUBLIC_IMAGE_NORMALIZE_API_URL = "/api/public/image-normalize";
const LOOKUP_MIN_DATE = "2000-01-01";
const DESTINATION_PHOTO_STORAGE_KEY = "everything_flight_destination_photos_v1";
const DESTINATION_PHOTO_LIMIT_PER_AIRPORT = 36;
const DESTINATION_PHOTO_MAX_IMPORT_COUNT = 12;
const DESTINATION_PHOTO_MAX_SOURCE_BYTES = 20_000_000;
const DESTINATION_PHOTO_MAX_HEIC_SOURCE_BYTES = 7 * 1024 * 1024;
const DESTINATION_PHOTO_MAX_DIMENSION = 1600;
const DESTINATION_PHOTO_TARGET_BYTES = 420_000;
const DESTINATION_PHOTO_JPEG_QUALITIES = [0.9, 0.82, 0.76, 0.7, 0.62, 0.54];

const MAX_PITCH_RAD = Math.PI * 0.42;
const MAX_GLOBE_DPR = 1.25;
const ACTIVE_GLOBE_DPR = 1;
const DRAG_SENSITIVITY = 0.0055;
const DRAG_CLICK_THRESHOLD = 6;
const MIN_GLOBE_ZOOM = 1;
const MAX_GLOBE_ZOOM = 2.35;
const GLOBE_ZOOM_STEP = 0.14;
const WHEEL_ZOOM_SENSITIVITY = 0.0011;
const HEMISPHERE_EPSILON = 0.000001;
const TRIP_PLAYBACK_ROUTE_MS = 950;
const TRIP_PLAYBACK_HOLD_MS = 180;
const ACTIVE_RENDER_MIN_INTERVAL_MS = 1000 / 30;
const ACTIVE_ROUTE_SAMPLE_SCALE = 0.68;
const ESTIMATED_AIRCRAFT_CRUISE_KMH = 830;
const WIKIPEDIA_SUMMARY_API_BASE_URL = "https://en.wikipedia.org/api/rest_v1/page/summary/";
const AIRCRAFT_IMAGE_FALLBACK_URL = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
    <defs>
      <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stop-color="#203244"/>
        <stop offset="100%" stop-color="#0d141e"/>
      </linearGradient>
      <linearGradient id="stripe" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stop-color="#66baff"/>
        <stop offset="100%" stop-color="#9de5ff"/>
      </linearGradient>
    </defs>
    <rect width="640" height="360" fill="url(#bg)"/>
    <rect y="270" width="640" height="90" fill="rgba(255,255,255,0.06)"/>
    <path d="M83 186 L254 186 L304 142 L381 142 L448 186 L555 186 L555 218 L448 218 L380 247 L302 247 L252 218 L83 218 Z" fill="url(#stripe)" opacity="0.92"/>
    <circle cx="342" cy="165" r="5" fill="#113049"/>
    <circle cx="360" cy="165" r="5" fill="#113049"/>
    <circle cx="378" cy="165" r="5" fill="#113049"/>
    <text x="50%" y="320" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" fill="rgba(255,255,255,0.78)">Aircraft photo unavailable</text>
  </svg>`
)}`;
const AIRCRAFT_IMAGE_PAGE_HINTS = [
  { pattern: /\bairbus\s*a220\b/i, page: "Airbus_A220" },
  { pattern: /\bairbus\s*a318\b/i, page: "Airbus_A320_family" },
  { pattern: /\bairbus\s*a319\b/i, page: "Airbus_A320_family" },
  { pattern: /\bairbus\s*a320\b/i, page: "Airbus_A320_family" },
  { pattern: /\bairbus\s*a321\b/i, page: "Airbus_A320_family" },
  { pattern: /\bairbus\s*a330\b/i, page: "Airbus_A330" },
  { pattern: /\bairbus\s*a350\b/i, page: "Airbus_A350" },
  { pattern: /\bboeing\s*717\b/i, page: "Boeing_717" },
  { pattern: /\bboeing\s*737\b.*\bmax\b/i, page: "Boeing_737_MAX" },
  { pattern: /\bboeing\s*737\b/i, page: "Boeing_737" },
  { pattern: /\bboeing\s*747\b/i, page: "Boeing_747" },
  { pattern: /\bboeing\s*757\b/i, page: "Boeing_757" },
  { pattern: /\bboeing\s*767\b/i, page: "Boeing_767" },
  { pattern: /\bboeing\s*777\b/i, page: "Boeing_777" },
  { pattern: /\bboeing\s*787\b/i, page: "Boeing_787_Dreamliner" },
  { pattern: /\bde havilland\b.*\bq400\b/i, page: "De_Havilland_Canada_Dash_8" },
  { pattern: /\bcrj\b/i, page: "Bombardier_CRJ" },
  { pattern: /\bembraer\b.*\b1(70|75|90|95)\b/i, page: "Embraer_E-Jet_family" }
];

const CORE_VERIFIED_LOOKUP_RECORDS = [
  {
    flightCode: "AC1902",
    flightDate: "2026-01-13",
    origin: {
      iata: "YYJ",
      name: "Victoria International Airport",
      city: "Victoria",
      country: "Canada",
      lat: 48.6469,
      lon: -123.426
    },
    destination: {
      iata: "YYZ",
      name: "Toronto Pearson International Airport",
      city: "Toronto",
      country: "Canada",
      lat: 43.6777,
      lon: -79.6248
    },
    aircraft: "Airbus A220-300",
    distanceKm: 3385,
    delayMinutes: 0
  },
  {
    flightCode: "AC105",
    flightDate: "2026-03-07",
    origin: {
      iata: "YYZ",
      name: "Toronto Pearson International Airport",
      city: "Toronto",
      country: "Canada",
      lat: 43.6777,
      lon: -79.6248
    },
    destination: {
      iata: "YVR",
      name: "Vancouver International Airport",
      city: "Vancouver",
      country: "Canada",
      lat: 49.1947,
      lon: -123.1792
    },
    aircraft: "Boeing 777-300ER (77W)",
    distanceKm: 3357,
    delayMinutes: 89
  }
];

const LAND_BLOBS = [
  { lon: -128, lat: 54, size: 24 },
  { lon: -105, lat: 40, size: 28 },
  { lon: -84, lat: 25, size: 14 },
  { lon: -148, lat: 64, size: 12 },
  { lon: -74, lat: -10, size: 20 },
  { lon: -63, lat: -32, size: 18 },
  { lon: -52, lat: 2, size: 12 },
  { lon: -42, lat: 72, size: 12 },
  { lon: 8, lat: 52, size: 14 },
  { lon: 24, lat: 20, size: 20 },
  { lon: 30, lat: -10, size: 16 },
  { lon: 20, lat: -30, size: 12 },
  { lon: 72, lat: 52, size: 20 },
  { lon: 92, lat: 36, size: 24 },
  { lon: 112, lat: 24, size: 22 },
  { lon: 126, lat: 45, size: 14 },
  { lon: 104, lat: 8, size: 14 },
  { lon: 136, lat: -25, size: 14 },
  { lon: 147, lat: -35, size: 10 },
  { lon: -165, lat: -75, size: 10 },
  { lon: -120, lat: -74, size: 10 },
  { lon: -70, lat: -75, size: 10 },
  { lon: -15, lat: -76, size: 10 },
  { lon: 40, lat: -77, size: 10 },
  { lon: 95, lat: -76, size: 10 },
  { lon: 150, lat: -75, size: 10 }
];

const elements = {
  flightCodeInput: document.getElementById("flightCodeInput"),
  flightLookupDateInput: document.getElementById("flightLookupDateInput"),
  flightLookupButton: document.getElementById("flightLookupButton"),
  flightLookupStatus: document.getElementById("flightLookupStatus"),
  flightLookupResult: document.getElementById("flightLookupResult"),
  flightLookupResultTitle: document.getElementById("flightLookupResultTitle"),
  flightLookupResultMeta: document.getElementById("flightLookupResultMeta"),
  lookupOriginValue: document.getElementById("lookupOriginValue"),
  lookupDestinationValue: document.getElementById("lookupDestinationValue"),
  lookupAircraftValue: document.getElementById("lookupAircraftValue"),
  lookupDelayValue: document.getElementById("lookupDelayValue"),
  logLookupFlightButton: document.getElementById("logLookupFlightButton"),

  mapViewport: document.getElementById("flightMapViewport"),
  globeCanvas: document.getElementById("flightGlobeCanvas"),
  zoomOutButton: document.getElementById("flightZoomOutButton"),
  zoomInButton: document.getElementById("flightZoomInButton"),
  zoomResetButton: document.getElementById("flightZoomResetButton"),
  zoomValue: document.getElementById("flightZoomValue"),
  mapStatus: document.getElementById("flightMapStatus"),
  airportFocusTitle: document.getElementById("flightAirportFocusTitle"),
  airportFocusMeta: document.getElementById("flightAirportFocusMeta"),
  openDestinationGalleryButton: document.getElementById("openDestinationGalleryButton"),
  loggedFlightCountBadge: document.getElementById("loggedFlightCountBadge"),
  loggedAirportCountBadge: document.getElementById("loggedAirportCountBadge"),

  flightHistoryBody: document.getElementById("flightHistoryBody"),
  flightHistoryEmpty: document.getElementById("flightHistoryEmpty"),

  clearFlightHistoryButton: document.getElementById("clearFlightHistoryButton"),
  allTimeFlightsValue: document.getElementById("allTimeFlightsValue"),
  allTimeKmValue: document.getElementById("allTimeKmValue"),
  allTimeDelayHoursValue: document.getElementById("allTimeDelayHoursValue"),
  allTimeTopAircraftValue: document.getElementById("allTimeTopAircraftValue"),
  yearStatsSelect: document.getElementById("flightStatsYearSelect"),
  yearFlightsValue: document.getElementById("yearFlightsValue"),
  yearKmValue: document.getElementById("yearKmValue"),
  yearDelayHoursValue: document.getElementById("yearDelayHoursValue"),
  yearTopAircraftValue: document.getElementById("yearTopAircraftValue"),
  aircraftGalleryModal: document.getElementById("aircraftGalleryModal"),
  aircraftGalleryTitle: document.getElementById("aircraftGalleryTitle"),
  aircraftGalleryMeta: document.getElementById("aircraftGalleryMeta"),
  aircraftGalleryList: document.getElementById("aircraftGalleryList"),
  aircraftGalleryCloseButton: document.getElementById("aircraftGalleryCloseButton"),
  destinationGalleryModal: document.getElementById("destinationGalleryModal"),
  destinationGalleryTitle: document.getElementById("destinationGalleryTitle"),
  destinationGalleryMeta: document.getElementById("destinationGalleryMeta"),
  destinationGalleryStatus: document.getElementById("destinationGalleryStatus"),
  destinationGalleryList: document.getElementById("destinationGalleryList"),
  destinationGalleryAddButton: document.getElementById("destinationGalleryAddButton"),
  destinationGalleryCloseButton: document.getElementById("destinationGalleryCloseButton"),
  destinationPhotoInput: document.getElementById("destinationPhotoInput"),
  playbackYearSelect: document.getElementById("flightPlaybackYearSelect"),
  playbackToggleButton: document.getElementById("flightPlaybackToggleButton"),
  playbackStopButton: document.getElementById("flightPlaybackStopButton"),
  playbackStatus: document.getElementById("flightPlaybackStatus"),
  analyticsStatus: document.getElementById("flightAnalyticsStatus")
};

const state = {
  logs: [],
  selectedYear: "all",
  playbackYear: "all",
  lookupRecords: [],
  lookupResult: null,
  lookupRequestSeq: 0,
  aircraftGalleryScope: "all",
  aircraftGalleryHighlightedName: "",
  aircraftGalleryRequestId: 0,
  aircraftPhotoCacheByPage: new Map(),
  aircraftPhotoCacheByName: new Map(),
  destinationPhotosByAirport: new Map(),
  destinationGalleryAirportKey: "",
  destinationGalleryBusy: false,
  destinationGalleryMessage: "",
  destinationGalleryTone: "normal",

  flightRoutes: [],
  airportMarkers: [],
  selectedAirportKey: "",
  projectedMarkers: [],

  yaw: 0,
  pitch: 0,
  targetYaw: null,
  targetPitch: null,
  velocityYaw: 0,
  velocityPitch: 0,
  dragging: false,
  activePointerId: null,
  dragDistance: 0,
  lastPointerX: 0,
  lastPointerY: 0,
  rafId: 0,
  needsRender: true,
  lastFrameTime: 0,
  lastDrawTime: 0,

  canvasWidth: 0,
  canvasHeight: 0,
  globeCx: 0,
  globeCy: 0,
  globeRadius: 0,
  globeZoom: 1,
  renderQuality: "full",

  landPolygons: [],

  tripPlayback: {
    active: false,
    paused: false,
    phase: "idle",
    phaseStartedAt: 0,
    phaseElapsedOnPause: 0,
    routeProgress: 0,
    completedTripCount: 0,
    currentTripIndex: 0,
    trips: []
  }
};

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeFlightCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

function normalizeDate(value) {
  const raw = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function wrapAngle(angle) {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= Math.PI * 2;
  while (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
}

function clampGlobeZoom(value) {
  return clamp(value, MIN_GLOBE_ZOOM, MAX_GLOBE_ZOOM);
}

function syncGlobeZoomUI() {
  if (elements.zoomValue) {
    elements.zoomValue.textContent = `${Math.round(state.globeZoom * 100)}%`;
  }
  if (elements.zoomOutButton) {
    elements.zoomOutButton.disabled = state.globeZoom <= MIN_GLOBE_ZOOM + 0.001;
  }
  if (elements.zoomInButton) {
    elements.zoomInButton.disabled = state.globeZoom >= MAX_GLOBE_ZOOM - 0.001;
  }
  if (elements.zoomResetButton) {
    elements.zoomResetButton.disabled = Math.abs(state.globeZoom - 1) < 0.001;
  }
}

function shortestAngleDelta(from, to) {
  return wrapAngle(to - from);
}

function degToRad(value) {
  return (value * Math.PI) / 180;
}

function normalizeLonDegrees(value) {
  let normalized = Number(value) || 0;
  while (normalized > 180) normalized -= 360;
  while (normalized < -180) normalized += 360;
  return normalized;
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function setLookupStatus(message, tone = "normal") {
  if (!elements.flightLookupStatus) return;
  elements.flightLookupStatus.textContent = message;
  elements.flightLookupStatus.classList.toggle("error", tone === "error");
  elements.flightLookupStatus.classList.toggle("warn", tone === "warn");
}

function setMapStatus(message) {
  if (!elements.mapStatus) return;
  elements.mapStatus.textContent = message;
}

function setAnalyticsStatus(message, tone = "normal") {
  if (!elements.analyticsStatus) return;
  elements.analyticsStatus.textContent = message;
  elements.analyticsStatus.classList.toggle("error", tone === "error");
  elements.analyticsStatus.classList.toggle("warn", tone === "warn");
}

function setPlaybackStatus(message, tone = "normal") {
  if (!elements.playbackStatus) return;
  elements.playbackStatus.textContent = message;
  elements.playbackStatus.classList.toggle("error", tone === "error");
  elements.playbackStatus.classList.toggle("warn", tone === "warn");
}

function setDestinationGalleryStatus(message, tone = "normal") {
  state.destinationGalleryMessage = String(message || "");
  state.destinationGalleryTone = tone === "error" || tone === "warn" ? tone : "normal";
  if (!elements.destinationGalleryStatus) return;
  elements.destinationGalleryStatus.textContent = state.destinationGalleryMessage;
  elements.destinationGalleryStatus.classList.toggle("error", state.destinationGalleryTone === "error");
  elements.destinationGalleryStatus.classList.toggle("warn", state.destinationGalleryTone === "warn");
}

function syncModalOpenClass() {
  const aircraftOpen = Boolean(elements.aircraftGalleryModal && !elements.aircraftGalleryModal.classList.contains("hidden"));
  const destinationOpen = Boolean(elements.destinationGalleryModal && !elements.destinationGalleryModal.classList.contains("hidden"));
  document.body.classList.toggle("modal-open", aircraftOpen || destinationOpen);
}

function todayLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatKm(value) {
  const km = safeNumber(value, 0);
  return `${Math.round(km).toLocaleString()} km`;
}

function formatDelayMinutes(value) {
  const minutes = Math.max(0, safeNumber(value, 0));
  if (minutes <= 0.4) {
    return "On time";
  }
  return `${Math.round(minutes)} min`;
}

function formatHours(value) {
  const hours = Math.max(0, safeNumber(value, 0));
  return `${hours.toFixed(1)} h`;
}

function formatFlightCount(value) {
  const count = Math.max(0, Math.round(safeNumber(value, 0)));
  return `${count} flight${count === 1 ? "" : "s"}`;
}

function formatDateLabel(value) {
  const raw = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return "Unknown date";
  }

  const [year, month, day] = raw.split("-").map((item) => Number(item));
  const parsed = new Date(year, month - 1, day);
  if (!Number.isFinite(parsed.getTime())) {
    return raw;
  }

  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatDateTimeLabel(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return "";
  }
  const date = new Date(parsed);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatAircraftUsageMeta(stat) {
  if (!stat || !stat.name) {
    return "";
  }
  return `${formatFlightCount(stat.count)} • ${formatHours(stat.hours)} • ${formatKm(stat.km)}`;
}

function logsForAircraftScope(scope) {
  if (scope === "year") {
    return logsForYear(state.selectedYear);
  }
  return state.logs;
}

function aircraftScopeLabel(scope) {
  if (scope === "year" && state.selectedYear !== "all") {
    return `for ${state.selectedYear}`;
  }
  if (scope === "year") {
    return "for all years";
  }
  return "all time";
}

const COMMON_AIRCRAFT_BY_CODE = {
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

const AIRCRAFT_FAMILY_BY_CODE = {
  A221: "Airbus A220",
  A223: "Airbus A220",
  A318: "Airbus A320 family",
  A319: "Airbus A320 family",
  A320: "Airbus A320 family",
  A20N: "Airbus A320 family",
  A321: "Airbus A320 family",
  A21N: "Airbus A320 family",
  A332: "Airbus A330 family",
  A333: "Airbus A330 family",
  A339: "Airbus A330 family",
  A359: "Airbus A350",
  A35K: "Airbus A350",
  B712: "Boeing 717",
  B37M: "Boeing 737",
  B38M: "Boeing 737",
  B39M: "Boeing 737",
  B3XM: "Boeing 737",
  B737: "Boeing 737",
  B738: "Boeing 737",
  B739: "Boeing 737",
  B744: "Boeing 747",
  B748: "Boeing 747",
  B752: "Boeing 757",
  B753: "Boeing 757",
  B763: "Boeing 767",
  B764: "Boeing 767",
  B772: "Boeing 777",
  B77L: "Boeing 777",
  B77W: "Boeing 777",
  B788: "Boeing 787",
  B789: "Boeing 787",
  B78X: "Boeing 787",
  BCS1: "Airbus A220",
  BCS3: "Airbus A220",
  CS100: "Airbus A220",
  CS300: "Airbus A220",
  CRJ2: "Bombardier CRJ family",
  CRJ7: "Bombardier CRJ family",
  CRJ9: "Bombardier CRJ family",
  DH8D: "De Havilland Dash 8",
  E145: "Embraer ERJ family",
  E170: "Embraer E-Jet family",
  E175: "Embraer E-Jet family",
  E190: "Embraer E-Jet family",
  E195: "Embraer E-Jet family"
};

function normalizeAircraftCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

function toCommonAircraftName(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "Unknown aircraft";
  }

  const mapped = COMMON_AIRCRAFT_BY_CODE[normalizeAircraftCode(raw)];
  return mapped || raw;
}

function toAircraftFamilyName(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "Unknown aircraft";
  }

  const normalizedCode = normalizeAircraftCode(raw);
  const mappedByCode = AIRCRAFT_FAMILY_BY_CODE[normalizedCode];
  if (mappedByCode) {
    return mappedByCode;
  }

  const normalizedName = normalize(raw);
  if (!normalizedName || normalizedName === "unknown aircraft") {
    return "Unknown aircraft";
  }

  if (/^boeing\s*717\b/i.test(normalizedName)) return "Boeing 717";
  if (/^boeing\s*737\b/i.test(normalizedName)) return "Boeing 737";
  if (/^boeing\s*747\b/i.test(normalizedName)) return "Boeing 747";
  if (/^boeing\s*757\b/i.test(normalizedName)) return "Boeing 757";
  if (/^boeing\s*767\b/i.test(normalizedName)) return "Boeing 767";
  if (/^boeing\s*777\b/i.test(normalizedName)) return "Boeing 777";
  if (/^boeing\s*787\b/i.test(normalizedName)) return "Boeing 787";
  if (/^airbus\s*a220\b/i.test(normalizedName)) return "Airbus A220";
  if (/^airbus\s*a3(18|19|20|21)(?:neo)?\b/i.test(normalizedName)) return "Airbus A320 family";
  if (/^airbus\s*a330\b/i.test(normalizedName)) return "Airbus A330 family";
  if (/^airbus\s*a350\b/i.test(normalizedName)) return "Airbus A350";
  if (/^bombardier\s*crj\b/i.test(normalizedName) || /^crj\b/i.test(normalizedName)) return "Bombardier CRJ family";
  if (/^embraer\s*erj\b/i.test(normalizedName)) return "Embraer ERJ family";
  if (/^embraer\s*e?(170|175|190|195)\b/i.test(normalizedName)) return "Embraer E-Jet family";
  if (/^de havilland\b.*\bdash\s*8\b/i.test(normalizedName) || /^dash\s*8\b/i.test(normalizedName)) return "De Havilland Dash 8";

  return raw;
}

function shouldShowVariantDropdown(entry) {
  const variants = Array.isArray(entry?.variants) ? entry.variants : [];
  if (variants.length === 0) {
    return false;
  }
  if (variants.length > 1) {
    return true;
  }
  const onlyVariantName = String(variants[0].name || "").trim();
  return normalize(onlyVariantName) !== normalize(entry.name);
}

function createAircraftVariantDropdown(entry) {
  if (!shouldShowVariantDropdown(entry)) {
    return null;
  }

  const details = document.createElement("details");
  details.className = "aircraft-variant-details";

  const summary = document.createElement("summary");
  summary.className = "aircraft-variant-summary";
  const variants = Array.isArray(entry.variants) ? entry.variants : [];
  summary.textContent = variants.length === 1 ? "Variant flown (1)" : `Variants flown (${variants.length})`;

  const list = document.createElement("ul");
  list.className = "aircraft-variant-list";
  for (const variant of variants) {
    const item = document.createElement("li");
    item.className = "aircraft-variant-item";

    const name = document.createElement("span");
    name.className = "aircraft-variant-name";
    name.textContent = variant.name;

    const meta = document.createElement("span");
    meta.className = "aircraft-variant-meta";
    meta.textContent = formatAircraftUsageMeta(variant);

    item.append(name, meta);
    list.append(item);
  }

  details.append(summary, list);
  return details;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function airportKey(airport) {
  if (!airport || typeof airport !== "object") {
    return "";
  }

  const iata = String(airport.iata || "")
    .toUpperCase()
    .trim();
  if (iata) {
    return iata;
  }

  const lat = Number(airport.lat);
  const lon = Number(airport.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    return `${lat.toFixed(4)},${lon.toFixed(4)}`;
  }

  const name = String(airport.name || "").trim();
  return name.toLowerCase();
}

function normalizeAirport(airport) {
  const safe = airport && typeof airport === "object" ? airport : {};
  const iata = String(safe.iata || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);

  return {
    iata,
    name: String(safe.name || "").trim(),
    city: String(safe.city || "").trim(),
    country: String(safe.country || "").trim(),
    lat: Number.isFinite(Number(safe.lat)) ? Number(safe.lat) : null,
    lon: Number.isFinite(Number(safe.lon)) ? Number(safe.lon) : null
  };
}

function normalizeLookupRecord(record) {
  const safe = record && typeof record === "object" ? record : {};
  const flightCode = normalizeFlightCode(safe.flightCode);
  const flightDate = normalizeDate(safe.flightDate);
  const origin = normalizeAirport(safe.origin);
  const destination = normalizeAirport(safe.destination);

  if (!flightCode || !flightDate || !origin.name || !destination.name) {
    return null;
  }

  const distanceKmFromCoords = calculateDistanceBetweenAirports(origin, destination);

  return {
    flightCode,
    flightDate,
    origin,
    destination,
    aircraft: toCommonAircraftName(String(safe.aircraft || "Unknown aircraft").trim() || "Unknown aircraft"),
    distanceKm: Number.isFinite(Number(safe.distanceKm)) ? Math.max(0, Number(safe.distanceKm)) : distanceKmFromCoords,
    delayMinutes: Math.max(0, safeNumber(safe.delayMinutes, 0))
  };
}

function mergeLookupRecords(records) {
  const merged = [...CORE_VERIFIED_LOOKUP_RECORDS, ...(Array.isArray(records) ? records : [])];
  const byKey = new Map();

  for (const record of merged) {
    const normalized = normalizeLookupRecord(record);
    if (!normalized) continue;
    const key = `${normalized.flightCode}|${normalized.flightDate}`;
    if (!byKey.has(key)) {
      byKey.set(key, normalized);
    }
  }

  return Array.from(byKey.values());
}

function reconcileLogsWithLookupRecords() {
  if (!Array.isArray(state.logs) || state.logs.length === 0 || !Array.isArray(state.lookupRecords) || state.lookupRecords.length === 0) {
    return 0;
  }

  const recordsByKey = new Map();
  for (const record of state.lookupRecords) {
    const normalized = normalizeLookupRecord(record);
    if (!normalized) continue;
    const key = `${normalized.flightCode}|${normalized.flightDate}`;
    const list = recordsByKey.get(key) || [];
    list.push(normalized);
    recordsByKey.set(key, list);
  }

  let updates = 0;
  for (const log of state.logs) {
    const key = `${log.flightCode}|${log.flightDate}`;
    const candidates = recordsByKey.get(key);
    if (!candidates || candidates.length === 0) {
      continue;
    }

    let match = candidates.find(
      (candidate) => airportKey(candidate.origin) === airportKey(log.origin) && airportKey(candidate.destination) === airportKey(log.destination)
    );
    if (!match) {
      match = candidates[0];
    }
    if (!match) {
      continue;
    }

    const nextDelay = Math.max(0, safeNumber(match.delayMinutes, 0));
    const currentDelay = Math.max(0, safeNumber(log.delayMinutes, 0));
    if (Math.abs(nextDelay - currentDelay) >= 1) {
      log.delayMinutes = nextDelay;
      updates += 1;
    }

    const nextAircraft = String(match.aircraft || "").trim();
    const currentAircraft = String(log.aircraft || "").trim();
    if (nextAircraft && (currentAircraft === "" || currentAircraft === "Unknown aircraft")) {
      log.aircraft = nextAircraft;
    }
  }

  return updates;
}

async function fetchLiveLookupRecord(flightCode, requestedDate) {
  const normalizedCode = normalizeFlightCode(flightCode);
  const normalizedDate = normalizeDate(requestedDate);
  if (!normalizedCode || !normalizedDate) {
    return null;
  }

  try {
    const params = new URLSearchParams({
      flightCode: normalizedCode,
      flightDate: normalizedDate
    });
    const response = await fetch(`${LIVE_LOOKUP_API_URL}?${params.toString()}`, { cache: "no-store" });

    if (response.status === 404 || response.status === 400) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Live lookup failed (${response.status})`);
    }

    const payload = await response.json();
    const record = normalizeLookupRecord(payload?.record);
    if (!record) {
      return null;
    }

    return {
      record,
      source: String(payload?.source || "live")
    };
  } catch (error) {
    console.error("Live flight lookup failed:", error);
    return null;
  }
}

function normalizeLog(log) {
  const safe = log && typeof log === "object" ? log : {};
  const origin = normalizeAirport(safe.origin);
  const destination = normalizeAirport(safe.destination);
  const flightCode = normalizeFlightCode(safe.flightCode);
  const flightDate = normalizeDate(safe.flightDate);

  if (!flightCode || !flightDate || !origin.name || !destination.name) {
    return null;
  }

  const distanceKmFromCoords = calculateDistanceBetweenAirports(origin, destination);

  return {
    id: typeof safe.id === "string" && safe.id ? safe.id : createId(),
    flightCode,
    flightDate,
    origin,
    destination,
    aircraft: toCommonAircraftName(String(safe.aircraft || "Unknown aircraft").trim() || "Unknown aircraft"),
    distanceKm: Number.isFinite(Number(safe.distanceKm)) ? Math.max(0, Number(safe.distanceKm)) : distanceKmFromCoords,
    delayMinutes: Math.max(0, safeNumber(safe.delayMinutes, 0)),
    createdAt: Number.isFinite(Number(safe.createdAt)) ? Number(safe.createdAt) : Date.now()
  };
}

function emptyStore() {
  return {
    version: 1,
    selectedYear: "all",
    playbackYear: "all",
    logs: []
  };
}

function normalizeStore(store) {
  const safe = store && typeof store === "object" ? store : emptyStore();
  const logs = Array.isArray(safe.logs) ? safe.logs : [];

  return {
    version: 1,
    selectedYear: typeof safe.selectedYear === "string" ? safe.selectedYear : "all",
    playbackYear: typeof safe.playbackYear === "string" ? safe.playbackYear : "all",
    logs: logs.map((log) => normalizeLog(log)).filter(Boolean)
  };
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return emptyStore();
    }

    const parsed = JSON.parse(raw);
    return normalizeStore(parsed);
  } catch (_error) {
    return emptyStore();
  }
}

function saveStore() {
  try {
    const payload = {
      version: 1,
      selectedYear: state.selectedYear,
      playbackYear: state.playbackYear,
      logs: state.logs
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (_error) {
    // no-op
  }
}

function normalizeDateKeyFromTimestamp(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return todayLocalDate();
  }
  const date = new Date(parsed);
  if (!Number.isFinite(date.getTime())) {
    return todayLocalDate();
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isSafeImageDataUrl(value) {
  return /^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(String(value || "").trim());
}

function normalizeDestinationPhoto(photo) {
  const safe = photo && typeof photo === "object" ? photo : {};
  const airport = String(safe.airportKey || "").trim();
  const dataUrl = String(safe.dataUrl || "").trim();

  if (!airport || !isSafeImageDataUrl(dataUrl)) {
    return null;
  }

  return {
    id: typeof safe.id === "string" && safe.id ? safe.id : createId(),
    airportKey: airport,
    caption: String(safe.caption || "").trim().slice(0, 160),
    fileName: String(safe.fileName || "photo.jpg").trim().slice(0, 140),
    takenOn: normalizeDate(safe.takenOn) || normalizeDateKeyFromTimestamp(safe.createdAt),
    createdAt: Number.isFinite(Number(safe.createdAt)) ? Number(safe.createdAt) : Date.now(),
    dataUrl
  };
}

function sortDestinationPhotos(photos) {
  return photos.sort((a, b) => {
    if (a.takenOn !== b.takenOn) {
      return b.takenOn.localeCompare(a.takenOn);
    }
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

function normalizeDestinationPhotoStore(store) {
  const safe = store && typeof store === "object" ? store : {};
  const source = safe.photosByAirport && typeof safe.photosByAirport === "object" ? safe.photosByAirport : {};
  const photosByAirport = new Map();

  for (const [key, items] of Object.entries(source)) {
    const airport = String(key || "").trim();
    if (!airport || !Array.isArray(items)) continue;

    const photos = sortDestinationPhotos(
      items
        .map((item) => normalizeDestinationPhoto({ ...(item && typeof item === "object" ? item : {}), airportKey: airport }))
        .filter(Boolean)
        .slice(0, DESTINATION_PHOTO_LIMIT_PER_AIRPORT)
    );

    if (photos.length > 0) {
      photosByAirport.set(airport, photos);
    }
  }

  return photosByAirport;
}

function loadDestinationPhotoStore() {
  try {
    const raw = localStorage.getItem(DESTINATION_PHOTO_STORAGE_KEY);
    if (!raw) {
      return new Map();
    }
    const parsed = JSON.parse(raw);
    return normalizeDestinationPhotoStore(parsed);
  } catch (_error) {
    return new Map();
  }
}

function saveDestinationPhotoStore() {
  try {
    const photosByAirport = {};
    for (const [airport, photos] of state.destinationPhotosByAirport.entries()) {
      const airportKeyValue = String(airport || "").trim();
      const safePhotos = Array.isArray(photos) ? photos.map((photo) => normalizeDestinationPhoto(photo)).filter(Boolean) : [];
      if (!airportKeyValue || safePhotos.length === 0) continue;
      photosByAirport[airportKeyValue] = sortDestinationPhotos(safePhotos).slice(0, DESTINATION_PHOTO_LIMIT_PER_AIRPORT);
    }

    localStorage.setItem(
      DESTINATION_PHOTO_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        photosByAirport
      })
    );
    return true;
  } catch (_error) {
    return false;
  }
}

function getDestinationPhotos(airportKeyValue) {
  const key = String(airportKeyValue || "").trim();
  if (!key) {
    return [];
  }
  const photos = state.destinationPhotosByAirport.get(key);
  return Array.isArray(photos) ? photos.slice() : [];
}

function setDestinationPhotos(airportKeyValue, photos) {
  const key = String(airportKeyValue || "").trim();
  if (!key) return;
  const normalized = Array.isArray(photos) ? photos.map((photo) => normalizeDestinationPhoto(photo)).filter(Boolean) : [];
  const filtered = sortDestinationPhotos(normalized).slice(0, DESTINATION_PHOTO_LIMIT_PER_AIRPORT);
  if (filtered.length === 0) {
    state.destinationPhotosByAirport.delete(key);
    return;
  }
  state.destinationPhotosByAirport.set(key, filtered);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image data."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(blob);
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function loadImageFromObjectUrl(objectUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode image file."));
    image.src = objectUrl;
  });
}

function isHeicContentType(value) {
  const type = String(value || "").trim().toLowerCase();
  return type === "image/heic" || type === "image/heif" || type === "image/heic-sequence" || type === "image/heif-sequence";
}

function isHeicFile(file) {
  if (!(file instanceof File)) {
    return false;
  }

  const lowerName = String(file.name || "").toLowerCase();
  const byName = lowerName.endsWith(".heic") || lowerName.endsWith(".heif");
  const byType = isHeicContentType(file.type);
  return byName || byType;
}

async function normalizeImageThroughPublicApi(file, fallbackContentType) {
  const imageBase64 = await blobToDataUrl(file);
  const contentType = String(fallbackContentType || file.type || "").trim().toLowerCase() || "application/octet-stream";

  let response;
  try {
    response = await fetch(PUBLIC_IMAGE_NORMALIZE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contentType,
        imageBase64
      })
    });
  } catch (_error) {
    throw new Error("Could not reach the image converter. Check that the app server is running.");
  }

  const bodyText = await response.text().catch(() => "");
  let payload = null;
  try {
    payload = bodyText ? JSON.parse(bodyText) : null;
  } catch (_error) {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload && typeof payload.error === "string" && payload.error.trim()
        ? payload.error
        : response.status === 413
          ? "HEIC photo is too large to convert. Try a smaller file."
          : `Image conversion failed (${response.status}).`;
    throw new Error(message);
  }

  const normalizedContentType = String(payload?.contentType || "").trim().toLowerCase();
  const normalizedBase64 = String(payload?.imageBase64 || "").trim();
  if (!/^image\/(jpeg|png|webp)$/.test(normalizedContentType) || !normalizedBase64) {
    throw new Error("Image converter returned an invalid image.");
  }

  const dataUrl = `data:${normalizedContentType};base64,${normalizedBase64}`;
  const normalizedBlobResponse = await fetch(dataUrl);
  if (!normalizedBlobResponse.ok) {
    throw new Error("Converted image is not readable.");
  }

  return await normalizedBlobResponse.blob();
}

async function normalizeDestinationPhotoFile(file) {
  if (!(file instanceof File)) {
    throw new Error("Invalid file.");
  }

  const heic = isHeicFile(file);
  const hasImageMime = String(file.type || "").startsWith("image/");

  if (!hasImageMime && !heic) {
    throw new Error(`${file.name || "File"} is not an image.`);
  }

  if (Number(file.size) > DESTINATION_PHOTO_MAX_SOURCE_BYTES) {
    throw new Error(`${file.name || "File"} is too large (max 20 MB before compression).`);
  }

  if (heic && Number(file.size) > DESTINATION_PHOTO_MAX_HEIC_SOURCE_BYTES) {
    throw new Error(`${file.name || "File"} is too large for HEIC conversion (max 7 MB).`);
  }

  let sourceBlob = file;
  if (heic) {
    sourceBlob = await normalizeImageThroughPublicApi(file, "image/heic");
  }

  const objectUrl = URL.createObjectURL(sourceBlob);
  try {
    const image = await loadImageFromObjectUrl(objectUrl).catch(() => {
      throw new Error("Cannot decode this photo. Try exporting it as JPEG/PNG.");
    });
    const sourceWidth = Math.max(1, Number(image.naturalWidth) || Number(image.width) || 1);
    const sourceHeight = Math.max(1, Number(image.naturalHeight) || Number(image.height) || 1);
    const scale = Math.min(1, DESTINATION_PHOTO_MAX_DIMENSION / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas is unavailable.");
    }

    context.drawImage(image, 0, 0, width, height);

    let encodedBlob = null;
    for (const quality of DESTINATION_PHOTO_JPEG_QUALITIES) {
      const blob = await canvasToBlob(canvas, "image/jpeg", quality);
      if (!blob) continue;
      encodedBlob = blob;
      if (blob.size <= DESTINATION_PHOTO_TARGET_BYTES) {
        break;
      }
    }

    if (!encodedBlob) {
      throw new Error("Could not encode image.");
    }

    const dataUrl = await blobToDataUrl(encodedBlob);
    const fileName = String(file.name || "photo")
      .trim()
      .replace(/\.[a-z0-9]+$/i, "")
      .slice(0, 140);

    return {
      dataUrl,
      fileName: fileName ? `${fileName}.jpg` : "photo.jpg",
      takenOn: normalizeDateKeyFromTimestamp(file.lastModified)
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function getLookupCandidatesByCode(flightCode) {
  return state.lookupRecords.filter((record) => record.flightCode === flightCode);
}

function dateToUtcTime(dateString) {
  const parsed = Date.parse(`${dateString}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function findBestLookupRecord(flightCode, requestedDate) {
  const normalizedDate = normalizeDate(requestedDate);
  const candidates = getLookupCandidatesByCode(flightCode);
  if (candidates.length === 0) {
    return null;
  }

  const requestedTime = normalizedDate ? dateToUtcTime(normalizedDate) : null;
  if (requestedTime === null) {
    const sorted = candidates.slice().sort((a, b) => b.flightDate.localeCompare(a.flightDate));
    return { record: sorted[0], exactDate: true, source: "catalog" };
  }

  let exact = candidates.find((record) => record.flightDate === normalizedDate) || null;
  if (exact) {
    return { record: exact, exactDate: true, source: "catalog" };
  }

  let best = candidates[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const candidateTime = dateToUtcTime(candidate.flightDate);
    if (candidateTime === null) continue;
    const distance = Math.abs(candidateTime - requestedTime);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return { record: best, exactDate: false, source: "catalog" };
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const r = 6371;
  const dLat = degToRad(lat2 - lat1);
  const dLon = degToRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(degToRad(lat1)) * Math.cos(degToRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return r * c;
}

function calculateDistanceBetweenAirports(origin, destination) {
  const oLat = Number(origin?.lat);
  const oLon = Number(origin?.lon);
  const dLat = Number(destination?.lat);
  const dLon = Number(destination?.lon);

  if (![oLat, oLon, dLat, dLon].every((value) => Number.isFinite(value))) {
    return 0;
  }

  return haversineKm(oLat, oLon, dLat, dLon);
}

function buildLogFromLookup(lookupResult) {
  if (!lookupResult?.record) {
    return null;
  }

  const requestedDate = normalizeDate(lookupResult.requestedDate);
  const source = lookupResult.record;

  const distanceKm = Number.isFinite(Number(source.distanceKm))
    ? Math.max(0, Number(source.distanceKm))
    : calculateDistanceBetweenAirports(source.origin, source.destination);

  return normalizeLog({
    id: createId(),
    flightCode: source.flightCode,
    flightDate: requestedDate || source.flightDate,
    origin: source.origin,
    destination: source.destination,
    aircraft: source.aircraft,
    distanceKm,
    delayMinutes: source.delayMinutes,
    createdAt: Date.now()
  });
}

function describeDelay(delayMinutes) {
  const minutes = Math.max(0, safeNumber(delayMinutes, 0));
  if (minutes >= 15) {
    return { label: "Delayed", badgeClass: "badge warn" };
  }
  return { label: "On time", badgeClass: "badge good" };
}

function lookupSourceLabel(source) {
  const value = String(source || "");
  return value === "flightaware"
    ? "live API (FlightAware AeroAPI)"
    : value === "flightaware-schedules"
      ? "live API (FlightAware schedules)"
      : value === "flightaware-schedules-current"
        ? "live API (FlightAware current schedule fallback)"
      : value === "cirium"
        ? "live API (Cirium FlightStats)"
        : value === "aviationstack"
          ? "live API (aviationstack)"
          : value === "adsbdb+flightaware-enriched"
            ? "live API route + FlightAware enrichment"
            : value === "adsbdb+flightaware-aircraft"
              ? "live API route + AeroAPI aircraft"
              : value === "adsbdb+catalog"
                ? "live API route + verified delay"
                : value === "adsbdb"
                  ? "live API (adsbdb route only)"
                  : "catalog";
}

async function performLookup() {
  const requestSeq = state.lookupRequestSeq + 1;
  state.lookupRequestSeq = requestSeq;

  const flightCode = normalizeFlightCode(elements.flightCodeInput?.value || "");
  const requestedDate = normalizeDate(elements.flightLookupDateInput?.value || "") || todayLocalDate();

  if (!flightCode) {
    state.lookupResult = null;
    renderLookupResult();
    setLookupStatus("Enter a flight code first (example: AC519).", "warn");
    return;
  }

  if (requestedDate < LOOKUP_MIN_DATE) {
    state.lookupResult = null;
    renderLookupResult();
    setLookupStatus(`Date must be ${LOOKUP_MIN_DATE} or later.`, "warn");
    return;
  }

  if (elements.flightLookupButton) {
    elements.flightLookupButton.disabled = true;
  }
  setLookupStatus(`Looking up ${flightCode} for ${requestedDate}...`);

  const liveLookup = await fetchLiveLookupRecord(flightCode, requestedDate);
  if (requestSeq !== state.lookupRequestSeq) {
    if (elements.flightLookupButton) {
      elements.flightLookupButton.disabled = false;
    }
    return;
  }

  if (!liveLookup && state.lookupRecords.length === 0) {
    await loadLookupCatalog();
  }

  const catalogBest = findBestLookupRecord(flightCode, requestedDate);
  let best = catalogBest;

  if (liveLookup && liveLookup.record) {
    const liveSource = String(liveLookup.source || "live");
    best = { record: liveLookup.record, exactDate: true, source: liveSource };

    if (liveSource.startsWith("adsbdb") && catalogBest?.exactDate) {
      const catalogAircraft = String(catalogBest.record.aircraft || "").trim();
      const mergedRecord = normalizeLookupRecord({
        ...liveLookup.record,
        aircraft: catalogAircraft && catalogAircraft !== "Unknown aircraft" ? catalogAircraft : liveLookup.record.aircraft,
        delayMinutes:
          Number(catalogBest.record.delayMinutes) > 0 ? catalogBest.record.delayMinutes : liveLookup.record.delayMinutes
      });

      if (mergedRecord) {
        best = { record: mergedRecord, exactDate: true, source: "adsbdb+catalog" };
      }
    }
  }

  if (elements.flightLookupButton) {
    elements.flightLookupButton.disabled = false;
  }

  if (!best) {
    state.lookupResult = null;
    renderLookupResult();
    setLookupStatus(`No verified record found for ${flightCode} on ${requestedDate}.`, "warn");
    return;
  }

  state.lookupResult = {
    record: best.record,
    exactDate: best.exactDate,
    requestedDate,
    source: String(best.source || "")
  };

  const destination = best.record.destination;
  const key = airportKey(destination);
  if (key) {
    state.selectedAirportKey = key;
  }

  const delay = describeDelay(best.record.delayMinutes);
  const dateMessage = best.exactDate ? best.record.flightDate : `${best.record.flightDate} (closest known)`;
  setLookupStatus(`${flightCode} found for ${dateMessage}. Status: ${delay.label}. Source: ${lookupSourceLabel(best.source)}.`);

  renderDataUI();

  if (Number.isFinite(Number(destination?.lat)) && Number.isFinite(Number(destination?.lon))) {
    centerGlobeOnLatLon(Number(destination.lat), Number(destination.lon));
  }
}

async function logLookupFlight() {
  const flightCode = normalizeFlightCode(state.lookupResult?.record?.flightCode || elements.flightCodeInput?.value || "");
  const requestedDate =
    normalizeDate(state.lookupResult?.requestedDate || state.lookupResult?.record?.flightDate || elements.flightLookupDateInput?.value || "") ||
    todayLocalDate();

  if (!flightCode) {
    setLookupStatus("Enter a flight code first (example: AC519).", "warn");
    return;
  }

  if (requestedDate < LOOKUP_MIN_DATE) {
    setLookupStatus(`Date must be ${LOOKUP_MIN_DATE} or later.`, "warn");
    return;
  }

  if (elements.logLookupFlightButton) {
    elements.logLookupFlightButton.disabled = true;
  }

  setLookupStatus(`Refreshing ${flightCode} for ${requestedDate} from live API...`);

  try {
    const liveLookup = await fetchLiveLookupRecord(flightCode, requestedDate);
    if (!liveLookup?.record) {
      setLookupStatus(`No verified record found for ${flightCode} on ${requestedDate}.`, "warn");
      return;
    }

    const source = String(liveLookup.source || "live");
    state.lookupResult = {
      record: liveLookup.record,
      exactDate: true,
      requestedDate,
      source
    };

    const destination = liveLookup.record.destination;
    const key = airportKey(destination);
    if (key) {
      state.selectedAirportKey = key;
    }

    const log = buildLogFromLookup(state.lookupResult);
    if (!log) {
      renderDataUI();
      setLookupStatus(`Live lookup succeeded, but ${flightCode} could not be logged.`, "warn");
      return;
    }

    const duplicate = state.logs.some(
      (entry) =>
        entry.flightCode === log.flightCode &&
        entry.flightDate === log.flightDate &&
        airportKey(entry.origin) === airportKey(log.origin) &&
        airportKey(entry.destination) === airportKey(log.destination)
    );

    if (duplicate) {
      renderDataUI();
      setLookupStatus("That flight is already in your logbook.", "warn");
      return;
    }

    if (state.tripPlayback.active) {
      stopTripPlayback("Trip playback stopped because your logbook changed.");
    }

    state.logs.push(log);
    state.logs.sort((a, b) => {
      if (a.flightDate !== b.flightDate) {
        return b.flightDate.localeCompare(a.flightDate);
      }
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

    saveStore();
    renderDataUI();

    const delay = describeDelay(log.delayMinutes);
    setLookupStatus(
      `${log.flightCode} on ${log.flightDate} logged. Status: ${delay.label}. Source: ${lookupSourceLabel(source)}.`
    );
    setAnalyticsStatus("Flight logged. Stats, markers, and route lines updated.");

    if (Number.isFinite(Number(destination?.lat)) && Number.isFinite(Number(destination?.lon))) {
      centerGlobeOnLatLon(Number(destination.lat), Number(destination.lon));
    }
  } catch (error) {
    console.error("Failed to log flight from live lookup:", error);
    setLookupStatus(`Could not verify ${flightCode} on ${requestedDate}. Try again.`, "warn");
  } finally {
    if (elements.logLookupFlightButton) {
      elements.logLookupFlightButton.disabled = false;
    }
  }
}

function renderLookupResult() {
  const result = state.lookupResult;
  const hasResult = Boolean(result?.record);

  if (!elements.flightLookupResult) return;
  elements.flightLookupResult.classList.toggle("hidden", !hasResult);

  if (!hasResult) {
    return;
  }

  const record = result.record;
  const shownDate = result.exactDate ? record.flightDate : `${record.flightDate} (closest known)`;
  const delayInfo = describeDelay(record.delayMinutes);

  if (elements.flightLookupResultTitle) {
    elements.flightLookupResultTitle.textContent = `${record.flightCode} • ${shownDate}`;
  }

  if (elements.flightLookupResultMeta) {
    elements.flightLookupResultMeta.textContent = `${record.origin.iata || "—"} → ${record.destination.iata || "—"} • ${delayInfo.label}`;
  }

  if (elements.lookupOriginValue) {
    elements.lookupOriginValue.textContent = `${record.origin.iata || "—"} (${record.origin.city || record.origin.name || "Unknown"})`;
  }

  if (elements.lookupDestinationValue) {
    elements.lookupDestinationValue.textContent = `${record.destination.iata || "—"} (${record.destination.city || record.destination.name || "Unknown"})`;
  }

  if (elements.lookupAircraftValue) {
    elements.lookupAircraftValue.textContent = record.aircraft || "Unknown";
  }

  if (elements.lookupDelayValue) {
    const distanceText = formatKm(record.distanceKm);
    elements.lookupDelayValue.textContent = `${formatDelayMinutes(record.delayMinutes)} • ${distanceText}`;
  }
}

function renderHistoryTable() {
  if (!elements.flightHistoryBody) return;
  elements.flightHistoryBody.replaceChildren();

  const rows = state.logs.slice().sort((a, b) => {
    if (a.flightDate !== b.flightDate) {
      return b.flightDate.localeCompare(a.flightDate);
    }
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  for (const log of rows) {
    const row = document.createElement("tr");
    const delayInfo = describeDelay(log.delayMinutes);
    const date = escapeHtml(log.flightDate);
    const code = escapeHtml(log.flightCode);
    const route = `${escapeHtml(log.origin.iata || "—")} → ${escapeHtml(log.destination.iata || "—")}`;
    const aircraft = escapeHtml(log.aircraft || "Unknown");
    const distance = escapeHtml(formatKm(log.distanceKm));
    const delay = escapeHtml(formatDelayMinutes(log.delayMinutes));
    const statusLabel = escapeHtml(delayInfo.label);

    row.innerHTML = `
      <td>${date}</td>
      <td><strong>${code}</strong></td>
      <td>${route}</td>
      <td>${aircraft}</td>
      <td>${distance}</td>
      <td>${delay}</td>
      <td><span class="${delayInfo.badgeClass}">${statusLabel}</span></td>
      <td><button type="button" class="danger compact" data-flight-log-id="${log.id}">Delete</button></td>
    `;

    elements.flightHistoryBody.append(row);
  }

  if (elements.flightHistoryEmpty) {
    elements.flightHistoryEmpty.classList.toggle("hidden", rows.length > 0);
  }
}

function computeStats(logs) {
  const safeLogs = Array.isArray(logs) ? logs : [];

  const flights = safeLogs.length;
  let km = 0;
  let delayMinutes = 0;
  const aircraftFamilyStats = new Map();

  for (const log of safeLogs) {
    const distanceKm = Math.max(0, safeNumber(log.distanceKm, 0));
    km += distanceKm;
    delayMinutes += Math.max(0, safeNumber(log.delayMinutes, 0));

    const aircraftVariant = String(log.aircraft || "").trim() || "Unknown aircraft";
    const aircraftFamily = toAircraftFamilyName(aircraftVariant);
    const familyKey = normalize(aircraftFamily);
    const variantKey = normalize(aircraftVariant);

    const existingFamily =
      aircraftFamilyStats.get(familyKey) ||
      { name: aircraftFamily, count: 0, km: 0, hours: 0, variantsByKey: new Map() };
    existingFamily.count += 1;
    existingFamily.km += distanceKm;
    existingFamily.hours += distanceKm / ESTIMATED_AIRCRAFT_CRUISE_KMH;

    const existingVariant =
      existingFamily.variantsByKey.get(variantKey) ||
      { name: aircraftVariant, count: 0, km: 0, hours: 0 };
    existingVariant.count += 1;
    existingVariant.km += distanceKm;
    existingVariant.hours += distanceKm / ESTIMATED_AIRCRAFT_CRUISE_KMH;
    existingFamily.variantsByKey.set(variantKey, existingVariant);
    aircraftFamilyStats.set(familyKey, existingFamily);
  }

  const aircraftBreakdown = Array.from(aircraftFamilyStats.values())
    .map((family) => {
      const variants = Array.from(family.variantsByKey.values()).sort((a, b) => {
        if (a.count !== b.count) return b.count - a.count;
        if (Math.abs(a.km - b.km) > 0.00001) return b.km - a.km;
        return a.name.localeCompare(b.name);
      });
      return {
        name: family.name,
        count: family.count,
        km: family.km,
        hours: family.hours,
        variants
      };
    })
    .sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;
      if (Math.abs(a.km - b.km) > 0.00001) return b.km - a.km;
      return a.name.localeCompare(b.name);
    });

  const topAircraft = aircraftBreakdown[0] || { name: "", count: 0, km: 0, hours: 0, variants: [] };

  return {
    flights,
    km,
    delayHours: delayMinutes / 60,
    topAircraft,
    aircraftBreakdown
  };
}

function renderTopAircraftMetric(target, stats, scope) {
  if (!target) return;

  target.replaceChildren();
  const aircraftBreakdown = Array.isArray(stats?.aircraftBreakdown) ? stats.aircraftBreakdown : [];
  if (aircraftBreakdown.length === 0) {
    target.textContent = "—";
    return;
  }

  const topList = document.createElement("div");
  topList.className = "aircraft-top-list";
  const topThree = aircraftBreakdown.slice(0, 3);

  topThree.forEach((entry, index) => {
    const row = document.createElement("div");
    row.className = "aircraft-top-entry";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "aircraft-top-item";
    button.setAttribute("data-aircraft-gallery-scope", scope);
    button.setAttribute("data-aircraft-name", entry.name);
    button.setAttribute("aria-label", `View ${entry.name} family details`);

    const rank = document.createElement("span");
    rank.className = "aircraft-top-rank";
    rank.textContent = String(index + 1);

    const details = document.createElement("span");
    details.className = "aircraft-top-details";

    const name = document.createElement("span");
    name.className = "aircraft-top-name";
    name.textContent = entry.name;

    const meta = document.createElement("span");
    meta.className = "aircraft-top-meta";
    meta.textContent = formatAircraftUsageMeta(entry);

    details.append(name, meta);
    button.append(rank, details);
    row.append(button);

    topList.append(row);
  });

  const seeMoreButton = document.createElement("button");
  seeMoreButton.type = "button";
  seeMoreButton.className = "aircraft-see-more compact";
  seeMoreButton.setAttribute("data-aircraft-gallery-scope", scope);
  seeMoreButton.textContent = `See more (${aircraftBreakdown.length})`;

  target.append(topList, seeMoreButton);
}

function normalizeWikipediaPageTitle(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "_");
}

function collectAircraftWikipediaPageCandidates(aircraftName) {
  const pages = [];
  const normalizedName = normalize(aircraftName);
  const strippedName = String(aircraftName || "")
    .replace(/\s*\([^)]*\)/g, "")
    .trim();

  const pushPage = (page) => {
    const normalizedPage = normalizeWikipediaPageTitle(page);
    if (normalizedPage && !pages.includes(normalizedPage)) {
      pages.push(normalizedPage);
    }
  };

  for (const hint of AIRCRAFT_IMAGE_PAGE_HINTS) {
    if (hint.pattern.test(normalizedName)) {
      pushPage(hint.page);
    }
  }

  if (strippedName && !/unknown aircraft/i.test(strippedName)) {
    pushPage(strippedName);
  }

  if (normalizedName.includes("airbus")) pushPage("Airbus");
  if (normalizedName.includes("boeing")) pushPage("Boeing_Commercial_Airplanes");
  if (normalizedName.includes("embraer")) pushPage("Embraer_E-Jet_family");
  if (normalizedName.includes("bombardier") || normalizedName.includes("crj")) pushPage("Bombardier_CRJ");
  if (normalizedName.includes("de havilland") || normalizedName.includes("dash 8")) pushPage("De_Havilland_Canada_Dash_8");
  pushPage("Airliner");

  return pages;
}

async function fetchWikipediaPageImage(pageTitle) {
  const normalizedPage = normalizeWikipediaPageTitle(pageTitle);
  if (!normalizedPage) {
    return "";
  }

  if (state.aircraftPhotoCacheByPage.has(normalizedPage)) {
    return state.aircraftPhotoCacheByPage.get(normalizedPage) || "";
  }

  try {
    const response = await fetch(`${WIKIPEDIA_SUMMARY_API_BASE_URL}${encodeURIComponent(normalizedPage)}`, {
      cache: "force-cache",
      headers: {
        accept: "application/json"
      }
    });

    if (!response.ok) {
      state.aircraftPhotoCacheByPage.set(normalizedPage, "");
      return "";
    }

    const payload = await response.json();
    const source =
      typeof payload?.originalimage?.source === "string"
        ? payload.originalimage.source
        : typeof payload?.thumbnail?.source === "string"
          ? payload.thumbnail.source
          : "";
    const imageUrl = /^https?:\/\//i.test(source) ? source : "";
    state.aircraftPhotoCacheByPage.set(normalizedPage, imageUrl);
    return imageUrl;
  } catch (_error) {
    state.aircraftPhotoCacheByPage.set(normalizedPage, "");
    return "";
  }
}

async function lookupAircraftPhotoUrl(aircraftName) {
  const cacheKey = normalize(aircraftName) || "unknown-aircraft";
  if (state.aircraftPhotoCacheByName.has(cacheKey)) {
    return state.aircraftPhotoCacheByName.get(cacheKey) || "";
  }

  const pageCandidates = collectAircraftWikipediaPageCandidates(aircraftName);
  for (const pageTitle of pageCandidates) {
    const imageUrl = await fetchWikipediaPageImage(pageTitle);
    if (imageUrl) {
      state.aircraftPhotoCacheByName.set(cacheKey, imageUrl);
      return imageUrl;
    }
  }

  state.aircraftPhotoCacheByName.set(cacheKey, "");
  return "";
}

function isAircraftGalleryOpen() {
  return Boolean(elements.aircraftGalleryModal && !elements.aircraftGalleryModal.classList.contains("hidden"));
}

function renderAircraftGallery(scope, highlightedName = "") {
  if (!elements.aircraftGalleryList) return;

  const resolvedScope = scope === "year" ? "year" : "all";
  const scopedLogs = logsForAircraftScope(resolvedScope);
  const stats = computeStats(scopedLogs);
  const aircraftBreakdown = Array.isArray(stats.aircraftBreakdown) ? stats.aircraftBreakdown : [];
  const normalizedHighlightedName = normalize(highlightedName);

  if (elements.aircraftGalleryTitle) {
    if (resolvedScope === "year" && state.selectedYear !== "all") {
      elements.aircraftGalleryTitle.textContent = `Aircraft flown in ${state.selectedYear}`;
    } else if (resolvedScope === "year") {
      elements.aircraftGalleryTitle.textContent = "Aircraft flown in all years";
    } else {
      elements.aircraftGalleryTitle.textContent = "All aircraft flown";
    }
  }

  if (elements.aircraftGalleryMeta) {
    if (aircraftBreakdown.length === 0) {
      elements.aircraftGalleryMeta.textContent = "No aircraft logged yet.";
    } else {
      const variantCount = aircraftBreakdown.reduce((sum, family) => {
        const variants = Array.isArray(family.variants) ? family.variants.length : 0;
        return sum + variants;
      }, 0);
      elements.aircraftGalleryMeta.textContent = `${aircraftBreakdown.length} aircraft families • ${variantCount} variants • ${formatFlightCount(stats.flights)} • Hours estimated from distance at ${ESTIMATED_AIRCRAFT_CRUISE_KMH} km/h.`;
    }
  }

  elements.aircraftGalleryList.replaceChildren();
  if (aircraftBreakdown.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "status";
    emptyState.textContent = "Log flights to populate aircraft history.";
    elements.aircraftGalleryList.append(emptyState);
    state.aircraftGalleryRequestId += 1;
    return;
  }

  const imageTargets = [];
  for (let index = 0; index < aircraftBreakdown.length; index += 1) {
    const stat = aircraftBreakdown[index];
    const item = document.createElement("article");
    item.className = "aircraft-gallery-item";
    if (normalizedHighlightedName && normalize(stat.name) === normalizedHighlightedName) {
      item.classList.add("active");
    }

    const imageWrap = document.createElement("div");
    imageWrap.className = "aircraft-gallery-image-wrap";

    const image = document.createElement("img");
    image.className = "aircraft-gallery-image";
    image.src = AIRCRAFT_IMAGE_FALLBACK_URL;
    image.alt = `${stat.name} aircraft photo`;
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => {
      image.src = AIRCRAFT_IMAGE_FALLBACK_URL;
    });

    imageWrap.append(image);

    const content = document.createElement("div");
    content.className = "aircraft-gallery-info";

    const name = document.createElement("h4");
    name.className = "aircraft-gallery-name";
    name.textContent = stat.name;

    const usage = document.createElement("p");
    usage.className = "aircraft-gallery-meta";
    usage.textContent = formatAircraftUsageMeta(stat);

    const rank = document.createElement("p");
    rank.className = "aircraft-gallery-rank";
    rank.textContent = `Rank #${index + 1} ${aircraftScopeLabel(resolvedScope)}`;

    content.append(name, usage, rank);
    const variantsDropdown = createAircraftVariantDropdown(stat);
    if (variantsDropdown) {
      content.append(variantsDropdown);
    }
    item.append(imageWrap, content);
    elements.aircraftGalleryList.append(item);

    imageTargets.push({ name: stat.name, image });
  }

  const requestId = state.aircraftGalleryRequestId + 1;
  state.aircraftGalleryRequestId = requestId;

  void Promise.all(
    imageTargets.map(async (target) => {
      const imageUrl = await lookupAircraftPhotoUrl(target.name);
      if (state.aircraftGalleryRequestId !== requestId || !target.image.isConnected) {
        return;
      }
      if (imageUrl) {
        target.image.src = imageUrl;
      }
    })
  );
}

function openAircraftGallery(scope, highlightedName = "") {
  if (!elements.aircraftGalleryModal) return;
  state.aircraftGalleryScope = scope === "year" ? "year" : "all";
  state.aircraftGalleryHighlightedName = String(highlightedName || "").trim();
  renderAircraftGallery(state.aircraftGalleryScope, state.aircraftGalleryHighlightedName);
  elements.aircraftGalleryModal.classList.remove("hidden");
  syncModalOpenClass();
  elements.aircraftGalleryCloseButton?.focus();
}

function closeAircraftGallery() {
  if (!elements.aircraftGalleryModal) return;
  elements.aircraftGalleryModal.classList.add("hidden");
  syncModalOpenClass();
  state.aircraftGalleryRequestId += 1;
}

function refreshAircraftGalleryIfOpen() {
  if (!isAircraftGalleryOpen()) return;
  renderAircraftGallery(state.aircraftGalleryScope, state.aircraftGalleryHighlightedName);
}

function isDestinationGalleryOpen() {
  return Boolean(elements.destinationGalleryModal && !elements.destinationGalleryModal.classList.contains("hidden"));
}

function resolveAirportByKey(key) {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) return null;

  const markerMatch = state.airportMarkers.find((marker) => marker.key === normalizedKey);
  if (markerMatch) {
    return markerMatch;
  }

  const searchLogs = [...state.logs];
  if (state.lookupResult?.record) {
    searchLogs.push({
      origin: state.lookupResult.record.origin,
      destination: state.lookupResult.record.destination
    });
  }

  for (const log of searchLogs) {
    const origin = normalizeAirport(log.origin);
    if (airportKey(origin) === normalizedKey) {
      return {
        key: normalizedKey,
        iata: origin.iata,
        name: origin.name,
        city: origin.city,
        country: origin.country,
        lat: origin.lat,
        lon: origin.lon,
        departures: 0,
        arrivals: 0
      };
    }

    const destination = normalizeAirport(log.destination);
    if (airportKey(destination) === normalizedKey) {
      return {
        key: normalizedKey,
        iata: destination.iata,
        name: destination.name,
        city: destination.city,
        country: destination.country,
        lat: destination.lat,
        lon: destination.lon,
        departures: 0,
        arrivals: 0
      };
    }
  }

  const guessedCode = /^[A-Z0-9]{2,4}$/.test(normalizedKey) ? normalizedKey : "";
  return {
    key: normalizedKey,
    iata: guessedCode,
    name: guessedCode ? `Airport ${guessedCode}` : "Saved destination",
    city: "",
    country: "",
    lat: null,
    lon: null,
    departures: 0,
    arrivals: 0
  };
}

function setDestinationGalleryBusy(busy) {
  state.destinationGalleryBusy = Boolean(busy);
  const hasAirport = Boolean(state.destinationGalleryAirportKey);
  if (elements.destinationGalleryAddButton) {
    elements.destinationGalleryAddButton.disabled = !hasAirport || state.destinationGalleryBusy;
  }
  if (elements.destinationPhotoInput) {
    elements.destinationPhotoInput.disabled = state.destinationGalleryBusy;
  }
}

function renderDestinationGallery() {
  if (!elements.destinationGalleryList) return;

  const airportKeyValue = String(state.destinationGalleryAirportKey || "").trim();
  const airport = resolveAirportByKey(airportKeyValue);
  const photos = getDestinationPhotos(airportKeyValue);

  elements.destinationGalleryList.replaceChildren();
  setDestinationGalleryBusy(state.destinationGalleryBusy);

  if (!airportKeyValue || !airport) {
    if (elements.destinationGalleryTitle) {
      elements.destinationGalleryTitle.textContent = "Airport photos";
    }
    if (elements.destinationGalleryMeta) {
      elements.destinationGalleryMeta.textContent = "Select an airport marker on the globe.";
    }

    const emptyState = document.createElement("p");
    emptyState.className = "status";
    emptyState.textContent = "Select an airport marker and add your destination photos.";
    elements.destinationGalleryList.append(emptyState);

    if (!state.destinationGalleryMessage) {
      setDestinationGalleryStatus("Select a destination to start a gallery.");
    } else {
      setDestinationGalleryStatus(state.destinationGalleryMessage, state.destinationGalleryTone);
    }
    return;
  }

  const titleCode = airport.iata || "—";
  const titleCity = airport.city || airport.name || "Unknown airport";
  if (elements.destinationGalleryTitle) {
    elements.destinationGalleryTitle.textContent = `${titleCode} • ${titleCity}`;
  }

  if (elements.destinationGalleryMeta) {
    const parts = [
      airport.name || "Unknown airport",
      airport.country || "",
      `${photos.length} photo${photos.length === 1 ? "" : "s"}`
    ].filter(Boolean);
    elements.destinationGalleryMeta.textContent = parts.join(" • ");
  }

  if (!state.destinationGalleryMessage) {
    if (photos.length === 0) {
      setDestinationGalleryStatus(`No photos yet for ${titleCode}. Add one to build this destination gallery.`);
    } else {
      setDestinationGalleryStatus(`Showing ${photos.length} photo${photos.length === 1 ? "" : "s"} for ${titleCode}.`);
    }
  } else {
    setDestinationGalleryStatus(state.destinationGalleryMessage, state.destinationGalleryTone);
  }

  if (photos.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "status";
    emptyState.textContent = "No photos yet at this destination.";
    elements.destinationGalleryList.append(emptyState);
    return;
  }

  for (const photo of photos) {
    const item = document.createElement("article");
    item.className = "destination-gallery-item";

    const imageWrap = document.createElement("div");
    imageWrap.className = "destination-gallery-image-wrap";

    const image = document.createElement("img");
    image.className = "destination-gallery-image";
    image.src = photo.dataUrl;
    image.alt = photo.caption ? `${photo.caption} at ${titleCode}` : `${titleCode} destination photo`;
    image.loading = "lazy";
    image.decoding = "async";
    imageWrap.append(image);

    const info = document.createElement("div");
    info.className = "destination-gallery-info";

    const caption = document.createElement("h4");
    caption.className = "destination-gallery-caption";
    caption.textContent = photo.caption || photo.fileName || "Untitled photo";

    const takenOn = document.createElement("p");
    takenOn.className = "destination-gallery-meta";
    takenOn.textContent = `Taken ${formatDateLabel(photo.takenOn)}`;

    const added = document.createElement("p");
    added.className = "destination-gallery-meta";
    const addedLabel = formatDateTimeLabel(photo.createdAt);
    added.textContent = addedLabel ? `Added ${addedLabel}` : "Added recently";

    const actions = document.createElement("div");
    actions.className = "destination-gallery-actions";

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "danger compact";
    deleteButton.setAttribute("data-destination-photo-id", photo.id);
    deleteButton.textContent = "Delete";

    actions.append(deleteButton);
    info.append(caption, takenOn, added, actions);
    item.append(imageWrap, info);
    elements.destinationGalleryList.append(item);
  }
}

async function importDestinationPhotos(fileList) {
  const airportKeyValue = String(state.destinationGalleryAirportKey || "").trim();
  if (!airportKeyValue) {
    setDestinationGalleryStatus("Select an airport first.", "warn");
    return;
  }

  const incoming = Array.from(fileList || []).filter((file) => file instanceof File);
  if (incoming.length === 0) {
    return;
  }

  const existing = getDestinationPhotos(airportKeyValue);
  const availableSlots = Math.max(0, DESTINATION_PHOTO_LIMIT_PER_AIRPORT - existing.length);
  if (availableSlots <= 0) {
    setDestinationGalleryStatus(`This destination already has ${DESTINATION_PHOTO_LIMIT_PER_AIRPORT} photos. Delete one to add more.`, "warn");
    if (elements.destinationPhotoInput) {
      elements.destinationPhotoInput.value = "";
    }
    return;
  }

  const requestedCount = Math.min(incoming.length, DESTINATION_PHOTO_MAX_IMPORT_COUNT, availableSlots);
  const files = incoming.slice(0, requestedCount);
  const nextPhotos = existing.slice();
  const failed = [];

  setDestinationGalleryBusy(true);
  setDestinationGalleryStatus(`Importing ${files.length} photo${files.length === 1 ? "" : "s"}...`);

  try {
    for (const file of files) {
      try {
        const prepared = await normalizeDestinationPhotoFile(file);
        const defaultCaption = String(file.name || "")
          .replace(/\.[a-z0-9]+$/i, "")
          .replace(/[_-]+/g, " ")
          .trim()
          .slice(0, 160);

        nextPhotos.push({
          id: createId(),
          airportKey: airportKeyValue,
          caption: defaultCaption,
          fileName: prepared.fileName,
          takenOn: prepared.takenOn,
          createdAt: Date.now(),
          dataUrl: prepared.dataUrl
        });
      } catch (error) {
        failed.push(error instanceof Error ? error.message : "Failed to import an image.");
      }
    }

    const previous = existing.slice();
    setDestinationPhotos(airportKeyValue, nextPhotos);
    const saved = saveDestinationPhotoStore();
    if (!saved) {
      setDestinationPhotos(airportKeyValue, previous);
      setDestinationGalleryStatus("Could not save photos. Browser storage may be full.", "error");
      renderDestinationGallery();
      return;
    }

    state.destinationGalleryMessage = "";
    state.destinationGalleryTone = "normal";
    renderDestinationGallery();
    renderAirportFocus();

    const actualAdded = getDestinationPhotos(airportKeyValue).length - existing.length;
    if (actualAdded > 0 && failed.length === 0) {
      setDestinationGalleryStatus(`Added ${actualAdded} photo${actualAdded === 1 ? "" : "s"}.`);
    } else if (actualAdded > 0) {
      setDestinationGalleryStatus(`Added ${actualAdded} photo${actualAdded === 1 ? "" : "s"}; ${failed.length} failed to import.`, "warn");
    } else if (failed.length > 0) {
      setDestinationGalleryStatus(failed[0], "error");
    } else {
      setDestinationGalleryStatus("No new photos were added.", "warn");
    }
  } finally {
    setDestinationGalleryBusy(false);
    if (elements.destinationPhotoInput) {
      elements.destinationPhotoInput.value = "";
    }
  }
}

function removeDestinationPhoto(photoId) {
  const airportKeyValue = String(state.destinationGalleryAirportKey || "").trim();
  if (!airportKeyValue || !photoId) return;

  const previous = getDestinationPhotos(airportKeyValue);
  const next = previous.filter((photo) => photo.id !== photoId);
  if (next.length === previous.length) {
    return;
  }

  setDestinationPhotos(airportKeyValue, next);
  if (!saveDestinationPhotoStore()) {
    setDestinationPhotos(airportKeyValue, previous);
    setDestinationGalleryStatus("Could not delete photo because storage update failed.", "error");
    renderDestinationGallery();
    return;
  }

  state.destinationGalleryMessage = "";
  state.destinationGalleryTone = "normal";
  renderDestinationGallery();
  renderAirportFocus();
  setDestinationGalleryStatus("Photo deleted.");
}

function openDestinationGalleryForAirportKey(key, { focusCloseButton = true } = {}) {
  const airportKeyValue = String(key || "").trim();
  if (!airportKeyValue) {
    setDestinationGalleryStatus("Select an airport marker first.", "warn");
    return;
  }

  state.destinationGalleryAirportKey = airportKeyValue;
  state.destinationGalleryMessage = "";
  state.destinationGalleryTone = "normal";
  renderDestinationGallery();

  if (!elements.destinationGalleryModal) return;
  elements.destinationGalleryModal.classList.remove("hidden");
  syncModalOpenClass();
  if (focusCloseButton) {
    elements.destinationGalleryCloseButton?.focus();
  }
}

function closeDestinationGallery() {
  if (!elements.destinationGalleryModal) return;
  elements.destinationGalleryModal.classList.add("hidden");
  syncModalOpenClass();
}

function handleTopAircraftMetricClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const button = target.closest("button[data-aircraft-gallery-scope]");
  if (!button) {
    return;
  }

  const scope = button.getAttribute("data-aircraft-gallery-scope") === "year" ? "year" : "all";
  const aircraftName = String(button.getAttribute("data-aircraft-name") || "").trim();
  openAircraftGallery(scope, aircraftName);
}

function getAvailableYears() {
  const years = new Set();
  for (const log of state.logs) {
    const year = String(log.flightDate || "").slice(0, 4);
    if (/^\d{4}$/.test(year)) {
      years.add(year);
    }
  }
  return Array.from(years).sort((a, b) => b.localeCompare(a));
}

function logsForYear(year) {
  if (year === "all") {
    return state.logs;
  }
  return state.logs.filter((log) => String(log.flightDate || "").startsWith(`${year}-`));
}

function ensureSelectedYearValid() {
  const years = getAvailableYears();
  if (state.selectedYear === "all") {
    return years;
  }

  if (!years.includes(state.selectedYear)) {
    state.selectedYear = years[0] || "all";
  }

  return years;
}

function renderYearSelect(years) {
  if (!elements.yearStatsSelect) return;

  const options = [
    { value: "all", label: "All years" },
    ...years.map((year) => ({ value: year, label: year }))
  ];

  const previous = elements.yearStatsSelect.value;
  elements.yearStatsSelect.replaceChildren();

  for (const optionData of options) {
    const option = document.createElement("option");
    option.value = optionData.value;
    option.textContent = optionData.label;
    elements.yearStatsSelect.append(option);
  }

  const fallbackValue = options.some((option) => option.value === previous) ? previous : state.selectedYear;
  elements.yearStatsSelect.value = fallbackValue;
  state.selectedYear = elements.yearStatsSelect.value;
}

function renderPlaybackYearSelect(years) {
  if (!elements.playbackYearSelect) return;

  const options = [
    { value: "all", label: "All years" },
    ...years.map((year) => ({ value: year, label: year }))
  ];

  const previous = elements.playbackYearSelect.value;
  elements.playbackYearSelect.replaceChildren();

  for (const optionData of options) {
    const option = document.createElement("option");
    option.value = optionData.value;
    option.textContent = optionData.label;
    elements.playbackYearSelect.append(option);
  }

  const fallbackValue = options.some((option) => option.value === previous) ? previous : state.playbackYear;
  elements.playbackYearSelect.value = fallbackValue;
  state.playbackYear = elements.playbackYearSelect.value;
}

function formatPlaybackScopeLabel(value) {
  return value === "all" ? "all years" : value;
}

function sortLogsChronologically(logs) {
  return logs.slice().sort((a, b) => {
    if (a.flightDate !== b.flightDate) {
      return a.flightDate.localeCompare(b.flightDate);
    }
    return (a.createdAt || 0) - (b.createdAt || 0);
  });
}

function buildPlaybackTrips(year) {
  const trips = [];
  const sortedLogs = sortLogsChronologically(logsForYear(year));

  for (const log of sortedLogs) {
    const origin = normalizeAirport(log.origin);
    const destination = normalizeAirport(log.destination);
    const originLat = Number(origin.lat);
    const originLon = Number(origin.lon);
    const destinationLat = Number(destination.lat);
    const destinationLon = Number(destination.lon);

    if (
      !Number.isFinite(originLat) ||
      !Number.isFinite(originLon) ||
      !Number.isFinite(destinationLat) ||
      !Number.isFinite(destinationLon)
    ) {
      continue;
    }

    const originKey = airportKey(origin);
    const destinationKey = airportKey(destination);
    if (!originKey || !destinationKey || originKey === destinationKey) {
      continue;
    }

    trips.push({
      id: log.id,
      flightCode: log.flightCode,
      flightDate: log.flightDate,
      origin,
      destination,
      originLat,
      originLon,
      destinationLat,
      destinationLon,
      startVector: lonLatToVector(originLon, originLat),
      endVector: lonLatToVector(destinationLon, destinationLat),
      originKey,
      destinationKey
    });
  }

  return trips;
}

function midLon(originLon, destinationLon) {
  const delta = normalizeLonDegrees(destinationLon - originLon);
  return normalizeLonDegrees(originLon + delta * 0.5);
}

function focusPlaybackTrip(trip) {
  if (!trip) return;
  const focusLat = (Number(trip.originLat) + Number(trip.destinationLat)) * 0.5;
  const focusLon = midLon(Number(trip.originLon), Number(trip.destinationLon));
  centerGlobeOnLatLon(focusLat, focusLon);
  state.selectedAirportKey = trip.destinationKey || trip.originKey || "";
}

function playbackTripDescriptor(trip) {
  if (!trip) return "Unknown trip";
  const originCode = trip.origin?.iata || "—";
  const destinationCode = trip.destination?.iata || "—";
  return `${trip.flightDate} • ${trip.flightCode} • ${originCode} → ${destinationCode}`;
}

function updatePlaybackControls() {
  const playback = state.tripPlayback;

  if (elements.playbackToggleButton) {
    elements.playbackToggleButton.textContent = playback.active ? (playback.paused ? "Resume" : "Pause") : "Play trips";
  }

  if (elements.playbackStopButton) {
    elements.playbackStopButton.disabled = !playback.active;
  }

  if (elements.playbackYearSelect) {
    elements.playbackYearSelect.disabled = playback.active && !playback.paused;
  }
}

function stopTripPlayback(message = "Trip playback stopped.", tone = "normal") {
  state.tripPlayback.active = false;
  state.tripPlayback.paused = false;
  state.tripPlayback.phase = "idle";
  state.tripPlayback.phaseStartedAt = 0;
  state.tripPlayback.phaseElapsedOnPause = 0;
  state.tripPlayback.routeProgress = 0;
  state.tripPlayback.completedTripCount = 0;
  state.tripPlayback.currentTripIndex = 0;
  state.tripPlayback.trips = [];

  setPlaybackStatus(message, tone);
  setMapStatus("Drag anywhere on the globe to spin.");
  updatePlaybackControls();
  queueSceneRender();
}

function completeTripPlayback() {
  state.tripPlayback.active = false;
  state.tripPlayback.paused = false;
  state.tripPlayback.phase = "idle";
  state.tripPlayback.phaseStartedAt = 0;
  state.tripPlayback.phaseElapsedOnPause = 0;
  state.tripPlayback.routeProgress = 0;
  state.tripPlayback.completedTripCount = 0;
  state.tripPlayback.currentTripIndex = 0;
  state.tripPlayback.trips = [];

  setPlaybackStatus("Trip playback complete.", "normal");
  setMapStatus("Trip playback complete. Drag to explore.");
  updatePlaybackControls();
  queueSceneRender();
}

function announcePlaybackTrip() {
  const playback = state.tripPlayback;
  const trip = playback.trips[playback.currentTripIndex];
  if (!trip) return;

  const total = playback.trips.length;
  const current = playback.currentTripIndex + 1;
  setPlaybackStatus(`Trip ${current}/${total}: ${playbackTripDescriptor(trip)}`);
  setMapStatus(`Animating ${trip.flightCode} • ${trip.origin.iata || "—"} → ${trip.destination.iata || "—"}`);
}

function startTripPlayback() {
  const trips = buildPlaybackTrips(state.playbackYear);
  if (trips.length === 0) {
    stopTripPlayback(`No playable trips for ${formatPlaybackScopeLabel(state.playbackYear)}.`, "warn");
    return;
  }

  const now = performance.now();
  state.tripPlayback.active = true;
  state.tripPlayback.paused = false;
  state.tripPlayback.phase = "route";
  state.tripPlayback.phaseStartedAt = now;
  state.tripPlayback.phaseElapsedOnPause = 0;
  state.tripPlayback.routeProgress = 0;
  state.tripPlayback.completedTripCount = 0;
  state.tripPlayback.currentTripIndex = 0;
  state.tripPlayback.trips = trips;

  focusPlaybackTrip(trips[0]);
  announcePlaybackTrip();
  updatePlaybackControls();
  queueSceneRender();
}

function pauseTripPlayback() {
  if (!state.tripPlayback.active || state.tripPlayback.paused) return;
  state.tripPlayback.paused = true;
  state.tripPlayback.phaseElapsedOnPause = Math.max(0, performance.now() - state.tripPlayback.phaseStartedAt);
  setPlaybackStatus("Trip playback paused.");
  setMapStatus("Trip playback paused.");
  updatePlaybackControls();
}

function resumeTripPlayback() {
  if (!state.tripPlayback.active || !state.tripPlayback.paused) return;
  state.tripPlayback.paused = false;
  state.tripPlayback.phaseStartedAt = performance.now() - state.tripPlayback.phaseElapsedOnPause;
  state.tripPlayback.phaseElapsedOnPause = 0;
  const trip = state.tripPlayback.trips[state.tripPlayback.currentTripIndex];
  if (trip) {
    setMapStatus(`Animating ${trip.flightCode} • ${trip.origin.iata || "—"} → ${trip.destination.iata || "—"}`);
  }
  setPlaybackStatus("Trip playback resumed.");
  updatePlaybackControls();
  queueSceneRender();
}

function toggleTripPlayback() {
  if (!state.tripPlayback.active) {
    startTripPlayback();
    return;
  }

  if (state.tripPlayback.paused) {
    resumeTripPlayback();
    return;
  }

  pauseTripPlayback();
}

function handlePlaybackYearSelectChange() {
  const selected = elements.playbackYearSelect?.value || "all";
  state.playbackYear = selected;
  saveStore();

  if (state.tripPlayback.active) {
    startTripPlayback();
    return;
  }

  setPlaybackStatus(`Trip playback scope set to ${formatPlaybackScopeLabel(selected)}.`);
  updatePlaybackControls();
}

function advanceTripPlayback(timestamp) {
  const playback = state.tripPlayback;
  if (!playback.active || playback.paused) {
    return false;
  }

  const currentTrip = playback.trips[playback.currentTripIndex];
  if (!currentTrip) {
    completeTripPlayback();
    return true;
  }

  const phaseDuration = playback.phase === "pause" ? TRIP_PLAYBACK_HOLD_MS : TRIP_PLAYBACK_ROUTE_MS;
  const elapsed = Math.max(0, timestamp - playback.phaseStartedAt);

  if (playback.phase === "route") {
    const nextProgress = clamp(elapsed / phaseDuration, 0, 1);
    const changed = Math.abs(nextProgress - playback.routeProgress) > 0.00001;
    playback.routeProgress = nextProgress;

    if (playback.routeProgress >= 1) {
      playback.completedTripCount = Math.max(playback.completedTripCount, playback.currentTripIndex + 1);
      playback.phase = "pause";
      playback.phaseStartedAt = timestamp;
      playback.phaseElapsedOnPause = 0;
      return true;
    }

    return changed;
  }

  if (elapsed < phaseDuration) {
    return false;
  }

  playback.currentTripIndex += 1;
  if (playback.currentTripIndex >= playback.trips.length) {
    completeTripPlayback();
    return true;
  }

  playback.phase = "route";
  playback.phaseStartedAt = timestamp;
  playback.phaseElapsedOnPause = 0;
  playback.routeProgress = 0;
  focusPlaybackTrip(playback.trips[playback.currentTripIndex]);
  announcePlaybackTrip();
  return true;
}

function renderStats() {
  const years = ensureSelectedYearValid();
  renderYearSelect(years);
  if (state.playbackYear !== "all" && !years.includes(state.playbackYear)) {
    state.playbackYear = years[0] || "all";
  }
  renderPlaybackYearSelect(years);

  const allTime = computeStats(state.logs);
  const scoped = computeStats(logsForYear(state.selectedYear));

  if (elements.allTimeFlightsValue) elements.allTimeFlightsValue.textContent = String(allTime.flights);
  if (elements.allTimeKmValue) elements.allTimeKmValue.textContent = Math.round(allTime.km).toLocaleString();
  if (elements.allTimeDelayHoursValue) elements.allTimeDelayHoursValue.textContent = allTime.delayHours.toFixed(1);
  renderTopAircraftMetric(elements.allTimeTopAircraftValue, allTime, "all");

  if (elements.yearFlightsValue) elements.yearFlightsValue.textContent = String(scoped.flights);
  if (elements.yearKmValue) elements.yearKmValue.textContent = Math.round(scoped.km).toLocaleString();
  if (elements.yearDelayHoursValue) elements.yearDelayHoursValue.textContent = scoped.delayHours.toFixed(1);
  renderTopAircraftMetric(elements.yearTopAircraftValue, scoped, "year");
  refreshAircraftGalleryIfOpen();

  if (state.logs.length === 0) {
    setAnalyticsStatus("No flights logged yet. Use lookup and add your first flight.");
    if (!state.tripPlayback.active) {
      setPlaybackStatus("Trip playback is idle.");
    }
    updatePlaybackControls();
    return;
  }

  if (state.selectedYear === "all") {
    setAnalyticsStatus("Showing all logged flights.");
  } else {
    setAnalyticsStatus(`Showing stats for ${state.selectedYear}.`);
  }

  if (!state.tripPlayback.active) {
    setPlaybackStatus(`Trip playback ready for ${formatPlaybackScopeLabel(state.playbackYear)}.`);
  }
  updatePlaybackControls();
}

function buildAirportMarkers() {
  const markersByKey = new Map();

  function upsertAirport(airport, type, preview = false) {
    const normalizedAirport = normalizeAirport(airport);
    const lat = Number(normalizedAirport.lat);
    const lon = Number(normalizedAirport.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return;
    }

    const key = airportKey(normalizedAirport);
    if (!key) return;

    let marker = markersByKey.get(key);
    if (!marker) {
      marker = {
        key,
        iata: normalizedAirport.iata,
        name: normalizedAirport.name,
        city: normalizedAirport.city,
        country: normalizedAirport.country,
        lat,
        lon,
        departures: 0,
        arrivals: 0,
        preview: false,
        totalTouches: 0
      };
      markersByKey.set(key, marker);
    }

    if (type === "departure") marker.departures += 1;
    if (type === "arrival") marker.arrivals += 1;
    if (preview) marker.preview = true;
    marker.totalTouches += 1;
  }

  for (const log of state.logs) {
    upsertAirport(log.origin, "departure");
    upsertAirport(log.destination, "arrival");
  }

  if (state.lookupResult?.record) {
    upsertAirport(state.lookupResult.record.origin, "departure", true);
    upsertAirport(state.lookupResult.record.destination, "arrival", true);
  }

  return Array.from(markersByKey.values()).sort((a, b) => b.totalTouches - a.totalTouches);
}

function buildFlightRoutes() {
  const routesByKey = new Map();

  for (const log of state.logs) {
    const origin = normalizeAirport(log.origin);
    const destination = normalizeAirport(log.destination);

    const originLat = Number(origin.lat);
    const originLon = Number(origin.lon);
    const destinationLat = Number(destination.lat);
    const destinationLon = Number(destination.lon);

    if (
      !Number.isFinite(originLat) ||
      !Number.isFinite(originLon) ||
      !Number.isFinite(destinationLat) ||
      !Number.isFinite(destinationLon)
    ) {
      continue;
    }

    const originKey = airportKey(origin);
    const destinationKey = airportKey(destination);
    if (!originKey || !destinationKey || originKey === destinationKey) {
      continue;
    }

    const routeKey = `${originKey}->${destinationKey}`;
    const existing = routesByKey.get(routeKey);
    if (existing) {
      existing.count += 1;
      continue;
    }

    routesByKey.set(routeKey, {
      key: routeKey,
      originKey,
      destinationKey,
      originLat,
      originLon,
      destinationLat,
      destinationLon,
      startVector: lonLatToVector(originLon, originLat),
      endVector: lonLatToVector(destinationLon, destinationLat),
      count: 1
    });
  }

  return Array.from(routesByKey.values()).sort((a, b) => a.count - b.count);
}

function renderAirportFocus() {
  const markers = state.airportMarkers;

  if (elements.loggedFlightCountBadge) {
    const count = state.logs.length;
    elements.loggedFlightCountBadge.textContent = `${count} flight${count === 1 ? "" : "s"} logged`;
  }

  if (elements.loggedAirportCountBadge) {
    const count = markers.length;
    elements.loggedAirportCountBadge.textContent = `${count} airport${count === 1 ? "" : "s"}`;
  }

  if (markers.length === 0) {
    if (elements.airportFocusTitle) elements.airportFocusTitle.textContent = "No logged airports yet";
    if (elements.airportFocusMeta) elements.airportFocusMeta.textContent = "Look up and log flights to populate airport markers on the globe.";
    if (elements.openDestinationGalleryButton) {
      elements.openDestinationGalleryButton.disabled = true;
      elements.openDestinationGalleryButton.textContent = "Open destination gallery";
    }
    return;
  }

  let focused = markers.find((marker) => marker.key === state.selectedAirportKey) || null;
  if (!focused) {
    focused = markers[0];
    state.selectedAirportKey = focused.key;
  }

  if (elements.airportFocusTitle) {
    const headline = `${focused.iata || "—"} • ${focused.city || focused.name || "Unknown airport"}`;
    elements.airportFocusTitle.textContent = headline;
  }

  if (elements.airportFocusMeta) {
    const lines = [
      focused.name || "Unknown airport",
      focused.country || "",
      `Departures: ${focused.departures} • Arrivals: ${focused.arrivals}`
    ].filter(Boolean);
    elements.airportFocusMeta.textContent = lines.join(" • ");
  }

  if (elements.openDestinationGalleryButton) {
    const photoCount = getDestinationPhotos(focused.key).length;
    elements.openDestinationGalleryButton.disabled = false;
    elements.openDestinationGalleryButton.textContent =
      photoCount > 0 ? `Open destination gallery (${photoCount})` : "Open destination gallery";
  }
}

function renderDataUI() {
  renderLookupResult();
  renderHistoryTable();
  renderStats();

  state.flightRoutes = buildFlightRoutes();
  state.airportMarkers = buildAirportMarkers();
  if (state.airportMarkers.length > 0 && !state.airportMarkers.some((marker) => marker.key === state.selectedAirportKey)) {
    state.selectedAirportKey = state.airportMarkers[0].key;
  }
  renderAirportFocus();
  if (isDestinationGalleryOpen()) {
    renderDestinationGallery();
  }
  queueSceneRender();
}

function isValidLonLat(point) {
  return Array.isArray(point) && point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]);
}

function simplifyLandRing(ring) {
  return ring;
}

function normalizeRing(points) {
  if (!Array.isArray(points) || points.length < 3) {
    return [];
  }

  const ring = [];
  for (const point of points) {
    if (!isValidLonLat(point)) continue;
    ring.push(lonLatToVector(point[0], point[1]));
  }

  if (ring.length < 3) {
    return [];
  }

  const first = ring[0];
  const last = ring[ring.length - 1];
  const closeDistance = Math.hypot(first.x - last.x, first.y - last.y, first.z - last.z);
  if (closeDistance < 0.00001) {
    ring.pop();
  }

  if (ring.length < 3) {
    return [];
  }

  return simplifyLandRing(ring);
}

function normalizePolygonCoordinates(coordinates) {
  if (!Array.isArray(coordinates)) {
    return [];
  }

  const rings = [];
  for (const ringCoordinates of coordinates) {
    const ring = normalizeRing(ringCoordinates);
    if (ring.length >= 3) {
      rings.push(ring);
    }
  }

  return rings;
}

function extractLandPolygonsFromGeoJSON(geojson) {
  if (!geojson || typeof geojson !== "object") {
    return [];
  }

  const features = Array.isArray(geojson.features) ? geojson.features : [];
  const polygons = [];

  for (const feature of features) {
    const geometry = feature?.geometry;
    if (!geometry || typeof geometry !== "object") continue;

    if (geometry.type === "Polygon") {
      const rings = normalizePolygonCoordinates(geometry.coordinates);
      if (rings.length > 0) {
        polygons.push(rings);
      }
      continue;
    }

    if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
      for (const polygonCoordinates of geometry.coordinates) {
        const rings = normalizePolygonCoordinates(polygonCoordinates);
        if (rings.length > 0) {
          polygons.push(rings);
        }
      }
    }
  }

  return polygons;
}

function intersectEdgeWithFrontHemisphere(start, end) {
  const denom = start.z - end.z;
  if (Math.abs(denom) < HEMISPHERE_EPSILON) {
    return { x: start.x, y: start.y, z: 0 };
  }

  const t = start.z / denom;
  const x = start.x + (end.x - start.x) * t;
  const y = start.y + (end.y - start.y) * t;
  const z = 0;
  const length = Math.hypot(x, y, z);

  if (length < HEMISPHERE_EPSILON) {
    return { x, y, z };
  }

  return { x: x / length, y: y / length, z };
}

function clipRingToVisibleHemisphere(rotatedRing) {
  if (!Array.isArray(rotatedRing) || rotatedRing.length < 3) {
    return [];
  }

  const clipped = [];
  const length = rotatedRing.length;

  for (let i = 0; i < length; i += 1) {
    const start = rotatedRing[i];
    const end = rotatedRing[(i + 1) % length];

    const startVisible = start.z >= -HEMISPHERE_EPSILON;
    const endVisible = end.z >= -HEMISPHERE_EPSILON;

    if (startVisible && endVisible) {
      clipped.push(end);
    } else if (startVisible && !endVisible) {
      clipped.push(intersectEdgeWithFrontHemisphere(start, end));
    } else if (!startVisible && endVisible) {
      clipped.push(intersectEdgeWithFrontHemisphere(start, end));
      clipped.push(end);
    }
  }

  if (clipped.length < 3) {
    return [];
  }

  const deduped = [];
  for (const point of clipped) {
    const previous = deduped[deduped.length - 1];
    if (!previous || Math.hypot(previous.x - point.x, previous.y - point.y, previous.z - point.z) > 0.00001) {
      deduped.push(point);
    }
  }

  if (deduped.length >= 3) {
    const first = deduped[0];
    const last = deduped[deduped.length - 1];
    const closeDistance = Math.hypot(first.x - last.x, first.y - last.y, first.z - last.z);
    if (closeDistance < 0.00001) {
      deduped.pop();
    }
  }

  return deduped.length >= 3 ? deduped : [];
}

async function loadCountryGeometry() {
  try {
    const response = await fetch(COUNTRY_GEOJSON_URL, { cache: "force-cache" });
    if (!response.ok) {
      throw new Error(`Failed to load country geometry (${response.status})`);
    }

    const geojson = await response.json();
    const polygons = extractLandPolygonsFromGeoJSON(geojson);

    if (polygons.length === 0) {
      throw new Error("Country geometry file loaded but had no polygons");
    }

    state.landPolygons = polygons;
    queueSceneRender();
  } catch (error) {
    console.error("Failed to load country geometry:", error);
  }
}

async function loadLookupCatalog() {
  try {
    const response = await fetch(LOOKUP_CATALOG_URL, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`Failed to load lookup catalog (${response.status})`);
    }

    const payload = await response.json();
    const records = Array.isArray(payload?.records) ? payload.records : [];

    state.lookupRecords = mergeLookupRecords(records);
    const reconciled = reconcileLogsWithLookupRecords();
    if (reconciled > 0) {
      saveStore();
      renderDataUI();
      setAnalyticsStatus(`Updated ${reconciled} logged flight${reconciled === 1 ? "" : "s"} with verified delay data.`);
    }
    setLookupStatus(`Lookup catalog ready (${state.lookupRecords.length} seeded + verified records).`);
  } catch (error) {
    console.error("Failed to load lookup catalog:", error);
    state.lookupRecords = mergeLookupRecords([]);
    const reconciled = reconcileLogsWithLookupRecords();
    if (reconciled > 0) {
      saveStore();
      renderDataUI();
      setAnalyticsStatus(`Updated ${reconciled} logged flight${reconciled === 1 ? "" : "s"} with verified delay data.`);
    }
    setLookupStatus("Lookup catalog unavailable. Using built-in verified records.", "warn");
  }
}

function lonLatToVector(lonDeg, latDeg) {
  const lon = degToRad(lonDeg);
  const lat = degToRad(latDeg);
  const cosLat = Math.cos(lat);

  return {
    x: cosLat * Math.sin(lon),
    y: Math.sin(lat),
    z: cosLat * Math.cos(lon)
  };
}

function buildGraticuleVectors() {
  const lines = [];

  for (let lon = -180; lon <= 180; lon += 30) {
    const line = [];
    for (let lat = -85; lat <= 85; lat += 2.5) {
      line.push(lonLatToVector(lon, lat));
    }
    lines.push(line);
  }

  for (let lat = -60; lat <= 60; lat += 20) {
    const line = [];
    for (let lon = -180; lon <= 180; lon += 3) {
      line.push(lonLatToVector(lon, lat));
    }
    lines.push(line);
  }

  return lines;
}

const GRATICULE_VECTORS = buildGraticuleVectors();

function rotateVector(vector, yaw, pitch) {
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);

  const x1 = vector.x * cosYaw + vector.z * sinYaw;
  const z1 = -vector.x * sinYaw + vector.z * cosYaw;

  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);

  const y2 = vector.y * cosPitch - z1 * sinPitch;
  const z2 = vector.y * sinPitch + z1 * cosPitch;

  return { x: x1, y: y2, z: z2 };
}

function projectVector(rotatedVector) {
  return {
    x: state.globeCx + rotatedVector.x * state.globeRadius,
    y: state.globeCy - rotatedVector.y * state.globeRadius,
    depth: rotatedVector.z
  };
}

function drawOcean(ctx) {
  const base = ctx.createRadialGradient(
    state.globeCx - state.globeRadius * 0.38,
    state.globeCy - state.globeRadius * 0.42,
    state.globeRadius * 0.12,
    state.globeCx,
    state.globeCy,
    state.globeRadius
  );
  base.addColorStop(0, "rgba(49, 129, 189, 0.95)");
  base.addColorStop(0.52, "rgba(22, 73, 115, 0.98)");
  base.addColorStop(1, "rgba(8, 25, 42, 1)");

  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(state.globeCx, state.globeCy, state.globeRadius, 0, Math.PI * 2);
  ctx.fill();

  const vignette = ctx.createRadialGradient(
    state.globeCx + state.globeRadius * 0.5,
    state.globeCy + state.globeRadius * 0.52,
    state.globeRadius * 0.1,
    state.globeCx,
    state.globeCy,
    state.globeRadius * 1.08
  );
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.34)");

  ctx.fillStyle = vignette;
  ctx.beginPath();
  ctx.arc(state.globeCx, state.globeCy, state.globeRadius, 0, Math.PI * 2);
  ctx.fill();
}

function drawGeoVectorLine(ctx, points, color, width, alpha = 1) {
  let drawing = false;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.globalAlpha = alpha;
  ctx.lineCap = "round";

  for (const point of points) {
    const rotated = rotateVector(point, state.yaw, state.pitch);
    if (rotated.z <= 0.005) {
      if (drawing) {
        ctx.stroke();
      }
      drawing = false;
      continue;
    }

    const projected = projectVector(rotated);

    if (!drawing) {
      ctx.beginPath();
      ctx.moveTo(projected.x, projected.y);
      drawing = true;
    } else {
      ctx.lineTo(projected.x, projected.y);
    }
  }

  if (drawing) {
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

function drawGraticule(ctx) {
  const lineColor = "rgba(236, 245, 255, 0.16)";
  const reducedQuality = state.renderQuality === "reduced";
  const stride = reducedQuality ? 2 : 1;
  const alpha = reducedQuality ? 0.42 : 0.52;
  const lineWidth = reducedQuality ? 0.9 : 1;

  for (let index = 0; index < GRATICULE_VECTORS.length; index += stride) {
    drawGeoVectorLine(ctx, GRATICULE_VECTORS[index], lineColor, lineWidth, alpha);
  }
}

function drawLandBlob(ctx, blob) {
  const center = rotateVector(lonLatToVector(blob.lon, blob.lat), state.yaw, state.pitch);
  if (center.z < -0.08) {
    return;
  }

  const projected = projectVector(center);
  const angularSize = degToRad(blob.size);
  const radius = state.globeRadius * Math.sin(angularSize) * Math.max(0.35, Math.pow(Math.max(center.z, 0), 0.35));

  const gradient = ctx.createRadialGradient(
    projected.x - radius * 0.24,
    projected.y - radius * 0.22,
    radius * 0.2,
    projected.x,
    projected.y,
    radius
  );
  gradient.addColorStop(0, "rgba(190, 236, 170, 0.92)");
  gradient.addColorStop(1, "rgba(96, 168, 106, 0.9)");

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(projected.x, projected.y, Math.max(2, radius), 0, Math.PI * 2);
  ctx.fill();
}

function drawLandFromFallbackBlobs(ctx) {
  for (const blob of LAND_BLOBS) {
    drawLandBlob(ctx, blob);
  }
}

function drawLandFromPolygons(ctx) {
  if (!Array.isArray(state.landPolygons) || state.landPolygons.length === 0) {
    return false;
  }

  const landFill = "rgb(104, 176, 114)";
  ctx.fillStyle = landFill;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const seamWidth = 1.6;
  const borderWidth = 0.85;
  const borderColor = "rgba(244, 255, 248, 0.39)";

  for (const polygon of state.landPolygons) {
    if (!Array.isArray(polygon) || polygon.length === 0) continue;

    let hasVisibleRing = false;
    ctx.beginPath();

    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 3) continue;

      const rotatedRing = new Array(ring.length);
      for (let i = 0; i < ring.length; i += 1) {
        rotatedRing[i] = rotateVector(ring[i], state.yaw, state.pitch);
      }

      const clippedRing = clipRingToVisibleHemisphere(rotatedRing);
      if (clippedRing.length < 3) continue;

      const first = projectVector(clippedRing[0]);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < clippedRing.length; i += 1) {
        const projected = projectVector(clippedRing[i]);
        ctx.lineTo(projected.x, projected.y);
      }
      ctx.closePath();
      hasVisibleRing = true;
    }

    if (hasVisibleRing) {
      ctx.fill("evenodd");
      // Seal subpixel cracks first, then redraw the political outline on top.
      ctx.strokeStyle = landFill;
      ctx.lineWidth = seamWidth;
      ctx.stroke();
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = borderWidth;
      ctx.stroke();
    }
  }

  return true;
}

function drawLand(ctx) {
  const drewAccuratePolygons = drawLandFromPolygons(ctx);
  if (!drewAccuratePolygons) {
    drawLandFromFallbackBlobs(ctx);
  }
}

function interpolateGreatCircleVector(startVector, endVector, t) {
  const dot = clamp(
    startVector.x * endVector.x + startVector.y * endVector.y + startVector.z * endVector.z,
    -1,
    1
  );
  const omega = Math.acos(dot);
  const sinOmega = Math.sin(omega);

  if (sinOmega <= 0.000001) {
    let x = startVector.x + (endVector.x - startVector.x) * t;
    let y = startVector.y + (endVector.y - startVector.y) * t;
    let z = startVector.z + (endVector.z - startVector.z) * t;
    const length = Math.hypot(x, y, z) || 1;
    x /= length;
    y /= length;
    z /= length;
    return { x, y, z, omega };
  }

  const startWeight = Math.sin((1 - t) * omega) / sinOmega;
  const endWeight = Math.sin(t * omega) / sinOmega;
  return {
    x: startVector.x * startWeight + endVector.x * endWeight,
    y: startVector.y * startWeight + endVector.y * endWeight,
    z: startVector.z * startWeight + endVector.z * endWeight,
    omega
  };
}

function drawRouteStroke(ctx, route, color, width, alpha, progress = 1) {
  const normalizedProgress = clamp(progress, 0, 1);
  if (normalizedProgress <= 0) {
    return;
  }

  const startVector = route.startVector || lonLatToVector(route.originLon, route.originLat);
  const endVector = route.endVector || lonLatToVector(route.destinationLon, route.destinationLat);
  const interpolationAtEnd = interpolateGreatCircleVector(startVector, endVector, 1);
  const sampleScale = state.renderQuality === "reduced" ? ACTIVE_ROUTE_SAMPLE_SCALE : 1;
  const baseSampleCount = clamp(Math.round((interpolationAtEnd.omega / Math.PI) * 56) + 18, 18, 84);
  const sampleCount = clamp(Math.round(baseSampleCount * sampleScale), 12, 84);
  const maxStep = Math.max(1, Math.round(sampleCount * normalizedProgress));

  let drawing = false;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.globalAlpha = alpha;
  ctx.lineCap = "round";

  for (let i = 0; i <= maxStep; i += 1) {
    const t = sampleCount <= 0 ? 0 : i / sampleCount;
    const point = interpolateGreatCircleVector(startVector, endVector, t);
    const rotated = rotateVector({ x: point.x, y: point.y, z: point.z }, state.yaw, state.pitch);

    if (rotated.z <= 0.005) {
      if (drawing) {
        ctx.stroke();
      }
      drawing = false;
      continue;
    }

    const projected = projectVector(rotated);
    if (!drawing) {
      ctx.beginPath();
      ctx.moveTo(projected.x, projected.y);
      drawing = true;
    } else {
      ctx.lineTo(projected.x, projected.y);
    }
  }

  if (drawing) {
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

function drawPlaneAlongRoute(ctx, route, progress) {
  const normalizedProgress = clamp(progress, 0, 1);
  if (normalizedProgress <= 0) {
    return;
  }

  const startVector = route.startVector || lonLatToVector(route.originLon, route.originLat);
  const endVector = route.endVector || lonLatToVector(route.destinationLon, route.destinationLat);
  const point = interpolateGreatCircleVector(startVector, endVector, normalizedProgress);
  const aheadPoint = interpolateGreatCircleVector(startVector, endVector, clamp(normalizedProgress + 0.02, 0, 1));

  const rotated = rotateVector({ x: point.x, y: point.y, z: point.z }, state.yaw, state.pitch);
  const rotatedAhead = rotateVector({ x: aheadPoint.x, y: aheadPoint.y, z: aheadPoint.z }, state.yaw, state.pitch);
  if (rotated.z <= 0.01) {
    return;
  }

  const projected = projectVector(rotated);
  const projectedAhead = projectVector(rotatedAhead);
  const heading = Math.atan2(projectedAhead.y - projected.y, projectedAhead.x - projected.x);

  ctx.save();
  ctx.translate(projected.x, projected.y);
  ctx.rotate(heading);

  ctx.beginPath();
  ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(76, 183, 255, 0.28)";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(9, 0);
  ctx.lineTo(-8, 5.2);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-8, -5.2);
  ctx.closePath();
  ctx.fillStyle = "rgba(221, 245, 255, 0.98)";
  ctx.strokeStyle = "rgba(41, 149, 232, 0.95)";
  ctx.lineWidth = 1;
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function drawTripPlaybackOverlay(ctx) {
  const playback = state.tripPlayback;
  if (!playback.active || !Array.isArray(playback.trips) || playback.trips.length === 0) {
    return;
  }

  const totalTrips = playback.trips.length;
  const currentIndex = clamp(playback.currentTripIndex, 0, Math.max(0, totalTrips - 1));
  const currentTrip = playback.trips[currentIndex];
  if (!currentTrip) {
    return;
  }

  const progress = playback.phase === "route" ? playback.routeProgress : 1;
  const reducedQuality = state.renderQuality === "reduced";
  drawRouteStroke(ctx, currentTrip, "rgba(57, 164, 255, 0.35)", reducedQuality ? 4.8 : 6, 0.45, progress);
  drawRouteStroke(ctx, currentTrip, "rgba(92, 194, 255, 1)", reducedQuality ? 2.4 : 3.2, 0.98, progress);
  drawPlaneAlongRoute(ctx, currentTrip, progress);
}

function drawFlightRoutes(ctx) {
  const reducedQuality = state.renderQuality === "reduced";
  const playback = state.tripPlayback;
  if (playback.active && Array.isArray(playback.trips) && playback.trips.length > 0) {
    const completedCount = clamp(playback.completedTripCount, 0, playback.trips.length);

    for (let index = 0; index < completedCount; index += 1) {
      const completedTrip = playback.trips[index];
      if (!completedTrip) {
        continue;
      }

      drawRouteStroke(ctx, completedTrip, "rgba(67, 165, 255, 0.95)", reducedQuality ? 2.6 : 3.4, 0.28);
      drawRouteStroke(ctx, completedTrip, "rgba(104, 196, 255, 1)", reducedQuality ? 1.6 : 2.2, 0.84);
    }

    return;
  }

  const routes = state.flightRoutes;
  if (!Array.isArray(routes) || routes.length === 0) {
    return;
  }

  const selectedKey = state.selectedAirportKey;
  for (const route of routes) {
    const isSelected = Boolean(selectedKey) && (route.originKey === selectedKey || route.destinationKey === selectedKey);
    const emphasis = clamp(route.count, 1, 8);
    const widthScale = reducedQuality ? 0.82 : 1;
    const width = (1.25 + emphasis * 0.24 + (isSelected ? 0.8 : 0)) * widthScale;

    drawRouteStroke(ctx, route, "rgba(67, 165, 255, 0.95)", width + 2, isSelected ? 0.26 : 0.2);
    drawRouteStroke(ctx, route, isSelected ? "rgba(112, 201, 255, 1)" : "rgba(74, 162, 250, 0.98)", width, isSelected ? 0.95 : 0.78);
  }
}

function drawMarkers(ctx) {
  state.projectedMarkers = [];
  const markers = state.airportMarkers;

  for (const marker of markers) {
    const rotated = rotateVector(lonLatToVector(marker.lon, marker.lat), state.yaw, state.pitch);
    if (rotated.z <= 0.04) {
      continue;
    }

    const projected = projectVector(rotated);
    const isSelected = marker.key === state.selectedAirportKey;
    const emphasis = clamp(marker.totalTouches, 1, 8);
    const markerRadius = Math.max(4, 3.2 + rotated.z * 4 + emphasis * 0.24 + (isSelected ? 2 : 0));

    state.projectedMarkers.push({
      key: marker.key,
      lat: marker.lat,
      lon: marker.lon,
      x: projected.x,
      y: projected.y,
      hitRadius: markerRadius + 10
    });

    ctx.beginPath();
    ctx.arc(projected.x, projected.y, markerRadius + 5, 0, Math.PI * 2);
    if (isSelected) {
      ctx.fillStyle = "rgba(24, 209, 140, 0.3)";
    } else if (marker.preview) {
      ctx.fillStyle = "rgba(88, 170, 255, 0.26)";
    } else {
      ctx.fillStyle = "rgba(255, 255, 255, 0.14)";
    }
    ctx.fill();

    ctx.beginPath();
    ctx.arc(projected.x, projected.y, markerRadius, 0, Math.PI * 2);
    if (isSelected) {
      ctx.fillStyle = "rgba(24, 209, 140, 0.98)";
    } else if (marker.preview) {
      ctx.fillStyle = "rgba(103, 186, 255, 0.98)";
    } else {
      ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
    }
    ctx.fill();

    if (isSelected) {
      const label = `${marker.iata || "—"} • ${marker.city || marker.name || "Unknown"}`;
      const fontSize = 12;
      ctx.font = `700 ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";

      const textWidth = ctx.measureText(label).width;
      const bubbleX = projected.x + 12;
      const bubbleY = projected.y - 24;

      ctx.fillStyle = "rgba(5, 10, 16, 0.8)";
      ctx.strokeStyle = "rgba(24, 209, 140, 0.6)";
      ctx.lineWidth = 1;
      roundRect(ctx, bubbleX, bubbleY, textWidth + 16, 24, 12);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "rgba(245, 255, 251, 0.96)";
      ctx.fillText(label, bubbleX + 8, bubbleY + 12.5);
    }
  }
}

function drawGlobeShadow(ctx) {
  const shadow = ctx.createRadialGradient(
    state.globeCx,
    state.globeCy + state.globeRadius * 0.98,
    state.globeRadius * 0.3,
    state.globeCx,
    state.globeCy + state.globeRadius * 0.98,
    state.globeRadius * 1.5
  );
  shadow.addColorStop(0, "rgba(0, 0, 0, 0.35)");
  shadow.addColorStop(1, "rgba(0, 0, 0, 0)");

  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.ellipse(state.globeCx, state.globeCy + state.globeRadius * 0.98, state.globeRadius * 0.74, state.globeRadius * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(ctx, x, y, width, height, radius) {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    return;
  }

  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.arcTo(x + width, y, x + width, y + r, r);
  ctx.lineTo(x + width, y + height - r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.lineTo(x + r, y + height);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
}

function prepareCanvas(ctx, dprCap) {
  if (!elements.globeCanvas || !elements.mapViewport) {
    return false;
  }

  const width = Math.max(1, Math.floor(elements.mapViewport.clientWidth || elements.mapViewport.getBoundingClientRect().width));
  const height = Math.max(1, Math.floor(elements.mapViewport.clientHeight || elements.mapViewport.getBoundingClientRect().height));
  const dpr = Math.min(dprCap, Math.max(1, window.devicePixelRatio || 1));

  const backingWidth = Math.round(width * dpr);
  const backingHeight = Math.round(height * dpr);

  if (elements.globeCanvas.width !== backingWidth || elements.globeCanvas.height !== backingHeight) {
    elements.globeCanvas.width = backingWidth;
    elements.globeCanvas.height = backingHeight;
  }

  state.canvasWidth = width;
  state.canvasHeight = height;
  state.globeCx = width * 0.5;
  state.globeCy = height * 0.5;
  state.globeRadius = Math.max(90, Math.min(width, height) * 0.42) * state.globeZoom;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  return true;
}

function drawScene({ reducedQuality = false } = {}) {
  if (!elements.globeCanvas) return;
  const ctx = elements.globeCanvas.getContext("2d");
  if (!ctx) return;
  state.renderQuality = reducedQuality ? "reduced" : "full";
  if (!prepareCanvas(ctx, reducedQuality ? ACTIVE_GLOBE_DPR : MAX_GLOBE_DPR)) return;

  drawGlobeShadow(ctx);

  ctx.save();
  ctx.beginPath();
  ctx.arc(state.globeCx, state.globeCy, state.globeRadius, 0, Math.PI * 2);
  ctx.clip();

  drawOcean(ctx);
  drawGraticule(ctx);
  drawLand(ctx);
  drawFlightRoutes(ctx);
  drawMarkers(ctx);
  drawTripPlaybackOverlay(ctx);

  ctx.restore();

  ctx.beginPath();
  ctx.arc(state.globeCx, state.globeCy, state.globeRadius, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.42)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function isAnimationActive() {
  return (
    (state.tripPlayback.active && !state.tripPlayback.paused) ||
    state.dragging ||
    state.targetYaw !== null ||
    state.targetPitch !== null ||
    Math.abs(state.velocityYaw) > 0.00002 ||
    Math.abs(state.velocityPitch) > 0.00002
  );
}

function queueSceneRender() {
  state.needsRender = true;
  if (state.rafId !== 0) {
    return;
  }
  state.rafId = window.requestAnimationFrame(animationFrame);
}

function centerGlobeOnLatLon(lat, lon) {
  state.targetYaw = wrapAngle(-degToRad(lon));
  state.targetPitch = clamp(degToRad(lat), -MAX_PITCH_RAD, MAX_PITCH_RAD);
  state.velocityYaw = 0;
  state.velocityPitch = 0;
  queueSceneRender();
}

function setGlobeZoom(nextZoom, { stopPlayback = false } = {}) {
  const clampedZoom = clampGlobeZoom(nextZoom);
  if (Math.abs(clampedZoom - state.globeZoom) < 0.001) {
    syncGlobeZoomUI();
    return false;
  }

  if (stopPlayback && state.tripPlayback.active) {
    stopTripPlayback("Trip playback stopped so you can zoom the globe.");
  }

  state.globeZoom = clampedZoom;
  syncGlobeZoomUI();
  queueSceneRender();
  return true;
}

function nudgeGlobeZoom(direction) {
  const multiplier = direction > 0 ? 1 + GLOBE_ZOOM_STEP : 1 / (1 + GLOBE_ZOOM_STEP);
  setGlobeZoom(state.globeZoom * multiplier, { stopPlayback: true });
}

function selectAirport(key, { centerGlobe = false, openGallery = false } = {}) {
  const marker = state.airportMarkers.find((item) => item.key === key);
  if (!marker) return;

  state.selectedAirportKey = marker.key;
  renderAirportFocus();

  if (centerGlobe) {
    centerGlobeOnLatLon(marker.lat, marker.lon);
  } else {
    queueSceneRender();
  }

  if (openGallery) {
    openDestinationGalleryForAirportKey(marker.key, { focusCloseButton: true });
  }
}

function applyRotationDelta(deltaYaw, deltaPitch) {
  if (!Number.isFinite(deltaYaw) || !Number.isFinite(deltaPitch)) {
    return false;
  }

  const nextYaw = wrapAngle(state.yaw + deltaYaw);
  const nextPitch = clamp(state.pitch + deltaPitch, -MAX_PITCH_RAD, MAX_PITCH_RAD);
  const changed = Math.abs(shortestAngleDelta(state.yaw, nextYaw)) > 0.0000001 || Math.abs(state.pitch - nextPitch) > 0.0000001;

  state.yaw = nextYaw;
  state.pitch = nextPitch;
  return changed;
}

function onPointerDown(event) {
  if (!elements.mapViewport) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;

  if (state.tripPlayback.active) {
    stopTripPlayback("Trip playback stopped so you can manually spin the globe.");
  }

  state.dragging = true;
  state.activePointerId = event.pointerId;
  state.dragDistance = 0;
  state.lastPointerX = event.clientX;
  state.lastPointerY = event.clientY;
  state.targetYaw = null;
  state.targetPitch = null;
  state.velocityYaw = 0;
  state.velocityPitch = 0;

  elements.mapViewport.classList.add("dragging");
  elements.mapViewport.setPointerCapture(event.pointerId);
  setMapStatus("Spinning globe...");
  queueSceneRender();
}

function onPointerMove(event) {
  if (!state.dragging || event.pointerId !== state.activePointerId) return;

  const dx = event.clientX - state.lastPointerX;
  const dy = event.clientY - state.lastPointerY;

  state.lastPointerX = event.clientX;
  state.lastPointerY = event.clientY;
  state.dragDistance += Math.hypot(dx, dy);

  const deltaYaw = dx * DRAG_SENSITIVITY;
  const deltaPitch = dy * DRAG_SENSITIVITY;

  const changed = applyRotationDelta(deltaYaw, deltaPitch);

  state.velocityYaw = deltaYaw * 0.35;
  state.velocityPitch = deltaPitch * 0.35;

  if (changed) {
    queueSceneRender();
  }
}

function pickMarkerAt(clientX, clientY) {
  if (!elements.mapViewport) {
    return null;
  }

  const rect = elements.mapViewport.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;

  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const marker of state.projectedMarkers) {
    const dx = marker.x - x;
    const dy = marker.y - y;
    const distance = Math.hypot(dx, dy);
    if (distance <= marker.hitRadius && distance < bestDistance) {
      best = marker;
      bestDistance = distance;
    }
  }

  return best;
}

function onPointerUp(event) {
  if (!elements.mapViewport) return;
  if (event.pointerId !== state.activePointerId) return;

  if (elements.mapViewport.hasPointerCapture(event.pointerId)) {
    elements.mapViewport.releasePointerCapture(event.pointerId);
  }

  if (state.dragDistance <= DRAG_CLICK_THRESHOLD) {
    const marker = pickMarkerAt(event.clientX, event.clientY);
    if (marker) {
      selectAirport(marker.key, { centerGlobe: true, openGallery: true });
    }
  }

  state.dragging = false;
  state.activePointerId = null;
  elements.mapViewport.classList.remove("dragging");
  setMapStatus("Drag anywhere on the globe to spin. Scroll or use +/- to zoom.");
  queueSceneRender();
}

function onMapWheel(event) {
  if (!elements.mapViewport) return;

  event.preventDefault();
  const zoomMultiplier = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY);
  setGlobeZoom(state.globeZoom * zoomMultiplier, { stopPlayback: true });
}

function advanceSimulation(timestamp) {
  const playbackChanged = advanceTripPlayback(timestamp);

  if (!state.lastFrameTime) {
    state.lastFrameTime = timestamp;
    return playbackChanged;
  }

  const elapsedMs = Math.max(8, Math.min(40, timestamp - state.lastFrameTime));
  const frameScale = elapsedMs / 16.666;
  let changed = playbackChanged;

  if (!state.dragging) {
    if (state.targetYaw !== null && state.targetPitch !== null) {
      const yawDelta = shortestAngleDelta(state.yaw, state.targetYaw);
      const pitchDelta = state.targetPitch - state.pitch;

      changed = applyRotationDelta(yawDelta * 0.12 * frameScale, pitchDelta * 0.12 * frameScale) || changed;

      if (Math.abs(yawDelta) < 0.002 && Math.abs(pitchDelta) < 0.002) {
        state.targetYaw = null;
        state.targetPitch = null;
      }
    } else {
      changed = applyRotationDelta(state.velocityYaw * frameScale, state.velocityPitch * frameScale) || changed;
      state.velocityYaw *= Math.pow(0.93, frameScale);
      state.velocityPitch *= Math.pow(0.9, frameScale);

      if (Math.abs(state.velocityYaw) < 0.00002) state.velocityYaw = 0;
      if (Math.abs(state.velocityPitch) < 0.00002) state.velocityPitch = 0;
    }
  }

  state.lastFrameTime = timestamp;
  return changed;
}

function animationFrame(timestamp) {
  state.rafId = 0;
  const motionChanged = advanceSimulation(timestamp);
  const animationActive = isAnimationActive();
  const shouldDraw = state.needsRender || motionChanged;
  const canDrawNow =
    !animationActive || state.lastDrawTime === 0 || timestamp - state.lastDrawTime >= ACTIVE_RENDER_MIN_INTERVAL_MS;

  if (shouldDraw) {
    if (canDrawNow) {
      drawScene({ reducedQuality: animationActive });
      state.needsRender = false;
      state.lastDrawTime = timestamp;
    } else {
      state.needsRender = true;
    }
  }

  if (state.needsRender || animationActive) {
    state.rafId = window.requestAnimationFrame(animationFrame);
    return;
  }

  state.lastFrameTime = 0;
  state.lastDrawTime = 0;
}

function handleYearSelectChange() {
  const selected = elements.yearStatsSelect?.value || "all";
  state.selectedYear = selected;
  saveStore();
  renderStats();
}

function removeLogById(logId) {
  if (state.tripPlayback.active) {
    stopTripPlayback("Trip playback stopped because your logbook changed.");
  }

  const before = state.logs.length;
  state.logs = state.logs.filter((log) => log.id !== logId);
  if (state.logs.length === before) {
    return;
  }

  saveStore();
  renderDataUI();
  setAnalyticsStatus("Flight removed and stats recalculated.");
}

function clearHistory() {
  if (state.logs.length === 0) {
    setAnalyticsStatus("No logged flights to clear.", "warn");
    return;
  }

  const confirmed = window.confirm("Clear all logged flights? This cannot be undone.");
  if (!confirmed) {
    return;
  }

  if (state.tripPlayback.active) {
    stopTripPlayback("Trip playback stopped because your logbook changed.");
  }

  state.logs = [];
  state.selectedYear = "all";
  state.playbackYear = "all";
  saveStore();
  renderDataUI();
  setAnalyticsStatus("Flight history cleared.");
}

function bindEvents() {
  if (elements.flightLookupButton) {
    elements.flightLookupButton.addEventListener("click", performLookup);
  }

  if (elements.flightCodeInput) {
    elements.flightCodeInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        performLookup();
      }
    });
  }

  if (elements.logLookupFlightButton) {
    elements.logLookupFlightButton.addEventListener("click", logLookupFlight);
  }

  if (elements.yearStatsSelect) {
    elements.yearStatsSelect.addEventListener("change", handleYearSelectChange);
  }

  if (elements.allTimeTopAircraftValue) {
    elements.allTimeTopAircraftValue.addEventListener("click", handleTopAircraftMetricClick);
  }

  if (elements.yearTopAircraftValue) {
    elements.yearTopAircraftValue.addEventListener("click", handleTopAircraftMetricClick);
  }

  if (elements.aircraftGalleryCloseButton) {
    elements.aircraftGalleryCloseButton.addEventListener("click", closeAircraftGallery);
  }

  if (elements.aircraftGalleryModal) {
    elements.aircraftGalleryModal.addEventListener("click", (event) => {
      if (event.target === elements.aircraftGalleryModal) {
        closeAircraftGallery();
      }
    });
  }

  if (elements.openDestinationGalleryButton) {
    elements.openDestinationGalleryButton.addEventListener("click", () => {
      const fallbackKey = state.selectedAirportKey || state.airportMarkers[0]?.key || "";
      if (!fallbackKey) {
        setDestinationGalleryStatus("No airport is available yet. Log a flight first.", "warn");
        return;
      }
      openDestinationGalleryForAirportKey(fallbackKey);
    });
  }

  if (elements.destinationGalleryCloseButton) {
    elements.destinationGalleryCloseButton.addEventListener("click", closeDestinationGallery);
  }

  if (elements.destinationGalleryModal) {
    elements.destinationGalleryModal.addEventListener("click", (event) => {
      if (event.target === elements.destinationGalleryModal) {
        closeDestinationGallery();
      }
    });
  }

  if (elements.destinationGalleryAddButton) {
    elements.destinationGalleryAddButton.addEventListener("click", () => {
      if (state.destinationGalleryBusy) {
        return;
      }
      elements.destinationPhotoInput?.click();
    });
  }

  if (elements.destinationPhotoInput) {
    elements.destinationPhotoInput.addEventListener("change", () => {
      if (state.destinationGalleryBusy) {
        return;
      }
      void importDestinationPhotos(elements.destinationPhotoInput?.files || []);
    });
  }

  if (elements.destinationGalleryList) {
    elements.destinationGalleryList.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const button = target.closest("button[data-destination-photo-id]");
      if (!button) {
        return;
      }

      const photoId = String(button.getAttribute("data-destination-photo-id") || "").trim();
      if (photoId) {
        removeDestinationPhoto(photoId);
      }
    });
  }

  if (elements.clearFlightHistoryButton) {
    elements.clearFlightHistoryButton.addEventListener("click", clearHistory);
  }

  if (elements.playbackYearSelect) {
    elements.playbackYearSelect.addEventListener("change", handlePlaybackYearSelectChange);
  }

  if (elements.playbackToggleButton) {
    elements.playbackToggleButton.addEventListener("click", toggleTripPlayback);
  }

  if (elements.playbackStopButton) {
    elements.playbackStopButton.addEventListener("click", () => {
      if (state.tripPlayback.active) {
        stopTripPlayback();
      }
    });
  }

  if (elements.flightHistoryBody) {
    elements.flightHistoryBody.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const button = target.closest("button[data-flight-log-id]");
      if (!button) {
        return;
      }

      const logId = button.getAttribute("data-flight-log-id") || "";
      if (logId) {
        removeLogById(logId);
      }
    });
  }

  if (elements.mapViewport) {
    elements.mapViewport.addEventListener("pointerdown", onPointerDown);
    elements.mapViewport.addEventListener("pointermove", onPointerMove);
    elements.mapViewport.addEventListener("pointerup", onPointerUp);
    elements.mapViewport.addEventListener("pointercancel", onPointerUp);
    elements.mapViewport.addEventListener("wheel", onMapWheel, { passive: false });
    elements.mapViewport.addEventListener("lostpointercapture", () => {
      if (!elements.mapViewport) return;
      state.dragging = false;
      state.activePointerId = null;
      elements.mapViewport.classList.remove("dragging");
      setMapStatus("Drag anywhere on the globe to spin. Scroll or use +/- to zoom.");
      queueSceneRender();
    });
  }

  const zoomButtons = [elements.zoomOutButton, elements.zoomInButton, elements.zoomResetButton].filter(Boolean);
  for (const button of zoomButtons) {
    button.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    button.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  }

  if (elements.zoomOutButton) {
    elements.zoomOutButton.addEventListener("click", () => {
      nudgeGlobeZoom(-1);
    });
  }

  if (elements.zoomInButton) {
    elements.zoomInButton.addEventListener("click", () => {
      nudgeGlobeZoom(1);
    });
  }

  if (elements.zoomResetButton) {
    elements.zoomResetButton.addEventListener("click", () => {
      setGlobeZoom(1, { stopPlayback: true });
    });
  }

  window.addEventListener("resize", () => {
    queueSceneRender();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      state.lastFrameTime = 0;
      state.lastDrawTime = 0;
      if (state.rafId !== 0) {
        window.cancelAnimationFrame(state.rafId);
        state.rafId = 0;
      }
      return;
    }

    queueSceneRender();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    if (isDestinationGalleryOpen()) {
      event.preventDefault();
      closeDestinationGallery();
      return;
    }

    if (isAircraftGalleryOpen()) {
      event.preventDefault();
      closeAircraftGallery();
    }
  });
}

function initializeFromStore() {
  const store = loadStore();
  state.logs = store.logs;
  state.selectedYear = store.selectedYear;
  state.playbackYear = store.playbackYear;
  state.destinationPhotosByAirport = loadDestinationPhotoStore();
  syncGlobeZoomUI();

  if (elements.flightLookupDateInput) {
    elements.flightLookupDateInput.min = LOOKUP_MIN_DATE;
    elements.flightLookupDateInput.value = todayLocalDate();
  }
}

function seedGlobeOrientation() {
  const initialAirport = state.airportMarkers[0] || null;
  if (initialAirport) {
    state.yaw = -degToRad(initialAirport.lon);
    state.pitch = clamp(degToRad(initialAirport.lat), -MAX_PITCH_RAD, MAX_PITCH_RAD);
    state.selectedAirportKey = initialAirport.key;
    return;
  }

  state.yaw = 0;
  state.pitch = 0;
}

function init() {
  bindEvents();
  initializeFromStore();
  renderDataUI();

  seedGlobeOrientation();
  queueSceneRender();

  void Promise.all([loadCountryGeometry(), loadLookupCatalog()]);
}

init();
