import "./search.js";

const state = {
  token: localStorage.getItem("finance_tracker_token") || "",
  user: null,
  todayPhoto: null,
  monthPhotos: [],
  monthPhotoUrls: new Map(),
  captured: {
    blob: null,
    previewUrl: "",
    contentType: "image/jpeg"
  },
  reminder: {
    enabled: localStorage.getItem("everything_photos_reminder_enabled") === "true",
    time: localStorage.getItem("everything_photos_reminder_time") || "20:00",
    timerId: null
  }
};

const authGate = document.getElementById("authGate");
const appPanel = document.getElementById("appPanel");
const userLabel = document.getElementById("userLabel");
const todayLabel = document.getElementById("todayLabel");
const dueBadge = document.getElementById("dueBadge");
const refreshButton = document.getElementById("refreshButton");
const statusText = document.getElementById("statusText");

const startCameraButton = document.getElementById("startCameraButton");
const stopCameraButton = document.getElementById("stopCameraButton");
const captureButton = document.getElementById("captureButton");
const retakeButton = document.getElementById("retakeButton");
const saveButton = document.getElementById("saveButton");
const captionInput = document.getElementById("captionInput");
const cameraVideo = document.getElementById("cameraVideo");
const photoPreview = document.getElementById("photoPreview");
const captureCanvas = document.getElementById("captureCanvas");

const monthInput = document.getElementById("monthInput");
const loadMonthButton = document.getElementById("loadMonthButton");
const photoGrid = document.getElementById("photoGrid");

const reminderEnabledInput = document.getElementById("reminderEnabledInput");
const reminderTimeInput = document.getElementById("reminderTimeInput");
const requestNotificationsButton = document.getElementById("requestNotificationsButton");

const collageModeSelect = document.getElementById("collageModeSelect");
const collageMonthInput = document.getElementById("collageMonthInput");
const collageYearInput = document.getElementById("collageYearInput");
const collageColumnsInput = document.getElementById("collageColumnsInput");
const buildCollageButton = document.getElementById("buildCollageButton");
const downloadCollageLink = document.getElementById("downloadCollageLink");
const collageCanvas = document.getElementById("collageCanvas");

function setStatus(message, tone = "normal") {
  statusText.textContent = message;
  statusText.classList.remove("error", "warn");
  if (tone === "error") statusText.classList.add("error");
  if (tone === "warn") statusText.classList.add("warn");
}

function authHeaders() {
  return state.token ? { Authorization: `Bearer ${state.token}` } : {};
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
    if (!trimmed) return null;
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
    const error = new Error(errorMessage);
    error.status = response.status;
    throw error;
  }

  if (payload !== null) return payload;

  if (contentType.includes("text/html") || trimmed.startsWith("<!doctype") || trimmed.startsWith("<html")) {
    throw new Error(
      "API returned HTML instead of JSON. Make sure you are running the Express server and opening the app from it (default: http://localhost:4000)."
    );
  }

  return null;
}

async function apiBlob(path) {
  const response = await fetch(`/api${path}`, { headers: { ...authHeaders() } });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}).`);
  }
  return await response.blob();
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseMonthInput(value) {
  const [y, m] = String(value || "").split("-").map((v) => Number(v));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  return { year: y, monthIndex: m - 1 };
}

function monthRange(year, monthIndex) {
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0);
  return { from: formatDateKey(start), to: formatDateKey(end) };
}

function setVisibility(el, show) {
  el.classList.toggle("hidden", !show);
}

function resetCaptureUi() {
  if (state.captured.previewUrl) {
    URL.revokeObjectURL(state.captured.previewUrl);
    state.captured.previewUrl = "";
  }
  state.captured.blob = null;
  captionInput.value = "";
  setVisibility(photoPreview, false);
  setVisibility(retakeButton, false);
  setVisibility(saveButton, false);
}

async function stopCamera() {
  const stream = cameraVideo.srcObject;
  if (stream && typeof stream.getTracks === "function") {
    for (const track of stream.getTracks()) track.stop();
  }
  cameraVideo.srcObject = null;
  setVisibility(cameraVideo, false);
  setVisibility(stopCameraButton, false);
  setVisibility(captureButton, false);
}

async function startCamera() {
  resetCaptureUi();

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false
  });

  cameraVideo.srcObject = stream;
  setVisibility(cameraVideo, true);
  setVisibility(stopCameraButton, true);
  setVisibility(captureButton, true);
}

function canvasToBlob(canvas, contentType, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), contentType, quality);
  });
}

async function compressToJpeg(canvas) {
  const attempts = [0.9, 0.85, 0.8, 0.75, 0.7, 0.6];
  for (const quality of attempts) {
    const blob = await canvasToBlob(canvas, "image/jpeg", quality);
    if (blob && blob.size <= 2_500_000) return blob;
  }
  return await canvasToBlob(canvas, "image/jpeg", 0.6);
}

async function capturePhoto() {
  if (!cameraVideo.videoWidth || !cameraVideo.videoHeight) {
    throw new Error("Camera not ready yet.");
  }

  const maxDim = 1280;
  const vw = cameraVideo.videoWidth;
  const vh = cameraVideo.videoHeight;
  const scale = Math.min(1, maxDim / Math.max(vw, vh));
  const w = Math.round(vw * scale);
  const h = Math.round(vh * scale);

  captureCanvas.width = w;
  captureCanvas.height = h;
  const ctx = captureCanvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available.");
  ctx.drawImage(cameraVideo, 0, 0, w, h);

  const blob = await compressToJpeg(captureCanvas);
  if (!blob) throw new Error("Failed to capture photo.");

  state.captured.blob = blob;
  state.captured.contentType = "image/jpeg";

  if (state.captured.previewUrl) {
    URL.revokeObjectURL(state.captured.previewUrl);
  }
  state.captured.previewUrl = URL.createObjectURL(blob);
  photoPreview.src = state.captured.previewUrl;
  setVisibility(photoPreview, true);
  setVisibility(retakeButton, true);
  setVisibility(saveButton, true);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image."));
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

function clearMonthPhotoUrls() {
  for (const url of state.monthPhotoUrls.values()) URL.revokeObjectURL(url);
  state.monthPhotoUrls.clear();
}

async function loadMonth(year, monthIndex) {
  clearMonthPhotoUrls();
  photoGrid.innerHTML = "";

  const range = monthRange(year, monthIndex);
  const payload = await api(`/photos?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}&limit=1000`);
  const photos = Array.isArray(payload?.photos) ? payload.photos : [];
  state.monthPhotos = photos;

  if (photos.length === 0) {
    photoGrid.innerHTML = '<article class="card">No photos yet for this month.</article>';
    return;
  }

  for (const photo of photos) {
    const card = document.createElement("article");
    card.className = "card photo-card";

    const img = document.createElement("img");
    img.className = "photo-thumb";
    img.alt = `Photo for ${photo.date}`;
    img.loading = "lazy";

    const meta = document.createElement("div");
    meta.className = "stack";
    meta.style.gap = "8px";

    const title = document.createElement("div");
    title.style.display = "flex";
    title.style.justifyContent = "space-between";
    title.style.gap = "10px";
    title.innerHTML = `<div><strong>${photo.date}</strong></div><span class="badge">${photo.contentType}</span>`;

    const caption = document.createElement("div");
    caption.className = "subtitle";
    caption.textContent = photo.caption || "";

    const actions = document.createElement("div");
    actions.className = "row";

    const deleteButton = document.createElement("button");
    deleteButton.className = "danger";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", async () => {
      if (!confirm(`Delete photo for ${photo.date}?`)) return;
      try {
        setStatus("Deleting…");
        await api(`/photos/${encodeURIComponent(photo.date)}`, { method: "DELETE" });
        await refresh();
        setStatus("Deleted.");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Failed to delete.", "error");
      }
    });

    actions.appendChild(deleteButton);
    meta.appendChild(title);
    if (photo.caption) meta.appendChild(caption);
    meta.appendChild(actions);

    card.appendChild(img);
    card.appendChild(meta);
    photoGrid.appendChild(card);

    try {
      const blob = await apiBlob(`/photos/${encodeURIComponent(photo.id)}/image`);
      const url = URL.createObjectURL(blob);
      state.monthPhotoUrls.set(photo.id, url);
      img.src = url;
    } catch (_error) {
      img.alt = `Failed to load ${photo.date}`;
    }
  }
}

async function refreshToday() {
  const todayKey = formatDateKey(new Date());
  const payload = await api(`/photos/by-date/${encodeURIComponent(todayKey)}`);
  state.todayPhoto = payload?.photo || null;

  const due = !state.todayPhoto;
  dueBadge.textContent = due ? "Photo due today" : "Done for today";
  dueBadge.classList.toggle("warn", due);
  dueBadge.classList.toggle("good", !due);

  return { todayKey, due };
}

function reminderTimeTodayMs(timeString) {
  const [hh, mm] = String(timeString || "").split(":").map((v) => Number(v));
  const hour = Number.isFinite(hh) ? hh : 20;
  const minute = Number.isFinite(mm) ? mm : 0;
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  return target.getTime();
}

function canNotify() {
  return "Notification" in window;
}

function notify(title, body) {
  if (!canNotify()) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body });
  } catch (_error) {
    // ignore
  }
}

async function maybeTriggerReminder() {
  const { todayKey, due } = await refreshToday();
  if (!state.reminder.enabled) return;
  if (!due) return;

  const now = Date.now();
  const targetMs = reminderTimeTodayMs(state.reminder.time);
  if (now < targetMs) return;

  const notifiedKey = localStorage.getItem("everything_photos_last_notified_date") || "";
  if (notifiedKey === todayKey) return;

  localStorage.setItem("everything_photos_last_notified_date", todayKey);
  notify("Daily photo", "Take your photo for today.");
}

function scheduleReminderTick() {
  if (state.reminder.timerId) {
    clearInterval(state.reminder.timerId);
    state.reminder.timerId = null;
  }

  state.reminder.timerId = setInterval(() => {
    maybeTriggerReminder().catch(() => {});
  }, 60_000);
}

async function refresh() {
  const now = new Date();
  todayLabel.textContent = `Today is ${now.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  })}`;

  await refreshToday();

  const monthValue = monthInput.value || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  monthInput.value = monthValue;
  collageMonthInput.value = collageMonthInput.value || monthValue;

  const parsed = parseMonthInput(monthValue);
  if (parsed) await loadMonth(parsed.year, parsed.monthIndex);

  await maybeTriggerReminder();
}

function updateCollageUi() {
  const mode = collageModeSelect.value;
  if (mode === "year") {
    setVisibility(collageYearInput, true);
    setVisibility(collageColumnsInput, true);
    setVisibility(collageMonthInput, false);
    collageYearInput.value = collageYearInput.value || String(new Date().getFullYear());
  } else {
    setVisibility(collageYearInput, false);
    setVisibility(collageColumnsInput, false);
    setVisibility(collageMonthInput, true);
  }
}

function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image."));
    };
    img.src = url;
  });
}

function drawCover(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

async function buildMonthCollage(year, monthIndex) {
  const { from, to } = monthRange(year, monthIndex);
  const payload = await api(`/photos?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=1000`);
  const photos = Array.isArray(payload?.photos) ? payload.photos : [];

  const photoByDate = new Map();
  for (const photo of photos) photoByDate.set(photo.date, photo);

  const cols = 7;
  const titleH = 80;
  const cell = 180;
  const first = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const startDay = first.getDay(); // Sunday=0
  const rows = Math.ceil((startDay + daysInMonth) / 7);

  collageCanvas.width = cols * cell;
  collageCanvas.height = titleH + rows * cell;

  const ctx = collageCanvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available.");

  ctx.fillStyle = "#0b0e14";
  ctx.fillRect(0, 0, collageCanvas.width, collageCanvas.height);

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "600 28px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  const monthTitle = first.toLocaleDateString(undefined, { year: "numeric", month: "long" });
  ctx.fillText(monthTitle, 20, 50);

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;

  for (let day = 1; day <= daysInMonth; day += 1) {
    const index = startDay + (day - 1);
    const row = Math.floor(index / 7);
    const col = index % 7;
    const x = col * cell;
    const y = titleH + row * cell;

    ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);

    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "500 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillText(String(day), x + 10, y + 20);

    const dateKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const photo = photoByDate.get(dateKey);
    if (!photo) continue;

    try {
      const blob = await apiBlob(`/photos/${encodeURIComponent(photo.id)}/image`);
      const img = await blobToImage(blob);
      drawCover(ctx, img, x + 6, y + 28, cell - 12, cell - 34);
    } catch (_error) {
      // ignore missing images
    }
  }

  downloadCollageLink.href = collageCanvas.toDataURL("image/png");
  downloadCollageLink.download = `collage-${year}-${String(monthIndex + 1).padStart(2, "0")}.png`;
  setVisibility(downloadCollageLink, true);
}

async function buildYearCollage(year, columns) {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const payload = await api(`/photos?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=5000`);
  const photos = Array.isArray(payload?.photos) ? payload.photos : [];

  const cols = Math.max(5, Math.min(40, Number(columns) || 20));
  const cell = 90;
  const titleH = 70;
  const rows = Math.ceil(photos.length / cols);

  collageCanvas.width = cols * cell;
  collageCanvas.height = titleH + Math.max(1, rows) * cell;

  const ctx = collageCanvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available.");

  ctx.fillStyle = "#0b0e14";
  ctx.fillRect(0, 0, collageCanvas.width, collageCanvas.height);

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "600 28px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText(`${year} • Daily photos`, 20, 45);

  for (let i = 0; i < photos.length; i += 1) {
    const photo = photos[i];
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = col * cell;
    const y = titleH + row * cell;

    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);

    try {
      const blob = await apiBlob(`/photos/${encodeURIComponent(photo.id)}/image`);
      const img = await blobToImage(blob);
      drawCover(ctx, img, x + 4, y + 4, cell - 8, cell - 8);
    } catch (_error) {
      // ignore
    }
  }

  downloadCollageLink.href = collageCanvas.toDataURL("image/png");
  downloadCollageLink.download = `collage-${year}.png`;
  setVisibility(downloadCollageLink, true);
}

async function bootstrap() {
  reminderEnabledInput.checked = state.reminder.enabled;
  reminderTimeInput.value = state.reminder.time;

  reminderEnabledInput.addEventListener("change", async () => {
    state.reminder.enabled = Boolean(reminderEnabledInput.checked);
    localStorage.setItem("everything_photos_reminder_enabled", String(state.reminder.enabled));
    scheduleReminderTick();
    await maybeTriggerReminder();
  });

  reminderTimeInput.addEventListener("change", async () => {
    state.reminder.time = reminderTimeInput.value || "20:00";
    localStorage.setItem("everything_photos_reminder_time", state.reminder.time);
    await maybeTriggerReminder();
  });

  requestNotificationsButton.addEventListener("click", async () => {
    if (!canNotify()) {
      setStatus("Notifications not supported in this browser.", "warn");
      return;
    }
    const permission = await Notification.requestPermission();
    setStatus(permission === "granted" ? "Notifications enabled." : "Notifications not enabled.", permission === "granted" ? "normal" : "warn");
  });

  refreshButton.addEventListener("click", async () => {
    try {
      setStatus("Refreshing…");
      await refresh();
      setStatus("Ready.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to refresh.", "error");
    }
  });

  startCameraButton.addEventListener("click", async () => {
    try {
      setStatus("Starting camera…");
      await startCamera();
      setStatus("Camera ready.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to start camera.", "error");
    }
  });

  stopCameraButton.addEventListener("click", async () => {
    await stopCamera();
    setStatus("Camera stopped.");
  });

  captureButton.addEventListener("click", async () => {
    try {
      setStatus("Capturing…");
      await capturePhoto();
      await stopCamera();
      setStatus("Captured. Add a caption and save.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to capture.", "error");
    }
  });

  retakeButton.addEventListener("click", async () => {
    resetCaptureUi();
    await startCamera();
    setStatus("Retake ready.");
  });

  saveButton.addEventListener("click", async () => {
    try {
      if (!state.captured.blob) throw new Error("No captured photo to save.");
      const todayKey = formatDateKey(new Date());
      setStatus("Uploading…");
      const imageBase64 = await blobToBase64(state.captured.blob);
      await api("/photos", {
        method: "POST",
        body: JSON.stringify({
          date: todayKey,
          takenAt: new Date().toISOString(),
          contentType: state.captured.contentType,
          imageBase64,
          caption: captionInput.value.trim() || undefined
        })
      });
      resetCaptureUi();
      setStatus("Saved.");
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save.", "error");
    }
  });

  loadMonthButton.addEventListener("click", async () => {
    const parsed = parseMonthInput(monthInput.value);
    if (!parsed) {
      setStatus("Pick a month.", "warn");
      return;
    }
    try {
      setStatus("Loading…");
      await loadMonth(parsed.year, parsed.monthIndex);
      setStatus("Ready.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load month.", "error");
    }
  });

  collageModeSelect.addEventListener("change", () => {
    updateCollageUi();
  });

  buildCollageButton.addEventListener("click", async () => {
    try {
      setStatus("Building collage…");
      setVisibility(downloadCollageLink, false);
      if (collageModeSelect.value === "year") {
        const year = Number(collageYearInput.value || new Date().getFullYear());
        await buildYearCollage(year, Number(collageColumnsInput.value || 20));
      } else {
        const parsed = parseMonthInput(collageMonthInput.value);
        if (!parsed) throw new Error("Pick a month.");
        await buildMonthCollage(parsed.year, parsed.monthIndex);
      }
      setStatus("Collage ready.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to build collage.", "error");
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
    userLabel.textContent = state.user?.name ? `${state.user.name}'s Photos` : "Photos";

    authGate.classList.add("hidden");
    appPanel.classList.remove("hidden");

    const now = new Date();
    monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    collageMonthInput.value = monthInput.value;
    collageYearInput.value = String(now.getFullYear());
    updateCollageUi();
    scheduleReminderTick();

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

window.addEventListener("beforeunload", () => {
  clearMonthPhotoUrls();
  resetCaptureUi();
  stopCamera().catch(() => {});
  if (state.reminder.timerId) clearInterval(state.reminder.timerId);
});

bootstrap();
