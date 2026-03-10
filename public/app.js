import "./search.js";

const HOLDINGS_SORT_STORAGE_KEY = "finance_tracker_holdings_sort";

const defaultHoldingsSort = {
  key: "gainPct",
  direction: "desc"
};

const holdingsSortKeys = new Set(["gainPct", "profit", "symbol", "name", "quantity", "avgCost", "unitPrice", "value"]);

function loadHoldingsSort() {
  const raw = localStorage.getItem(HOLDINGS_SORT_STORAGE_KEY);
  if (!raw) {
    return { ...defaultHoldingsSort };
  }

  try {
    const parsed = JSON.parse(raw);
    const key = parsed?.key;
    const direction = parsed?.direction;
    const safeDirection = direction === "asc" || direction === "desc" ? direction : defaultHoldingsSort.direction;

    if (typeof key !== "string" || !holdingsSortKeys.has(key)) {
      return { ...defaultHoldingsSort };
    }

    return { key, direction: safeDirection };
  } catch (_error) {
    return { ...defaultHoldingsSort };
  }
}

function saveHoldingsSort(sort) {
  localStorage.setItem(HOLDINGS_SORT_STORAGE_KEY, JSON.stringify(sort));
}

const state = {
  token: localStorage.getItem("finance_tracker_token") || "",
  user: null,
  providers: [],
  holdings: [],
  holdingsSort: loadHoldingsSort(),
  portfolioRange: localStorage.getItem("finance_tracker_portfolio_range") || "1m",
  portfolioHistory: null
};

const labels = {
  eq_bank: "EQ Bank",
  wealthsimple: "Wealthsimple",
  td: "TD",
  amex: "Amex",
  manual_csv: "Manual CSV"
};

const authPanel = document.getElementById("authPanel");
const appPanel = document.getElementById("appPanel");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const nameInput = document.getElementById("nameInput");
const registerButton = document.getElementById("registerButton");
const loginButton = document.getElementById("loginButton");
const logoutButton = document.getElementById("logoutButton");
const syncAllButton = document.getElementById("syncAllButton");
const providerButtons = document.getElementById("providerButtons");
const summaryCards = document.getElementById("summaryCards");
const accountsBody = document.getElementById("accountsBody");
const holdingsBody = document.getElementById("holdingsBody");
const holdingsTable = document.querySelector("table.holdings-table");
const liabilitiesBody = document.getElementById("liabilitiesBody");
const userLabel = document.getElementById("userLabel");
const modeHint = document.getElementById("modeHint");
const statusText = document.getElementById("statusText");
const portfolioGrowthValue = document.getElementById("portfolioGrowthValue");
const portfolioGrowthDelta = document.getElementById("portfolioGrowthDelta");
const portfolioGrowthSubtitle = document.getElementById("portfolioGrowthSubtitle");
const portfolioRefreshButton = document.getElementById("portfolioRefreshButton");
const portfolioRangeButtons = document.getElementById("portfolioRangeButtons");
const portfolioChart = document.getElementById("portfolioChart");
const portfolioGrowthMeta = document.getElementById("portfolioGrowthMeta");
const snapshotFromInput = document.getElementById("snapshotFromInput");
const snapshotToInput = document.getElementById("snapshotToInput");
const snapshotLimitInput = document.getElementById("snapshotLimitInput");
const snapshotSearchButton = document.getElementById("snapshotSearchButton");
const snapshotClearButton = document.getElementById("snapshotClearButton");
const snapshotsBody = document.getElementById("snapshotsBody");
const snapshotDetail = document.getElementById("snapshotDetail");
const snapshotDetailPre = document.getElementById("snapshotDetailPre");
const csvInstitutionInput = document.getElementById("csvInstitutionInput");
const csvAccountNameInput = document.getElementById("csvAccountNameInput");
const csvAccountTypeInput = document.getElementById("csvAccountTypeInput");
const csvCurrencyInput = document.getElementById("csvCurrencyInput");
const csvDayFirstInput = document.getElementById("csvDayFirstInput");
const csvFileInput = document.getElementById("csvFileInput");
const csvImportButton = document.getElementById("csvImportButton");
const csvImportDetails = document.getElementById("csvImportDetails");
const resetDataButton = document.getElementById("resetDataButton");

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
}

function authHeaders() {
  return state.token
    ? {
        Authorization: `Bearer ${state.token}`
      }
    : {};
}

async function api(path, options = {}, requireAuth = true) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
    ...(requireAuth ? authHeaders() : {})
  };

  const response = await fetch(`/api${path}`, {
    ...options,
    headers
  });

  const contentType = response.headers.get("content-type") || "";
  const bodyText = await response.text().catch(() => "");
  const trimmed = bodyText.trim();

  const parseBody = () => {
    if (!trimmed) {
      return null;
    }

    try {
      return JSON.parse(bodyText);
    } catch (_error) {
      return null;
    }
  };

  const payload = parseBody();

  if (!response.ok) {
    const errorMessage =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : contentType.includes("text/html") || trimmed.startsWith("<!doctype") || trimmed.startsWith("<html")
          ? "API returned HTML instead of JSON. Make sure you are running the Express server and opening the app from it (default: http://localhost:4000)."
          : `Request failed (${response.status}).`;
    throw new Error(errorMessage);
  }

  if (payload !== null) {
    return payload;
  }

  if (contentType.includes("text/html") || trimmed.startsWith("<!doctype") || trimmed.startsWith("<html")) {
    throw new Error(
      "API returned HTML instead of JSON. Make sure you are running the Express server and opening the app from it (default: http://localhost:4000)."
    );
  }

  return null;
}

function setToken(token) {
  state.token = token;
  localStorage.setItem("finance_tracker_token", token);
}

function clearSession() {
  state.token = "";
  state.user = null;
  state.providers = [];
  state.holdings = [];
  state.portfolioHistory = null;
  localStorage.removeItem("finance_tracker_token");
  authPanel.classList.remove("hidden");
  appPanel.classList.add("hidden");
  summaryCards.innerHTML = "";
  accountsBody.innerHTML = "";
  holdingsBody.innerHTML = "";
  liabilitiesBody.innerHTML = "";
  snapshotsBody.innerHTML = "";
  snapshotDetailPre.textContent = "";
  snapshotDetail.open = false;
  if (portfolioGrowthValue) {
    portfolioGrowthValue.textContent = "—";
  }
  if (portfolioGrowthDelta) {
    portfolioGrowthDelta.textContent = "—";
    portfolioGrowthDelta.classList.remove("positive", "negative");
  }
}

function currency(amount, code = "CAD") {
  const numeric = Number(amount || 0);
  const candidate = typeof code === "string" ? code.trim().toUpperCase() : "CAD";
  const safe = /^[A-Z]{3}$/.test(candidate) ? candidate : "CAD";

  try {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: safe,
      maximumFractionDigits: 2
    }).format(numeric);
  } catch (_error) {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
      maximumFractionDigits: 2
    }).format(numeric);
  }
}

function formatPrice(amount, code = "CAD") {
  const numeric = Number(amount || 0);
  const candidate = typeof code === "string" ? code.trim().toUpperCase() : "CAD";
  const safe = /^[A-Z]{3}$/.test(candidate) ? candidate : "CAD";
  const abs = Math.abs(numeric);
  const digits = abs > 0 && abs < 1 ? 6 : 2;

  try {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: safe,
      maximumFractionDigits: digits
    }).format(numeric);
  } catch (_error) {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
      maximumFractionDigits: digits
    }).format(numeric);
  }
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return "—";
  }
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shortenHoldingName(name) {
  const raw = String(name ?? "").trim();
  if (!raw) {
    return raw;
  }

  let normalized = raw.replace(/\s+/g, " ");
  normalized = normalized.replace(/\s*\(cad hedged\)\s*$/i, "");
  normalized = normalized.replace(/\s*-\s*cad\s*$/i, "");

  if (normalized.includes(" - ") && normalized.length > 44) {
    normalized = normalized.split(" - ")[0] || normalized;
  }

  normalized = normalized.trim();
  if (normalized.length <= 44) {
    return normalized;
  }

  return `${normalized.slice(0, 41).trimEnd()}…`;
}

function computeHoldingStats(holding) {
  const costBasis =
    holding?.costBasis === null || holding?.costBasis === undefined ? null : Number(holding.costBasis);
  const quantity = Number(holding?.quantity ?? 0);
  const hasBasis =
    costBasis !== null && Number.isFinite(costBasis) && costBasis > 0 && Number.isFinite(quantity) && quantity !== 0;
  const avgCost = hasBasis ? costBasis / quantity : null;
  const profit = hasBasis ? Number(holding?.value ?? 0) - costBasis : null;
  const gainPct = hasBasis ? (profit / costBasis) * 100 : null;
  const profitClass = profit === null ? "" : profit > 0 ? "positive" : profit < 0 ? "negative" : "";

  return {
    quantity,
    hasBasis,
    avgCost,
    profit,
    gainPct,
    profitClass
  };
}

function defaultHoldingsSortDirection(key) {
  return key === "symbol" || key === "name" ? "asc" : "desc";
}

function normalizeSortString(value) {
  return String(value ?? "").trim().toLowerCase();
}

function compareNullableNumbers(left, right, direction) {
  const leftMissing = left === null || left === undefined || !Number.isFinite(left);
  const rightMissing = right === null || right === undefined || !Number.isFinite(right);

  if (leftMissing && rightMissing) {
    return 0;
  }
  if (leftMissing) {
    return 1;
  }
  if (rightMissing) {
    return -1;
  }

  const delta = left - right;
  if (delta === 0) {
    return 0;
  }

  return direction === "desc" ? -delta : delta;
}

function compareStrings(left, right, direction) {
  const delta = left.localeCompare(right, undefined, { sensitivity: "base" });
  if (delta === 0) {
    return 0;
  }
  return direction === "desc" ? -delta : delta;
}

function buildHoldingsSortSpec(sort) {
  const key = sort?.key;
  const direction = sort?.direction === "asc" || sort?.direction === "desc" ? sort.direction : defaultHoldingsSort.direction;

  if (key === "gainPct") {
    return [
      { key: "gainPct", direction, type: "number" },
      { key: "profit", direction, type: "number" },
      { key: "symbol", direction: "asc", type: "string" },
      { key: "name", direction: "asc", type: "string" }
    ];
  }

  if (key === "profit") {
    return [
      { key: "profit", direction, type: "number" },
      { key: "gainPct", direction, type: "number" },
      { key: "symbol", direction: "asc", type: "string" },
      { key: "name", direction: "asc", type: "string" }
    ];
  }

  if (key === "name") {
    return [
      { key: "name", direction, type: "string" },
      { key: "symbol", direction: "asc", type: "string" }
    ];
  }

  if (key === "symbol") {
    return [
      { key: "symbol", direction, type: "string" },
      { key: "name", direction: "asc", type: "string" }
    ];
  }

  if (typeof key === "string" && holdingsSortKeys.has(key)) {
    return [
      { key, direction, type: "number" },
      { key: "symbol", direction: "asc", type: "string" },
      { key: "name", direction: "asc", type: "string" }
    ];
  }

  return buildHoldingsSortSpec(defaultHoldingsSort);
}

function sortHoldings(holdings, sort) {
  const safeHoldings = Array.isArray(holdings) ? holdings : [];
  const spec = buildHoldingsSortSpec(sort);

  const decorated = safeHoldings.map((holding, index) => {
    const stats = computeHoldingStats(holding);
    return {
      holding,
      index,
      gainPct: stats.gainPct,
      profit: stats.profit,
      symbol: normalizeSortString(holding?.symbol),
      name: normalizeSortString(holding?.name),
      quantity: stats.quantity,
      avgCost: stats.avgCost,
      unitPrice: Number(holding?.unitPrice ?? NaN),
      value: Number(holding?.value ?? NaN)
    };
  });

  decorated.sort((left, right) => {
    for (const step of spec) {
      const leftValue = left[step.key];
      const rightValue = right[step.key];
      const delta =
        step.type === "string"
          ? compareStrings(leftValue, rightValue, step.direction)
          : compareNullableNumbers(leftValue, rightValue, step.direction);
      if (delta !== 0) {
        return delta;
      }
    }

    return left.index - right.index;
  });

  return decorated.map((item) => item.holding);
}

function updateHoldingsSortIndicators() {
  if (!holdingsTable) {
    return;
  }

  const headers = holdingsTable.querySelectorAll("thead th[data-sort-key]");
  for (const header of headers) {
    const key = header.dataset.sortKey;
    if (key && key === state.holdingsSort.key) {
      header.setAttribute("aria-sort", state.holdingsSort.direction === "asc" ? "ascending" : "descending");
    } else {
      header.removeAttribute("aria-sort");
    }
  }
}

function setHoldingsSort(nextKey) {
  if (!nextKey || !holdingsSortKeys.has(nextKey)) {
    return;
  }

  const current = state.holdingsSort;
  const isSameKey = current?.key === nextKey;
  const nextDirection = isSameKey ? (current.direction === "desc" ? "asc" : "desc") : defaultHoldingsSortDirection(nextKey);

  state.holdingsSort = {
    key: nextKey,
    direction: nextDirection
  };

  saveHoldingsSort(state.holdingsSort);
  updateHoldingsSortIndicators();
  renderHoldings(sortHoldings(state.holdings, state.holdingsSort));
}

function initHoldingsSortControls() {
  if (!holdingsTable) {
    return;
  }

  const thead = holdingsTable.querySelector("thead");
  if (!thead) {
    return;
  }

  thead.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const header = target.closest("th[data-sort-key]");
    if (!(header instanceof HTMLTableCellElement)) {
      return;
    }

    const sortKey = header.dataset.sortKey;
    if (sortKey) {
      setHoldingsSort(sortKey);
    }
  });

  thead.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) {
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const header = target.closest("th[data-sort-key]");
    if (!(header instanceof HTMLTableCellElement)) {
      return;
    }

    const sortKey = header.dataset.sortKey;
    if (sortKey) {
      event.preventDefault();
      setHoldingsSort(sortKey);
    }
  });

  updateHoldingsSortIndicators();
}

function renderSummary(summary) {
  summaryCards.innerHTML = "";

  const cards = [
    { title: "Total Assets", value: currency(summary.totals.assets) },
    { title: "Cash + Savings", value: currency(summary.totals.cashAndSavings) },
    { title: "Investments", value: currency(summary.totals.investments) },
    { title: "Total Debt", value: currency(summary.totals.debt), debt: true },
    { title: "Net Worth", value: currency(summary.totals.netWorth) }
  ];

  for (const card of cards) {
    const element = document.createElement("article");
    element.className = "card";
    element.innerHTML = `
      <div class="metric-title">${card.title}</div>
      <div class="metric-value ${card.debt ? "debt" : ""}">${card.value}</div>
    `;
    summaryCards.appendChild(element);
  }
}

function renderAccounts(accounts) {
  accountsBody.innerHTML = "";

  for (const account of accounts) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${labels[account.provider] || account.provider}</td>
      <td>${account.name}</td>
      <td>${currency(account.balance, account.currency)}</td>
      <td>${account.type}</td>
      <td>${new Date(account.lastSyncedAt).toLocaleString()}</td>
    `;
    accountsBody.appendChild(row);
  }
}

function renderHoldings(holdings) {
  holdingsBody.innerHTML = "";

  for (const holding of holdings) {
    const stats = computeHoldingStats(holding);

    const holdingName = holding?.name ?? "";
    const displayName = shortenHoldingName(holdingName);
    const title = escapeHtml(holdingName);
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="pl ${stats.profitClass}">${stats.gainPct === null ? "—" : formatPercent(stats.gainPct)}</td>
      <td class="pl ${stats.profitClass}">${stats.profit === null ? "—" : currency(stats.profit, holding.currency)}</td>
      <td>${escapeHtml(holding?.symbol ?? "")}</td>
      <td title="${title}">${escapeHtml(displayName)}</td>
      <td>${holding.quantity}</td>
      <td>${stats.avgCost === null ? "—" : formatPrice(stats.avgCost, holding.currency)}</td>
      <td>${formatPrice(holding.unitPrice, holding.currency)}</td>
      <td>${currency(holding.value, holding.currency)}</td>
    `;
    holdingsBody.appendChild(row);
  }
}

function renderLiabilities(liabilities) {
  liabilitiesBody.innerHTML = "";

  for (const liability of liabilities) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${labels[liability.provider] || liability.provider}</td>
      <td>${liability.name}</td>
      <td>${currency(liability.balance, liability.currency)}</td>
      <td>${liability.kind}</td>
      <td>${liability.interestRate ?? "-"}</td>
    `;
    liabilitiesBody.appendChild(row);
  }
}

function formatDelta(delta, code) {
  const prefix = delta > 0 ? "+" : "";
  return `${prefix}${currency(delta, code)}`;
}

function resizeCanvasToDisplaySize(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    return true;
  }

  return false;
}

function drawPortfolioChart(canvas, points, code) {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  resizeCanvasToDisplaySize(canvas);

  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const style = getComputedStyle(document.documentElement);
  const border = style.getPropertyValue("--border").trim() || "#e6e8eb";
  const muted = style.getPropertyValue("--muted").trim() || "#5d6672";
  const accent = style.getPropertyValue("--accent").trim() || "#00a86b";

  if (!points || points.length === 0) {
    ctx.fillStyle = muted;
    ctx.font = `${Math.round(13 * (window.devicePixelRatio || 1))}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("No snapshot data yet.", width / 2, height / 2);
    return;
  }

  const times = points.map((point) => Date.parse(point.capturedAt));
  const values = points.map((point) => Number(point.value || 0));

  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);

  const paddingLeft = Math.round(48 * (window.devicePixelRatio || 1));
  const paddingRight = Math.round(16 * (window.devicePixelRatio || 1));
  const paddingTop = Math.round(18 * (window.devicePixelRatio || 1));
  const paddingBottom = Math.round(24 * (window.devicePixelRatio || 1));

  const plotWidth = Math.max(1, width - paddingLeft - paddingRight);
  const plotHeight = Math.max(1, height - paddingTop - paddingBottom);

  const valueRange = maxValue - minValue || Math.max(1, Math.abs(maxValue) * 0.05);
  const yMin = minValue - valueRange * 0.08;
  const yMax = maxValue + valueRange * 0.12;

  const xForTime = (time) => {
    if (maxTime === minTime) {
      return paddingLeft;
    }
    return paddingLeft + ((time - minTime) / (maxTime - minTime)) * plotWidth;
  };

  const yForValue = (value) => paddingTop + (1 - (value - yMin) / (yMax - yMin)) * plotHeight;

  ctx.strokeStyle = border;
  ctx.lineWidth = Math.max(1, Math.round(1 * (window.devicePixelRatio || 1)));

  const gridLines = 4;
  for (let i = 0; i <= gridLines; i += 1) {
    const y = paddingTop + (i / gridLines) * plotHeight;
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(width - paddingRight, y);
    ctx.stroke();
  }

  const labelFontSize = Math.round(11 * (window.devicePixelRatio || 1));
  ctx.font = `${labelFontSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = muted;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  const labelValues = [yMax, (yMax + yMin) / 2, yMin];
  for (const value of labelValues) {
    const y = yForValue(value);
    const label = currency(value, code);
    ctx.fillText(label, paddingLeft - Math.round(10 * (window.devicePixelRatio || 1)), y);
  }

  ctx.lineWidth = Math.max(2, Math.round(2 * (window.devicePixelRatio || 1)));
  ctx.strokeStyle = accent;
  ctx.beginPath();

  points.forEach((point, index) => {
    const x = xForTime(Date.parse(point.capturedAt));
    const y = yForValue(point.value);
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();

  ctx.globalAlpha = 0.14;
  ctx.fillStyle = accent;
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = xForTime(Date.parse(point.capturedAt));
    const y = yForValue(point.value);
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.lineTo(xForTime(maxTime), paddingTop + plotHeight);
  ctx.lineTo(xForTime(minTime), paddingTop + plotHeight);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

function setRangeButtonActive(range) {
  const buttons = portfolioRangeButtons?.querySelectorAll("button[data-range]") || [];
  for (const button of buttons) {
    button.classList.toggle("active", button.dataset.range === range);
  }
}

async function refreshPortfolioGrowth(options = {}) {
  if (!state.token || !portfolioChart) {
    return;
  }

  const range = options.range || state.portfolioRange || "1m";

  try {
    portfolioGrowthMeta.textContent = "Loading portfolio history...";
    portfolioGrowthMeta.classList.remove("warn");
    if (portfolioGrowthValue) {
      portfolioGrowthValue.textContent = "—";
    }
    if (portfolioGrowthDelta) {
      portfolioGrowthDelta.textContent = "—";
      portfolioGrowthDelta.classList.remove("positive", "negative");
    }
    setRangeButtonActive(range);

    const history = await api(`/portfolio/history?metric=investments&range=${encodeURIComponent(range)}&maxPoints=500`);
    state.portfolioHistory = history;

    const code = history.currency || "CAD";
    const points = history.points || [];
    drawPortfolioChart(portfolioChart, points, code);

    if (portfolioGrowthSubtitle) {
      portfolioGrowthSubtitle.textContent = `Investments (${code}) based on snapshots.`;
    }

    if (points.length === 0) {
      portfolioGrowthMeta.textContent = "No snapshots yet. Sync or import a CSV to record one.";
      return;
    }

    const first = points[0];
    const last = points[points.length - 1];
    const delta = Number(last.value) - Number(first.value);
    const pct = first.value ? (delta / Number(first.value)) * 100 : 0;
    const pctLabel = Number.isFinite(pct) ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : "0.00%";

    if (portfolioGrowthValue) {
      portfolioGrowthValue.textContent = currency(last.value, code);
    }

    if (portfolioGrowthDelta) {
      portfolioGrowthDelta.textContent = `${formatDelta(delta, code)} (${pctLabel})`;
      portfolioGrowthDelta.classList.toggle("positive", delta > 0);
      portfolioGrowthDelta.classList.toggle("negative", delta < 0);
    }

    const capturedAt = last.capturedAt ? new Date(last.capturedAt) : null;
    const capturedLabel = capturedAt && !Number.isNaN(capturedAt.getTime()) ? capturedAt.toLocaleString() : "unknown";
    const pointLabel = points.length === 1 ? "1 snapshot" : `${points.length} snapshots`;
    portfolioGrowthMeta.textContent = `As of ${capturedLabel} • ${pointLabel}`;
  } catch (error) {
    portfolioGrowthMeta.textContent = error.message || "Failed to load portfolio history.";
    portfolioGrowthMeta.classList.add("warn");
  }
}

function toIsoFromDatetimeLocal(value) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
}

async function searchPortfolioSnapshots() {
  if (!state.token) {
    return;
  }

  const from = toIsoFromDatetimeLocal(snapshotFromInput.value);
  const to = toIsoFromDatetimeLocal(snapshotToInput.value);
  const limit = Number.parseInt(snapshotLimitInput.value, 10);
  const params = new URLSearchParams();
  if (from) {
    params.set("from", from);
  }
  if (to) {
    params.set("to", to);
  }
  if (Number.isFinite(limit) && limit > 0) {
    params.set("limit", String(Math.min(limit, 1000)));
  }

  try {
    setStatus("Loading snapshots...");
    const snapshots = await api(`/portfolio/snapshots?${params.toString()}`);
    renderSnapshots(snapshots);
    setStatus(`Loaded ${snapshots.length} snapshot(s).`);
  } catch (error) {
    setStatus(error.message || "Failed to load snapshots.", true);
  }
}

function renderSnapshots(snapshots) {
  snapshotsBody.innerHTML = "";
  snapshotDetailPre.textContent = "";
  snapshotDetail.open = false;

  if (!snapshots || snapshots.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="6" class="metric-label">No snapshots found for that range.</td>`;
    snapshotsBody.appendChild(row);
    return;
  }

  for (const snapshot of snapshots) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${new Date(snapshot.capturedAt).toLocaleString()}</td>
      <td>${currency(snapshot.investments, snapshot.currency)}</td>
      <td>${currency(snapshot.totalAssets, snapshot.currency)}</td>
      <td>${currency(snapshot.netWorth, snapshot.currency)}</td>
      <td>${snapshot.currency}</td>
      <td><button type="button" data-snapshot-id="${snapshot.id}">View</button></td>
    `;
    snapshotsBody.appendChild(row);
  }

  for (const button of snapshotsBody.querySelectorAll("button[data-snapshot-id]")) {
    button.addEventListener("click", async () => {
      const snapshotId = button.dataset.snapshotId;
      if (!snapshotId) {
        return;
      }

      try {
        setStatus("Loading snapshot details...");
        const detail = await api(`/portfolio/snapshots/${snapshotId}`);
        snapshotDetailPre.textContent = JSON.stringify(detail, null, 2);
        snapshotDetail.open = true;
        setStatus("Snapshot loaded.");
      } catch (error) {
        setStatus(error.message || "Failed to load snapshot.", true);
      }
    });
  }
}

function openPlaidLink(linkToken) {
  return new Promise((resolve, reject) => {
    if (!window.Plaid) {
      reject(new Error("Plaid script not loaded. Check network access to cdn.plaid.com."));
      return;
    }

    const handler = window.Plaid.create({
      token: linkToken,
      onSuccess: (publicToken) => {
        resolve(publicToken);
      },
      onExit: (error) => {
        if (error) {
          reject(new Error(error.display_message || error.error_message || "Plaid Link exited with error."));
          return;
        }

        reject(new Error("Connection canceled before completion."));
      }
    });

    handler.open();
  });
}

function encodeBase64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function promptRequired(message, fieldName) {
  const value = window.prompt(message);

  if (value === null) {
    throw new Error(`${fieldName} entry canceled.`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`${fieldName} is required.`);
  }

  return trimmed;
}

function buildEqMobileAuthToken() {
  const email = promptRequired("EQ Bank email:", "Email");
  const password = promptRequired("EQ Bank password:", "Password");
  const stepupTypeInput = window.prompt(
    "If EQ asks for step-up now, enter OTP or QUESTION. Otherwise leave blank.",
    ""
  );
  const stepupType = stepupTypeInput ? stepupTypeInput.trim().toUpperCase() : "";
  const trustDeviceInput = window.prompt("Trust this device for future EQ step-up? yes/no", "yes");
  const trustDevice = !trustDeviceInput || !["no", "n", "false", "0"].includes(trustDeviceInput.toLowerCase());
  const payload = {
    email,
    password,
    trustDevice
  };

  if (stepupType === "OTP") {
    payload.stepupType = "OTP";
    payload.otpPin = promptRequired("Enter the OTP code from EQ Bank:", "OTP code");
  } else if (stepupType === "QUESTION" || stepupType === "CHALLENGED_QUESTION") {
    payload.stepupType = "CHALLENGED_QUESTION";
    payload.questionCode = promptRequired("Enter EQ question code (example: QA_107):", "Question code");
    payload.questionAnswer = promptRequired("Enter your EQ security question answer:", "Question answer");
  }

  return `eq-mobile-auth:${encodeBase64Utf8(JSON.stringify(payload))}`;
}

async function connectProvider(provider) {
  const providerName = provider.displayName || labels[provider.provider] || provider.provider;

  try {
    if (provider.status && provider.status !== "available") {
      throw new Error(`${providerName} is not enabled (mode=${provider.mode}).`);
    }

    setStatus(`Generating link token for ${providerName} (${provider.mode})...`);
    const link = await api(`/providers/${provider.provider}/link-token`, {
      method: "POST"
    });

    let publicToken = "";

    if (provider.mode === "eq_mobile_api") {
      publicToken = buildEqMobileAuthToken();
    } else if (provider.mode === "manual_holdings") {
      const json = promptRequired(
        'Paste Wealthsimple holdings JSON (CAD).\n\nTip: include `costBasis` (total) to enable P/L, and optionally `quoteSymbol` (ex: "XEQT.TO") for pricing.',
        "Holdings JSON"
      );

      publicToken = `manual-holdings:${encodeBase64Utf8(json)}`;
    } else if (provider.mode === "snaptrade") {
      window.open(link.linkToken, "_blank", "noopener,noreferrer");
      const confirmed = window.confirm(
        "Complete the SnapTrade connection flow in the opened tab, then click OK here to continue."
      );

      if (!confirmed) {
        throw new Error("SnapTrade connection canceled before completion.");
      }

      publicToken = `snaptrade-complete:${provider.provider}:${Date.now()}`;
    } else {
      publicToken = await openPlaidLink(link.linkToken);
    }

    const connection = await api(`/providers/${provider.provider}/exchange`, {
      method: "POST",
      body: JSON.stringify({ publicToken })
    });

    await api(`/connections/${connection.id}/sync`, { method: "POST" });
    await refreshData();
    setStatus(`Connected and synced ${providerName}.`);
  } catch (error) {
    setStatus(error.message || "Provider connection failed.", true);
  }
}

async function importCsvStatement() {
  const file = csvFileInput.files?.[0];

  if (!file) {
    setStatus("Choose a CSV file first.", true);
    return;
  }

  try {
    setStatus(`Reading CSV file: ${file.name}...`);
    const csvText = await file.text();
    const payload = {
      provider: "manual_csv",
      csvText,
      institutionName: csvInstitutionInput.value.trim() || undefined,
      defaultAccountName: csvAccountNameInput.value.trim() || undefined,
      defaultAccountType: csvAccountTypeInput.value || undefined,
      defaultCurrency: csvCurrencyInput.value.trim().toUpperCase() || undefined,
      dayFirst: Boolean(csvDayFirstInput.checked)
    };

    setStatus("Importing CSV...");
    const result = await api("/import/csv", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    await refreshData();

    const importedParts = [];

    if (Number(result.imported.holdings || 0) > 0) {
      importedParts.push(`${result.imported.holdings} holdings`);
    }

    if (Number(result.imported.transactions || 0) > 0) {
      importedParts.push(`${result.imported.transactions} transactions`);
    }

    const importedLabel = importedParts.length > 0 ? importedParts.join(" and ") : `${result.imported.rowsImported} row(s)`;

    const diagnostics =
      result?.detectedColumns?.format === "wealthsimple_holdings_report" && Number(result?.detectedColumns?.holdingsTotal || 0) > 0
        ? ` Cost basis parsed for ${Number(result.detectedColumns.holdingsWithCostBasis || 0)}/${Number(result.detectedColumns.holdingsTotal || 0)} holding(s).`
        : "";

    setStatus(`CSV imported: ${importedLabel} across ${result.imported.accounts} account(s).${diagnostics}`);
    csvFileInput.value = "";
    if (csvImportDetails instanceof HTMLDetailsElement) {
      csvImportDetails.open = false;
    }
  } catch (error) {
    setStatus(error.message || "CSV import failed.", true);
  }
}

async function resetAllData() {
  if (!state.token) {
    setStatus("Sign in first.", true);
    return;
  }

  const first = confirm(
    "Reset ALL finance + health data?\n\nThis deletes connections, accounts, holdings, transactions, snapshots, health samples, and targets.\n\nYour user account stays."
  );
  if (!first) {
    return;
  }

  const second = prompt('Type "RESET" to confirm:');
  if (String(second || "").trim().toUpperCase() !== "RESET") {
    setStatus("Reset canceled.", true);
    return;
  }

  try {
    setStatus("Resetting data...");
    const result = await api("/reset", { method: "POST", body: JSON.stringify({}) });
    await refreshData();
    const remaining = result?.deleted?.remaining;
    const remainingTotal =
      remaining && typeof remaining === "object"
        ? Number(remaining.connections || 0) +
          Number(remaining.accounts || 0) +
          Number(remaining.holdings || 0) +
          Number(remaining.liabilities || 0) +
          Number(remaining.transactions || 0) +
          Number(remaining.portfolioSnapshots || 0) +
          Number(remaining.healthConnections || 0) +
          Number(remaining.fitnessSamples || 0) +
          Number(remaining.fitnessTargets || 0)
        : 0;

    if (remainingTotal > 0) {
      setStatus(
        `Reset incomplete (remaining rows: ${remainingTotal}). Open /api/debug/user-counts for details.`,
        true
      );
      return;
    }

    setStatus("All data reset to 0. Import/sync to load your real data.");
  } catch (error) {
    setStatus(error.message || "Reset failed.", true);
  }
}

function renderProviderButtons() {
  providerButtons.innerHTML = "";

  for (const provider of state.providers) {
    const button = document.createElement("button");
    const providerName = provider.displayName || labels[provider.provider] || provider.provider;
    button.textContent = `Connect ${providerName} (${provider.mode})`;
    button.disabled = provider.status && provider.status !== "available";
    button.addEventListener("click", () => connectProvider(provider));
    providerButtons.appendChild(button);
  }

  const anyLive = state.providers.some((provider) => provider.mode === "plaid");
  const anyEqMobile = state.providers.some((provider) => provider.mode === "eq_mobile_api");
  const anySnaptrade = state.providers.some((provider) => provider.mode === "snaptrade");
  const anyManualHoldings = state.providers.some((provider) => provider.mode === "manual_holdings");
  const connectorHint = anyEqMobile
    ? "EQ Bank mobile API mode is enabled. You will be prompted for EQ credentials and step-up details."
    : anyManualHoldings
      ? "Manual holdings mode is enabled for Wealthsimple. Paste your per-account positions JSON, then sync to compute market value."
    : anyLive
      ? "Plaid Link is enabled for one or more providers."
      : anySnaptrade
        ? "SnapTrade mode is enabled for Wealthsimple. Follow the browser-based connection flow."
        : "Some providers may be disabled. Update env to enable eq_mobile_api/plaid/snaptrade/manual_holdings as needed.";

  modeHint.textContent = `${connectorHint} CSV statement import is available in the Import CSV panel.`;
}

async function refreshData() {
  const [summary, accounts, holdings, liabilities] = await Promise.all([
    api("/summary"),
    api("/accounts"),
    api("/holdings"),
    api("/liabilities")
  ]);

  renderSummary(summary);
  renderAccounts(accounts);
  state.holdings = holdings;
  renderHoldings(sortHoldings(holdings, state.holdingsSort));
  renderLiabilities(liabilities);

  await refreshPortfolioGrowth();
}

async function initializeAuthenticatedView() {
  authPanel.classList.add("hidden");
  appPanel.classList.remove("hidden");
  userLabel.textContent = `${state.user.name} (${state.user.email})`;

  state.providers = await api("/providers");
  renderProviderButtons();
  await refreshData();
  setStatus("Ready.");
}

async function handleRegister() {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const name = nameInput.value.trim();

  try {
    setStatus("Creating account...");
    const result = await api(
      "/auth/register",
      {
        method: "POST",
        body: JSON.stringify({ email, password, name: name || undefined })
      },
      false
    );

    setToken(result.token);
    state.user = result.user;
    await initializeAuthenticatedView();
  } catch (error) {
    setStatus(error.message || "Register failed.", true);
  }
}

async function handleLogin() {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  try {
    setStatus("Signing in...");
    const result = await api(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password })
      },
      false
    );

    setToken(result.token);
    state.user = result.user;
    await initializeAuthenticatedView();
  } catch (error) {
    setStatus(error.message || "Login failed.", true);
  }
}

async function restoreSession() {
  if (!state.token) {
    clearSession();
    return;
  }

  try {
    state.user = await api("/auth/me");
    await initializeAuthenticatedView();
  } catch (_error) {
    clearSession();
    setStatus("Session expired. Please sign in again.", true);
  }
}

registerButton.addEventListener("click", handleRegister);
loginButton.addEventListener("click", handleLogin);
logoutButton.addEventListener("click", () => {
  clearSession();
  setStatus("Signed out.");
});

syncAllButton.addEventListener("click", async () => {
  try {
    setStatus("Syncing all connections...");
    await api("/sync-all", {
      method: "POST",
      body: JSON.stringify({})
    });
    await refreshData();
    setStatus("Sync completed.");
  } catch (error) {
    setStatus(error.message || "Sync failed.", true);
  }
});

csvImportButton.addEventListener("click", importCsvStatement);
resetDataButton?.addEventListener("click", resetAllData);

if (portfolioRangeButtons) {
  portfolioRangeButtons.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const button = target.closest("button[data-range]");
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const range = button.dataset.range;
    if (!range) {
      return;
    }

    state.portfolioRange = range;
    localStorage.setItem("finance_tracker_portfolio_range", range);
    await refreshPortfolioGrowth({ range });
  });
}

if (portfolioRefreshButton) {
  portfolioRefreshButton.addEventListener("click", () => refreshPortfolioGrowth());
}

if (snapshotSearchButton) {
  snapshotSearchButton.addEventListener("click", searchPortfolioSnapshots);
}

if (snapshotClearButton) {
  snapshotClearButton.addEventListener("click", () => {
    snapshotFromInput.value = "";
    snapshotToInput.value = "";
    snapshotLimitInput.value = "250";
    snapshotsBody.innerHTML = "";
    snapshotDetailPre.textContent = "";
    snapshotDetail.open = false;
  });
}

window.addEventListener("resize", () => {
  if (state.portfolioHistory?.points?.length) {
    drawPortfolioChart(portfolioChart, state.portfolioHistory.points, state.portfolioHistory.currency || "CAD");
  }
});

initHoldingsSortControls();
restoreSession();
