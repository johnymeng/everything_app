import "./search.js";

const state = {
  token: localStorage.getItem("finance_tracker_token") || "",
  user: null,
  wealthMetric: localStorage.getItem("everything_dashboard_metric") || "netWorth",
  wealthRange: localStorage.getItem("everything_dashboard_range") || "1m",
  fitnessCatalog: null
};

const authPanel = document.getElementById("authPanel");
const appPanel = document.getElementById("appPanel");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const nameInput = document.getElementById("nameInput");
const registerButton = document.getElementById("registerButton");
const loginButton = document.getElementById("loginButton");
const logoutButton = document.getElementById("logoutButton");
const dashboardResetButton = document.getElementById("dashboardResetButton");
const userLabel = document.getElementById("userLabel");
const modeHint = document.getElementById("modeHint");
const statusText = document.getElementById("statusText");

const wealthMetricLabel = document.getElementById("wealthMetricLabel");
const wealthValue = document.getElementById("wealthValue");
const wealthDelta = document.getElementById("wealthDelta");
const wealthSubtitle = document.getElementById("wealthSubtitle");
const wealthMeta = document.getElementById("wealthMeta");
const wealthRefreshButton = document.getElementById("wealthRefreshButton");
const wealthMetricButtons = document.getElementById("wealthMetricButtons");
const wealthRangeButtons = document.getElementById("wealthRangeButtons");
const wealthChart = document.getElementById("wealthChart");

const financeSummaryCards = document.getElementById("financeSummaryCards");

const healthStatusTitle = document.getElementById("healthStatusTitle");
const healthStatusSubtitle = document.getElementById("healthStatusSubtitle");
const healthLatestGrid = document.getElementById("healthLatestGrid");
const healthInsights = document.getElementById("healthInsights");

const learningTitle = document.getElementById("learningTitle");
const learningSubtitle = document.getElementById("learningSubtitle");
const learningDueBadge = document.getElementById("learningDueBadge");
const learningInterestSelect = document.getElementById("learningInterestSelect");
const learningStartLink = document.getElementById("learningStartLink");

const photoStatusTitle = document.getElementById("photoStatusTitle");
const photoStatusSubtitle = document.getElementById("photoStatusSubtitle");
const photoDueBadge = document.getElementById("photoDueBadge");

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

  const response = await fetch(`/api${path}`, { ...options, headers });
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

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function reminderTimeTodayMs(timeString) {
  const [hh, mm] = String(timeString || "").split(":").map((v) => Number(v));
  const hour = Number.isFinite(hh) ? hh : 20;
  const minute = Number.isFinite(mm) ? mm : 0;
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  return target.getTime();
}

function maybeNotifyDailyPhoto(due, todayKey) {
  if (!due) return;

  const enabled = localStorage.getItem("everything_photos_reminder_enabled") === "true";
  const time = localStorage.getItem("everything_photos_reminder_time") || "20:00";
  if (!enabled) return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (Date.now() < reminderTimeTodayMs(time)) return;

  const notifiedKey = localStorage.getItem("everything_photos_last_notified_date") || "";
  if (notifiedKey === todayKey) return;

  localStorage.setItem("everything_photos_last_notified_date", todayKey);
  try {
    new Notification("Daily photo", { body: "Take your photo for today." });
  } catch (_error) {
    // ignore
  }
}

function renderPhotoPanel(photoPayload, todayKey) {
  const photos = Array.isArray(photoPayload?.photos) ? photoPayload.photos : photoPayload?.photo ? [photoPayload.photo] : [];
  const due = photos.length === 0;
  const countLabel = photos.length === 1 ? "1 photo" : `${photos.length} photos`;

  if (photoStatusTitle) {
    photoStatusTitle.textContent = due ? "Photo due today" : `${countLabel} today`;
  }

  if (photoStatusSubtitle) {
    photoStatusSubtitle.textContent = due ? `No photos saved for ${todayKey} yet.` : `Saved ${countLabel} for ${todayKey}.`;
  }

  if (photoDueBadge) {
    photoDueBadge.textContent = due ? "Due" : "Done";
    photoDueBadge.classList.toggle("warn", due);
    photoDueBadge.classList.toggle("good", !due);
  }

  maybeNotifyDailyPhoto(due, todayKey);
}

function setToken(token) {
  state.token = token;
  localStorage.setItem("finance_tracker_token", token);
}

function clearSession() {
  state.token = "";
  state.user = null;
  localStorage.removeItem("finance_tracker_token");

  authPanel.classList.remove("hidden");
  appPanel.classList.add("hidden");

  if (financeSummaryCards) {
    financeSummaryCards.innerHTML = "";
  }
  if (healthLatestGrid) {
    healthLatestGrid.innerHTML = "";
  }
  if (healthInsights) {
    healthInsights.innerHTML = "";
  }

  if (wealthValue) {
    wealthValue.textContent = "—";
  }
  if (wealthDelta) {
    wealthDelta.textContent = "—";
    wealthDelta.classList.remove("positive", "negative");
  }

  if (learningTitle) learningTitle.textContent = "Pick a 15-minute topic";
  if (learningSubtitle) learningSubtitle.textContent = "Set your focus area and start a quick session.";
  if (learningDueBadge) learningDueBadge.textContent = "0 due";
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

function formatDelta(amount, code = "CAD") {
  const numeric = Number(amount || 0);
  const prefix = numeric > 0 ? "+" : "";
  return `${prefix}${currency(numeric, code)}`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return "—";
  }
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

function metricDisplay(metric) {
  if (metric === "investments") return "Portfolio";
  if (metric === "totalAssets") return "Assets";
  return "Net worth";
}

function setSegmentedActive(container, attribute, value) {
  const buttons = container?.querySelectorAll(`button[data-${attribute}]`) || [];
  for (const button of buttons) {
    button.classList.toggle("active", button.dataset[attribute] === value);
  }
}

function drawWealthChart(canvas, points, code) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || canvas.width;
  const cssHeight = canvas.clientHeight || canvas.height;
  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);

  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);

  if (!points || points.length < 2) {
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.font = `${Math.round(13 * dpr)}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(points && points.length === 1 ? "Only 1 snapshot available." : "No snapshot history yet.", width / 2, height / 2);
    return;
  }

  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#18d18c";
  const border = getComputedStyle(document.documentElement).getPropertyValue("--border").trim() || "rgba(255,255,255,0.1)";
  const muted = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim() || "rgba(255,255,255,0.66)";
  const returnsColor = "rgba(255, 255, 255, 0.7)";

  const paddingLeft = Math.round(56 * dpr);
  const paddingRight = Math.round(52 * dpr);
  const paddingTop = Math.round(14 * dpr);
  const paddingBottom = Math.round(22 * dpr);

  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;

  const times = points.map((p) => Date.parse(p.capturedAt)).filter((t) => Number.isFinite(t));
  const values = points.map((p) => Number(p.value)).filter((v) => Number.isFinite(v));
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);

  const base = Number(points[0].value) || 0;
  const returns = points.map((p) => {
    const v = Number(p.value);
    const pct = base ? ((v - base) / base) * 100 : 0;
    return Number.isFinite(pct) ? pct : 0;
  });

  const minReturn = Math.min(...returns);
  const maxReturn = Math.max(...returns);

  const valueRange = maxValue - minValue || Math.max(1, Math.abs(maxValue) * 0.05);
  const yValueMin = minValue - valueRange * 0.08;
  const yValueMax = maxValue + valueRange * 0.12;

  const returnRange = maxReturn - minReturn || Math.max(1, Math.abs(maxReturn) * 0.25);
  const yReturnMin = minReturn - returnRange * 0.1;
  const yReturnMax = maxReturn + returnRange * 0.1;

  const xForTime = (time) => {
    if (maxTime === minTime) {
      return paddingLeft;
    }
    return paddingLeft + ((time - minTime) / (maxTime - minTime)) * plotWidth;
  };

  const yForValue = (value) => paddingTop + (1 - (value - yValueMin) / (yValueMax - yValueMin)) * plotHeight;
  const yForReturn = (pct) => paddingTop + (1 - (pct - yReturnMin) / (yReturnMax - yReturnMin)) * plotHeight;

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
  ctx.textBaseline = "middle";

  ctx.textAlign = "right";
  const leftValues = [yValueMax, (yValueMax + yValueMin) / 2, yValueMin];
  for (const value of leftValues) {
    const y = yForValue(value);
    ctx.fillText(currency(value, code), paddingLeft - Math.round(10 * dpr), y);
  }

  ctx.textAlign = "left";
  const rightValues = [yReturnMax, (yReturnMax + yReturnMin) / 2, yReturnMin];
  for (const pct of rightValues) {
    const y = yForReturn(pct);
    ctx.fillText(formatPercent(pct), width - paddingRight + Math.round(10 * dpr), y);
  }

  ctx.lineWidth = Math.max(2, Math.round(2 * dpr));
  ctx.strokeStyle = accent;
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = xForTime(Date.parse(point.capturedAt));
    const y = yForValue(Number(point.value));
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.globalAlpha = 0.12;
  ctx.fillStyle = accent;
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = xForTime(Date.parse(point.capturedAt));
    const y = yForValue(Number(point.value));
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(xForTime(maxTime), paddingTop + plotHeight);
  ctx.lineTo(xForTime(minTime), paddingTop + plotHeight);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = returnsColor;
  ctx.setLineDash([Math.round(6 * dpr), Math.round(6 * dpr)]);
  ctx.beginPath();
  returns.forEach((pct, index) => {
    const x = xForTime(Date.parse(points[index].capturedAt));
    const y = yForReturn(pct);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.setLineDash([]);
}

function renderFinanceCards(summary) {
  if (!financeSummaryCards) return;
  financeSummaryCards.innerHTML = "";

  const totals = summary?.totals;
  const code = "CAD";

  const cards = [
    {
      label: "Net worth",
      value: currency(totals?.netWorth ?? 0, code),
      hint: "Assets - liabilities"
    },
    {
      label: "Investments",
      value: currency(totals?.investments ?? 0, code),
      hint: "Holdings value"
    },
    {
      label: "Cash",
      value: currency(totals?.cashAndSavings ?? 0, code),
      hint: "Chequing + savings"
    },
    {
      label: "Debt",
      value: currency(totals?.debt ?? totals?.liabilities ?? 0, code),
      hint: "Loans + credit"
    }
  ];

  for (const card of cards) {
    const el = document.createElement("article");
    el.className = "card";
    el.innerHTML = `
      <div class="metric-label">${card.label}</div>
      <div class="metric-value">${card.value}</div>
      <div class="subtitle">${card.hint}</div>
    `;
    financeSummaryCards.appendChild(el);
  }
}

function formatMileSeconds(seconds) {
  const total = Number(seconds || 0);
  const minutes = Math.floor(total / 60);
  const remaining = (total - minutes * 60).toFixed(1).padStart(4, "0");
  return `${minutes}:${remaining}`;
}

function formatHealthValue(metric, value, unit) {
  const numeric = Number(value || 0);
  if (metric === "mile_time") {
    return `${formatMileSeconds(numeric)} min`;
  }

  const compact = numeric >= 1000 ? Math.round(numeric).toLocaleString() : numeric.toFixed(1).replace(/\.0$/, "");
  return `${compact} ${unit || ""}`.trim();
}

function healthMetricLabel(metric) {
  if (!state.fitnessCatalog) return metric;
  const hit = state.fitnessCatalog.find((item) => item.metric === metric);
  return hit?.label || metric;
}

function renderHealthDashboard(dashboard) {
  if (healthLatestGrid) {
    healthLatestGrid.innerHTML = "";
  }
  if (healthInsights) {
    healthInsights.innerHTML = "";
  }

  const connection = dashboard?.connection || null;
  const latest = dashboard?.latest || [];
  const insights = dashboard?.insights || [];

  if (!connection) {
    if (healthStatusTitle) healthStatusTitle.textContent = "Not synced yet";
    if (healthStatusSubtitle) healthStatusSubtitle.textContent = "Sync Apple Health samples from the Health page.";
  } else {
    const syncedAt = connection.lastSyncedAt ? new Date(connection.lastSyncedAt).toLocaleString() : "never";
    if (healthStatusTitle) healthStatusTitle.textContent = `Connected • last sync ${syncedAt}`;
    if (healthStatusSubtitle) healthStatusSubtitle.textContent = "Latest metrics from Apple Health payload sync.";
  }

  if (healthLatestGrid) {
    const items = latest.slice(0, 4);
    if (items.length === 0) {
      const empty = document.createElement("article");
      empty.className = "card";
      empty.innerHTML = `<div class="subtitle">No health samples yet. Open Health and sync your payload.</div>`;
      healthLatestGrid.appendChild(empty);
    } else {
      for (const sample of items) {
        const card = document.createElement("article");
        card.className = "card";
        card.innerHTML = `
          <div class="metric-label">${healthMetricLabel(sample.metric)}</div>
          <div class="metric-value">${formatHealthValue(sample.metric, sample.value, sample.unit)}</div>
          <div class="subtitle">${new Date(sample.recordedAt).toLocaleDateString()}</div>
        `;
        healthLatestGrid.appendChild(card);
      }
    }
  }

  if (healthInsights) {
    const lines = (insights || []).slice(0, 2);
    if (lines.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No insights yet. Sync more health samples to unlock trend detection.";
      healthInsights.appendChild(li);
    } else {
      for (const line of lines) {
        const li = document.createElement("li");
        li.textContent = line;
        healthInsights.appendChild(li);
      }
    }
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
      setStatus(`Reset incomplete (remaining rows: ${remainingTotal}).`, true);
      return;
    }

    await refreshDashboard();
    setStatus("All data reset to 0.");
  } catch (error) {
    setStatus(error.message || "Reset failed.", true);
  }
}

async function refreshWealthChart(options = {}) {
  if (!state.token || !wealthChart) return;

  const metric = options.metric || state.wealthMetric || "netWorth";
  const range = options.range || state.wealthRange || "1m";

  setSegmentedActive(wealthMetricButtons, "metric", metric);
  setSegmentedActive(wealthRangeButtons, "range", range);

  try {
    if (wealthMeta) wealthMeta.textContent = "Loading history...";
    if (wealthMetricLabel) wealthMetricLabel.textContent = metricDisplay(metric);
    if (wealthValue) wealthValue.textContent = "—";
    if (wealthDelta) {
      wealthDelta.textContent = "—";
      wealthDelta.classList.remove("positive", "negative");
    }

    const history = await api(`/portfolio/history?metric=${encodeURIComponent(metric)}&range=${encodeURIComponent(range)}&maxPoints=500`);
    const code = history.currency || "CAD";
    const points = history.points || [];

    drawWealthChart(wealthChart, points, code);

    if (wealthSubtitle) {
      wealthSubtitle.textContent = `${metricDisplay(metric)} (${code}) value + return % from snapshots.`;
    }

    if (points.length === 0) {
      if (wealthMeta) wealthMeta.textContent = "No snapshots yet. Sync or import on the Finance page to record one.";
      return;
    }

    const first = points[0];
    const last = points[points.length - 1];
    const delta = Number(last.value) - Number(first.value);
    const pct = first.value ? (delta / Number(first.value)) * 100 : 0;

    if (wealthValue) {
      wealthValue.textContent = currency(last.value, code);
    }

    if (wealthDelta) {
      wealthDelta.textContent = `${formatDelta(delta, code)} (${formatPercent(pct)})`;
      wealthDelta.classList.toggle("positive", delta > 0);
      wealthDelta.classList.toggle("negative", delta < 0);
    }

    const capturedAt = last.capturedAt ? new Date(last.capturedAt) : null;
    const capturedLabel = capturedAt && !Number.isNaN(capturedAt.getTime()) ? capturedAt.toLocaleString() : "unknown";
    const pointLabel = points.length === 1 ? "1 snapshot" : `${points.length} snapshots`;
    if (wealthMeta) wealthMeta.textContent = `As of ${capturedLabel} • ${pointLabel}`;
  } catch (error) {
    if (wealthMeta) wealthMeta.textContent = error.message || "Failed to load portfolio history.";
    wealthMeta?.classList.add("warn");
  }
}

async function refreshDashboard() {
  if (!state.token) return;
  setStatus("Loading dashboard...");

  try {
    const todayKey = formatDateKey(new Date());
    const [me, summary, catalog, health, learning, todayPhoto] = await Promise.all([
      api("/auth/me"),
      api("/summary"),
      api("/fitness/metrics"),
      api("/fitness/dashboard"),
      api("/learning/dashboard"),
      api(`/photos/by-date/${encodeURIComponent(todayKey)}`)
    ]);

    state.user = me;
    state.fitnessCatalog = catalog;

    if (userLabel) {
      const name = me?.name || me?.email || "Authenticated";
      userLabel.textContent = name;
    }
    if (modeHint) {
      modeHint.textContent = "Dashboard pulls finance + health summaries.";
    }

    renderFinanceCards(summary);
    renderHealthDashboard(health);
    renderLearningPanel(learning);
    renderPhotoPanel(todayPhoto, todayKey);

    authPanel.classList.add("hidden");
    appPanel.classList.remove("hidden");

    // Ensure canvas layout is measurable before first chart draw.
    await new Promise((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });

    await refreshWealthChart({ metric: state.wealthMetric, range: state.wealthRange });

    setStatus("Dashboard ready.");
  } catch (error) {
    if (String(error.message || "").toLowerCase().includes("jwt")) {
      clearSession();
      setStatus("Session expired. Please sign in again.", true);
      return;
    }

    setStatus(error.message || "Failed to load dashboard.", true);
  }
}

function renderLearningPanel(learning) {
  if (!learning) {
    if (learningTitle) learningTitle.textContent = "Pick a 15-minute topic";
    if (learningSubtitle) learningSubtitle.textContent = "Open Learning to get started.";
    if (learningDueBadge) learningDueBadge.textContent = "0 due";
    return;
  }

  const suggestion = learning.suggestion?.topic;
  if (learningTitle) learningTitle.textContent = suggestion?.title || "Pick a 15-minute topic";
  if (learningSubtitle) {
    const dueCount = Number(learning.dueCount || 0);
    const kind = learning.suggestion?.kind === "new" ? "New topic" : "Review";
    learningSubtitle.textContent = `${kind} • ${dueCount} due`;
  }
  if (learningDueBadge) {
    const dueCount = Number(learning.dueCount || 0);
    learningDueBadge.textContent = `${dueCount} due`;
  }
  if (learningInterestSelect && learning.preference?.interestArea) {
    learningInterestSelect.value = learning.preference.interestArea;
  }
  if (learningStartLink) {
    learningStartLink.href = "/learning.html";
  }
}

registerButton?.addEventListener("click", async () => {
  try {
    setStatus("Registering...");
    const result = await api(
      "/auth/register",
      {
        method: "POST",
        body: JSON.stringify({
          email: emailInput.value,
          password: passwordInput.value,
          name: nameInput.value
        })
      },
      false
    );
    setToken(result.token);
    await refreshDashboard();
  } catch (error) {
    setStatus(error.message || "Could not register.", true);
  }
});

loginButton?.addEventListener("click", async () => {
  try {
    setStatus("Logging in...");
    const result = await api(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({
          email: emailInput.value,
          password: passwordInput.value
        })
      },
      false
    );
    setToken(result.token);
    await refreshDashboard();
  } catch (error) {
    setStatus(error.message || "Could not log in.", true);
  }
});

logoutButton?.addEventListener("click", () => {
  clearSession();
  setStatus("Logged out.");
});

dashboardResetButton?.addEventListener("click", resetAllData);

learningInterestSelect?.addEventListener("change", async () => {
  if (!state.token) return;
  try {
    setStatus("Saving learning focus...");
    await api("/learning/preferences", {
      method: "PUT",
      body: JSON.stringify({ interestArea: learningInterestSelect.value })
    });
    await refreshDashboard();
  } catch (error) {
    setStatus(error.message || "Could not save learning focus.", true);
  }
});

wealthRefreshButton?.addEventListener("click", async () => {
  await refreshWealthChart();
});

wealthMetricButtons?.addEventListener("click", async (event) => {
  const button = event.target?.closest?.("button[data-metric]");
  if (!button) return;
  const metric = button.dataset.metric || "netWorth";
  state.wealthMetric = metric;
  localStorage.setItem("everything_dashboard_metric", metric);
  await refreshWealthChart({ metric });
});

wealthRangeButtons?.addEventListener("click", async (event) => {
  const button = event.target?.closest?.("button[data-range]");
  if (!button) return;
  const range = button.dataset.range || "1m";
  state.wealthRange = range;
  localStorage.setItem("everything_dashboard_range", range);
  await refreshWealthChart({ range });
});

window.addEventListener("resize", () => {
  if (!state.token) return;
  refreshWealthChart().catch(() => {});
});

(async () => {
  if (!state.token) {
    clearSession();
    setStatus("Ready.");
    setSegmentedActive(wealthMetricButtons, "metric", state.wealthMetric);
    setSegmentedActive(wealthRangeButtons, "range", state.wealthRange);
    return;
  }

  await refreshDashboard();
})();
