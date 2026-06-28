// Garden Vision — photo-to-garden-map heuristic pipeline.
//
// Ported from an-incomplete-gardening-companion. Given raw RGBA pixel data
// from a garden photo, estimates camera geometry and detects plant-shaped
// blobs of vegetation, then projects them onto a normalised ground plane and
// snaps them to a 6-inch grid — the same grid convention a Bed's layout
// would use.
//
// This is the cheap heuristic first pass (no model download, runs instantly
// in the browser). It is NOT yet wired up to create real Plant/Bed rows —
// see src/app/garden-vision/page.tsx for a demo page that runs it on an
// uploaded photo and shows the detection result. Turning detections into
// actual database rows needs a couple of schema decisions (does a detected
// blob become a Plant immediately, or a pending suggestion the user
// confirms?) that haven't been made yet.
export { HeuristicImageToMapPipeline } from "./heuristic-pipeline";
export { ClassicalGeometryEngine } from "./geometry-engine";
export { detectSinglePlant } from "./single-plant";
export type {
  CameraGeometryResult,
  GroundPlaneTransform,
  GeometryEngine,
  PlantInstanceDetection,
  PlantInstanceEngine,
  ProjectedPlant,
  PlantMapResult,
  SvgMapOptions,
  ImageToMapPipeline,
} from "./types";

import { HeuristicImageToMapPipeline } from "./heuristic-pipeline";
import type { ImageToMapPipeline } from "./types";

/**
 * Returns a pipeline that converts raw RGBA image data into a structured
 * PlantMapResult (2D garden map + SVG export).
 *
 * Currently always the heuristic CPU implementation. Swap in an ML-based
 * detector (e.g. the SAM/SegFormer stack prototyped in
 * public/icon-tool and in the ground-view project) by implementing
 * `ImageToMapPipeline` and returning it here instead.
 */
export function createGardenVisionPipeline(): ImageToMapPipeline {
  return new HeuristicImageToMapPipeline();
}
