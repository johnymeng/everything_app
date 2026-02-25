import "./search.js";

const state = {
  token: localStorage.getItem("finance_tracker_token") || "",
  user: null,
  dashboard: null,
  due: [],
  topicCache: new Map(),
  timer: {
    secondsRemaining: 15 * 60,
    running: false,
    intervalId: null
  }
};

const authGate = document.getElementById("authGate");
const appPanel = document.getElementById("appPanel");
const userLabel = document.getElementById("userLabel");
const modeHint = document.getElementById("modeHint");
const dueBadge = document.getElementById("dueBadge");
const refreshButton = document.getElementById("refreshButton");
const interestSelect = document.getElementById("interestSelect");
const suggestionTitle = document.getElementById("suggestionTitle");
const suggestionOverview = document.getElementById("suggestionOverview");
const suggestionKindBadge = document.getElementById("suggestionKindBadge");
const suggestionPlan = document.getElementById("suggestionPlan");
const suggestionQuizPrompts = document.getElementById("suggestionQuizPrompts");
const startTimerButton = document.getElementById("startTimerButton");
const resetTimerButton = document.getElementById("resetTimerButton");
const timerBadge = document.getElementById("timerBadge");
const completeButton = document.getElementById("completeButton");
const dueGrid = document.getElementById("dueGrid");
const recentGrid = document.getElementById("recentGrid");
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

function formatTimer(secondsRemaining) {
  const safe = Math.max(0, Math.floor(Number(secondsRemaining) || 0));
  const minutes = String(Math.floor(safe / 60)).padStart(2, "0");
  const seconds = String(safe % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function stopTimer() {
  state.timer.running = false;
  if (state.timer.intervalId) {
    clearInterval(state.timer.intervalId);
    state.timer.intervalId = null;
  }
  startTimerButton.textContent = "Start timer";
}

function tickTimer() {
  state.timer.secondsRemaining = Math.max(0, state.timer.secondsRemaining - 1);
  timerBadge.textContent = formatTimer(state.timer.secondsRemaining);

  if (state.timer.secondsRemaining <= 0) {
    stopTimer();
    setStatus("Timer done — mark it learned if you finished the topic.", "warn");
  }
}

function startOrPauseTimer() {
  if (state.timer.running) {
    stopTimer();
    return;
  }

  state.timer.running = true;
  startTimerButton.textContent = "Pause";
  if (!state.timer.intervalId) {
    state.timer.intervalId = setInterval(tickTimer, 1000);
  }
}

function resetTimer() {
  stopTimer();
  state.timer.secondsRemaining = 15 * 60;
  timerBadge.textContent = formatTimer(state.timer.secondsRemaining);
}

async function getTopic(topicKey) {
  if (state.topicCache.has(topicKey)) {
    return state.topicCache.get(topicKey);
  }

  const topic = await api(`/learning/topics/${encodeURIComponent(topicKey)}`);
  state.topicCache.set(topicKey, topic);
  return topic;
}

function renderSuggestion(suggestion) {
  if (!suggestion || !suggestion.topic) {
    suggestionTitle.textContent = "—";
    suggestionOverview.textContent = "—";
    suggestionKindBadge.textContent = "—";
    suggestionPlan.innerHTML = "";
    suggestionQuizPrompts.innerHTML = "";
    return;
  }

  suggestionTitle.textContent = suggestion.topic.title || suggestion.topic.key;
  suggestionOverview.textContent = suggestion.topic.overview || "";
  suggestionKindBadge.textContent = suggestion.kind === "new" ? "New" : "Review";

  suggestionPlan.innerHTML = "";
  for (const step of suggestion.topic.plan || []) {
    const li = document.createElement("li");
    li.textContent = step;
    suggestionPlan.appendChild(li);
  }

  suggestionQuizPrompts.innerHTML = "";
  for (const prompt of suggestion.topic.quizPrompts || []) {
    const li = document.createElement("li");
    li.textContent = prompt;
    suggestionQuizPrompts.appendChild(li);
  }
}

function renderDueBadge(count) {
  const safe = Number.isFinite(count) ? count : 0;
  dueBadge.textContent = `${safe} due`;
}

function renderEmptyCard(text) {
  const card = document.createElement("article");
  card.className = "card";
  card.style.padding = "14px";
  card.textContent = text;
  return card;
}

async function renderDue(items) {
  dueGrid.innerHTML = "";

  if (!items || items.length === 0) {
    dueGrid.appendChild(renderEmptyCard("No reviews due. Learn a new topic to seed spaced repetition."));
    return;
  }

  for (const progress of items) {
    const topic = await getTopic(progress.topicKey).catch(() => null);
    const title = topic?.title || progress.topicKey;

    const card = document.createElement("article");
    card.className = "card";
    card.style.padding = "14px";

    const dueAt = progress.nextReviewAt ? new Date(progress.nextReviewAt) : null;
    const dueLabel = dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt.toLocaleString() : "now";
    const prompts = Array.isArray(topic?.quizPrompts) ? topic.quizPrompts : [];

    card.innerHTML = `
      <div class="metric-label">Due</div>
      <div class="metric-value" style="font-size: 1.05rem; line-height: 1.2">${title}</div>
      <div class="subtitle">Scheduled: ${dueLabel} • Stage ${Number(progress.reviewStage || 0) + 1}</div>
      <details class="accordion panel" style="margin-top: 12px">
        <summary>
          <div>
            <h4>Quiz me</h4>
            <p class="subtitle">Answer from memory, then rate how it felt.</p>
          </div>
        </summary>
        <div class="accordion-content stack">
          <ul class="stack">
            ${prompts.map((prompt) => `<li>${escapeHtml(prompt)}</li>`).join("")}
          </ul>
          <div class="row">
            <button type="button" class="danger" data-rating="again" data-topic="${escapeAttr(progress.topicKey)}">Again</button>
            <button type="button" data-rating="hard" data-topic="${escapeAttr(progress.topicKey)}">Hard</button>
            <button type="button" class="primary" data-rating="good" data-topic="${escapeAttr(progress.topicKey)}">Good</button>
            <button type="button" data-rating="easy" data-topic="${escapeAttr(progress.topicKey)}">Easy</button>
          </div>
        </div>
      </details>
    `;

    card.addEventListener("click", async (event) => {
      const button = event.target?.closest?.("button[data-rating][data-topic]");
      if (!button) return;
      const rating = button.dataset.rating;
      const topicKey = button.dataset.topic;
      if (!rating || !topicKey) return;

      try {
        setStatus("Saving review...");
        await api("/learning/reviews", { method: "POST", body: JSON.stringify({ topicKey, rating }) });
        await refreshAll();
        setStatus("Review saved.");
      } catch (error) {
        setStatus(error.message || "Failed to save review.", "error");
      }
    });

    dueGrid.appendChild(card);
  }
}

async function renderRecent(items) {
  recentGrid.innerHTML = "";

  if (!items || items.length === 0) {
    recentGrid.appendChild(renderEmptyCard("No topics completed yet."));
    return;
  }

  for (const progress of items) {
    const topic = await getTopic(progress.topicKey).catch(() => null);
    const title = topic?.title || progress.topicKey;
    const learnedAt = progress.learnedAt ? new Date(progress.learnedAt) : null;
    const learnedLabel = learnedAt && !Number.isNaN(learnedAt.getTime()) ? learnedAt.toLocaleDateString() : "—";

    const card = document.createElement("article");
    card.className = "card";
    card.style.padding = "14px";
    card.innerHTML = `
      <div class="metric-label">Learned</div>
      <div class="metric-value" style="font-size: 1.05rem; line-height: 1.2">${title}</div>
      <div class="subtitle">${learnedLabel} • Stage ${Number(progress.reviewStage || 0) + 1}</div>
    `;
    recentGrid.appendChild(card);
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

async function refreshAll() {
  if (!state.token) return;
  setStatus("Loading learning...");

  try {
    const [me, dashboard, due] = await Promise.all([api("/auth/me"), api("/learning/dashboard"), api("/learning/reviews/due?limit=12")]);
    state.user = me;
    state.dashboard = dashboard;
    state.due = due || [];

    if (userLabel) {
      const name = me?.name || me?.email || "Learner";
      userLabel.textContent = name;
    }
    if (modeHint) {
      modeHint.textContent = "Set your focus area and start a 15-minute topic.";
    }

    if (interestSelect && dashboard?.preference?.interestArea) {
      interestSelect.value = dashboard.preference.interestArea;
    }

    renderDueBadge(dashboard?.dueCount ?? state.due.length);
    renderSuggestion(dashboard?.suggestion);
    await renderDue(state.due);
    await renderRecent(dashboard?.recent || []);

    setStatus("Learning ready.");
  } catch (error) {
    if (String(error.message || "").toLowerCase().includes("jwt")) {
      setStatus("Session expired. Please sign in again.", "error");
      authGate.classList.remove("hidden");
      appPanel.classList.add("hidden");
      return;
    }

    setStatus(error.message || "Failed to load learning page.", "error");
  }
}

refreshButton?.addEventListener("click", refreshAll);
startTimerButton?.addEventListener("click", startOrPauseTimer);
resetTimerButton?.addEventListener("click", resetTimer);

interestSelect?.addEventListener("change", async () => {
  try {
    setStatus("Saving focus...");
    await api("/learning/preferences", { method: "PUT", body: JSON.stringify({ interestArea: interestSelect.value }) });
    await refreshAll();
    setStatus("Focus saved.");
  } catch (error) {
    setStatus(error.message || "Failed to save focus.", "error");
  }
});

completeButton?.addEventListener("click", async () => {
  const topicKey = state.dashboard?.suggestion?.topic?.key;
  if (!topicKey) return;

  try {
    setStatus("Marking as learned...");
    await api("/learning/complete", { method: "POST", body: JSON.stringify({ topicKey }) });
    resetTimer();
    await refreshAll();
    setStatus("Saved. You’ll be quizzed again later via spaced repetition.");
  } catch (error) {
    setStatus(error.message || "Failed to mark as learned.", "error");
  }
});

window.addEventListener("beforeunload", () => {
  stopTimer();
});

(async () => {
  if (!state.token) {
    authGate.classList.remove("hidden");
    appPanel.classList.add("hidden");
    setStatus("Sign in required.", "warn");
    return;
  }

  authGate.classList.add("hidden");
  appPanel.classList.remove("hidden");
  timerBadge.textContent = formatTimer(state.timer.secondsRemaining);
  await refreshAll();
})();
