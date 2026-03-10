import "./search.js";

const STORAGE_KEY = "everything_watch_accuracy_v1";

const elements = {
  statusText: document.getElementById("statusText"),
  watchSearchInput: document.getElementById("watchSearchInput"),
  watchCountBadge: document.getElementById("watchCountBadge"),
  watchList: document.getElementById("watchList"),
  watchListEmpty: document.getElementById("watchListEmpty"),
  newWatchNameInput: document.getElementById("newWatchNameInput"),
  addWatchButton: document.getElementById("addWatchButton"),

  selectedWatchTitle: document.getElementById("selectedWatchTitle"),
  selectedWatchSubtitle: document.getElementById("selectedWatchSubtitle"),
  renameWatchButton: document.getElementById("renameWatchButton"),
  deleteWatchButton: document.getElementById("deleteWatchButton"),
  watchSummaryCards: document.getElementById("watchSummaryCards"),

  markTwelveButton: document.getElementById("markTwelveButton"),
  pendingReadingPanel: document.getElementById("pendingReadingPanel"),
  referenceTimeLabel: document.getElementById("referenceTimeLabel"),
  useNowButton: document.getElementById("useNowButton"),
  hourDownButton: document.getElementById("hourDownButton"),
  hourUpButton: document.getElementById("hourUpButton"),
  hourInput: document.getElementById("hourInput"),
  minuteDownButton: document.getElementById("minuteDownButton"),
  minuteUpButton: document.getElementById("minuteUpButton"),
  minuteInput: document.getElementById("minuteInput"),
  watchTimePreview: document.getElementById("watchTimePreview"),
  saveReadingButton: document.getElementById("saveReadingButton"),
  cancelReadingButton: document.getElementById("cancelReadingButton"),

  watchRateChart: document.getElementById("watchRateChart"),
  watchChartMeta: document.getElementById("watchChartMeta"),

  logsBody: document.getElementById("logsBody"),
  logsEmptyState: document.getElementById("logsEmptyState"),
  clearAllLogsButton: document.getElementById("clearAllLogsButton")
};

const uiState = {
  pendingReferenceTimeMs: null
};

function setStatus(message, kind = "info") {
  if (!elements.statusText) return;
  elements.statusText.textContent = message;
  elements.statusText.classList.toggle("error", kind === "error");
  elements.statusText.classList.toggle("warn", kind === "warn");
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, n));
}

function hour24ToHour12(hour24) {
  const h = ((Number(hour24) % 24) + 24) % 24;
  const h12 = h % 12;
  return h12 === 0 ? 12 : h12;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatWatchTime(hour12, minute) {
  return `${hour12}:${pad2(minute)}`;
}

function formatDateTime(ms) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function formatShortDateTime(ms) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatSignedNumber(value, decimals = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${Math.abs(n).toFixed(decimals)}`;
}

function formatSignedSeconds(seconds, decimals = 1, suffix = "s") {
  const n = Number(seconds);
  if (!Number.isFinite(n)) return "—";
  return `${formatSignedNumber(n, decimals)} ${suffix}`.trim();
}

function buildWatchCandidates(referenceTimeMs, hour12, minute) {
  const base = new Date(referenceTimeMs);
  if (Number.isNaN(base.getTime())) {
    return [];
  }

  const h = clampInt(hour12, 1, 12, 12);
  const m = clampInt(minute, 0, 59, 0);
  const baseHour = h % 12;

  const hours24 = [baseHour, baseHour + 12];
  const candidates = [];
  const dayMs = 24 * 60 * 60 * 1000;

  for (const hour24 of hours24) {
    const candidate = new Date(referenceTimeMs);
    candidate.setHours(hour24, m, 0, 0);
    const t = candidate.getTime();
    candidates.push(t, t - dayMs, t + dayMs);
  }

  return Array.from(new Set(candidates)).filter((t) => Number.isFinite(t));
}

function resolveWatchTime(referenceTimeMs, hour12, minute, previousOffsetMs) {
  const candidates = buildWatchCandidates(referenceTimeMs, hour12, minute);
  if (candidates.length === 0) {
    return { resolvedWatchTimeMs: referenceTimeMs, offsetMs: 0 };
  }

  const targetOffset = Number.isFinite(previousOffsetMs) ? previousOffsetMs : null;
  let best = candidates[0];
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidateMs of candidates) {
    const offsetMs = candidateMs - referenceTimeMs;
    const score = targetOffset === null ? Math.abs(offsetMs) : Math.abs(offsetMs - targetOffset);
    if (score < bestScore) {
      bestScore = score;
      best = candidateMs;
    }
  }

  return { resolvedWatchTimeMs: best, offsetMs: best - referenceTimeMs };
}

function resizeCanvasToDisplaySize(canvas) {
  if (!canvas) return false;
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

function drawRateChart(canvas, series) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  resizeCanvasToDisplaySize(canvas);
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const style = getComputedStyle(document.documentElement);
  const border = style.getPropertyValue("--border").trim() || "rgba(255,255,255,0.12)";
  const muted = style.getPropertyValue("--muted").trim() || "rgba(255,255,255,0.66)";
  const accent = style.getPropertyValue("--accent").trim() || "#18d18c";
  const danger = style.getPropertyValue("--danger").trim() || "#ff6b60";

  const dpr = window.devicePixelRatio || 1;

  if (!series || series.length === 0) {
    ctx.fillStyle = muted;
    ctx.font = `${Math.round(13 * dpr)}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Add at least two readings.", width / 2, height / 2);
    return;
  }

  const rates = series.map((p) => Number(p.rateSecPerDay)).filter((n) => Number.isFinite(n));
  const maxAbs = Math.max(1, ...rates.map((n) => Math.abs(n)));
  const yMax = maxAbs * 1.15;
  const yMin = -yMax;

  const paddingLeft = Math.round(54 * dpr);
  const paddingRight = Math.round(14 * dpr);
  const paddingTop = Math.round(16 * dpr);
  const paddingBottom = Math.round(34 * dpr);

  const plotWidth = Math.max(1, width - paddingLeft - paddingRight);
  const plotHeight = Math.max(1, height - paddingTop - paddingBottom);

  const yForRate = (rate) => paddingTop + (1 - (rate - yMin) / (yMax - yMin)) * plotHeight;
  const baselineY = yForRate(0);

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

  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = Math.max(1, Math.round(1.25 * dpr));
  ctx.beginPath();
  ctx.moveTo(paddingLeft, baselineY);
  ctx.lineTo(width - paddingRight, baselineY);
  ctx.stroke();

  const labelFontSize = Math.round(11 * dpr);
  ctx.font = `${labelFontSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = muted;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  const labelValues = [yMax, 0, yMin];
  for (const value of labelValues) {
    const y = yForRate(value);
    ctx.fillText(`${formatSignedNumber(value, 0)} s/d`, paddingLeft - Math.round(10 * dpr), y);
  }

  const n = series.length;
  const band = plotWidth / n;
  const barWidth = Math.max(3 * dpr, band * 0.68);
  const radius = Math.round(6 * dpr);

  for (let i = 0; i < n; i += 1) {
    const rate = Number(series[i].rateSecPerDay) || 0;
    const x = paddingLeft + i * band + (band - barWidth) / 2;
    const y = yForRate(rate);
    const top = rate >= 0 ? y : baselineY;
    const bottom = rate >= 0 ? baselineY : y;
    const h = Math.max(1, bottom - top);

    ctx.fillStyle = rate >= 0 ? accent : danger;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      const r = Math.min(radius, barWidth / 2, h / 2);
      ctx.roundRect(x, top, barWidth, h, r);
    } else {
      ctx.rect(x, top, barWidth, h);
    }
    ctx.fill();
  }

  ctx.fillStyle = muted;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const labelEvery = n <= 8 ? 1 : n <= 16 ? 2 : n <= 28 ? 3 : 4;
  for (let i = 0; i < n; i += labelEvery) {
    const label = String(series[i].label || "");
    const x = paddingLeft + i * band + band / 2;
    ctx.fillText(label, x, paddingTop + plotHeight + Math.round(10 * dpr));
  }
}

function emptyStore() {
  return {
    version: 1,
    selectedWatchId: "",
    watches: []
  };
}

function normalizeStore(store) {
  const safe = store && typeof store === "object" ? store : emptyStore();
  const watches = Array.isArray(safe.watches) ? safe.watches : [];

  return {
    version: 1,
    selectedWatchId: typeof safe.selectedWatchId === "string" ? safe.selectedWatchId : "",
    watches: watches
      .map((watch) => {
        const w = watch && typeof watch === "object" ? watch : {};
        const logs = Array.isArray(w.logs) ? w.logs : [];
        return {
          id: typeof w.id === "string" && w.id ? w.id : createId(),
          name: typeof w.name === "string" && w.name.trim() ? w.name.trim() : "Untitled watch",
          createdAt: Number.isFinite(w.createdAt) ? w.createdAt : Date.now(),
	          logs: logs
	            .map((log) => {
	              const l = log && typeof log === "object" ? log : {};
	              const recordedAt = Number(l.recordedAt);
	              const watchHour12 = clampInt(l.watchHour12, 1, 12, 12);
	              const watchMinute = clampInt(l.watchMinute, 0, 59, 0);
	              const resolvedWatchTimeMs = Number(l.resolvedWatchTimeMs);
	              const offsetMs = Number(l.offsetMs);
	              const isBase = Boolean(l.isBase);
	              return {
	                id: typeof l.id === "string" && l.id ? l.id : createId(),
	                recordedAt: Number.isFinite(recordedAt) ? recordedAt : Date.now(),
	                watchHour12,
	                watchMinute,
	                resolvedWatchTimeMs: Number.isFinite(resolvedWatchTimeMs) ? resolvedWatchTimeMs : null,
	                offsetMs: Number.isFinite(offsetMs) ? offsetMs : null,
	                isBase
	              };
	            })
	            .filter((l) => Number.isFinite(l.recordedAt))
	        };
      })
      .filter((w) => typeof w.id === "string" && w.id)
  };
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw);
    return normalizeStore(parsed);
  } catch (_error) {
    return emptyStore();
  }
}

function saveStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

let store = loadStore();

function getSelectedWatch() {
  const id = store.selectedWatchId;
  if (!id) return null;
  return store.watches.find((w) => w.id === id) || null;
}

function ensureSelection() {
  const selected = getSelectedWatch();
  if (selected) return;

  if (store.watches.length > 0) {
    store.selectedWatchId = store.watches[0].id;
    saveStore(store);
  } else {
    store.selectedWatchId = "";
  }
}

function computeIntervals(logsSortedAsc) {
  const intervals = [];
  for (let i = 1; i < logsSortedAsc.length; i += 1) {
    const prev = logsSortedAsc[i - 1];
    const next = logsSortedAsc[i];
    if (next.isBase) {
      continue;
    }
    const elapsedMs = next.recordedAt - prev.recordedAt;
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
      continue;
    }
    const deltaOffsetMs = (next.offsetMs ?? 0) - (prev.offsetMs ?? 0);
    const rateSecPerDay = (deltaOffsetMs * 86400) / elapsedMs;
    intervals.push({
      logId: next.id,
      recordedAt: next.recordedAt,
      label: new Date(next.recordedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      rateSecPerDay
    });
  }
  return intervals;
}

function computeSummary(logsSortedAsc) {
  const count = logsSortedAsc.length;
  const latest = count ? logsSortedAsc[count - 1] : null;

  let activeStartIndex = 0;
  for (let i = logsSortedAsc.length - 1; i >= 1; i -= 1) {
    if (logsSortedAsc[i].isBase) {
      activeStartIndex = i;
      break;
    }
  }

  const activeLogs = logsSortedAsc.slice(activeStartIndex);
  const activeCount = activeLogs.length;
  const baseline = activeCount ? activeLogs[0] : null;
  const baselineRecordedAt = baseline ? baseline.recordedAt : null;
  const baselineIsExplicit = Boolean(baseline?.isBase);

  const latestOffsetSec = latest && Number.isFinite(latest.offsetMs) ? latest.offsetMs / 1000 : null;
  const intervals = computeIntervals(logsSortedAsc);
  const activeIntervals = computeIntervals(activeLogs);
  const latestRate = activeIntervals.length ? activeIntervals[activeIntervals.length - 1].rateSecPerDay : null;

  let avgRate = null;
  if (activeCount >= 2 && baseline) {
    const activeLatest = activeLogs[activeCount - 1];
    const elapsedMs = activeLatest.recordedAt - baseline.recordedAt;
    if (elapsedMs > 0 && Number.isFinite(baseline.offsetMs) && Number.isFinite(activeLatest.offsetMs)) {
      avgRate = ((activeLatest.offsetMs - baseline.offsetMs) * 86400) / elapsedMs;
    }
  }

  return {
    count,
    activeCount,
    baselineRecordedAt,
    baselineIsExplicit,
    latestOffsetSec,
    latestRateSecPerDay: latestRate,
    avgRateSecPerDay: avgRate,
    intervals,
    activeIntervals
  };
}

function setPendingReadingVisible(visible) {
  if (!elements.pendingReadingPanel) return;
  elements.pendingReadingPanel.classList.toggle("hidden", !visible);
}

function setMarkButtonEnabled(enabled) {
  if (!elements.markTwelveButton) return;
  elements.markTwelveButton.disabled = !enabled;
}

function updateWatchTimePreview() {
  if (!elements.watchTimePreview) return;
  const hour12 = clampInt(elements.hourInput?.value, 1, 12, 12);
  const minute = clampInt(elements.minuteInput?.value, 0, 59, 0);
  elements.watchTimePreview.textContent = formatWatchTime(hour12, minute);
}

function setSuggestedTimeFromDate(date) {
  const d = date instanceof Date ? date : new Date();
  if (elements.hourInput) {
    elements.hourInput.value = String(hour24ToHour12(d.getHours()));
  }
  if (elements.minuteInput) {
    elements.minuteInput.value = String(d.getMinutes());
  }
  updateWatchTimePreview();
}

function adjustHour(delta) {
  const current = clampInt(elements.hourInput?.value, 1, 12, 12);
  let next = current + delta;
  while (next < 1) next += 12;
  while (next > 12) next -= 12;
  if (elements.hourInput) {
    elements.hourInput.value = String(next);
  }
  updateWatchTimePreview();
}

function adjustMinute(delta) {
  const currentMinute = clampInt(elements.minuteInput?.value, 0, 59, 0);
  const currentHour = clampInt(elements.hourInput?.value, 1, 12, 12);
  let minute = currentMinute + delta;
  let hour = currentHour;

  while (minute < 0) {
    minute += 60;
    hour -= 1;
  }
  while (minute > 59) {
    minute -= 60;
    hour += 1;
  }

  while (hour < 1) hour += 12;
  while (hour > 12) hour -= 12;

  if (elements.minuteInput) elements.minuteInput.value = String(minute);
  if (elements.hourInput) elements.hourInput.value = String(hour);
  updateWatchTimePreview();
}

function renderSummaryCards(watch, summary) {
  if (!elements.watchSummaryCards) return;
  elements.watchSummaryCards.innerHTML = "";

  const baseLabel = summary.baselineIsExplicit ? "Base" : "Start";
  const baseValue = summary.baselineRecordedAt === null ? "—" : formatShortDateTime(summary.baselineRecordedAt);
  const startToEndHint = summary.baselineIsExplicit ? "Base → latest reading" : "First → latest reading";
  const readingsHint = summary.baselineIsExplicit
    ? `Total logs • ${summary.activeCount} since base`
    : "Total logs for this watch";

  const cards = [
    {
      label: baseLabel,
      value: baseValue,
      hint: "Stats use readings after this"
    },
    {
      label: "Latest offset",
      value: summary.latestOffsetSec === null ? "—" : formatSignedSeconds(summary.latestOffsetSec, 1),
      hint: "Positive means watch is ahead"
    },
    {
      label: "Latest rate",
      value: summary.latestRateSecPerDay === null ? "—" : formatSignedSeconds(summary.latestRateSecPerDay, 1, "s/day"),
      hint: summary.baselineIsExplicit ? "Between last two readings (since base)" : "Between last two readings"
    },
    {
      label: "Average rate",
      value: summary.avgRateSecPerDay === null ? "—" : formatSignedSeconds(summary.avgRateSecPerDay, 1, "s/day"),
      hint: startToEndHint
    },
    {
      label: "Readings",
      value: String(summary.count),
      hint: readingsHint
    }
  ];

  for (const card of cards) {
    const el = document.createElement("article");
    el.className = "card";
    const label = document.createElement("div");
    label.className = "metric-label";
    label.textContent = card.label;
    const value = document.createElement("div");
    value.className = "metric-value";
    value.textContent = card.value;
    const hint = document.createElement("div");
    hint.className = "subtitle";
    hint.textContent = card.hint;
    el.append(label, value, hint);
    elements.watchSummaryCards.appendChild(el);
  }
}

function renderLogsTable(logsSortedAsc) {
  if (!elements.logsBody) return;
  elements.logsBody.innerHTML = "";

  const intervals = computeIntervals(logsSortedAsc);
  const rateByLogId = new Map(intervals.map((i) => [i.logId, i.rateSecPerDay]));

  for (let index = logsSortedAsc.length - 1; index >= 0; index -= 1) {
    const log = logsSortedAsc[index];
    const tr = document.createElement("tr");

    const recorded = document.createElement("td");
    recorded.textContent = formatDateTime(log.recordedAt);

    const watchTime = document.createElement("td");
    watchTime.textContent = formatWatchTime(log.watchHour12, log.watchMinute);

    const offset = document.createElement("td");
    const offsetSec = Number.isFinite(log.offsetMs) ? log.offsetMs / 1000 : null;
    offset.textContent = offsetSec === null ? "—" : formatSignedSeconds(offsetSec, 1);

    const rate = document.createElement("td");
    if (log.isBase) {
      rate.textContent = "Base";
    } else {
      const r = rateByLogId.get(log.id);
      rate.textContent = Number.isFinite(r) ? formatSignedSeconds(r, 1, "s/day") : "—";
    }

    const actions = document.createElement("td");
    actions.style.textAlign = "right";

    const toggleBase = document.createElement("button");
    toggleBase.type = "button";
    toggleBase.className = `compact${log.isBase ? " primary" : ""}`;
    toggleBase.textContent = log.isBase ? "Base ✓" : "Set base";
    toggleBase.title = "Start a new accuracy segment from this reading.";
    toggleBase.addEventListener("click", () => toggleBaseLogById(log.id));

    const del = document.createElement("button");
    del.type = "button";
    del.className = "compact danger";
    del.textContent = "Delete";
    del.addEventListener("click", () => deleteLogById(log.id));

    const actionRow = document.createElement("div");
    actionRow.className = "row";
    actionRow.style.justifyContent = "flex-end";
    actionRow.style.gap = "8px";
    actionRow.append(toggleBase, del);
    actions.appendChild(actionRow);

    tr.append(recorded, watchTime, offset, rate, actions);
    elements.logsBody.appendChild(tr);
  }

  if (elements.logsEmptyState) {
    elements.logsEmptyState.classList.toggle("hidden", logsSortedAsc.length > 0);
  }
}

function renderSelectedWatch() {
  ensureSelection();
  const watch = getSelectedWatch();

  const hasWatch = Boolean(watch);
  if (elements.renameWatchButton) elements.renameWatchButton.classList.toggle("hidden", !hasWatch);
  if (elements.deleteWatchButton) elements.deleteWatchButton.classList.toggle("hidden", !hasWatch);
  if (elements.clearAllLogsButton) elements.clearAllLogsButton.classList.toggle("hidden", !hasWatch || (watch?.logs?.length || 0) === 0);

  if (!watch) {
    if (elements.selectedWatchTitle) elements.selectedWatchTitle.textContent = "No watch selected";
    if (elements.selectedWatchSubtitle) elements.selectedWatchSubtitle.textContent = "Create a watch on the right to start tracking.";
    if (elements.watchSummaryCards) elements.watchSummaryCards.innerHTML = "";
    renderLogsTable([]);
    drawRateChart(elements.watchRateChart, []);
    if (elements.watchChartMeta) elements.watchChartMeta.textContent = "Add at least two readings to see performance.";
    setMarkButtonEnabled(false);
    setPendingReadingVisible(false);
    return;
  }

  if (elements.selectedWatchTitle) elements.selectedWatchTitle.textContent = watch.name;

  setMarkButtonEnabled(uiState.pendingReferenceTimeMs === null);

  const logsSortedAsc = [...watch.logs].sort((a, b) => a.recordedAt - b.recordedAt);
  const summary = computeSummary(logsSortedAsc);
  if (elements.selectedWatchSubtitle) {
    const totalLabel = summary.count === 1 ? "1 reading" : `${summary.count} readings`;
    const segmentNote = summary.baselineIsExplicit ? ` • ${summary.activeCount} since base` : "";
    elements.selectedWatchSubtitle.textContent = `${totalLabel}${segmentNote} • Local-only tracking`;
  }
  renderSummaryCards(watch, summary);

  const chartIntervals = summary.activeIntervals || [];
  drawRateChart(elements.watchRateChart, chartIntervals);
  if (elements.watchChartMeta) {
    elements.watchChartMeta.textContent =
      chartIntervals.length === 0
        ? summary.baselineIsExplicit
          ? "Add at least two readings after the current base to see performance."
          : "Add at least two readings to see performance."
        : `${chartIntervals.length} interval${chartIntervals.length === 1 ? "" : "s"} • scale ±${Math.max(
            1,
            ...chartIntervals.map((i) => Math.abs(i.rateSecPerDay))
          ).toFixed(0)} s/day`;
  }

  renderLogsTable(logsSortedAsc);
}

function renderWatchList() {
  if (!elements.watchList) return;
  elements.watchList.innerHTML = "";

  const query = normalize(elements.watchSearchInput?.value || "");
  const watches = store.watches;
  const visible = query ? watches.filter((w) => normalize(w.name).includes(query)) : watches;

  if (elements.watchCountBadge) {
    elements.watchCountBadge.textContent = String(watches.length);
  }

  if (elements.watchListEmpty) {
    if (watches.length === 0) {
      elements.watchListEmpty.textContent = "No watches yet.";
      elements.watchListEmpty.classList.remove("hidden");
    } else if (visible.length === 0) {
      elements.watchListEmpty.textContent = "No watches match your search.";
      elements.watchListEmpty.classList.remove("hidden");
    } else {
      elements.watchListEmpty.classList.add("hidden");
    }
  }

  for (const watch of visible) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `selection-item${watch.id === store.selectedWatchId ? " active" : ""}`;

    const main = document.createElement("div");
    main.className = "selection-item-main";

    const title = document.createElement("div");
    title.className = "selection-item-title";
    title.textContent = watch.name;

    const subtitle = document.createElement("div");
    subtitle.className = "selection-item-subtitle";
    const count = watch.logs.length;
    subtitle.textContent = `${count} reading${count === 1 ? "" : "s"}`;

    main.append(title, subtitle);

    const tail = document.createElement("div");
    tail.className = "selection-item-tail";

    const logsSortedAsc = [...watch.logs].sort((a, b) => a.recordedAt - b.recordedAt);
    const summary = computeSummary(logsSortedAsc);
    if (Number.isFinite(summary.latestRateSecPerDay)) {
      const badge = document.createElement("span");
      const abs = Math.abs(summary.latestRateSecPerDay);
      badge.className = `badge ${abs <= 2 ? "good" : abs <= 10 ? "warn" : "error"}`;
      badge.textContent = `${formatSignedNumber(summary.latestRateSecPerDay, 1)} s/day`;
      tail.appendChild(badge);
    }

    button.append(main, tail);
    button.addEventListener("click", () => {
      store.selectedWatchId = watch.id;
      uiState.pendingReferenceTimeMs = null;
      setPendingReadingVisible(false);
      saveStore(store);
      render();
    });

    elements.watchList.appendChild(button);
  }
}

function render() {
  renderWatchList();
  renderSelectedWatch();
}

function addWatch(name) {
  const trimmed = String(name || "").trim();
  const finalName = trimmed || `Watch ${store.watches.length + 1}`;
  const watch = {
    id: createId(),
    name: finalName,
    createdAt: Date.now(),
    logs: []
  };
  store.watches.unshift(watch);
  store.selectedWatchId = watch.id;
  if (elements.watchSearchInput) {
    elements.watchSearchInput.value = "";
  }
  saveStore(store);
  if (elements.newWatchNameInput) {
    elements.newWatchNameInput.value = "";
  }
  setStatus(`Added “${finalName}”.`);
  render();
}

function renameSelectedWatch() {
  const watch = getSelectedWatch();
  if (!watch) return;
  const next = window.prompt("Rename watch", watch.name);
  if (next === null) return;
  const trimmed = next.trim();
  if (!trimmed) {
    setStatus("Watch name cannot be empty.", "warn");
    return;
  }
  watch.name = trimmed;
  saveStore(store);
  setStatus("Renamed watch.");
  render();
}

function deleteSelectedWatch() {
  const watch = getSelectedWatch();
  if (!watch) return;
  const ok = window.confirm(`Delete “${watch.name}” and all of its readings? This cannot be undone.`);
  if (!ok) return;

  store.watches = store.watches.filter((w) => w.id !== watch.id);
  store.selectedWatchId = store.watches[0]?.id || "";
  uiState.pendingReferenceTimeMs = null;
  setPendingReadingVisible(false);
  saveStore(store);
  setStatus("Deleted watch.");
  render();
}

function clearAllLogs() {
  const watch = getSelectedWatch();
  if (!watch) return;
  if (watch.logs.length === 0) return;
  const ok = window.confirm(`Clear all readings for “${watch.name}”? This cannot be undone.`);
  if (!ok) return;
  watch.logs = [];
  uiState.pendingReferenceTimeMs = null;
  setPendingReadingVisible(false);
  saveStore(store);
  setStatus("Cleared readings.");
  render();
}

function deleteLogById(logId) {
  const watch = getSelectedWatch();
  if (!watch) return;
  const hit = watch.logs.find((l) => l.id === logId);
  if (!hit) return;
  const ok = window.confirm("Delete this reading?");
  if (!ok) return;
  watch.logs = watch.logs.filter((l) => l.id !== logId);
  saveStore(store);
  setStatus("Deleted reading.");
  render();
}

function toggleBaseLogById(logId) {
  const watch = getSelectedWatch();
  if (!watch) return;
  const hit = watch.logs.find((l) => l.id === logId);
  if (!hit) return;
  hit.isBase = !Boolean(hit.isBase);
  saveStore(store);
  setStatus(hit.isBase ? "Set base reading." : "Removed base reading.");
  render();
}

function startPendingReading() {
  const watch = getSelectedWatch();
  if (!watch) return;

  uiState.pendingReferenceTimeMs = Date.now();
  if (elements.referenceTimeLabel) {
    elements.referenceTimeLabel.textContent = formatDateTime(uiState.pendingReferenceTimeMs);
  }
  setSuggestedTimeFromDate(new Date(uiState.pendingReferenceTimeMs));
  setPendingReadingVisible(true);
  setMarkButtonEnabled(false);
  setStatus("Captured reference time. Now enter your watch time.");
  if (elements.hourInput) {
    elements.hourInput.focus();
    elements.hourInput.select?.();
  }
}

function cancelPendingReading() {
  uiState.pendingReferenceTimeMs = null;
  setPendingReadingVisible(false);
  setMarkButtonEnabled(Boolean(getSelectedWatch()));
  setStatus("Canceled.");
}

function getPreviousLogForTime(logs, referenceTimeMs) {
  const sorted = [...logs].sort((a, b) => a.recordedAt - b.recordedAt);
  let best = null;
  for (const log of sorted) {
    if (log.recordedAt < referenceTimeMs) {
      best = log;
    }
  }
  return best;
}

function savePendingReading() {
  const watch = getSelectedWatch();
  if (!watch) return;
  if (!Number.isFinite(uiState.pendingReferenceTimeMs)) return;

  const referenceTimeMs = uiState.pendingReferenceTimeMs;
  const hour12 = clampInt(elements.hourInput?.value, 1, 12, 12);
  const minute = clampInt(elements.minuteInput?.value, 0, 59, 0);

  const prev = getPreviousLogForTime(watch.logs, referenceTimeMs);
  const prevOffsetMs = prev && Number.isFinite(prev.offsetMs) ? prev.offsetMs : null;
  const resolved = resolveWatchTime(referenceTimeMs, hour12, minute, prevOffsetMs);

	  const log = {
	    id: createId(),
	    recordedAt: referenceTimeMs,
	    watchHour12: hour12,
	    watchMinute: minute,
	    resolvedWatchTimeMs: resolved.resolvedWatchTimeMs,
	    offsetMs: resolved.offsetMs,
	    isBase: false
	  };

  watch.logs.push(log);
  saveStore(store);
  uiState.pendingReferenceTimeMs = null;
  setPendingReadingVisible(false);
  setMarkButtonEnabled(true);
  setStatus("Saved reading.");
  render();
}

if (elements.addWatchButton) {
  elements.addWatchButton.addEventListener("click", () => addWatch(elements.newWatchNameInput?.value || ""));
}

if (elements.newWatchNameInput) {
  elements.newWatchNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addWatch(elements.newWatchNameInput?.value || "");
    }
  });
}

if (elements.watchSearchInput) {
  elements.watchSearchInput.addEventListener("input", renderWatchList);
}

if (elements.renameWatchButton) {
  elements.renameWatchButton.addEventListener("click", renameSelectedWatch);
}

if (elements.deleteWatchButton) {
  elements.deleteWatchButton.addEventListener("click", deleteSelectedWatch);
}

if (elements.clearAllLogsButton) {
  elements.clearAllLogsButton.addEventListener("click", clearAllLogs);
}

if (elements.markTwelveButton) {
  elements.markTwelveButton.addEventListener("click", startPendingReading);
}

if (elements.cancelReadingButton) {
  elements.cancelReadingButton.addEventListener("click", cancelPendingReading);
}

if (elements.saveReadingButton) {
  elements.saveReadingButton.addEventListener("click", savePendingReading);
}

if (elements.useNowButton) {
  elements.useNowButton.addEventListener("click", () => setSuggestedTimeFromDate(new Date()));
}

if (elements.hourDownButton) elements.hourDownButton.addEventListener("click", () => adjustHour(-1));
if (elements.hourUpButton) elements.hourUpButton.addEventListener("click", () => adjustHour(1));
if (elements.minuteDownButton) elements.minuteDownButton.addEventListener("click", () => adjustMinute(-1));
if (elements.minuteUpButton) elements.minuteUpButton.addEventListener("click", () => adjustMinute(1));

if (elements.hourInput) elements.hourInput.addEventListener("input", updateWatchTimePreview);
if (elements.minuteInput) elements.minuteInput.addEventListener("input", updateWatchTimePreview);

ensureSelection();
render();
setStatus("Ready.");
