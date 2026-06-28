// Ported, unchanged in substance, from
// an-incomplete-gardening-companion's src/ml/geometryEngine.ts.

import type { CameraGeometryResult, GeometryEngine, GroundPlaneTransform } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Assumed vertical field of view of the camera in degrees. */
const VFOV_DEG = 60;

/** Max width of the working image used internally for speed. */
const WORK_WIDTH = 320;

/** Minimum row window that must have ≥42 % ground-ish pixels to count as ground start. */
const GROUND_WINDOW_ROWS = 8;
const GROUND_THRESHOLD = 0.42;

// ---------------------------------------------------------------------------
// ClassicalGeometryEngine
// ---------------------------------------------------------------------------

/**
 * Estimates camera geometry from a single RGBA image using:
 *   1. Horizontal Sobel edge density to detect strong sky↔ground transitions.
 *   2. Row-level colour classification (sky blue, vegetation green, dirt/rock) to
 *      find where ground begins independently in the left and right halves.
 *   3. A perspective-to-ortho homography computed via Direct Linear Transform
 *      from the four corners of the visible ground trapezoid.
 *
 * No ML model is required — this runs entirely in JS/CPU and is fast enough
 * for typical browser use even on full-resolution images.
 */
export class ClassicalGeometryEngine implements GeometryEngine {
  estimateFromRgba(
    data: Uint8ClampedArray,
    width: number,
    height: number,
  ): CameraGeometryResult {
    const scale = Math.min(1, WORK_WIDTH / width);
    const sw = Math.round(width * scale);
    const sh = Math.round(height * scale);
    const small = downsample(data, width, height, sw, sh);

    const { leftY, rightY, edgeConfidence } = findHorizonRows(small, sw, sh);

    // Scale back to original image dimensions
    const groundStartLeft = Math.round(leftY / scale);
    const groundStartRight = Math.round(rightY / scale);

    const avgHorizonY = (groundStartLeft + groundStartRight) / 2;
    const horizonFraction = avgHorizonY / height;

    // Roll: angle of the horizon line
    const rollRad = Math.atan2(groundStartRight - groundStartLeft, width);
    const rollDeg = (rollRad * 180) / Math.PI;

    // Pitch: map the normalised horizon fraction through the assumed VFOV
    const halfVFovRad = (VFOV_DEG / 2) * (Math.PI / 180);
    const pitchRad = Math.atan(Math.tan(halfVFovRad) * (2 * horizonFraction - 1));
    const pitchDeg = (pitchRad * 180) / Math.PI;

    const groundCoverage = Math.max(0, height - avgHorizonY) / height;
    const geometryConfidence = Math.min(1, edgeConfidence * 0.6 + groundCoverage * 0.4);

    const groundPlane = computeGroundPlaneHomography(
      width,
      height,
      groundStartLeft,
      groundStartRight,
    );

    return {
      angleDeg: pitchDeg,
      rollDeg,
      horizonFraction,
      groundStartLeft,
      groundStartRight,
      groundPlane,
      confidence: geometryConfidence,
    };
  }

  /**
   * Project an image-space point (x, y) onto the ground plane using the
   * homography returned by `estimateFromRgba`.
   *
   * Returns normalised coordinates [0..1, 0..1] where (0,0) is the horizon
   * left edge and (1,1) is the bottom-right corner of the image.
   */
  static projectPoint(H: number[], x: number, y: number): { u: number; v: number } {
    const w = H[6] * x + H[7] * y + H[8];
    if (Math.abs(w) < 1e-9) return { u: 0, v: 0 };
    return {
      u: (H[0] * x + H[1] * y + H[2]) / w,
      v: (H[3] * x + H[4] * y + H[5]) / w,
    };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Nearest-neighbour downsample of an RGBA buffer. */
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
 * Detect the horizon row in the left half and right half of the image
 * separately (to detect camera roll / slant).
 *
 * Strategy:
 *   – Compute per-row horizontal edge magnitude (Sobel dI/dy).
 *   – Compute per-row sky-likelihood (blue dominance) and ground-likelihood
 *     (green/brown pixels).
 *   – Score each row by edge × skyAbove × groundBelow.
 *   – Additionally use the colour-based band scan as a tie-breaker.
 *
 * Returns left and right horizon Y values in the *working* image coordinates.
 */
function findHorizonRows(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { leftY: number; rightY: number; edgeConfidence: number } {
  const minRow = Math.floor(height * 0.05);
  const maxRow = Math.floor(height * 0.9);

  // Per-row horizontal edge magnitude (average over all columns)
  const rowEdge = new Float32Array(height);
  for (let y = minRow + 1; y < maxRow; y++) {
    let edgeSum = 0;
    for (let x = 0; x < width; x++) {
      const above = ((y - 1) * width + x) * 4;
      const below = ((y + 1) * width + x) * 4;
      edgeSum +=
        Math.abs(data[below] - data[above]) +
        Math.abs(data[below + 1] - data[above + 1]) +
        Math.abs(data[below + 2] - data[above + 2]);
    }
    rowEdge[y] = edgeSum / width;
  }

  // Per-row sky/ground pixel fractions
  const rowSky = new Float32Array(height);
  const rowGround = new Float32Array(height);
  for (let y = minRow; y < maxRow; y++) {
    let sky = 0;
    let ground = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (isSkyPixel(r, g, b)) sky++;
      if (isGroundPixel(r, g, b)) ground++;
    }
    rowSky[y] = sky / width;
    rowGround[y] = ground / width;
  }

  // Find best overall transition row for confidence estimation
  let bestScore = -1;
  const windowSize = 5;
  for (let y = minRow + windowSize; y < maxRow - windowSize; y++) {
    let skyAbove = 0;
    let groundBelow = 0;
    for (let k = 1; k <= windowSize; k++) {
      skyAbove += rowSky[y - k];
      groundBelow += rowGround[y + k];
    }
    const score = rowEdge[y] * (1 + skyAbove / windowSize) * (1 + groundBelow / windowSize);
    if (score > bestScore) bestScore = score;
  }

  const maxEdge = rowEdge.reduce((a, b) => Math.max(a, b), 0);
  const edgeConfidence = maxEdge > 0 ? Math.min(1, bestScore / (maxEdge * 4)) : 0.3;

  // Find left/right ground start independently for roll estimation
  const midX = Math.floor(width / 2);
  const leftY = findBandGroundStart(data, width, height, 0, Math.floor(midX * 0.9), minRow, maxRow);
  const rightY = findBandGroundStart(
    data,
    width,
    height,
    Math.ceil(midX * 1.1),
    width,
    minRow,
    maxRow,
  );

  return { leftY, rightY, edgeConfidence };
}

/**
 * Find the first row inside a horizontal band where ≥42 % of pixels are
 * "ground-ish" (plant, dirt, rock or hardscape but not sky), using a sliding
 * window of GROUND_WINDOW_ROWS rows.
 */
function findBandGroundStart(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  endX: number,
  minRow: number,
  maxRow: number,
): number {
  const bandWidth = Math.max(1, endX - startX);
  const rowScores = new Float32Array(height);

  for (let y = minRow; y <= maxRow; y++) {
    let groundish = 0;
    for (let x = startX; x < endX; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (!isSkyPixel(r, g, b) && isGroundPixel(r, g, b)) groundish++;
    }
    rowScores[y] = groundish / bandWidth;
  }

  for (let y = minRow; y <= maxRow - GROUND_WINDOW_ROWS; y++) {
    let avg = 0;
    for (let k = 0; k < GROUND_WINDOW_ROWS; k++) avg += rowScores[y + k];
    avg /= GROUND_WINDOW_ROWS;
    if (avg >= GROUND_THRESHOLD) return y;
  }

  // Fallback: assume ground starts at 55 % of the frame
  return Math.floor(height * 0.55);
}

// ---------------------------------------------------------------------------
// Pixel classifiers
// ---------------------------------------------------------------------------

function isSkyPixel(r: number, g: number, b: number): boolean {
  return b > g * 1.1 && b > r * 1.1 && b > 80;
}

function isGroundPixel(r: number, g: number, b: number): boolean {
  // Vegetation (green index)
  const vi = 2 * g - r - b;
  if (g > 45 && g > r * 1.08 && g > b * 1.08 && vi > 24) return true;
  // Dirt (reddish-brown, moderate saturation)
  const max = Math.max(r, g, b);
  const sat = max > 0 ? (max - Math.min(r, g, b)) / max : 0;
  if (r > g * 0.9 && g > b * 0.84 && sat > 0.1 && sat < 0.62) return true;
  // Hardscape / rock (neutral, not too bright)
  const brightness = (r + g + b) / 3;
  if (sat < 0.17 && brightness > 50 && brightness < 230) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Homography
// ---------------------------------------------------------------------------

/**
 * Compute a perspective-to-ortho homography from the visible ground trapezoid
 * to a unit square using the Direct Linear Transform.
 *
 * Source trapezoid (image space):
 *   P0 = (0,       groundStartLeft)   → (0,0)  top-left
 *   P1 = (width,   groundStartRight)  → (1,0)  top-right
 *   P2 = (width,   height)            → (1,1)  bottom-right
 *   P3 = (0,       height)            → (0,1)  bottom-left
 */
function computeGroundPlaneHomography(
  width: number,
  height: number,
  groundStartLeft: number,
  groundStartRight: number,
): GroundPlaneTransform {
  const src: [number, number][] = [
    [0, groundStartLeft],
    [width, groundStartRight],
    [width, height],
    [0, height],
  ];
  const dst: [number, number][] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];

  const H = computeHomographyDLT(src, dst);
  const groundCoverage = Math.max(0, height - (groundStartLeft + groundStartRight) / 2) / height;
  const confidence = Math.min(1, groundCoverage * 1.5);

  return { matrix: H, confidence };
}

/**
 * Solve for a 3×3 homography from 4 point correspondences using the Direct
 * Linear Transform (Gaussian elimination, partial pivoting, h[8] = 1).
 *
 * Each correspondence (px,py) → (qx,qy) contributes two equations:
 *   h0·px + h1·py + h2               − h6·px·qx − h7·py·qx = qx
 *             h3·px + h4·py + h5     − h6·px·qy − h7·py·qy = qy
 */
function computeHomographyDLT(
  src: [number, number][],
  dst: [number, number][],
): number[] {
  const n = 8; // unknowns (h0..h7; h8 = 1)
  // Build augmented 8×9 matrix [A | b]
  const M: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [px, py] = src[i];
    const [qx, qy] = dst[i];
    M.push([px, py, 1, 0, 0, 0, -px * qx, -py * qx, qx]);
    M.push([0, 0, 0, px, py, 1, -px * qy, -py * qy, qy]);
  }

  // Gaussian elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];

    const pivot = M[col][col];
    if (Math.abs(pivot) < 1e-12) continue;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = M[row][col] / pivot;
      for (let k = col; k <= n; k++) {
        M[row][k] -= factor * M[col][k];
      }
    }
  }

  const h = new Array<number>(9).fill(0);
  h[8] = 1;
  for (let i = 0; i < n; i++) {
    h[i] = Math.abs(M[i][i]) < 1e-12 ? 0 : M[i][n] / M[i][i];
  }
  return h;
}
