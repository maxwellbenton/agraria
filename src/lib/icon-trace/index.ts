// icon-trace — typed, in-app port of public/icon-tool's mask→SVG tracer plus
// a SAM point-prompt wrapper, used by the photo-scan suggestion flow
// (src/app/gardens/[id]/scan) to optionally turn a detected plant blob into
// an editable, copyable SVG icon alongside its suggested name/species.
export {
  largestComponent,
  traceBoundary,
  simplifyClosed,
  polygonToSmoothPath,
  averageColor,
  darken,
  rgbToHex,
} from "./trace-core";
export type { Point, RGB } from "./trace-core";

export { SamSegmenter } from "./sam-segmenter";
export type { SamLoadProgress } from "./sam-segmenter";
