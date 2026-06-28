// Single-plant detection — a deliberately simpler sibling to
// HeuristicImageToMapPipeline, for the photo-scan suggestion flow
// (src/app/gardens/[id]/scan), where the assumption is "this photo shows one
// plant, close up" rather than a wide shot of a bed with several plants.
//
// The multi-blob pipeline (heuristic-pipeline.ts) was built for that
// wide-bed case: it restricts detection to pixels below an estimated
// horizon, then runs 4-connected blob-finding, which means a single plant's
// leaves — separated by stems, shadows, or gaps — frequently get split into
// several disconnected "detections" once the camera is close enough to fill
// the frame. That's the wrong shape for "treat the whole photo as one
// plant," so this module skips camera-geometry/horizon estimation and
// connected-components entirely: it just finds the centroid and bounding
// box of ALL vegetation-coloured pixels in the frame and reports that as a
// single detection, with a heuristic confidence based on how much of the
// frame looks plant-like.

import type { PlantInstanceDetection } from "./types";

const DETECT_SCALE = 0.5;
const MIN_VEGETATION_PIXELS = 40;

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
 * Detects a single plant somewhere in a close-up photo. Always returns
 * exactly one PlantInstanceDetection — if no vegetation-coloured pixels
 * clear the threshold (e.g. a flower with little visible green, or a dry/
 * dormant plant), falls back to a centered box covering most of the frame,
 * on the assumption the photo was deliberately framed around the plant.
 */
export function detectSinglePlant(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): PlantInstanceDetection {
  const sw = Math.max(1, Math.round(width * DETECT_SCALE));
  const sh = Math.max(1, Math.round(height * DETECT_SCALE));
  const small = downsample(data, width, height, sw, sh);

  let sumX = 0, sumY = 0, count = 0;
  let minX = sw, maxX = 0, minY = sh, maxY = 0;

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const i = (y * sw + x) * 4;
      const r = small[i], g = small[i + 1], b = small[i + 2];
      const vi = 2 * g - r - b;
      if (g > 40 && g > r * 1.05 && g > b * 1.05 && vi > 18) {
        sumX += x;
        sumY += y;
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const invScale = 1 / DETECT_SCALE;

  if (count < MIN_VEGETATION_PIXELS) {
    return {
      bbox: {
        x: Math.round(width * 0.15),
        y: Math.round(height * 0.15),
        width: Math.round(width * 0.7),
        height: Math.round(height * 0.7),
      },
      centroid: { x: Math.round(width / 2), y: Math.round(height / 2) },
      confidence: 0.3,
    };
  }

  const coverage = count / (sw * sh);
  return {
    bbox: {
      x: Math.round(minX * invScale),
      y: Math.round(minY * invScale),
      width: Math.round((maxX - minX) * invScale),
      height: Math.round((maxY - minY) * invScale),
    },
    centroid: {
      x: Math.round((sumX / count) * invScale),
      y: Math.round((sumY / count) * invScale),
    },
    confidence: Math.min(1, 0.4 + coverage * 1.5),
  };
}
