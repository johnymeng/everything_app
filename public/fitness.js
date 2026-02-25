import "./search.js";

const state = {
  token: localStorage.getItem("finance_tracker_token") || "",
  user: null,
  metrics: [],
  dashboard: null
};

const authGate = document.getElementById("authGate");
const appPanel = document.getElementById("appPanel");
const userLabel = document.getElementById("userLabel");
const connectionLabel = document.getElementById("connectionLabel");
const connectionBadge = document.getElementById("connectionBadge");
const syncButton = document.getElementById("syncButton");
const payloadInput = document.getElementById("payloadInput");
const latestGrid = document.getElementById("latestGrid");
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

async function bootAuthenticatedView() {
  authGate.classList.add("hidden");
  appPanel.classList.remove("hidden");
  userLabel.textContent = `${state.user.name} (${state.user.email})`;

  const [metrics, dashboard] = await Promise.all([api("/fitness/metrics"), api("/fitness/dashboard")]);
  state.metrics = metrics;
  state.dashboard = dashboard;

  populateMetricSelects();
  renderDashboard();
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

syncButton.addEventListener("click", syncAppleHealth);
saveTarget.addEventListener("click", createOrUpdateTarget);
addSample.addEventListener("click", addManualMetricSample);

restoreSession();
