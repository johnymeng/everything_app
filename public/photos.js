import "./search.js";

const state = {
  token: localStorage.getItem("finance_tracker_token") || "",
  user: null,
  todayPhotos: [],
  monthPhotos: [],
  monthPhotoUrls: new Map(),
  viewerPhotoUrls: new Map(),
  galleryCollapsed: localStorage.getItem("everything_photos_gallery_collapsed") === "true",
  collageHitRegions: [],
  lightbox: {
    open: false,
    date: "",
    photos: [],
    index: 0,
    touchStartX: null,
    touchStartY: null,
    ignoreStageClickUntil: 0
  },
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
const importPhotosButton = document.getElementById("importPhotosButton");
const importPhotosInput = document.getElementById("importPhotosInput");
const retakeButton = document.getElementById("retakeButton");
const saveButton = document.getElementById("saveButton");
const photoDateInput = document.getElementById("photoDateInput");
const captionInput = document.getElementById("captionInput");
const cameraVideo = document.getElementById("cameraVideo");
const photoPreview = document.getElementById("photoPreview");
const captureCanvas = document.getElementById("captureCanvas");

const monthInput = document.getElementById("monthInput");
const loadMonthButton = document.getElementById("loadMonthButton");
const galleryToggleButton = document.getElementById("galleryToggleButton");
const galleryBody = document.getElementById("galleryBody");
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

const photoLightbox = document.getElementById("photoLightbox");
const photoLightboxBackdrop = document.getElementById("photoLightboxBackdrop");
const photoLightboxCloseButton = document.getElementById("photoLightboxCloseButton");
const photoLightboxTitle = document.getElementById("photoLightboxTitle");
const photoLightboxMeta = document.getElementById("photoLightboxMeta");
const photoLightboxCounter = document.getElementById("photoLightboxCounter");
const photoLightboxStage = document.getElementById("photoLightboxStage");
const photoLightboxImage = document.getElementById("photoLightboxImage");
const photoLightboxVideo = document.getElementById("photoLightboxVideo");
const photoLightboxPrevButton = document.getElementById("photoLightboxPrevButton");
const photoLightboxNextButton = document.getElementById("photoLightboxNextButton");
const photoLightboxCaption = document.getElementById("photoLightboxCaption");

const LIGHTBOX_SWIPE_MIN_DELTA_X = 44;
const LIGHTBOX_SWIPE_MAX_DELTA_Y = 120;

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

function resolveTargetDateKey() {
  const value = String(photoDateInput.value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const today = formatDateKey(new Date());
  photoDateInput.value = today;
  return today;
}

function pluralizePhotos(count) {
  return count === 1 ? "1 photo" : `${count} photos`;
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

function applyGalleryCollapsedState() {
  if (!galleryBody || !galleryToggleButton) return;
  setVisibility(galleryBody, !state.galleryCollapsed);
  galleryToggleButton.textContent = state.galleryCollapsed ? "Expand" : "Collapse";
}

function isVideoContentType(contentType) {
  return /^video\//.test(String(contentType || "").toLowerCase());
}

function drawVideoPlaceholder(ctx, x, y, w, h) {
  ctx.fillStyle = "rgba(21, 27, 38, 0.9)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  const cx = x + w / 2;
  const cy = y + h / 2;
  const size = Math.max(10, Math.min(w, h) * 0.13);
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.45, cy - size * 0.65);
  ctx.lineTo(cx + size * 0.75, cy);
  ctx.lineTo(cx - size * 0.45, cy + size * 0.65);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.76)";
  ctx.font = "600 11px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText("VIDEO", x + 8, y + h - 10);
}

async function getPhotoUrl(photoId) {
  if (state.monthPhotoUrls.has(photoId)) {
    return state.monthPhotoUrls.get(photoId);
  }
  if (state.viewerPhotoUrls.has(photoId)) {
    return state.viewerPhotoUrls.get(photoId);
  }

  const blob = await apiBlob(`/photos/${encodeURIComponent(photoId)}/image`);
  const url = URL.createObjectURL(blob);
  state.viewerPhotoUrls.set(photoId, url);
  return url;
}

function closeLightbox() {
  if (!photoLightbox) return;
  if (photoLightboxVideo) {
    try {
      photoLightboxVideo.pause();
    } catch (_error) {
      // ignore
    }
    photoLightboxVideo.removeAttribute("src");
    photoLightboxVideo.load();
  }
  if (photoLightboxImage) {
    photoLightboxImage.removeAttribute("src");
  }
  state.lightbox.open = false;
  state.lightbox.touchStartX = null;
  state.lightbox.touchStartY = null;
  state.lightbox.ignoreStageClickUntil = 0;
  setVisibility(photoLightbox, false);
  photoLightbox.setAttribute("aria-hidden", "true");
  document.body.classList.remove("photo-lightbox-open");
}

async function renderLightboxPhoto() {
  if (
    !photoLightboxTitle ||
    !photoLightboxMeta ||
    !photoLightboxCounter ||
    !photoLightboxCaption ||
    !photoLightboxImage ||
    !photoLightboxVideo ||
    !photoLightboxPrevButton ||
    !photoLightboxNextButton
  ) {
    return;
  }
  if (!state.lightbox.open || state.lightbox.photos.length === 0) return;

  const active = state.lightbox.photos[state.lightbox.index];
  const count = state.lightbox.photos.length;
  const time = active?.takenAt
    ? new Date(active.takenAt).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit"
      })
    : "";
  photoLightboxTitle.textContent = active.date || "Photo";
  photoLightboxMeta.textContent = time ? `Taken at ${time}` : "";
  photoLightboxCounter.textContent = `${state.lightbox.index + 1} / ${count}`;
  photoLightboxCaption.textContent = active.caption || "";
  photoLightboxImage.alt = `Photo ${state.lightbox.index + 1} of ${count} for ${active.date}`;
  photoLightboxPrevButton.disabled = count <= 1;
  photoLightboxNextButton.disabled = count <= 1;

  const showVideo = isVideoContentType(active.contentType);
  try {
    photoLightboxVideo.pause();
  } catch (_error) {
    // ignore
  }
  photoLightboxVideo.removeAttribute("src");
  photoLightboxVideo.load();
  photoLightboxImage.removeAttribute("src");

  setVisibility(photoLightboxVideo, showVideo);
  setVisibility(photoLightboxImage, !showVideo);
  const expectedId = active.id;

  try {
    const url = await getPhotoUrl(active.id);
    if (!state.lightbox.open) return;
    const current = state.lightbox.photos[state.lightbox.index];
    if (!current || current.id !== expectedId) return;
    if (showVideo) {
      photoLightboxVideo.src = url;
      photoLightboxVideo.load();
    } else {
      photoLightboxImage.src = url;
    }
  } catch (_error) {
    photoLightboxCaption.textContent = "Failed to load media.";
  }
}

async function openLightboxForDate(dateKey, preferredPhotoId) {
  if (!photoLightbox) return;
  try {
    const payload = await api(`/photos/by-date/${encodeURIComponent(dateKey)}`);
    const photos = Array.isArray(payload?.photos) ? payload.photos : [];
    if (photos.length === 0) {
      setStatus(`No photos found for ${dateKey}.`, "warn");
      return;
    }

    photos.sort((a, b) => Date.parse(a.takenAt || "") - Date.parse(b.takenAt || ""));
    const index = Math.max(
      0,
      preferredPhotoId ? photos.findIndex((photo) => photo.id === preferredPhotoId) : 0
    );

    state.lightbox.open = true;
    state.lightbox.date = dateKey;
    state.lightbox.photos = photos;
    state.lightbox.index = index >= 0 ? index : 0;
    state.lightbox.touchStartX = null;
    state.lightbox.touchStartY = null;
    state.lightbox.ignoreStageClickUntil = 0;

    setVisibility(photoLightbox, true);
    photoLightbox.setAttribute("aria-hidden", "false");
    document.body.classList.add("photo-lightbox-open");

    await renderLightboxPhoto();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Failed to open photo viewer.", "error");
  }
}

function moveLightbox(step) {
  if (!state.lightbox.open || state.lightbox.photos.length <= 1) return;
  const count = state.lightbox.photos.length;
  state.lightbox.index = (state.lightbox.index + step + count) % count;
  renderLightboxPhoto().catch(() => {});
}

function beginLightboxSwipe(clientX, clientY) {
  state.lightbox.touchStartX = Number.isFinite(clientX) ? clientX : null;
  state.lightbox.touchStartY = Number.isFinite(clientY) ? clientY : null;
}

function completeLightboxSwipe(clientX, clientY) {
  if (!state.lightbox.open || state.lightbox.photos.length <= 1) {
    state.lightbox.touchStartX = null;
    state.lightbox.touchStartY = null;
    return false;
  }

  const startX = Number(state.lightbox.touchStartX);
  const startY = Number(state.lightbox.touchStartY);
  state.lightbox.touchStartX = null;
  state.lightbox.touchStartY = null;

  if (!Number.isFinite(startX) || !Number.isFinite(startY)) {
    return false;
  }

  const deltaX = Number(clientX) - startX;
  const deltaY = Number(clientY) - startY;
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  if (absX < LIGHTBOX_SWIPE_MIN_DELTA_X || absY > LIGHTBOX_SWIPE_MAX_DELTA_Y || absX <= absY) {
    return false;
  }

  moveLightbox(deltaX > 0 ? -1 : 1);
  state.lightbox.ignoreStageClickUntil = Date.now() + 320;
  return true;
}

function openGalleryPhoto(photo) {
  openLightboxForDate(photo.date, photo.id).catch(() => {});
}

function resetCollageHitRegions() {
  state.collageHitRegions = [];
}

function addCollageHitRegion(region) {
  state.collageHitRegions.push(region);
}

function findCollageHitRegion(x, y) {
  let best = null;
  let bestArea = Number.POSITIVE_INFINITY;
  for (const region of state.collageHitRegions) {
    if (x < region.x || x > region.x + region.w || y < region.y || y > region.y + region.h) continue;
    const area = region.w * region.h;
    if (area < bestArea) {
      best = region;
      bestArea = area;
    }
  }
  return best;
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
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

async function prepareImageForUpload(file) {
  const type = String(file?.type || "").toLowerCase();
  const lowerName = String(file?.name || "").toLowerCase();
  const isHeicByName = lowerName.endsWith(".heic") || lowerName.endsWith(".heif");
  const isHeicByType =
    type === "image/heic" || type === "image/heif" || type === "image/heic-sequence" || type === "image/heif-sequence";
  const isMp4ByName = lowerName.endsWith(".mp4");
  const isMovByName = lowerName.endsWith(".mov");
  const isMp4ByType = type === "video/mp4";
  const isMovByType = type === "video/quicktime";
  const isVideoByType = type.startsWith("video/");
  const supportedType = /^image\/(jpeg|png|webp)$/.test(type);
  const maxUploadBytes = 5 * 1024 * 1024;
  const maxVideoUploadBytes = 25 * 1024 * 1024;

  if (isMp4ByName || isMovByName || isMp4ByType || isMovByType) {
    if (file.size <= 0) throw new Error("Video file is empty.");
    if (file.size > maxVideoUploadBytes) {
      throw new Error("Video too large. Max 25MB for MP4/MOV imports.");
    }
    const contentType = isMovByName || isMovByType ? "video/quicktime" : "video/mp4";
    return { blob: file, contentType };
  }

  if (isVideoByType) {
    throw new Error("Unsupported video type. Use MP4 or MOV.");
  }

  if (isHeicByName || isHeicByType) {
    return { blob: file, contentType: "image/heic" };
  }

  if (supportedType && file.size > 0 && file.size <= maxUploadBytes) {
    return { blob: file, contentType: type };
  }

  const image = await blobToImage(file);
  const maxDim = 1600;
  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  const scale = Math.min(1, maxDim / Math.max(iw, ih));
  const width = Math.max(1, Math.round(iw * scale));
  const height = Math.max(1, Math.round(ih * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available.");
  ctx.drawImage(image, 0, 0, width, height);

  const blob = await compressToJpeg(canvas);
  if (!blob) throw new Error("Failed to process image.");
  if (blob.size > maxUploadBytes) {
    throw new Error("Image too large after compression.");
  }

  return { blob, contentType: "image/jpeg" };
}

async function importPhotos(files) {
  const mediaFiles = Array.from(files || []).filter((file) => {
    const type = String(file.type || "").toLowerCase();
    const lowerName = String(file.name || "").toLowerCase();
    return (
      type.startsWith("image/") ||
      type.startsWith("video/") ||
      lowerName.endsWith(".heic") ||
      lowerName.endsWith(".heif") ||
      lowerName.endsWith(".mp4") ||
      lowerName.endsWith(".mov")
    );
  });
  if (mediaFiles.length === 0) {
    throw new Error("Choose one or more image/video files.");
  }

  const date = resolveTargetDateKey();
  const caption = captionInput.value.trim() || undefined;
  let imported = 0;
  let failed = 0;
  let firstErrorMessage = "";

  for (let index = 0; index < mediaFiles.length; index += 1) {
    try {
      const file = mediaFiles[index];
      setStatus(`Importing ${index + 1}/${mediaFiles.length}…`);
      const prepared = await prepareImageForUpload(file);
      const imageBase64 = await blobToBase64(prepared.blob);
      const timestamp = Number(file.lastModified);
      const takenAt = Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toISOString() : new Date().toISOString();

      await api("/photos", {
        method: "POST",
        body: JSON.stringify({
          date,
          takenAt,
          contentType: prepared.contentType,
          imageBase64,
          caption
        })
      });
      imported += 1;
    } catch (error) {
      failed += 1;
      if (!firstErrorMessage) {
        firstErrorMessage = error instanceof Error ? error.message : "Import failed.";
      }
    }
  }

  if (imported === 0) {
    throw new Error(firstErrorMessage || "Failed to import photos.");
  }

  return { imported, failed };
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
    card.classList.add("photo-card-clickable");
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Open media from ${photo.date}`);
    card.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("button")) return;
      openGalleryPhoto(photo);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("button")) return;
      event.preventDefault();
      openGalleryPhoto(photo);
    });

    const isVideo = isVideoContentType(photo.contentType);
    const previewEl = isVideo ? document.createElement("video") : document.createElement("img");
    previewEl.className = "photo-thumb";
    previewEl.tabIndex = 0;
    previewEl.setAttribute("role", "button");
    previewEl.classList.add("photo-thumb-clickable");
    if (isVideo) {
      previewEl.muted = true;
      previewEl.playsInline = true;
      previewEl.preload = "metadata";
      previewEl.setAttribute("aria-label", `Open video from ${photo.date}`);
    } else {
      previewEl.alt = `Photo for ${photo.date}`;
      previewEl.loading = "lazy";
    }
    previewEl.addEventListener("click", (event) => {
      event.stopPropagation();
      openGalleryPhoto(photo);
    });
    previewEl.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      openGalleryPhoto(photo);
    });

    const meta = document.createElement("div");
    meta.className = "stack";
    meta.style.gap = "8px";

    const title = document.createElement("div");
    title.style.display = "flex";
    title.style.justifyContent = "space-between";
    title.style.gap = "10px";
    const timeLabel = photo.takenAt
      ? new Date(photo.takenAt).toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit"
        })
      : "";
    title.innerHTML = `<div><strong>${photo.date}</strong>${timeLabel ? `<div class="subtitle">${timeLabel}</div>` : ""}</div><span class="badge">${photo.contentType}</span>`;

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
      if (!confirm(`Delete this photo from ${photo.date}?`)) return;
      try {
        setStatus("Deleting…");
        const result = await api(`/photos/${encodeURIComponent(photo.id)}`, { method: "DELETE" });
        if (!result?.deleted) {
          throw new Error("Photo was not deleted. Refresh and try again.");
        }
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

    card.appendChild(previewEl);
    card.appendChild(meta);
    photoGrid.appendChild(card);

    try {
      const blob = await apiBlob(`/photos/${encodeURIComponent(photo.id)}/image`);
      const url = URL.createObjectURL(blob);
      state.monthPhotoUrls.set(photo.id, url);
      previewEl.src = url;
      if (isVideo) previewEl.load();
    } catch (_error) {
      if (!isVideo) previewEl.alt = `Failed to load ${photo.date}`;
    }
  }
}

async function refreshToday() {
  const todayKey = formatDateKey(new Date());
  const payload = await api(`/photos/by-date/${encodeURIComponent(todayKey)}`);
  const photos = Array.isArray(payload?.photos) ? payload.photos : payload?.photo ? [payload.photo] : [];
  state.todayPhotos = photos;

  const due = photos.length === 0;
  dueBadge.textContent = due ? "Photo due today" : `${pluralizePhotos(photos.length)} today`;
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
  if (!photoDateInput.value) {
    photoDateInput.value = formatDateKey(now);
  }
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
  resetCollageHitRegions();

  const photosByDate = new Map();
  for (const photo of photos) {
    const existing = photosByDate.get(photo.date);
    if (existing) {
      existing.push(photo);
    } else {
      photosByDate.set(photo.date, [photo]);
    }
  }

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
    const dayPhotos = photosByDate.get(dateKey) || [];
    if (dayPhotos.length === 0) continue;

    const innerX = x + 6;
    const innerY = y + 28;
    const innerW = cell - 12;
    const innerH = cell - 34;
    const visiblePhotos = dayPhotos.slice(-4);

    if (visiblePhotos.length === 1) {
      addCollageHitRegion({
        x: innerX,
        y: innerY,
        w: innerW,
        h: innerH,
        date: dateKey,
        photoId: visiblePhotos[0].id
      });
      if (isVideoContentType(visiblePhotos[0].contentType)) {
        drawVideoPlaceholder(ctx, innerX, innerY, innerW, innerH);
        continue;
      }
      try {
        const blob = await apiBlob(`/photos/${encodeURIComponent(visiblePhotos[0].id)}/image`);
        const img = await blobToImage(blob);
        drawCover(ctx, img, innerX, innerY, innerW, innerH);
      } catch (_error) {
        // ignore missing images
      }
      continue;
    }

    const colsPerCell = 2;
    const rowsPerCell = Math.ceil(visiblePhotos.length / colsPerCell);
    const gap = 4;
    const tileW = (innerW - gap * (colsPerCell - 1)) / colsPerCell;
    const tileH = (innerH - gap * (rowsPerCell - 1)) / rowsPerCell;

    for (let i = 0; i < visiblePhotos.length; i += 1) {
      const tileRow = Math.floor(i / colsPerCell);
      const tileCol = i % colsPerCell;
      const tileX = innerX + tileCol * (tileW + gap);
      const tileY = innerY + tileRow * (tileH + gap);
      addCollageHitRegion({
        x: tileX,
        y: tileY,
        w: tileW,
        h: tileH,
        date: dateKey,
        photoId: visiblePhotos[i].id
      });

      if (isVideoContentType(visiblePhotos[i].contentType)) {
        drawVideoPlaceholder(ctx, tileX, tileY, tileW, tileH);
        continue;
      }

      try {
        const blob = await apiBlob(`/photos/${encodeURIComponent(visiblePhotos[i].id)}/image`);
        const img = await blobToImage(blob);
        drawCover(ctx, img, tileX, tileY, tileW, tileH);
      } catch (_error) {
        // ignore missing images
      }
    }

    const hiddenCount = dayPhotos.length - visiblePhotos.length;
    if (hiddenCount > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(innerX, innerY + innerH - 24, 42, 20);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "600 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      ctx.fillText(`+${hiddenCount}`, innerX + 8, innerY + innerH - 9);
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
  resetCollageHitRegions();

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
    addCollageHitRegion({
      x: x + 4,
      y: y + 4,
      w: cell - 8,
      h: cell - 8,
      date: photo.date,
      photoId: photo.id
    });

    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);

    if (isVideoContentType(photo.contentType)) {
      drawVideoPlaceholder(ctx, x + 4, y + 4, cell - 8, cell - 8);
      continue;
    }

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
  applyGalleryCollapsedState();

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

  if (galleryToggleButton) {
    galleryToggleButton.addEventListener("click", () => {
      state.galleryCollapsed = !state.galleryCollapsed;
      localStorage.setItem("everything_photos_gallery_collapsed", String(state.galleryCollapsed));
      applyGalleryCollapsedState();
    });
  }

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

  importPhotosButton.addEventListener("click", () => {
    importPhotosInput.click();
  });

  importPhotosInput.addEventListener("change", async () => {
    const files = importPhotosInput.files;
    if (!files || files.length === 0) return;
    try {
      const result = await importPhotos(files);
      if (result.failed > 0) {
        setStatus(`Imported ${pluralizePhotos(result.imported)}. ${result.failed} file(s) failed.`, "warn");
      } else {
        setStatus(`Imported ${pluralizePhotos(result.imported)}.`);
      }
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to import photos.", "error");
    } finally {
      importPhotosInput.value = "";
    }
  });

  saveButton.addEventListener("click", async () => {
    try {
      if (!state.captured.blob) throw new Error("No captured photo to save.");
      const date = resolveTargetDateKey();
      setStatus("Uploading…");
      const imageBase64 = await blobToBase64(state.captured.blob);
      await api("/photos", {
        method: "POST",
        body: JSON.stringify({
          date,
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

  if (collageCanvas) {
    collageCanvas.addEventListener("click", (event) => {
      const rect = collageCanvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = ((event.clientX - rect.left) * collageCanvas.width) / rect.width;
      const y = ((event.clientY - rect.top) * collageCanvas.height) / rect.height;
      const hit = findCollageHitRegion(x, y);
      if (!hit) return;
      openLightboxForDate(hit.date, hit.photoId).catch(() => {});
    });
  }

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

  if (photoLightboxBackdrop) {
    photoLightboxBackdrop.addEventListener("click", () => {
      closeLightbox();
    });
  }

  if (photoLightboxCloseButton) {
    photoLightboxCloseButton.addEventListener("click", () => {
      closeLightbox();
    });
  }

  if (photoLightboxPrevButton) {
    photoLightboxPrevButton.addEventListener("click", (event) => {
      event.stopPropagation();
      moveLightbox(-1);
    });
  }

  if (photoLightboxNextButton) {
    photoLightboxNextButton.addEventListener("click", (event) => {
      event.stopPropagation();
      moveLightbox(1);
    });
  }

  if (photoLightboxStage) {
    photoLightboxStage.addEventListener("click", (event) => {
      if (!state.lightbox.open) return;
      if (Date.now() < state.lightbox.ignoreStageClickUntil) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("button")) return;
      if (target instanceof HTMLElement && target.closest("video")) return;
      const rect = photoLightboxStage.getBoundingClientRect();
      const mid = rect.left + rect.width / 2;
      if (event.clientX < mid) {
        moveLightbox(-1);
      } else {
        moveLightbox(1);
      }
    });

    photoLightboxStage.addEventListener(
      "touchstart",
      (event) => {
        if (!state.lightbox.open) return;
        const target = event.target;
        if (target instanceof HTMLElement && target.closest("video")) return;
        const touch = event.touches && event.touches[0];
        if (!touch) return;
        beginLightboxSwipe(touch.clientX, touch.clientY);
      },
      { passive: true }
    );

    photoLightboxStage.addEventListener(
      "touchend",
      (event) => {
        if (!state.lightbox.open) return;
        const touch = event.changedTouches && event.changedTouches[0];
        if (!touch) return;
        completeLightboxSwipe(touch.clientX, touch.clientY);
      },
      { passive: true }
    );

    photoLightboxStage.addEventListener(
      "touchcancel",
      () => {
        state.lightbox.touchStartX = null;
        state.lightbox.touchStartY = null;
      },
      { passive: true }
    );
  }

  window.addEventListener("keydown", (event) => {
    if (!state.lightbox.open) return;
    if (event.key === "Escape") {
      closeLightbox();
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveLightbox(-1);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveLightbox(1);
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
    photoDateInput.value = formatDateKey(now);
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
  for (const url of state.viewerPhotoUrls.values()) URL.revokeObjectURL(url);
  state.viewerPhotoUrls.clear();
  closeLightbox();
  resetCaptureUi();
  stopCamera().catch(() => {});
  if (state.reminder.timerId) clearInterval(state.reminder.timerId);
});

bootstrap();
