import "./search.js";

const state = {
  token: localStorage.getItem("finance_tracker_token") || "",
  user: null,
  habits: [],
  archivedHabits: [],
  logs: [],
  weeks: Number(localStorage.getItem("everything_habits_weeks") || "12"),
  pendingSave: null
};

const authGate = document.getElementById("authGate");
const appPanel = document.getElementById("appPanel");
const userLabel = document.getElementById("userLabel");
const rangeLabel = document.getElementById("rangeLabel");
const weeksSelect = document.getElementById("weeksSelect");
const refreshButton = document.getElementById("refreshButton");
const todayLabel = document.getElementById("todayLabel");
const todayList = document.getElementById("todayList");
const heatmap = document.getElementById("heatmap");
const habitNameInput = document.getElementById("habitNameInput");
const habitColorInput = document.getElementById("habitColorInput");
const addHabitButton = document.getElementById("addHabitButton");
const manageList = document.getElementById("manageList");
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
    const details =
      payload && typeof payload === "object" && "details" in payload && typeof payload.details === "string" ? payload.details : "";
    const errorMessage =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? details
          ? `${payload.error}: ${details}`
          : payload.error
        : contentType.includes("text/html") || trimmed.startsWith("<!doctype") || trimmed.startsWith("<html")
          ? "API returned HTML instead of JSON. Make sure you are running the Express server and opening the app from it (default: http://localhost:4000)."
          : `Request failed (${response.status}).`;
    const error = new Error(errorMessage);
    error.status = response.status;
    throw error;
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

function parseDateKey(key) {
  const [y, m, d] = String(key).split("-").map((value) => Number(value));
  return new Date(y, (m || 1) - 1, d || 1);
}

function addDays(date, days) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function startOfWeekMonday(date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (copy.getDay() + 6) % 7; // Monday=0
  copy.setDate(copy.getDate() - day);
  return copy;
}

function rangeDates(weeks) {
  const today = new Date();
  const start = addDays(startOfWeekMonday(today), -(Math.max(1, weeks) - 1) * 7);
  const days = Math.max(1, weeks) * 7;
  const list = [];
  for (let i = 0; i < days; i += 1) {
    list.push(addDays(start, i));
  }
  return { start, end: list[list.length - 1], list };
}

function logKey(habitId, dateKey) {
  return `${habitId}:${dateKey}`;
}

function buildLogMap(logs) {
  const map = new Map();
  for (const entry of logs || []) {
    map.set(logKey(entry.habitId, entry.date), Boolean(entry.completed));
  }
  return map;
}

function streakForHabit(habitId, logMap, todayKey) {
  let streak = 0;
  let cursor = parseDateKey(todayKey);

  for (let i = 0; i < 3660; i += 1) {
    const key = formatDateKey(cursor);
    if (!logMap.get(logKey(habitId, key))) {
      break;
    }
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

function completionRate(habitId, logMap, days, endKey) {
  const end = parseDateKey(endKey);
  let done = 0;
  for (let i = 0; i < days; i += 1) {
    const key = formatDateKey(addDays(end, -i));
    if (logMap.get(logKey(habitId, key))) {
      done += 1;
    }
  }
  return Math.round((done / Math.max(1, days)) * 100);
}

function dot(color) {
  return `<span class="habit-dot" style="background:${color}"></span>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isHexColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || "").trim());
}

function renderToday(habits, logMap, todayKey) {
  todayList.innerHTML = "";

  if (!habits || habits.length === 0) {
    todayList.innerHTML = '<article class="card" style="padding:14px">No habits yet. Add one on the right.</article>';
    return;
  }

  for (const habit of habits) {
    const item = document.createElement("label");
    item.className = "habit-item";
    item.innerHTML = `
      <span class="habit-name">${dot(habit.color)}${escapeHtml(habit.name)}</span>
      <input class="habit-check" type="checkbox" data-habit-id="${habit.id}" />
    `;
    const checked = Boolean(logMap.get(logKey(habit.id, todayKey)));
    const checkbox = item.querySelector("input");
    checkbox.checked = checked;
    checkbox.addEventListener("change", () => scheduleSaveToday(todayKey));
    todayList.appendChild(item);
  }
}

function renderManage(activeHabits, archivedHabits) {
  manageList.innerHTML = "";

  const hasActive = Array.isArray(activeHabits) && activeHabits.length > 0;
  const hasArchived = Array.isArray(archivedHabits) && archivedHabits.length > 0;

  if (!hasActive && !hasArchived) {
    manageList.innerHTML = '<p class="subtitle">No habits yet.</p>';
    return;
  }

  if (hasActive) {
    const heading = document.createElement("div");
    heading.className = "subtitle";
    heading.textContent = "Active";
    manageList.appendChild(heading);

    for (const habit of activeHabits) {
      const row = document.createElement("div");
      row.className = "habit-manage-row";
      row.innerHTML = `
        <div class="habit-manage-name">${dot(habit.color)}${escapeHtml(habit.name)}</div>
        <div class="row">
          <button type="button" class="danger" data-action="archive" data-habit-id="${habit.id}">Archive</button>
        </div>
      `;

      const archiveButton = row.querySelector('button[data-action="archive"]');
      archiveButton.addEventListener("click", async () => {
        if (!confirm(`Archive "${habit.name}"? (You can restore it in Manage later.)`)) {
          return;
        }
        try {
          setStatus("Archiving…");
          await api(`/habits/${habit.id}`, { method: "PATCH", body: JSON.stringify({ archived: true }) });
          await refresh();
          setStatus("Archived.");
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "Failed to archive.", "error");
        }
      });

      manageList.appendChild(row);
    }
  }

  if (hasArchived) {
    const heading = document.createElement("div");
    heading.className = "subtitle";
    heading.textContent = "Archived";
    manageList.appendChild(heading);

    for (const habit of archivedHabits) {
      const row = document.createElement("div");
      row.className = "habit-manage-row";
      row.innerHTML = `
        <div class="habit-manage-name">${dot(habit.color)}${escapeHtml(habit.name)}</div>
        <div class="row">
          <button type="button" class="primary" data-action="unarchive" data-habit-id="${habit.id}">Unarchive</button>
        </div>
      `;

      const unarchiveButton = row.querySelector('button[data-action="unarchive"]');
      unarchiveButton.addEventListener("click", async () => {
        try {
          setStatus("Unarchiving…");
          await api(`/habits/${habit.id}`, { method: "PATCH", body: JSON.stringify({ archived: false }) });
          await refresh();
          setStatus("Unarchived.");
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "Failed to unarchive.", "error");
        }
      });

      manageList.appendChild(row);
    }
  }
}

function renderHeatmap(habits, logMap, dates, todayKey) {
  heatmap.innerHTML = "";

  if (!habits || habits.length === 0) {
    heatmap.innerHTML = '<article class="card" style="padding:14px">Add a habit to start tracking.</article>';
    return;
  }

  const container = document.createElement("div");
  container.className = "heatmap-stack";

  for (const habit of habits) {
    const streak = streakForHabit(habit.id, logMap, todayKey);
    const rate = completionRate(habit.id, logMap, 30, todayKey);

    const row = document.createElement("div");
    row.className = "heatmap-row";

    const meta = document.createElement("div");
    meta.className = "heatmap-meta";
    meta.innerHTML = `
      <div class="heatmap-title">${dot(habit.color)}${escapeHtml(habit.name)}</div>
      <div class="subtitle">Streak: ${streak} • 30d: ${rate}%</div>
    `;

    const grid = document.createElement("div");
    grid.className = "heatmap-grid";

    for (const date of dates) {
      const key = formatDateKey(date);
      const done = Boolean(logMap.get(logKey(habit.id, key)));
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = `heatmap-cell ${done ? "done" : ""}`;
      cell.title = `${habit.name} • ${key}`;
      cell.dataset.habitId = habit.id;
      cell.dataset.date = key;
      if (done) {
        cell.style.background = habit.color;
        cell.style.borderColor = "transparent";
      }

      cell.addEventListener("click", () => toggleCell(habit.id, key));
      grid.appendChild(cell);
    }

    row.appendChild(meta);
    row.appendChild(grid);
    container.appendChild(row);
  }

  heatmap.appendChild(container);
}

function readTodayEntries() {
  const entries = [];
  const inputs = todayList.querySelectorAll("input.habit-check");
  for (const input of inputs) {
    entries.push({
      habitId: input.dataset.habitId,
      completed: Boolean(input.checked)
    });
  }
  return entries;
}

function scheduleSaveToday(todayKey) {
  if (state.pendingSave) {
    clearTimeout(state.pendingSave);
  }

  state.pendingSave = setTimeout(async () => {
    state.pendingSave = null;
    try {
      setStatus("Saving…");
      const entries = readTodayEntries();
      const updated = await api(`/habits/logs/${todayKey}`, { method: "PUT", body: JSON.stringify({ entries }) });
      mergeLogs(updated);
      renderAll();
      setStatus("Saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed.", "error");
    }
  }, 250);
}

function mergeLogs(updatedRows) {
  const byKey = new Map();
  for (const row of state.logs || []) {
    byKey.set(logKey(row.habitId, row.date), row);
  }
  for (const row of updatedRows || []) {
    byKey.set(logKey(row.habitId, row.date), row);
  }
  state.logs = Array.from(byKey.values());
}

async function toggleCell(habitId, dateKey) {
  const existing = buildLogMap(state.logs).get(logKey(habitId, dateKey));
  try {
    setStatus("Saving…");
    const updated = await api(`/habits/logs/${dateKey}`, {
      method: "PUT",
      body: JSON.stringify({
        entries: [{ habitId, completed: !existing }]
      })
    });
    mergeLogs(updated);
    renderAll();
    setStatus("Saved.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Save failed.", "error");
  }
}

function renderAll() {
  const weeks = Math.max(1, Number(state.weeks) || 12);
  const { start, end, list } = rangeDates(weeks);
  const todayKey = formatDateKey(new Date());
  const logMap = buildLogMap(state.logs);

  todayLabel.textContent = new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  rangeLabel.textContent = `Showing last ${weeks} weeks (${formatDateKey(start)} → ${formatDateKey(end)}).`;

  renderToday(state.habits, logMap, todayKey);
  renderHeatmap(state.habits, logMap, list, todayKey);
  renderManage(state.habits, state.archivedHabits);
}

async function refresh() {
  const weeks = Math.max(1, Number(state.weeks) || 12);
  localStorage.setItem("everything_habits_weeks", String(weeks));
  weeksSelect.value = String(weeks);

  const { start, end } = rangeDates(weeks);
  const from = formatDateKey(start);
  const to = formatDateKey(end);

  const [habits, logs] = await Promise.all([api("/habits?includeArchived=true"), api(`/habits/logs?from=${from}&to=${to}`)]);
  const list = Array.isArray(habits) ? habits : [];
  state.habits = list.filter((habit) => !habit.archivedAt);
  state.archivedHabits = list.filter((habit) => habit.archivedAt);
  state.logs = Array.isArray(logs) ? logs : [];
  renderAll();
}

async function bootstrap() {
  weeksSelect.value = String(state.weeks);
  weeksSelect.addEventListener("change", async () => {
    state.weeks = Number(weeksSelect.value || "12");
    await refresh().catch((error) => setStatus(error instanceof Error ? error.message : "Refresh failed.", "error"));
  });

  refreshButton.addEventListener("click", async () => {
    setStatus("Refreshing…");
    await refresh()
      .then(() => setStatus("Ready."))
      .catch((error) => setStatus(error instanceof Error ? error.message : "Refresh failed.", "error"));
  });

  addHabitButton.addEventListener("click", async () => {
    const name = String(habitNameInput.value || "").trim();
    const color = String(habitColorInput.value || "").trim();
    if (!name) {
      setStatus("Habit name is required.", "warn");
      habitNameInput.focus();
      return;
    }

    try {
      const normalized = name.toLowerCase();
      const activeMatch = (state.habits || []).find((habit) => habit.name.toLowerCase() === normalized);
      if (activeMatch) {
        setStatus(`"${activeMatch.name}" already exists.`, "warn");
        return;
      }

      const archivedMatch = (state.archivedHabits || []).find((habit) => habit.name.toLowerCase() === normalized);
      if (archivedMatch) {
        setStatus(`Restoring "${archivedMatch.name}"…`);
        await api(`/habits/${archivedMatch.id}`, {
          method: "PATCH",
          body: JSON.stringify({ archived: false, ...(isHexColor(color) ? { color } : {}) })
        });
        habitNameInput.value = "";
        await refresh();
        setStatus("Restored.");
        return;
      }

      setStatus("Adding…");
      await api("/habits", {
        method: "POST",
        body: JSON.stringify({ name, ...(isHexColor(color) ? { color } : {}) })
      });
      habitNameInput.value = "";
      await refresh();
      setStatus("Added.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to add habit.", "error");
    }
  });

  if (!state.token) {
    authGate.classList.remove("hidden");
    appPanel.classList.add("hidden");
    setStatus("Sign in required.", "warn");
    return;
  }

  try {
    state.user = await api("/auth/me");
    userLabel.textContent = state.user?.name ? `${state.user.name}'s Habits` : "Habits";

    authGate.classList.add("hidden");
    appPanel.classList.remove("hidden");

    setStatus("Loading…");
    await refresh();
    setStatus("Ready.");
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && error.status === 401) {
      localStorage.removeItem("finance_tracker_token");
      state.token = "";
      authGate.classList.remove("hidden");
      appPanel.classList.add("hidden");
      setStatus("Session expired. Sign in again on the Dashboard.", "warn");
      return;
    }

    authGate.classList.remove("hidden");
    appPanel.classList.add("hidden");
    setStatus(error instanceof Error ? error.message : "Failed to load.", "error");
  }
}

bootstrap();
