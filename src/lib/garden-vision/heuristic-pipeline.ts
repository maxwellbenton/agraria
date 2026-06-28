// Ported, unchanged in substance, from
// an-incomplete-gardening-companion's src/ml/pipeline.ts (HeuristicImageToMapPipeline).

import type {
  ImageToMapPipeline,
  PlantInstanceDetection,
  PlantMapResult,
  ProjectedPlant,
  SvgMapOptions,
} from "./types";
import { ClassicalGeometryEngine } from "./geometry-engine";

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

/** Scale factor applied before plant-blob detection (reduces CPU cost). */
const DETECT_SCALE = 0.25;

/**
 * Minimum blob size in scaled pixels.  At 25 % scale a 40×40 px plant in
 * the original image becomes 10×10 = 100 scaled pixels.
 */
const MIN_BLOB_PIXELS = 80;

/** Garden grid defaults for the suggested layout (6-inch squares). */
const DEFAULT_GRID_W = 20;
const DEFAULT_GRID_H = 16;

// ---------------------------------------------------------------------------
// HeuristicImageToMapPipeline
// ---------------------------------------------------------------------------

/**
 * Full image-to-map pipeline using only CPU-based heuristics — no ML model
 * download required, runs in any browser (or in Node, given an RGBA buffer).
 *
 * Stages:
 *   1. Camera geometry   – ClassicalGeometryEngine (Sobel + colour heuristics)
 *   2. Plant mask        – vegetation-index pixel classification
 *   3. Blob detection    – BFS connected-components on the plant mask (only
 *                          below the estimated horizon)
 *   4. Ground projection – homography from the geometry stage
 *   5. Grid placement    – normalised coords → 6-inch square grid positions
 *
 * This is intentionally the cheap, zero-download first pass: good enough to
 * sanity-check the "photo in, plant positions out" flow end to end before
 * spending effort on heavier ML detection (SAM/SegFormer, as prototyped in
 * the icon tracer and in the ground-view project).
 *
 * `toSvg()` renders the PlantMapResult as a standalone SVG string that can be
 * displayed in the UI or downloaded.
 */
export class HeuristicImageToMapPipeline implements ImageToMapPipeline {
  private readonly geometry = new ClassicalGeometryEngine();

  async analyze(
    data: Uint8ClampedArray,
    width: number,
    height: number,
  ): Promise<PlantMapResult> {
    // ── Stage 1: geometry ─────────────────────────────────────────────────
    const geom = this.geometry.estimateFromRgba(data, width, height);

    // ── Stage 2 & 3: plant detection on downsampled image ─────────────────
    const sw = Math.max(1, Math.round(width * DETECT_SCALE));
    const sh = Math.max(1, Math.round(height * DETECT_SCALE));
    const small = downsample(data, width, height, sw, sh);

    const horizonRowScaled = Math.round(geom.horizonFraction * sh);
    const mask = buildPlantMask(small, sw, sh, horizonRowScaled);
    const blobs = findBlobs(mask, sw, sh);

    // Scale blobs back to original image dimensions
    const invScale = 1 / DETECT_SCALE;
    const detections: PlantInstanceDetection[] = blobs.map((b) => ({
      bbox: {
        x: Math.round(b.minX * invScale),
        y: Math.round(b.minY * invScale),
        width: Math.round((b.maxX - b.minX) * invScale),
        height: Math.round((b.maxY - b.minY) * invScale),
      },
      centroid: {
        x: Math.round(b.cx * invScale),
        y: Math.round(b.cy * invScale),
      },
      confidence: b.confidence,
    }));

    // ── Stage 4: project detections onto the ground plane ─────────────────
    const H = geom.groundPlane.matrix;
    const projectedPlants: ProjectedPlant[] = detections
      .map((det): ProjectedPlant | null => {
        const { u, v } = ClassicalGeometryEngine.projectPoint(
          H,
          det.centroid.x,
          det.centroid.y,
        );
        // Discard points that project outside the visible ground region
        if (u < -0.15 || u > 1.15 || v < -0.05 || v > 1.1) return null;
        const blobWidthFraction = det.bbox.width / width;
        const radiusInSquares = Math.max(1, Math.min(6, Math.round(blobWidthFraction * DEFAULT_GRID_W * 0.5)));
        return {
          gardenX: Math.max(0, Math.min(1, u)),
          gardenY: Math.max(0, Math.min(1, v)),
          radiusInSquares,
          detection: det,
        };
      })
      .filter((p): p is ProjectedPlant => p !== null);

    // Deduplicate nearby projections (merge if grid cells would overlap)
    const merged = mergeDuplicates(projectedPlants, DEFAULT_GRID_W, DEFAULT_GRID_H);

    // ── Stage 5: build grid positions ─────────────────────────────────────
    const plantPositions = merged.map((p, i) => ({
      plantName: `detected-plant-${i + 1}`,
      gridX: Math.min(DEFAULT_GRID_W - 1, Math.round(p.gardenX * DEFAULT_GRID_W)),
      gridY: Math.min(DEFAULT_GRID_H - 1, Math.round(p.gardenY * DEFAULT_GRID_H)),
      size: p.radiusInSquares,
      confidence: p.detection.confidence,
    }));

    return {
      imageWidth: width,
      imageHeight: height,
      geometry: geom,
      detections,
      projectedPlants: merged,
      suggestedGridWidth: DEFAULT_GRID_W,
      suggestedGridHeight: DEFAULT_GRID_H,
      plantPositions,
    };
  }

  toSvg(result: PlantMapResult, options: SvgMapOptions = {}): string {
    const {
      svgWidth = 800,
      svgHeight = 600,
      showConfidence = true,
      showGrid = true,
    } = options;

    const { suggestedGridWidth: gw, suggestedGridHeight: gh, plantPositions, geometry } = result;
    const cellW = svgWidth / gw;
    const cellH = svgHeight / gh;

    const parts: string[] = [
      `<svg xmlns="http://www.w3.org/2000/svg"`,
      `  width="${svgWidth}" height="${svgHeight}"`,
      `  viewBox="0 0 ${svgWidth} ${svgHeight}"`,
      `  role="img" aria-label="Detected garden plant map">`,

      // Background
      `  <rect width="${svgWidth}" height="${svgHeight}" fill="#f4f7f0"/>`,
    ];

    // ── Grid ──────────────────────────────────────────────────────────────
    if (showGrid) {
      parts.push(`  <g stroke="#c8d4c0" stroke-width="0.5" opacity="0.7">`);
      for (let x = 0; x <= gw; x++) {
        const px = (x * cellW).toFixed(1);
        parts.push(`    <line x1="${px}" y1="0" x2="${px}" y2="${svgHeight}"/>`);
      }
      for (let y = 0; y <= gh; y++) {
        const py = (y * cellH).toFixed(1);
        parts.push(`    <line x1="0" y1="${py}" x2="${svgWidth}" y2="${py}"/>`);
      }
      parts.push(`  </g>`);
    }

    // ── Horizon indicator ────────────────────────────────────────────────
    const horizonY = (geometry.horizonFraction * svgHeight).toFixed(1);
    parts.push(
      `  <line x1="0" y1="${horizonY}" x2="${svgWidth}" y2="${horizonY}"`,
      `    stroke="#e8c060" stroke-width="1.5" stroke-dasharray="6 4" opacity="0.5"/>`,
      `  <text x="4" y="${(Number(horizonY) - 4).toFixed(1)}"`,
      `    font-size="9" fill="#b89a30" font-family="sans-serif" opacity="0.8">horizon</text>`,
    );

    // ── Plants ────────────────────────────────────────────────────────────
    parts.push(`  <g class="plants">`);
    for (const pos of plantPositions) {
      const cx = (pos.gridX * cellW + cellW / 2).toFixed(1);
      const cy = (pos.gridY * cellH + cellH / 2).toFixed(1);
      const r = ((pos.size || 1) * Math.min(cellW, cellH) * 0.4).toFixed(1);
      const opacity = showConfidence ? (0.45 + pos.confidence * 0.5).toFixed(2) : "0.85";
      const fontSize = Math.max(7, Number(r) * 0.65).toFixed(1);
      const shortLabel = pos.plantName.replace("detected-plant-", "P");

      parts.push(
        `    <circle cx="${cx}" cy="${cy}" r="${r}"`,
        `      fill="#4caf50" stroke="#2e7d32" stroke-width="1.5" opacity="${opacity}"/>`,
        `    <text x="${cx}" y="${(Number(cy) + 3).toFixed(1)}"`,
        `      text-anchor="middle" font-size="${fontSize}"`,
        `      fill="#fff" font-family="sans-serif" pointer-events="none">${shortLabel}</text>`,
      );

      if (showConfidence) {
        parts.push(
          `    <title>${pos.plantName} · confidence ${(pos.confidence * 100).toFixed(0)}%</title>`,
        );
      }
    }
    parts.push(`  </g>`);

    // ── Metadata strip ────────────────────────────────────────────────────
    const count = plantPositions.length;
    const confPct = (geometry.confidence * 100).toFixed(0);
    const angleTxt = geometry.angleDeg.toFixed(1);
    parts.push(
      `  <rect x="0" y="${svgHeight - 18}" width="${svgWidth}" height="18" fill="rgba(0,0,0,0.28)"/>`,
      `  <text x="6" y="${svgHeight - 5}"`,
      `    font-size="10" fill="#e8e8e8" font-family="sans-serif">`,
      `    ${count} plant${count !== 1 ? "s" : ""} detected`,
      `    · pitch ${angleTxt}°`,
      `    · geometry confidence ${confPct}%`,
      `    · each cell = 6 in`,
      `  </text>`,
    );

    parts.push(`</svg>`);
    return parts.join("\n");
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function downsample(
  src: Uint8ClampedArray,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): Uint8ClampedArray {
  const dst = new Uint8ClampedArray(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.floor((y / dh) * sh));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.floor((x / dw) * sw));
      const si = (sy * sw + sx) * 4;
      const di = (y * dw + x) * 4;
      dst[di] = src[si];
      dst[di + 1] = src[si + 1];
      dst[di + 2] = src[si + 2];
      dst[di + 3] = src[si + 3];
    }
  }
  return dst;
}

/**
 * Mark each pixel as plant (1) or non-plant (0).
 * Only pixels at or below `horizonRow` are considered (sky above is ignored).
 */
function buildPlantMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  horizonRow: number,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  const startRow = Math.max(0, horizonRow);
  for (let y = startRow; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const vi = 2 * g - r - b;
      if (g > 45 && g > r * 1.08 && g > b * 1.08 && vi > 24) {
        mask[y * width + x] = 1;
      }
    }
  }
  return mask;
}

type Blob = {
  pixels: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  cx: number;
  cy: number;
  confidence: number;
};

/**
 * BFS connected-components on the plant mask.
 * Uses an index pointer instead of Array.shift() to keep O(n) per blob.
 */
function findBlobs(mask: Uint8Array, width: number, height: number): Blob[] {
  const visited = new Uint8Array(width * height);
  const blobs: Blob[] = [];
  const queue = new Int32Array(width * height);

  for (let startIdx = 0; startIdx < mask.length; startIdx++) {
    if (!mask[startIdx] || visited[startIdx]) continue;

    let head = 0;
    let tail = 0;
    queue[tail++] = startIdx;
    visited[startIdx] = 1;

    let pixels = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = startIdx % width;
    let maxX = minX;
    let minY = Math.floor(startIdx / width);
    let maxY = minY;

    while (head < tail) {
      const curr = queue[head++];
      const cy = Math.floor(curr / width);
      const cx = curr % width;

      pixels++;
      sumX += cx;
      sumY += cy;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;

      // 4-connected neighbours
      const neighbours = [curr - 1, curr + 1, curr - width, curr + width] as const;
      for (const ni of neighbours) {
        if (ni < 0 || ni >= mask.length) continue;
        const nx = ni % width;
        const ny = Math.floor(ni / width);
        // Guard against wrapping at row edges
        if (Math.abs(nx - cx) > 1 || Math.abs(ny - cy) > 1) continue;
        if (!mask[ni] || visited[ni]) continue;
        visited[ni] = 1;
        queue[tail++] = ni;
      }
    }

    if (pixels >= MIN_BLOB_PIXELS) {
      blobs.push({
        pixels,
        minX,
        maxX,
        minY,
        maxY,
        cx: sumX / pixels,
        cy: sumY / pixels,
        // Confidence grows quickly toward 1 for larger blobs
        confidence: Math.min(1, pixels / (MIN_BLOB_PIXELS * 4)),
      });
    }
  }

  // Sort largest blobs first (most-confident plants on top in SVG)
  blobs.sort((a, b) => b.pixels - a.pixels);
  return blobs;
}

/**
 * Merge projected plants whose grid cells are identical or directly adjacent
 * (prevents duplicate circles from a single large plant blob splitting).
 */
function mergeDuplicates(
  plants: ProjectedPlant[],
  gridW: number,
  gridH: number,
): ProjectedPlant[] {
  const cellOccupied = new Set<string>();
  return plants.filter((p) => {
    const gx = Math.min(gridW - 1, Math.round(p.gardenX * gridW));
    const gy = Math.min(gridH - 1, Math.round(p.gardenY * gridH));
    const key = `${gx},${gy}`;
    if (cellOccupied.has(key)) return false;
    cellOccupied.add(key);
    return true;
  });
}
