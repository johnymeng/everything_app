import "./search.js";

const state = {
  token: localStorage.getItem("finance_tracker_token") || "",
  user: null,
  metrics: [],
  dashboard: null,
  strengthMetric: localStorage.getItem("fitness_strength_metric") || "squat_1rm",
  strengthRange: localStorage.getItem("fitness_strength_range") || "6m",
  strengthHistory: null
};

const authGate = document.getElementById("authGate");
const appPanel = document.getElementById("appPanel");
const userLabel = document.getElementById("userLabel");
const connectionLabel = document.getElementById("connectionLabel");
const connectionBadge = document.getElementById("connectionBadge");
const syncButton = document.getElementById("syncButton");
const payloadInput = document.getElementById("payloadInput");
const latestGrid = document.getElementById("latestGrid");
const strengthMetric = document.getElementById("strengthMetric");
const strengthRangeButtons = document.getElementById("strengthRangeButtons");
const strengthChart = document.getElementById("strengthChart");
const strengthLatestValue = document.getElementById("strengthLatestValue");
const strengthDelta = document.getElementById("strengthDelta");
const strengthSubtitle = document.getElementById("strengthSubtitle");
const strengthMeta = document.getElementById("strengthMeta");
const strengthLogMetric = document.getElementById("strengthLogMetric");
const strengthLogValue = document.getElementById("strengthLogValue");
const strengthLogUnit = document.getElementById("strengthLogUnit");
const strengthLogRecordedAt = document.getElementById("strengthLogRecordedAt");
const strengthLogAdd = document.getElementById("strengthLogAdd");
const insightsList = document.getElementById("insightsList");
const targetsBody = document.getElementById("targetsBody");
const targetMetric = document.getElementById("targetMetric");
const targetLabel = document.getElementById("targetLabel");
const targetValue = document.getElementById("targetValue");
const targetUnit = document.getElementById("targetUnit");
const targetDueDate = document.getElementById("targetDueDate");
const saveTarget = document.getElementById("saveTarget");
const suggestionsGrid = document.getElementById("suggestionsGrid");
const sampleMetric = document.getElementById("sampleMetric");
const sampleValue = document.getElementById("sampleValue");
const sampleUnit = document.getElementById("sampleUnit");
const sampleRecordedAt = document.getElementById("sampleRecordedAt");
const addSample = document.getElementById("addSample");
const statusText = document.getElementById("statusText");

const strengthMetricKeys = ["squat_1rm", "bench_1rm", "deadlift_1rm"];

function setStatus(message, tone = "normal") {
  statusText.textContent = message;
  statusText.classList.remove("error", "warn");

  if (tone === "error") {
    statusText.classList.add("error");
  }

  if (tone === "warn") {
    statusText.classList.add("warn");
  }
}

function authHeaders() {
  return state.token
    ? {
        Authorization: `Bearer ${state.token}`
      }
    : {};
}

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      ...authHeaders()
    }
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

function metricMeta(metric) {
  return state.metrics.find((item) => item.metric === metric) || null;
}

function metricLabel(metric) {
  return metricMeta(metric)?.label || metric;
}

function metricUnit(metric) {
  return metricMeta(metric)?.defaultUnit || "";
}

function metricDirection(metric) {
  return metricMeta(metric)?.goalDirection || "increase";
}

function formatMileSeconds(seconds) {
  const total = Number(seconds || 0);
  const minutes = Math.floor(total / 60);
  const remaining = (total - minutes * 60).toFixed(1).padStart(4, "0");
  return `${minutes}:${remaining}`;
}

function formatMetricValue(metric, value, unit, withUnit = true) {
  const numeric = Number(value || 0);

  if (metric === "mile_time") {
    const display = formatMileSeconds(numeric);
    return withUnit ? `${display} min` : display;
  }

  const compact = numeric >= 1000 ? Math.round(numeric).toLocaleString() : numeric.toFixed(1).replace(/\.0$/, "");
  if (!withUnit) {
    return compact;
  }

  return `${compact} ${unit || metricUnit(metric)}`.trim();
}

function renderConnection(connection) {
  if (!connection) {
    connectionLabel.textContent = "Apple Health not synced yet.";
    connectionBadge.textContent = "Disconnected";
    return;
  }

  const syncedAt = connection.lastSyncedAt ? new Date(connection.lastSyncedAt).toLocaleString() : "never";
  connectionLabel.textContent = `Status: ${connection.status}. Last sync: ${syncedAt}. Mode: Apple payload sync.`;
  connectionBadge.textContent = "Apple Health";
}

function renderLatest(latest) {
  latestGrid.innerHTML = "";

  if (!latest || latest.length === 0) {
    latestGrid.innerHTML = '<article class="card" style="padding:14px">No health samples yet. Run sync to populate metrics.</article>';
    return;
  }

  for (const sample of latest) {
    const card = document.createElement("article");
    card.className = "card";
    card.style.padding = "14px";
    card.innerHTML = `
      <div class="metric-label">${metricLabel(sample.metric)}</div>
      <div class="metric-value">${formatMetricValue(sample.metric, sample.value, sample.unit)}</div>
      <div class="subtitle">${new Date(sample.recordedAt).toLocaleDateString()} (${sample.source})</div>
    `;
    latestGrid.appendChild(card);
  }
}

function setSegmentedActive(container, attribute, value) {
  const buttons = container?.querySelectorAll(`button[data-${attribute}]`) || [];
  for (const button of buttons) {
    button.classList.toggle("active", button.dataset[attribute] === value);
  }
}

function resizeCanvasToDisplaySize(canvas) {
  if (!canvas) {
    return false;
  }

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

function drawMetricHistoryChart(canvas, metric, points, unit) {
  if (!canvas) {
    return;
  }

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
  const dpr = window.devicePixelRatio || 1;

  if (!points || points.length === 0) {
    ctx.fillStyle = muted;
    ctx.font = `${Math.round(13 * dpr)}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("No lift entries in this range.", width / 2, height / 2);
    return;
  }

  const times = points.map((point) => Date.parse(point.recordedAt));
  const values = points.map((point) => Number(point.value || 0));

  const parsedTimes = times.filter((t) => Number.isFinite(t));
  const parsedValues = values.filter((v) => Number.isFinite(v));

  if (parsedTimes.length === 0 || parsedValues.length === 0) {
    ctx.fillStyle = muted;
    ctx.font = `${Math.round(13 * dpr)}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("No valid chart points.", width / 2, height / 2);
    return;
  }

  const minTime = Math.min(...parsedTimes);
  const maxTime = Math.max(...parsedTimes);
  const minValue = Math.min(...parsedValues);
  const maxValue = Math.max(...parsedValues);

  const paddingLeft = Math.round(52 * dpr);
  const paddingRight = Math.round(16 * dpr);
  const paddingTop = Math.round(18 * dpr);
  const paddingBottom = Math.round(24 * dpr);

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
  ctx.lineWidth = Math.max(1, Math.round(1 * dpr));

  const gridLines = 4;
  for (let i = 0; i <= gridLines; i += 1) {
    const y = paddingTop + (i / gridLines) * plotHeight;
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(width - paddingRight, y);
    ctx.stroke();
  }

  const labelFontSize = Math.round(11 * dpr);
  ctx.font = `${labelFontSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = muted;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  const labelValues = [yMax, (yMax + yMin) / 2, yMin];
  for (const value of labelValues) {
    const y = yForValue(value);
    const label = formatMetricValue(metric, value, unit, false);
    ctx.fillText(label, paddingLeft - Math.round(10 * dpr), y);
  }

  ctx.lineWidth = Math.max(2, Math.round(2 * dpr));
  ctx.strokeStyle = accent;
  ctx.beginPath();

  points.forEach((point, index) => {
    const time = Date.parse(point.recordedAt);
    const value = Number(point.value || 0);
    if (!Number.isFinite(time) || !Number.isFinite(value)) {
      return;
    }

    const x = xForTime(time);
    const y = yForValue(value);
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
    const time = Date.parse(point.recordedAt);
    const value = Number(point.value || 0);
    if (!Number.isFinite(time) || !Number.isFinite(value)) {
      return;
    }

    const x = xForTime(time);
    const y = yForValue(value);
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

function renderInsights(insights) {
  insightsList.innerHTML = "";

  for (const insight of insights || []) {
    const item = document.createElement("li");
    item.textContent = insight;
    insightsList.appendChild(item);
  }
}

function statusPill(status) {
  const label = status.replace("_", " ");
  return `<span class="pill ${status}">${label}</span>`;
}

function renderTargets(targetProgress) {
  targetsBody.innerHTML = "";

  if (!targetProgress || targetProgress.length === 0) {
    const empty = document.createElement("tr");
    empty.innerHTML = '<td colspan="7">No targets yet. Add one below.</td>';
    targetsBody.appendChild(empty);
    return;
  }

  for (const entry of targetProgress) {
    const current = entry.currentValue === undefined ? "-" : formatMetricValue(entry.target.metric, entry.currentValue, entry.target.unit);
    const targetDisplay = formatMetricValue(entry.target.metric, entry.target.targetValue, entry.target.unit);
    const direction = metricDirection(entry.target.metric);
    const gap =
      entry.gap === undefined
        ? "-"
        : direction === "decrease"
          ? `${formatMetricValue(entry.target.metric, Math.abs(entry.gap), entry.target.unit)} above`
          : `${formatMetricValue(entry.target.metric, Math.abs(entry.gap), entry.target.unit)} to go`;
    const dueDate = entry.target.dueDate || "-";

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${entry.target.label}</td>
      <td>${current}</td>
      <td>${targetDisplay}</td>
      <td>${gap}</td>
      <td>${dueDate}</td>
      <td>${statusPill(entry.status)}</td>
      <td><button class="danger" data-target-id="${entry.target.id}">Delete</button></td>
    `;

    const deleteButton = row.querySelector("button");
    deleteButton.addEventListener("click", async () => {
      try {
        await api(`/fitness/targets/${entry.target.id}`, { method: "DELETE" });
        await refreshDashboard();
        setStatus(`Deleted target: ${entry.target.label}.`);
      } catch (error) {
        setStatus(error.message || "Could not delete target.", "error");
      }
    });

    targetsBody.appendChild(row);
  }
}

function renderSuggestions(suggestions) {
  suggestionsGrid.innerHTML = "";

  if (!suggestions || suggestions.length === 0) {
    suggestionsGrid.innerHTML = '<article class="card suggestion"><p>No suggestions right now. Log more data to generate new target ideas.</p></article>';
    return;
  }

  for (const suggestion of suggestions) {
    const card = document.createElement("article");
    card.className = "card suggestion stack";
    card.innerHTML = `
      <strong>${suggestion.label}</strong>
      <p>${formatMetricValue(suggestion.metric, suggestion.targetValue, suggestion.unit)} target</p>
      <p>${suggestion.reason}</p>
      <button class="primary">Apply</button>
    `;

    const applyButton = card.querySelector("button");
    applyButton.addEventListener("click", async () => {
      try {
        await api("/fitness/targets", {
          method: "POST",
          body: JSON.stringify({
            metric: suggestion.metric,
            label: suggestion.label,
            targetValue: suggestion.targetValue,
            unit: suggestion.unit
          })
        });

        await refreshDashboard();
        setStatus(`Applied target: ${suggestion.label}.`);
      } catch (error) {
        setStatus(error.message || "Failed to apply suggestion.", "error");
      }
    });

    suggestionsGrid.appendChild(card);
  }
}

function renderDashboard() {
  const dashboard = state.dashboard;
  if (!dashboard) {
    return;
  }

  renderConnection(dashboard.connection);
  renderLatest(dashboard.latest || []);
  renderInsights(dashboard.insights || []);
  renderTargets(dashboard.targetProgress || []);
  renderSuggestions(dashboard.suggestedTargets || []);
}

function populateStrengthSelects() {
  if (!strengthMetric || !strengthLogMetric) {
    return;
  }

  strengthMetric.innerHTML = "";
  strengthLogMetric.innerHTML = "";

  for (const metricKey of strengthMetricKeys) {
    const label = metricLabel(metricKey);

    const chartOption = document.createElement("option");
    chartOption.value = metricKey;
    chartOption.textContent = label;
    strengthMetric.appendChild(chartOption);

    const logOption = document.createElement("option");
    logOption.value = metricKey;
    logOption.textContent = label;
    strengthLogMetric.appendChild(logOption);
  }

  const fallbackMetric = strengthMetricKeys[0];
  const selectedMetric = strengthMetricKeys.includes(state.strengthMetric) ? state.strengthMetric : fallbackMetric;
  strengthMetric.value = selectedMetric;
  strengthLogMetric.value = selectedMetric;

  if (strengthLogUnit) {
    const defaultUnit = metricUnit(selectedMetric);
    strengthLogUnit.value = defaultUnit === "lb" ? "lb" : "kg";
  }
}

function populateMetricSelects() {
  targetMetric.innerHTML = "";
  sampleMetric.innerHTML = "";

  for (const metric of state.metrics) {
    const targetOption = document.createElement("option");
    targetOption.value = metric.metric;
    targetOption.textContent = metric.label;
    targetMetric.appendChild(targetOption);

    const sampleOption = document.createElement("option");
    sampleOption.value = metric.metric;
    sampleOption.textContent = metric.label;
    sampleMetric.appendChild(sampleOption);
  }

  targetUnit.value = metricUnit(targetMetric.value);
  sampleUnit.value = metricUnit(sampleMetric.value);
}

async function refreshDashboard() {
  state.dashboard = await api("/fitness/dashboard");
  renderDashboard();
}

async function refreshStrengthHistory(options = {}) {
  if (!strengthChart || !strengthMetric) {
    return;
  }

  const metric = options.metric || strengthMetric.value || state.strengthMetric;
  const range = options.range || state.strengthRange || "6m";
  const maxPoints = options.maxPoints || 500;

  state.strengthMetric = metric;
  state.strengthRange = range;

  localStorage.setItem("fitness_strength_metric", metric);
  localStorage.setItem("fitness_strength_range", range);

  setSegmentedActive(strengthRangeButtons, "range", range);

  try {
    if (strengthMeta) {
      strengthMeta.textContent = "Loading strength history...";
      strengthMeta.classList.remove("warn");
    }

    if (strengthSubtitle) {
      strengthSubtitle.textContent = `${metricLabel(metric)} • ${range.toUpperCase()} range`;
    }

    const history = await api(
      `/fitness/history?metric=${encodeURIComponent(metric)}&range=${encodeURIComponent(range)}&maxPoints=${encodeURIComponent(String(maxPoints))}`
    );
    state.strengthHistory = history;

    const points = history.points || [];
    drawMetricHistoryChart(strengthChart, metric, points, history.unit);

    if (points.length === 0) {
      if (strengthLatestValue) strengthLatestValue.textContent = "—";
      if (strengthDelta) {
        strengthDelta.textContent = "—";
        strengthDelta.classList.remove("positive", "negative");
      }
      if (strengthMeta) {
        strengthMeta.textContent = "No lift entries yet. Add one below.";
      }
      return;
    }

    const first = points[0];
    const last = points[points.length - 1];
    const delta = Number(last.value) - Number(first.value);
    const direction = metricDirection(metric);
    const isPositive = direction === "increase" ? delta > 0 : delta < 0;

    if (strengthLatestValue) {
      strengthLatestValue.textContent = formatMetricValue(metric, last.value, history.unit);
    }

    if (strengthDelta) {
      const prefix = delta > 0 ? "+" : "";
      strengthDelta.textContent = `${prefix}${formatMetricValue(metric, delta, history.unit)}`;
      strengthDelta.classList.toggle("positive", isPositive);
      strengthDelta.classList.toggle("negative", !isPositive && delta !== 0);
    }

    const lastRecordedAt = last.recordedAt ? new Date(last.recordedAt) : null;
    const lastLabel = lastRecordedAt && !Number.isNaN(lastRecordedAt.getTime()) ? lastRecordedAt.toLocaleDateString() : "unknown date";
    const pointLabel = points.length === 1 ? "1 entry" : `${points.length} entries`;

    if (strengthMeta) {
      strengthMeta.textContent = `Last logged ${lastLabel} • ${pointLabel} • Unit: ${history.unit || metricUnit(metric)}`;
    }
  } catch (error) {
    if (strengthMeta) {
      strengthMeta.textContent = error.message || "Failed to load strength history.";
      strengthMeta.classList.add("warn");
    }
  }
}

function parsePayload() {
  const raw = payloadInput.value.trim();
  if (!raw) {
    throw new Error("Paste Apple Health JSON payload first.");
  }

  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch (_error) {
    throw new Error("Payload must be valid JSON.");
  }

  if (Array.isArray(parsed)) {
    return { samples: parsed };
  }

  if (parsed && typeof parsed === "object" && Array.isArray(parsed.samples)) {
    return { samples: parsed.samples };
  }

  if (parsed && typeof parsed === "object" && parsed.metric && Number.isFinite(parsed.value)) {
    return { samples: [parsed] };
  }

  throw new Error("Payload JSON must be an array of samples or an object with a samples array.");
}

async function syncAppleHealth() {
  try {
    setStatus("Syncing Apple Health data...");
    const payload = parsePayload();
    const result = await api("/fitness/apple-health/sync", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    state.dashboard = result.dashboard;
    renderDashboard();

    if (result.imported === 0) {
      setStatus("Sync completed, but no new samples were imported (likely duplicates).", "warn");
      return;
    }

    setStatus(`Sync completed. Imported ${result.imported} sample${result.imported === 1 ? "" : "s"}.`);
  } catch (error) {
    setStatus(error.message || "Sync failed.", "error");
  }
}

async function createOrUpdateTarget() {
  const metric = targetMetric.value;
  const label = targetLabel.value.trim();
  const value = Number(targetValue.value);
  const unit = targetUnit.value.trim();
  const dueDate = targetDueDate.value;

  if (!Number.isFinite(value)) {
    setStatus("Enter a valid target value.", "error");
    return;
  }

  try {
    await api("/fitness/targets", {
      method: "POST",
      body: JSON.stringify({
        metric,
        label: label || undefined,
        targetValue: value,
        unit: unit || undefined,
        dueDate: dueDate || undefined
      })
    });

    targetLabel.value = "";
    targetValue.value = "";
    targetDueDate.value = "";
    await refreshDashboard();
    setStatus("Target saved.");
  } catch (error) {
    setStatus(error.message || "Target save failed.", "error");
  }
}

async function addManualMetricSample() {
  const metric = sampleMetric.value;
  const value = Number(sampleValue.value);
  const unit = sampleUnit.value.trim();
  const recordedAtInput = sampleRecordedAt.value;

  if (!Number.isFinite(value)) {
    setStatus("Enter a valid manual sample value.", "error");
    return;
  }

  const payload = {
    metric,
    value,
    unit: unit || undefined,
    recordedAt: recordedAtInput ? new Date(recordedAtInput).toISOString() : undefined
  };

  try {
    await api("/fitness/samples", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    sampleValue.value = "";
    sampleRecordedAt.value = "";
    await refreshDashboard();
    setStatus("Manual sample added.");
  } catch (error) {
    setStatus(error.message || "Could not add manual sample.", "error");
  }
}

async function addStrengthWorkout() {
  const metric = strengthLogMetric?.value || strengthMetric?.value || "squat_1rm";
  const value = Number(strengthLogValue?.value);
  const unit = strengthLogUnit?.value || metricUnit(metric);
  const recordedAtInput = strengthLogRecordedAt?.value || "";

  if (!Number.isFinite(value)) {
    setStatus("Enter a valid lift weight.", "error");
    return;
  }

  const payload = {
    metric,
    value,
    unit: unit || undefined,
    recordedAt: recordedAtInput ? new Date(recordedAtInput).toISOString() : undefined
  };

  try {
    await api("/fitness/samples", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    if (strengthLogValue) strengthLogValue.value = "";
    if (strengthLogRecordedAt) strengthLogRecordedAt.value = "";

    if (strengthMetric && strengthMetric.value !== metric) {
      strengthMetric.value = metric;
    }

    await Promise.all([refreshDashboard(), refreshStrengthHistory({ metric })]);
    setStatus(`${metricLabel(metric)} logged.`);
  } catch (error) {
    setStatus(error.message || "Could not add strength workout.", "error");
  }
}

async function bootAuthenticatedView() {
  authGate.classList.add("hidden");
  appPanel.classList.remove("hidden");
  userLabel.textContent = `${state.user.name} (${state.user.email})`;

  const [metrics, dashboard] = await Promise.all([api("/fitness/metrics"), api("/fitness/dashboard")]);
  state.metrics = metrics;
  state.dashboard = dashboard;

  populateMetricSelects();
  populateStrengthSelects();
  renderDashboard();
  await refreshStrengthHistory({ metric: strengthMetric?.value || state.strengthMetric, range: state.strengthRange }).catch(() => {});
}

async function restoreSession() {
  if (!state.token) {
    authGate.classList.remove("hidden");
    appPanel.classList.add("hidden");
    setStatus("No active session. Sign in from the finance page.", "warn");
    return;
  }

  try {
    state.user = await api("/auth/me");
    await bootAuthenticatedView();
    setStatus("Ready.");
  } catch (_error) {
    authGate.classList.remove("hidden");
    appPanel.classList.add("hidden");
    setStatus("Session expired. Sign in again from the finance page.", "warn");
  }
}

targetMetric.addEventListener("change", () => {
  targetUnit.value = metricUnit(targetMetric.value);
});

sampleMetric.addEventListener("change", () => {
  sampleUnit.value = metricUnit(sampleMetric.value);
});

strengthMetric?.addEventListener("change", async () => {
  const metric = strengthMetric.value;
  state.strengthMetric = metric;
  localStorage.setItem("fitness_strength_metric", metric);
  if (strengthLogMetric) {
    strengthLogMetric.value = metric;
  }
  await refreshStrengthHistory({ metric }).catch(() => {});
});

strengthLogMetric?.addEventListener("change", async () => {
  const metric = strengthLogMetric.value;
  state.strengthMetric = metric;
  localStorage.setItem("fitness_strength_metric", metric);
  if (strengthMetric) {
    strengthMetric.value = metric;
  }
  await refreshStrengthHistory({ metric }).catch(() => {});
});

strengthRangeButtons?.addEventListener("click", async (event) => {
  const button = event.target?.closest?.("button[data-range]");
  if (!button) return;
  const range = button.dataset.range;
  if (!range) return;

  state.strengthRange = range;
  localStorage.setItem("fitness_strength_range", range);
  await refreshStrengthHistory({ range }).catch(() => {});
});

syncButton.addEventListener("click", syncAppleHealth);
saveTarget.addEventListener("click", createOrUpdateTarget);
addSample.addEventListener("click", addManualMetricSample);
strengthLogAdd?.addEventListener("click", addStrengthWorkout);

window.addEventListener("resize", () => {
  if (!state.strengthHistory) {
    return;
  }

  const metric = strengthMetric?.value || state.strengthMetric;
  const points = state.strengthHistory?.points || [];
  const unit = state.strengthHistory?.unit || metricUnit(metric);
  drawMetricHistoryChart(strengthChart, metric, points, unit);
});

restoreSession();
