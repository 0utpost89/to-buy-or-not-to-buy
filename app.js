"use strict";

/* ---------- storage helpers ---------- */
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }
};

const settings = {
  omdbKey: store.get("omdbKey", ""),
  buyThreshold: store.get("buyThreshold", 60),
  imdbThreshold: store.get("imdbThreshold", 6.5),
};

let history = store.get("scanHistory", []);

/* ---------- screen switching ---------- */
const screens = {
  scan: document.getElementById("scanScreen"),
  loading: document.getElementById("loadingScreen"),
  result: document.getElementById("resultScreen"),
  error: document.getElementById("errorScreen"),
};
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove("active"));
  screens[name].classList.add("active");
}

/* ---------- settings modal ---------- */
const settingsModal = document.getElementById("settingsModal");
const omdbKeyInput = document.getElementById("omdbKeyInput");
const buyThresholdInput = document.getElementById("buyThreshold");
const imdbThresholdInput = document.getElementById("imdbThreshold");

function openSettings() {
  omdbKeyInput.value = settings.omdbKey;
  buyThresholdInput.value = settings.buyThreshold;
  imdbThresholdInput.value = settings.imdbThreshold;
  settingsModal.hidden = false;
}
document.getElementById("settingsBtn").addEventListener("click", openSettings);
document.getElementById("settingsSaveBtn").addEventListener("click", () => {
  settings.omdbKey = omdbKeyInput.value.trim();
  settings.buyThreshold = Number(buyThresholdInput.value) || 60;
  settings.imdbThreshold = Number(imdbThresholdInput.value) || 6.5;
  store.set("omdbKey", settings.omdbKey);
  store.set("buyThreshold", settings.buyThreshold);
  store.set("imdbThreshold", settings.imdbThreshold);
  settingsModal.hidden = true;
});
document.getElementById("clearHistoryBtn").addEventListener("click", () => {
  history = [];
  store.set("scanHistory", history);
  renderHistory();
});

if (!settings.omdbKey) {
  // first run: nudge the user to add a free OMDb key
  setTimeout(openSettings, 400);
}

/* ---------- history ---------- */
const historyEl = document.getElementById("history");
function renderHistory() {
  historyEl.innerHTML = "";
  if (!history.length) return;
  const heading = document.createElement("p");
  heading.style.cssText = "font-size:12px;color:#777;margin:0 0 8px;";
  heading.textContent = "Recent scans";
  historyEl.appendChild(heading);

  history.slice(0, 10).forEach(item => {
    const row = document.createElement("div");
    row.className = "history-item";
    const pillClass = item.verdict === "buy" ? "buy" : item.verdict === "no-buy" ? "no-buy" : "unknown";
    const pillText = item.verdict === "buy" ? "BUY" : item.verdict === "no-buy" ? "SKIP" : "?";
    row.innerHTML = `<span>${escapeHtml(item.title)}</span><span class="pill ${pillClass}">${pillText}</span>`;
    row.addEventListener("click", () => renderResult(item));
    historyEl.appendChild(row);
  });
}
function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}
function pushHistory(item) {
  history.unshift(item);
  history = history.slice(0, 30);
  store.set("scanHistory", history);
  renderHistory();
}
renderHistory();

/* ---------- barcode scanner ---------- */
const READER_ID = "reader";
let qrScanner = null;
let currentCameraId = null;
let torchOn = false;
let zoomLevel = 1;

const torchBtn = document.getElementById("torchBtn");
const zoomInBtn = document.getElementById("zoomInBtn");
const switchCamBtn = document.getElementById("switchCamBtn");

const barcodeFormats = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
];

async function startScanner(cameraId) {
  if (qrScanner) {
    try { await qrScanner.stop(); } catch {}
    try { qrScanner.clear(); } catch {}
  }
  qrScanner = new Html5Qrcode(READER_ID, { formatsToSupport: barcodeFormats, verbose: false });

  const config = {
    fps: 12,
    qrbox: (viewfinderWidth, viewfinderHeight) => {
      const w = Math.floor(viewfinderWidth * 0.78);
      const h = Math.floor(viewfinderHeight * 0.32);
      return { width: w, height: h };
    },
    aspectRatio: 3 / 4,
    disableFlip: false,
  };

  const cameraConfig = cameraId
    ? { deviceId: { exact: cameraId } }
    : { facingMode: { ideal: "environment" } };

  // ask for continuous autofocus + a reasonably high resolution so small barcodes stay sharp
  const videoConstraints = {
    ...cameraConfig,
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    advanced: [{ focusMode: "continuous" }],
  };

  try {
    await qrScanner.start(videoConstraints, config, onScanSuccess, () => {});
  } catch (err) {
    // fall back to the simplest possible constraint set if the fancy one is rejected
    await qrScanner.start(cameraConfig, config, onScanSuccess, () => {});
  }

  detectCapabilities();
}

function getVideoTrack() {
  try {
    const video = document.querySelector("#reader video");
    const stream = video && video.srcObject;
    return stream ? stream.getVideoTracks()[0] : null;
  } catch { return null; }
}

function detectCapabilities() {
  const track = getVideoTrack();
  if (!track || !track.getCapabilities) { torchBtn.hidden = true; zoomInBtn.hidden = true; return; }
  const caps = track.getCapabilities();
  torchBtn.hidden = !caps.torch;
  zoomInBtn.hidden = !caps.zoom;
  if (caps.zoom) {
    zoomLevel = caps.zoom.min;
  }
}

torchBtn.addEventListener("click", async () => {
  const track = getVideoTrack();
  if (!track) return;
  torchOn = !torchOn;
  try {
    await track.applyConstraints({ advanced: [{ torch: torchOn }] });
    torchBtn.classList.toggle("on", torchOn);
  } catch {
    torchOn = false;
  }
});

zoomInBtn.addEventListener("click", async () => {
  const track = getVideoTrack();
  if (!track || !track.getCapabilities) return;
  const caps = track.getCapabilities();
  if (!caps.zoom) return;
  zoomLevel = Math.min(caps.zoom.max, zoomLevel + (caps.zoom.step || 0.5) * 4);
  if (zoomLevel >= caps.zoom.max) zoomLevel = caps.zoom.min; // cycle back
  try { await track.applyConstraints({ advanced: [{ zoom: zoomLevel }] }); } catch {}
});

// tap the reticle to nudge the camera to refocus on that area
document.getElementById("reticle").addEventListener("click", async () => {
  const track = getVideoTrack();
  if (!track || !track.getCapabilities) return;
  const caps = track.getCapabilities();
  if (!caps.focusMode || !caps.focusMode.includes("single-shot")) return;
  try {
    await track.applyConstraints({ advanced: [{ focusMode: "single-shot" }] });
    setTimeout(() => {
      track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
    }, 1500);
  } catch {}
});

let cameraList = [];
let cameraIndex = 0;
switchCamBtn.addEventListener("click", async () => {
  if (!cameraList.length) return;
  cameraIndex = (cameraIndex + 1) % cameraList.length;
  currentCameraId = cameraList[cameraIndex].id;
  await startScanner(currentCameraId);
});

async function initCameras() {
  try {
    cameraList = await Html5Qrcode.getCameras();
    const backIdx = cameraList.findIndex(c => /back|rear|environment/i.test(c.label));
    cameraIndex = backIdx >= 0 ? backIdx : 0;
    currentCameraId = cameraList[cameraIndex] ? cameraList[cameraIndex].id : null;
  } catch {
    cameraList = [];
  }
  await startScanner(currentCameraId);
}

let lastScanTime = 0;
function onScanSuccess(decodedText) {
  const now = Date.now();
  if (now - lastScanTime < 1500) return; // debounce duplicate reads
  lastScanTime = now;
  handleBarcode(decodedText.replace(/\D/g, ""));
}

document.getElementById("manualForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const val = document.getElementById("manualInput").value.trim();
  if (val) handleBarcode(val.replace(/\D/g, ""));
});

document.getElementById("scanAgainBtn").addEventListener("click", () => showScreen("scan"));
document.getElementById("errorBackBtn").addEventListener("click", () => showScreen("scan"));

document.getElementById("titleSearchForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("titleSearchInput").value.trim();
  if (!title) return;
  showScreen("loading");
  document.getElementById("loadingText").textContent = `Fetching ratings for "${title}"…`;
  try {
    const omdbData = await omdbSearch(title);
    const { rt, imdb } = extractScores(omdbData);
    const { verdict, reason } = computeVerdict(rt, imdb);
    const item = {
      barcode: "manual title search",
      title: omdbData.Title || title,
      year: omdbData.Year || "",
      rt, imdb, verdict, reason,
      timestamp: Date.now(),
    };
    pushHistory(item);
    renderResult(item);
  } catch (err) {
    showError("Couldn't find that title", err.message || String(err));
  }
});

/* ---------- lookup pipeline ---------- */
// UPCitemdb's trial API has no CORS headers, so browser calls must go through a
// public proxy. These free proxies are flaky (rate limits, occasional downtime),
// so we try several in order and use whichever responds first.
const CORS_PROXIES = [
  {
    build: (target) => `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
    parse: (res) => res.json(),
  },
  {
    build: (target) => `https://api.allorigins.win/get?url=${encodeURIComponent(target)}`,
    parse: async (res) => JSON.parse((await res.json()).contents),
  },
  {
    build: (target) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
    parse: (res) => res.json(),
  },
];

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

function cleanTitle(rawTitle) {
  let t = rawTitle;
  t = t.replace(/\[.*?\]/g, " ");
  t = t.replace(/\(.*?\)/g, " ");
  t = t.replace(/\b(blu-?ray|4k|uhd|dvd|region\s?[a-c0-9]+|steelbook|widescreen|full\s?screen|special\s?edition|collector'?s\s?edition|remastered|ultra\s?hd|digital\s?copy|includes.*|disc\s?\d+)\b/gi, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

async function lookupUPC(code) {
  const target = `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`;
  let lastErr = null;

  for (const proxy of CORS_PROXIES) {
    try {
      const res = await fetchWithTimeout(proxy.build(target), 8000);
      if (!res.ok) { lastErr = new Error(`proxy responded ${res.status}`); continue; }
      const data = await proxy.parse(res);
      if (data && data.code === "INVALID_UPC") throw new Error("That doesn't look like a valid barcode.");
      if (!data || !data.items || !data.items.length) { lastErr = new Error("no items in response"); continue; }
      return data.items[0];
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error("No product found for that barcode, or the lookup service is temporarily down. Try again in a moment, or type the title straight into a search if this keeps happening.");
}

async function omdbSearch(title) {
  const key = settings.omdbKey;
  if (!key) throw new Error("Add your free OMDb API key in Settings first.");

  // try a direct title match first
  let res = await fetch(`https://www.omdbapi.com/?apikey=${encodeURIComponent(key)}&t=${encodeURIComponent(title)}&type=movie`);
  let data = await res.json();
  if (data.Response === "True") return data;

  // fall back to fuzzy search and take the first hit
  res = await fetch(`https://www.omdbapi.com/?apikey=${encodeURIComponent(key)}&s=${encodeURIComponent(title)}&type=movie`);
  data = await res.json();
  if (data.Response === "True" && data.Search && data.Search.length) {
    const imdbID = data.Search[0].imdbID;
    res = await fetch(`https://www.omdbapi.com/?apikey=${encodeURIComponent(key)}&i=${encodeURIComponent(imdbID)}`);
    data = await res.json();
    if (data.Response === "True") return data;
  }
  throw new Error(`Couldn't find "${title}" on OMDb`);
}

function extractScores(omdbData) {
  let rt = null;
  if (omdbData.Ratings) {
    const rtRating = omdbData.Ratings.find(r => r.Source === "Rotten Tomatoes");
    if (rtRating) rt = parseInt(rtRating.Value, 10);
  }
  let imdb = null;
  if (omdbData.imdbRating && omdbData.imdbRating !== "N/A") {
    imdb = parseFloat(omdbData.imdbRating);
  }
  return { rt, imdb };
}

function computeVerdict(rt, imdb) {
  if (rt !== null && !Number.isNaN(rt)) {
    return {
      verdict: rt >= settings.buyThreshold ? "buy" : "no-buy",
      reason: `Tomatometer is ${rt}% (your bar: ${settings.buyThreshold}%+).`,
    };
  }
  if (imdb !== null && !Number.isNaN(imdb)) {
    return {
      verdict: imdb >= settings.imdbThreshold ? "buy" : "no-buy",
      reason: `No critic score on file, so this used IMDb's ${imdb}/10 (your bar: ${settings.imdbThreshold}+).`,
    };
  }
  return { verdict: "unknown", reason: "No ratings found for this title — your call." };
}

async function handleBarcode(code) {
  showScreen("loading");
  document.getElementById("loadingText").textContent = `Looking up barcode ${code}…`;
  try {
    const product = await lookupUPC(code);
    const title = cleanTitle(product.title || "");
    if (!title) throw new Error("Couldn't work out a title from that barcode's listing.");

    document.getElementById("loadingText").textContent = `Fetching ratings for "${title}"…`;
    const omdbData = await omdbSearch(title);
    const { rt, imdb } = extractScores(omdbData);
    const { verdict, reason } = computeVerdict(rt, imdb);

    const item = {
      barcode: code,
      title: omdbData.Title || title,
      year: omdbData.Year || "",
      poster: omdbData.Poster && omdbData.Poster !== "N/A" ? omdbData.Poster : null,
      rt, imdb, verdict, reason,
      timestamp: Date.now(),
    };
    pushHistory(item);
    renderResult(item);
  } catch (err) {
    showError("Couldn't find that one", err.message || String(err));
  }
}

function renderResult(item) {
  const badge = document.getElementById("verdictBadge");
  badge.className = "verdict-badge" + (item.verdict === "no-buy" ? " no-buy" : item.verdict === "unknown" ? " unknown" : "");
  badge.textContent = item.verdict === "buy" ? "BUY" : item.verdict === "no-buy" ? "DON'T BUY" : "UNKNOWN";

  document.getElementById("movieTitle").textContent = item.title;
  document.getElementById("movieMeta").textContent = item.year ? `(${item.year}) · barcode ${item.barcode}` : `barcode ${item.barcode}`;
  document.getElementById("rtScore").textContent = item.rt !== null ? `${item.rt}%` : "N/A";
  document.getElementById("imdbScore").textContent = item.imdb !== null ? `${item.imdb}/10` : "N/A";
  document.getElementById("verdictReason").textContent = item.reason;

  showScreen("result");
}

function showError(title, message) {
  document.getElementById("errorTitle").textContent = title;
  document.getElementById("errorMessage").textContent = message;
  showScreen("error");
}

/* ---------- boot ---------- */
initCameras().catch(err => showError("Camera problem", err.message || String(err)));
