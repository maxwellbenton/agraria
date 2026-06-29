// ============================================================================
// Plant Icon Tracer — standalone page
// Upload a plant photo, click a point, run SAM (Segment Anything) entirely in
// the browser via Transformers.js, trace the resulting mask into a smoothed
// SVG path, and export it. No backend, no upload of the photo anywhere.
// ============================================================================

import {
  largestComponent,
  traceBoundary,
  simplifyClosed,
  polygonToSmoothPath,
  averageColor,
  rgbToHex,
} from "./trace-core.js";

const MAX_DIM = 768; // working resolution cap — plenty for an icon silhouette
const SAM_MODEL_ID = "Xenova/sam-vit-base";

const el = (id) => document.getElementById(id);
const els = {
  dropZone: el("drop-zone"),
  fileIn: el("file-in"),
  uploadSection: el("upload-section"),
  workSection: el("work-section"),
  display: el("c-display"),
  runBtn: el("run-btn"),
  resetBtn: el("reset-btn"),
  statusMsg: el("status-msg"),
  progWrap: el("prog-wrap"),
  progFill: el("prog-fill"),
  resultCard: el("result-card"),
  svgPreview: el("svg-preview"),
  epsilon: el("epsilon-slider"),
  epsilonVal: el("epsilon-val"),
  smoothing: el("smoothing-slider"),
  smoothingVal: el("smoothing-val"),
  colorSwatch: el("color-swatch"),
  colorHex: el("color-hex"),
  slugInput: el("slug-input"),
  exportBtn: el("export-btn"),
};

let TF = null;
async function getTF() {
  if (TF) return TF;
  setStatus("Loading Transformers.js…");
  TF = await import(
    "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.4.0/dist/transformers.min.js"
  );
  TF.env.allowLocalModels = false;
  return TF;
}

let samModel = null;
let samProcessor = null;
let rawImage = null;
let imageEmbeddings = null;
let originalSizes = null;
let reshapedSizes = null;

let srcCanvas = null; // working-resolution canvas holding the uploaded photo
let point = null; // {x, y} in srcCanvas pixel space
let lastMask = null; // Uint8Array, srcCanvas resolution
let lastColor = null;
let lastPathInfo = null; // { path, w, h }

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

els.dropZone.addEventListener("click", () => els.fileIn.click());
els.fileIn.addEventListener("change", (e) => {
  if (e.target.files[0]) loadFile(e.target.files[0]);
});
els.dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  els.dropZone.classList.add("drag-over");
});
els.dropZone.addEventListener("dragleave", () =>
  els.dropZone.classList.remove("drag-over")
);
els.dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  els.dropZone.classList.remove("drag-over");
  if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
});

function loadFile(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    setupImage(img);
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

function setupImage(img) {
  const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  srcCanvas = document.createElement("canvas");
  srcCanvas.width = w;
  srcCanvas.height = h;
  srcCanvas.getContext("2d").drawImage(img, 0, 0, w, h);

  // Reset all per-image state
  point = null;
  lastMask = null;
  lastColor = null;
  lastPathInfo = null;
  rawImage = null;
  imageEmbeddings = null;
  originalSizes = null;
  reshapedSizes = null;

  els.display.width = w;
  els.display.height = h;
  redrawDisplay();

  els.uploadSection.classList.add("hidden");
  els.workSection.classList.remove("hidden");
  els.resultCard.classList.add("hidden");
  els.runBtn.disabled = true;
  setStatus("Click on the plant to set a point.");
}

els.resetBtn.addEventListener("click", () => {
  els.uploadSection.classList.remove("hidden");
  els.workSection.classList.add("hidden");
  els.fileIn.value = "";
});

// ---------------------------------------------------------------------------
// Point picking
// ---------------------------------------------------------------------------

els.display.addEventListener("click", (e) => {
  if (!srcCanvas) return;
  const rect = els.display.getBoundingClientRect();
  const sx = srcCanvas.width / rect.width;
  const sy = srcCanvas.height / rect.height;
  point = {
    x: Math.round((e.clientX - rect.left) * sx),
    y: Math.round((e.clientY - rect.top) * sy),
  };
  redrawDisplay();
  els.runBtn.disabled = false;
  setStatus("Point set — click “Segment plant” (or click elsewhere to move it).");
});

function redrawDisplay() {
  const ctx = els.display.getContext("2d");
  ctx.clearRect(0, 0, els.display.width, els.display.height);
  ctx.drawImage(srcCanvas, 0, 0);
  if (point) {
    ctx.save();
    ctx.strokeStyle = "#ffd34d";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(point.x - 10, point.y);
    ctx.lineTo(point.x + 10, point.y);
    ctx.moveTo(point.x, point.y - 10);
    ctx.lineTo(point.x, point.y + 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.strokeStyle = "#ffd34d";
    ctx.stroke();
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// SAM segmentation
// ---------------------------------------------------------------------------

els.runBtn.addEventListener("click", runSAM);

function setStatus(msg) {
  els.statusMsg.textContent = msg;
}

function setProgress(pct) {
  if (pct == null) {
    els.progWrap.classList.add("hidden");
    return;
  }
  els.progWrap.classList.remove("hidden");
  els.progFill.style.width = `${pct}%`;
}

async function runSAM() {
  if (!point || !srcCanvas) return;
  els.runBtn.disabled = true;
  try {
    const tf = await getTF();
    const { SamModel, AutoProcessor, RawImage } = tf;

    if (!samModel) {
      setStatus("Downloading SAM (~375 MB, cached after first use)…");
      samProcessor = await AutoProcessor.from_pretrained(SAM_MODEL_ID);
      samModel = await SamModel.from_pretrained(SAM_MODEL_ID, {
        dtype: "fp32",
        progress_callback: (p) => {
          if (p.status === "progress" && p.total) {
            const pct = Math.round((p.loaded / p.total) * 100);
            setProgress(pct);
            const loadedMB = (p.loaded / 1e6).toFixed(0);
            const totalMB = (p.total / 1e6).toFixed(0);
            setStatus(`Downloading SAM: ${pct}% (${loadedMB} / ${totalMB} MB)`);
          }
        },
      });
      setProgress(null);
    }

    if (!imageEmbeddings) {
      setStatus("Encoding image…");
      rawImage = await RawImage.fromURL(srcCanvas.toDataURL("image/png"));
      const imageInputs = await samProcessor(rawImage);
      const enc = await samModel.get_image_embeddings(imageInputs);
      imageEmbeddings = enc.image_embeddings;
      originalSizes = imageInputs.original_sizes;
      reshapedSizes = imageInputs.reshaped_input_sizes;
    }

    setStatus("Segmenting…");
    const promptInputs = await samProcessor(rawImage, {
      input_points: [[[point.x, point.y]]],
      input_labels: [[[1]]],
    });
    // The model's ONNX graph expects pixel_values even when image_embeddings
    // is supplied (it just skips re-running the vision encoder) — omitting
    // it fails with "Missing the following inputs: pixel_values."
    const outputs = await samModel({
      pixel_values: promptInputs.pixel_values,
      image_embeddings: imageEmbeddings,
      input_points: promptInputs.input_points,
      input_labels: promptInputs.input_labels,
    });
    const masks = await samProcessor.post_process_masks(
      outputs.pred_masks,
      originalSizes,
      reshapedSizes
    );

    const iouData = outputs.iou_scores.data ?? outputs.iou_scores[0].data;
    const scores = Array.from(iouData);
    const bestIdx = scores.indexOf(Math.max(...scores));
    const maskList = Array.isArray(masks[0]) ? masks[0] : [masks[0]];
    const tensor = maskList[Math.min(bestIdx, maskList.length - 1)];

    const w = srcCanvas.width;
    const h = srcCanvas.height;
    const binary = new Uint8Array(w * h);
    for (let i = 0; i < binary.length; i++) binary[i] = tensor.data[i] > 0 ? 1 : 0;
    lastMask = largestComponent(binary, w, h);

    const ctx = srcCanvas.getContext("2d");
    const rgba = ctx.getImageData(0, 0, w, h).data;
    lastColor = averageColor(rgba, lastMask, w, h);

    retrace();
    els.resultCard.classList.remove("hidden");
    setStatus("Done. Adjust simplify/smoothing below, then export.");
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err.message}`);
  } finally {
    els.runBtn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Tracing + preview (cheap — re-runs instantly on slider input, no SAM re-run)
// ---------------------------------------------------------------------------

els.epsilon.addEventListener("input", () => {
  els.epsilonVal.textContent = els.epsilon.value;
  retrace();
});
els.smoothing.addEventListener("input", () => {
  els.smoothingVal.textContent = els.smoothing.value;
  retrace();
});

function retrace() {
  if (!lastMask) return;
  const w = srcCanvas.width;
  const h = srcCanvas.height;
  const contour = traceBoundary(lastMask, w, h);
  const epsilon = parseFloat(els.epsilon.value);
  const smoothing = parseFloat(els.smoothing.value);
  const simplified = simplifyClosed(contour, epsilon);
  const path = polygonToSmoothPath(simplified, smoothing);
  lastPathInfo = { path, w, h };
  renderPreview();
}

function renderPreview() {
  if (!lastPathInfo || !lastColor) return;
  // Outline only, no fill — a flat-color blob reads as a shapeless splotch
  // at icon size; an unfilled stroke in the detected color keeps the
  // silhouette legible.
  const stroke = rgbToHex(lastColor);
  const { path, w, h } = lastPathInfo;
  els.svgPreview.innerHTML = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><path d="${path}" fill="none" stroke="${stroke}" stroke-width="4" stroke-linejoin="round"/></svg>`;
  els.colorSwatch.style.background = stroke;
  els.colorHex.textContent = stroke;
}

// ---------------------------------------------------------------------------
// Export — matches agraria's toCompanionSlug() convention so the filename can
// double as the lookup key against plant data.
// ---------------------------------------------------------------------------

function toSlug(s) {
  return s
    .toLowerCase()
    .trim()
    .replace(/×/g, "x")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

els.exportBtn.addEventListener("click", () => {
  if (!lastPathInfo || !lastColor) return;
  const stroke = rgbToHex(lastColor);
  const { path, w, h } = lastPathInfo;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">\n  <path d="${path}" fill="none" stroke="${stroke}" stroke-width="4" stroke-linejoin="round"/>\n</svg>\n`;
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const slug = toSlug(els.slugInput.value) || "plant-icon";
  a.download = `${slug}.svg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
