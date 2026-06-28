// icon-trace/sam-segmenter.ts
//
// Browser-only wrapper around SAM (Segment Anything) via Transformers.js,
// ported from the point-prompt logic in public/icon-tool/main.js. The
// difference from that standalone tool: callers here already know *where*
// the plant is (a detection centroid from the garden-vision heuristic
// pipeline), so there's no manual click-to-prompt step — encode the photo
// once, then run as many point-prompts against it as there are detections.
//
// Transformers.js is loaded from a CDN at runtime (not bundled), exactly as
// in public/icon-tool, so this adds no weight to the main app bundle and
// only downloads (~375MB SAM weights, cached by the browser after first use)
// when a caller actually invokes loadModel().

import { largestComponent } from "./trace-core";

const SAM_MODEL_ID = "Xenova/sam-vit-base";
const TRANSFORMERS_URL =
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.4.0/dist/transformers.min.js";

// Minimal shape of the bits of the @huggingface/transformers module this
// file actually touches — the real module has no published types we can
// import without adding it as a build-time dependency.
type TensorLike = { data: ArrayLike<number> };
type SamProcessorOutput = {
  pixel_values: unknown;
  original_sizes: unknown;
  reshaped_input_sizes: unknown;
  input_points?: unknown;
  input_labels?: unknown;
};
type SamModelOutput = {
  pred_masks: unknown;
  iou_scores: TensorLike | TensorLike[];
};
type SamProcessor = {
  (image: unknown, opts?: { input_points: number[][][]; input_labels: number[][][] }):
    Promise<SamProcessorOutput>;
  post_process_masks: (
    predMasks: unknown,
    originalSizes: unknown,
    reshapedSizes: unknown,
  ) => Promise<unknown[]>;
};
type SamModel = {
  get_image_embeddings: (inputs: SamProcessorOutput) => Promise<{ image_embeddings: unknown }>;
  (inputs: {
    pixel_values: unknown;
    image_embeddings: unknown;
    input_points: unknown;
    input_labels: unknown;
  }): Promise<SamModelOutput>;
};
type TransformersModule = {
  env: { allowLocalModels: boolean };
  SamModel: { from_pretrained: (id: string, opts?: Record<string, unknown>) => Promise<SamModel> };
  AutoProcessor: { from_pretrained: (id: string) => Promise<SamProcessor> };
  RawImage: { fromURL: (url: string) => Promise<unknown> };
};

export type SamLoadProgress = { pct: number; loadedMB: number; totalMB: number };

// Webpack statically analyzes `import("literal/path")` and tries to bundle
// it; that's wrong here since this is a true runtime ESM import of a remote
// CDN URL (exactly like public/icon-tool's plain-script version does). Going
// through `new Function` keeps the import() call out of webpack's static
// analysis so it's resolved by the browser's native module loader instead.
const dynamicImport = (url: string): Promise<TransformersModule> =>
  new Function("u", "return import(u)")(url) as Promise<TransformersModule>;

let tfModulePromise: Promise<TransformersModule> | null = null;
async function getTransformers(): Promise<TransformersModule> {
  if (!tfModulePromise) {
    tfModulePromise = dynamicImport(TRANSFORMERS_URL).then((tf) => {
      tf.env.allowLocalModels = false;
      return tf;
    });
  }
  return tfModulePromise;
}

// Model + processor are cached at module scope (singleton) so multiple
// SamSegmenter instances across a session reuse the same ~375MB download.
let cachedModel: SamModel | null = null;
let cachedProcessor: SamProcessor | null = null;

/**
 * Encodes one photo and runs repeated point-prompt segmentation against it.
 * Create one instance per uploaded photo: call `encodeImage` once, then
 * `segmentPoint` once per detected plant centroid (cheap — reuses the same
 * image embeddings).
 */
export class SamSegmenter {
  private rawImage: unknown = null;
  private imageEmbeddings: unknown = null;
  private originalSizes: unknown = null;
  private reshapedSizes: unknown = null;
  private width = 0;
  private height = 0;

  /** Downloads (if not cached) and loads the SAM model + processor. */
  async loadModel(onProgress?: (p: SamLoadProgress) => void): Promise<void> {
    const tf = await getTransformers();
    if (cachedModel && cachedProcessor) return;
    cachedProcessor = await tf.AutoProcessor.from_pretrained(SAM_MODEL_ID);
    cachedModel = await tf.SamModel.from_pretrained(SAM_MODEL_ID, {
      dtype: "fp32",
      progress_callback: (p: { status: string; loaded?: number; total?: number }) => {
        if (p.status === "progress" && p.total && onProgress) {
          onProgress({
            pct: Math.round((p.loaded! / p.total) * 100),
            loadedMB: p.loaded! / 1e6,
            totalMB: p.total / 1e6,
          });
        }
      },
    });
  }

  /** Encodes the given canvas — call once per photo, before any segmentPoint calls. */
  async encodeImage(canvas: HTMLCanvasElement): Promise<void> {
    if (!cachedModel || !cachedProcessor) {
      throw new Error("SamSegmenter.loadModel() must complete before encodeImage()");
    }
    const tf = await getTransformers();
    this.width = canvas.width;
    this.height = canvas.height;
    this.rawImage = await tf.RawImage.fromURL(canvas.toDataURL("image/png"));
    const imageInputs = await cachedProcessor(this.rawImage);
    const enc = await cachedModel.get_image_embeddings(imageInputs);
    this.imageEmbeddings = enc.image_embeddings;
    this.originalSizes = imageInputs.original_sizes;
    this.reshapedSizes = imageInputs.reshaped_input_sizes;
  }

  /**
   * Runs SAM with a single foreground point prompt and returns a binary mask
   * (Uint8Array, length width*height of the encoded canvas) reduced to its
   * largest connected component.
   */
  async segmentPoint(point: { x: number; y: number }): Promise<Uint8Array> {
    if (!cachedModel || !cachedProcessor || !this.rawImage) {
      throw new Error("encodeImage() must complete before segmentPoint()");
    }
    const promptInputs = await cachedProcessor(this.rawImage, {
      input_points: [[[point.x, point.y]]],
      input_labels: [[[1]]],
    });
    // The model's ONNX graph expects pixel_values even when image_embeddings
    // is supplied (it just skips re-running the vision encoder) — omitting
    // it fails with "Missing the following inputs: pixel_values."
    const outputs = await cachedModel({
      pixel_values: promptInputs.pixel_values,
      image_embeddings: this.imageEmbeddings,
      input_points: promptInputs.input_points,
      input_labels: promptInputs.input_labels,
    });
    const masks = await cachedProcessor.post_process_masks(
      outputs.pred_masks,
      this.originalSizes,
      this.reshapedSizes,
    );

    const iouScores = outputs.iou_scores;
    const iouData = Array.isArray(iouScores) ? iouScores[0].data : iouScores.data;
    const scores = Array.from(iouData);
    const bestIdx = scores.indexOf(Math.max(...scores));
    const maskList = (Array.isArray(masks[0]) ? masks[0] : [masks[0]]) as TensorLike[];
    const tensor = maskList[Math.min(bestIdx, maskList.length - 1)];

    const w = this.width, h = this.height;
    const binary = new Uint8Array(w * h);
    for (let i = 0; i < binary.length; i++) binary[i] = tensor.data[i] > 0 ? 1 : 0;
    return largestComponent(binary, w, h);
  }
}
