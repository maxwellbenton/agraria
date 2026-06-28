// trace-core.js
// Pure functions for turning a binary mask into a smoothed SVG path.
// No DOM/browser deps — runs the same in Node (for testing) and in the browser.

/**
 * Largest connected component (4-connectivity) of a binary mask, returned as
 * a same-size Uint8Array with only that component set to 1. Keeps the tracer
 * robust if SAM returns a couple of stray pixels outside the main blob.
 */
export function largestComponent(mask, w, h) {
  const visited = new Uint8Array(w * h);
  let best = null;
  let bestSize = 0;

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;
    const stack = [start];
    visited[start] = 1;
    const pixels = [];
    while (stack.length) {
      const idx = stack.pop();
      pixels.push(idx);
      const x = idx % w, y = (idx / w) | 0;
      const neighbours = [
        x > 0 ? idx - 1 : -1,
        x < w - 1 ? idx + 1 : -1,
        y > 0 ? idx - w : -1,
        y < h - 1 ? idx + w : -1,
      ];
      for (const n of neighbours) {
        if (n >= 0 && mask[n] && !visited[n]) {
          visited[n] = 1;
          stack.push(n);
        }
      }
    }
    if (pixels.length > bestSize) {
      bestSize = pixels.length;
      best = pixels;
    }
  }

  const out = new Uint8Array(w * h);
  if (best) for (const idx of best) out[idx] = 1;
  return out;
}

/**
 * Moore-neighbour boundary tracing on a binary mask (1 = foreground).
 * Returns an ordered, closed list of {x, y} points along the OUTER boundary
 * only — interior holes are not traced, which is what we want for a solid
 * plant silhouette icon.
 *
 * Mask is padded internally by 1px of background so boundary pixels on the
 * image edge are handled the same as interior ones.
 */
export function traceBoundary(mask, w, h) {
  const pw = w + 2, ph = h + 2;
  const padded = new Uint8Array(pw * ph);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) padded[(y + 1) * pw + (x + 1)] = 1;
    }
  }

  const isFg = (x, y) => x >= 0 && y >= 0 && x < pw && y < ph && padded[y * pw + x] !== 0;

  // Find the first foreground pixel, scanning row-major (topmost, then leftmost).
  let startX = -1, startY = -1;
  for (let y = 0; y < ph && startX < 0; y++) {
    for (let x = 0; x < pw; x++) {
      if (isFg(x, y)) { startX = x; startY = y; break; }
    }
  }
  if (startX < 0) return [];

  // 8-connected neighbour offsets in clockwise order starting at North.
  const DIRS = [
    [0, -1], [1, -1], [1, 0], [1, 1],
    [0, 1], [-1, 1], [-1, 0], [-1, -1],
  ];

  const contour = [];
  let cx = startX, cy = startY;
  // We scanned left-to-right to find the start pixel, so the pixel to its
  // west is guaranteed background — begin the clockwise search from there.
  let backDir = 6; // index into DIRS for West

  const MAX_STEPS = pw * ph * 8;
  let steps = 0;
  let firstMove = true;

  while (steps++ < MAX_STEPS) {
    contour.push({ x: cx - 1, y: cy - 1 }); // un-pad back to original coords

    let found = false;
    // Search clockwise starting just after the direction we arrived from.
    for (let i = 1; i <= 8; i++) {
      const di = (backDir + i) % 8;
      const [dx, dy] = DIRS[di];
      const nx = cx + dx, ny = cy + dy;
      if (isFg(nx, ny)) {
        cx = nx; cy = ny;
        backDir = (di + 4) % 8; // direction back to the pixel we came from
        found = true;
        break;
      }
    }

    if (!found) break; // isolated single pixel
    if (cx === startX && cy === startY && !firstMove) break;
    firstMove = false;
  }

  return contour;
}

/** Perpendicular distance from point p to the line through a–b. */
function perpDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

/** Ramer–Douglas–Peucker simplification of an open polyline. */
function rdp(points, epsilon) {
  if (points.length < 3) return points.slice();
  const a = points[0], b = points[points.length - 1];
  let maxDist = -1, maxIdx = -1;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], a, b);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }
  if (maxDist > epsilon) {
    const left = rdp(points.slice(0, maxIdx + 1), epsilon);
    const right = rdp(points.slice(maxIdx), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [a, b];
}

/**
 * Simplify a CLOSED contour. Splits at two far-apart anchor points so RDP
 * (which is defined for open polylines) doesn't get confused by the wraparound.
 */
export function simplifyClosed(points, epsilon) {
  if (points.length < 4) return points;

  // Pick the point farthest from points[0] as the second anchor.
  let farIdx = 0, farDist = -1;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i].x - points[0].x, points[i].y - points[0].y);
    if (d > farDist) { farDist = d; farIdx = i; }
  }

  const half1 = points.slice(0, farIdx + 1);
  const half2 = points.slice(farIdx).concat([points[0]]);

  const s1 = rdp(half1, epsilon);
  const s2 = rdp(half2, epsilon);

  return s1.slice(0, -1).concat(s2.slice(0, -1));
}

/**
 * Turn a simplified closed polygon into an SVG path string.
 *
 * smoothing=0   -> straight-edged polygon (sharp vertices).
 * smoothing=1   -> quadratic curve through each vertex, anchored at edge
 *                  midpoints (mild, standard "rounded corner" look).
 * smoothing>1   -> (up to 2) blends further toward a flattened/blobby curve
 *                  by pulling each control point toward the midpoint of its
 *                  two neighbouring edge-midpoints.
 */
export function polygonToSmoothPath(points, smoothing = 1) {
  const n = points.length;
  if (n < 3) return "";
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  if (smoothing <= 0) {
    let d = `M ${points[0].x} ${points[0].y} `;
    for (let i = 1; i < n; i++) d += `L ${points[i].x} ${points[i].y} `;
    return d + "Z";
  }

  const flattenAmount = Math.max(0, Math.min(1, smoothing - 1));

  const mids = points.map((p, i) => mid(p, points[(i + 1) % n]));
  let d = `M ${mids[n - 1].x.toFixed(2)} ${mids[n - 1].y.toFixed(2)} `;
  for (let i = 0; i < n; i++) {
    const curr = points[i];
    const prevMid = mids[(i - 1 + n) % n];
    const nextMid = mids[i];
    const flattened = mid(prevMid, nextMid);
    const ctrlX = curr.x + (flattened.x - curr.x) * flattenAmount;
    const ctrlY = curr.y + (flattened.y - curr.y) * flattenAmount;
    d += `Q ${ctrlX.toFixed(2)} ${ctrlY.toFixed(2)} ${nextMid.x.toFixed(2)} ${nextMid.y.toFixed(2)} `;
  }
  return d + "Z";
}

/** Average RGB over masked pixels of an RGBA image buffer. */
export function averageColor(rgba, mask, w, h) {
  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) continue;
    r += rgba[i * 4];
    g += rgba[i * 4 + 1];
    b += rgba[i * 4 + 2];
    count++;
  }
  if (!count) return { r: 100, g: 140, b: 90 };
  return { r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count) };
}

export function darken({ r, g, b }, amount = 0.35) {
  return {
    r: Math.round(r * (1 - amount)),
    g: Math.round(g * (1 - amount)),
    b: Math.round(b * (1 - amount)),
  };
}

export function rgbToHex({ r, g, b }) {
  const h = (v) => v.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}
