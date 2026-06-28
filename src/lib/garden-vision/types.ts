// Garden Vision — types for the photo-to-garden-map heuristic pipeline.
//
// Ported from an-incomplete-gardening-companion's src/ml/types.ts. Trimmed to
// just the camera-geometry / plant-detection / map-result types this pipeline
// needs — the original file's ONNX-classifier types (PlantInferenceEngine,
// PlantEngineStatus) aren't included since the heuristic map pipeline doesn't
// depend on that classifier, and we don't have a model file to ship for it.

// ---------------------------------------------------------------------------
// Stage 1 – Camera geometry
// ---------------------------------------------------------------------------

/**
 * A 3×3 perspective-to-ortho homography (row-major, 9 elements) that maps
 * image pixel coordinates to normalised ground-plane coordinates [0..1, 0..1].
 */
export type GroundPlaneTransform = {
  /** Row-major 3×3 homography matrix */
  matrix: number[];
  /** Confidence in the estimated transform 0..1 */
  confidence: number;
};

export type CameraGeometryResult = {
  /** Camera pitch – positive = tilting down toward ground (degrees) */
  angleDeg: number;
  /** Camera roll / horizon tilt (degrees) */
  rollDeg: number;
  /** Horizon row as fraction of image height (0 = top, 1 = bottom) */
  horizonFraction: number;
  /** Estimated sky/ground boundary row on the left side (image pixels) */
  groundStartLeft: number;
  /** Estimated sky/ground boundary row on the right side (image pixels) */
  groundStartRight: number;
  /** Ground-plane homography for projecting image points to garden space */
  groundPlane: GroundPlaneTransform;
  /** Overall geometry confidence 0..1 */
  confidence: number;
};

export interface GeometryEngine {
  estimateFromRgba(data: Uint8ClampedArray, width: number, height: number): CameraGeometryResult;
}

// ---------------------------------------------------------------------------
// Stage 2 – Plant instance detection
// ---------------------------------------------------------------------------

export type PlantInstanceDetection = {
  /** Bounding box in original image pixels */
  bbox: { x: number; y: number; width: number; height: number };
  /** Centroid in original image pixels */
  centroid: { x: number; y: number };
  /** Detection confidence 0..1 */
  confidence: number;
  /** Optional species/genus label if a classifier ran */
  speciesLabel?: string;
  /** Species classification confidence 0..1 */
  speciesConfidence?: number;
};

export interface PlantInstanceEngine {
  detectRgba(
    data: Uint8ClampedArray,
    width: number,
    height: number,
  ): Promise<PlantInstanceDetection[]>;
}

// ---------------------------------------------------------------------------
// Stage 3 – Ground-plane projection
// ---------------------------------------------------------------------------

export type ProjectedPlant = {
  /** Position in normalised garden coords [0..1, 0..1] */
  gardenX: number;
  gardenY: number;
  /** Estimated radius in 6-inch grid squares */
  radiusInSquares: number;
  /** Underlying detection */
  detection: PlantInstanceDetection;
};

// ---------------------------------------------------------------------------
// Final map result (JSON, before SVG rendering)
// ---------------------------------------------------------------------------

export type PlantMapResult = {
  imageWidth: number;
  imageHeight: number;
  /** Camera geometry used for projection */
  geometry: CameraGeometryResult;
  /** Detected plant instances (image-space) */
  detections: PlantInstanceDetection[];
  /** Detections projected onto the ground plane */
  projectedPlants: ProjectedPlant[];
  /** Suggested grid dimensions (in 6-inch squares) for a garden-bed map */
  suggestedGridWidth: number;
  suggestedGridHeight: number;
  /** Ready-to-place positions — one per detected plant instance */
  plantPositions: Array<{
    plantName: string;
    gridX: number;
    gridY: number;
    size: number;
    confidence: number;
  }>;
};

// ---------------------------------------------------------------------------
// Full image-to-map pipeline interface
// ---------------------------------------------------------------------------

export type SvgMapOptions = {
  /** SVG viewport width in px (default 800) */
  svgWidth?: number;
  /** SVG viewport height in px (default 600) */
  svgHeight?: number;
  /** Vary plant opacity by detection confidence (default true) */
  showConfidence?: boolean;
  /** Render 6-inch grid lines (default true) */
  showGrid?: boolean;
};

export interface ImageToMapPipeline {
  /**
   * Run the full pipeline on raw RGBA pixel data.
   * Returns a structured result that can be rendered to SVG or used to seed
   * Plant rows for a Bed.
   */
  analyze(
    data: Uint8ClampedArray,
    width: number,
    height: number,
  ): Promise<PlantMapResult>;

  /** Render a PlantMapResult to an SVG string. */
  toSvg(result: PlantMapResult, options?: SvgMapOptions): string;
}
