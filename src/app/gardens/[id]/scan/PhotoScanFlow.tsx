"use client";

// Photo-scan suggestion flow.
//
// 1. Upload/take a photo → run the existing garden-vision heuristic pipeline
//    (src/lib/garden-vision) to detect plant-shaped blobs.
// 2. Each detection becomes a frontend-only "suggestion" — never written to
//    the database until the user explicitly clicks "Add to garden" for that
//    plant. All detected plants are grouped under one suggested Bed (default
//    name "Bed 1"), which the user must create first (so plants have
//    somewhere to attach to) and can rename before creating.
// 3. Optional: "Generate plant icons (SVG)" reuses the SAM-based tracer from
//    public/icon-tool (ported, typed, in src/lib/icon-trace) — instead of a
//    manual click-to-prompt point, it uses each detection's already-known
//    centroid as the point prompt. Generated SVGs are shown with a copyable
//    code block; they are NOT saved anywhere automatically — this is an
//    exploratory step for reviewing icons to possibly save for broader use
//    later, not a final icon pipeline.

import { useRef, useState, useCallback } from "react";
import { gql } from "@apollo/client";
import { useMutation } from "@apollo/client/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  createGardenVisionPipeline,
  type PlantInstanceDetection,
} from "@/lib/garden-vision";
import {
  SamSegmenter,
  traceBoundary,
  simplifyClosed,
  polygonToSmoothPath,
  averageColor,
  darken,
  rgbToHex,
} from "@/lib/icon-trace";

const MAX_DIM = 1600; // cap getImageData size; the pipeline downsamples internally anyway
const TRACE_EPSILON = 2;
const TRACE_SMOOTHING = 1;

const CREATE_BED = gql`mutation CreateBed($input: CreateBedInput!) { createBed(input: $input) { id } }`;
const CREATE_PLANT = gql`mutation CreatePlant($input: CreatePlantInput!) { createPlant(input: $input) { id } }`;

type PlantSvgState =
  | { status: "idle" }
  | { status: "loading"; message: string }
  | { status: "error"; message: string }
  | { status: "done"; svg: string };

type PlantSuggestion = {
  key: string;
  name: string;
  species: string;
  detection: PlantInstanceDetection;
  svg: PlantSvgState;
  added: boolean;
  adding: boolean;
};

export function PhotoScanFlow({ gardenId }: { gardenId: string }) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const samRef = useRef<SamSegmenter | null>(null);

  const [detecting, setDetecting] = useState(false);
  const [detectStatus, setDetectStatus] = useState<string | null>(null);
  const [plants, setPlants] = useState<PlantSuggestion[] | null>(null);

  const [bedName, setBedName] = useState("Bed 1");
  const [bedId, setBedId] = useState<string | null>(null);

  const [generateSvgs, setGenerateSvgs] = useState(false);

  const [createBed, { loading: creatingBed }] = useMutation(CREATE_BED);
  const [createPlant] = useMutation(CREATE_PLANT);

  function patchPlant(key: string, patch: Partial<PlantSuggestion>) {
    setPlants((prev) => prev?.map((p) => (p.key === key ? { ...p, ...patch } : p)) ?? prev);
  }

  const generateAllSvgs = useCallback(async (targets: PlantSuggestion[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const mark = (key: string, svg: PlantSvgState) =>
      setPlants((prev) => prev?.map((p) => (p.key === key ? { ...p, svg } : p)) ?? prev);

    for (const p of targets) mark(p.key, { status: "loading", message: "Waiting…" });

    try {
      if (!samRef.current) samRef.current = new SamSegmenter();
      const sam = samRef.current;

      await sam.loadModel((progress) => {
        for (const p of targets) {
          mark(p.key, {
            status: "loading",
            message: `Downloading SAM model: ${progress.pct}% (${progress.loadedMB.toFixed(0)} / ${progress.totalMB.toFixed(0)} MB, cached after first use)`,
          });
        }
      });

      for (const p of targets) mark(p.key, { status: "loading", message: "Encoding photo…" });
      await sam.encodeImage(canvas);

      const ctx = canvas.getContext("2d");
      const rgba = ctx?.getImageData(0, 0, canvas.width, canvas.height).data;

      for (const p of targets) {
        mark(p.key, { status: "loading", message: "Segmenting…" });
        try {
          const mask = await sam.segmentPoint(p.detection.centroid);
          const contour = traceBoundary(mask, canvas.width, canvas.height);
          const simplified = simplifyClosed(contour, TRACE_EPSILON);
          const path = polygonToSmoothPath(simplified, TRACE_SMOOTHING);
          const color = rgba
            ? averageColor(rgba, mask, canvas.width, canvas.height)
            : { r: 100, g: 140, b: 90 };
          const fill = rgbToHex(color);
          const stroke = rgbToHex(darken(color, 0.35));
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas.width} ${canvas.height}">\n  <path d="${path}" fill="${fill}" stroke="${stroke}" stroke-width="3"/>\n</svg>`;
          mark(p.key, { status: "done", svg });
        } catch (err) {
          mark(p.key, { status: "error", message: err instanceof Error ? err.message : String(err) });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      for (const p of targets) mark(p.key, { status: "error", message });
    }
  }, []);

  function onFile(file: File) {
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    setPlants(null);
    setDetectStatus(null);
    setBedId(null);
    setBedName("Bed 1");
    canvasRef.current = null;
  }

  async function runDetection() {
    if (!imgUrl) return;
    setDetecting(true);
    setDetectStatus("Analyzing photo…");
    try {
      const img = await loadImage(imgUrl);
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context unavailable");
      ctx.drawImage(img, 0, 0, w, h);
      canvasRef.current = canvas;

      const { data } = ctx.getImageData(0, 0, w, h);
      const pipeline = createGardenVisionPipeline();
      const result = await pipeline.analyze(data, w, h);

      const suggestions: PlantSuggestion[] = result.detections.map((detection, i) => ({
        key: `plant-${i}`,
        name: `Plant ${i + 1}`,
        species: "",
        detection,
        svg: { status: "idle" },
        added: false,
        adding: false,
      }));
      setPlants(suggestions);
      setDetectStatus(
        `${suggestions.length} plant${suggestions.length === 1 ? "" : "s"} detected · geometry confidence ${(result.geometry.confidence * 100).toFixed(0)}%`,
      );

      if (generateSvgs && suggestions.length > 0) {
        void generateAllSvgs(suggestions);
      }
    } catch (err) {
      setDetectStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDetecting(false);
    }
  }

  function toggleGenerateSvgs(checked: boolean) {
    setGenerateSvgs(checked);
    if (checked && plants && plants.length > 0) {
      void generateAllSvgs(plants);
    }
  }

  async function handleCreateBed() {
    const res = await createBed({ variables: { input: { gardenId, name: bedName } } });
    const id = (res.data as { createBed: { id: string } } | null | undefined)?.createBed?.id;
    if (id) setBedId(id);
  }

  async function handleAddPlant(key: string) {
    if (!bedId || !plants) return;
    const plant = plants.find((p) => p.key === key);
    if (!plant) return;
    patchPlant(key, { adding: true });
    await createPlant({
      variables: { input: { bedId, name: plant.name, species: plant.species || undefined } },
    });
    patchPlant(key, { adding: false, added: true });
  }

  function reset() {
    setImgUrl(null);
    setPlants(null);
    setDetectStatus(null);
    setBedId(null);
    setBedName("Bed 1");
    canvasRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="p-5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          {!imgUrl ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-border rounded-lg py-10 text-center text-sm text-muted-foreground hover:bg-accent/40 transition-colors"
            >
              Click to take or upload a garden photo
            </button>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imgUrl} alt="Uploaded garden photo" className="rounded-lg max-h-80 mx-auto" />
          )}

          <label className="flex items-center gap-2 mt-4 text-sm">
            <input
              type="checkbox"
              checked={generateSvgs}
              onChange={(e) => toggleGenerateSvgs(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Generate plant icons (SVG) for each detected plant
          </label>

          <div className="flex gap-2 mt-3">
            <Button onClick={runDetection} disabled={!imgUrl || detecting}>
              {detecting ? "Analyzing…" : "Detect plants & beds"}
            </Button>
            <Button variant="outline" onClick={reset} disabled={!imgUrl}>
              New photo
            </Button>
          </div>
          {detectStatus && <p className="text-sm text-muted-foreground mt-2">{detectStatus}</p>}
        </CardContent>
      </Card>

      {plants && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Suggested bed</p>
              {bedId ? (
                <span className="text-xs text-muted-foreground">Created ✓</span>
              ) : (
                <Button size="sm" onClick={handleCreateBed} disabled={creatingBed || !bedName.trim()}>
                  {creatingBed ? "Creating…" : "Create bed"}
                </Button>
              )}
            </div>
            <Input
              value={bedName}
              onChange={(e) => setBedName(e.target.value)}
              disabled={!!bedId}
              placeholder="Bed name"
            />
            {!bedId && (
              <p className="text-xs text-muted-foreground">
                All plants detected in this photo are grouped under one bed — create it, then add
                the plants you want below. Nothing is saved until you do.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {plants?.map((plant) => (
        <Card key={plant.key}>
          <CardContent className="p-5 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={plant.name}
                onChange={(e) => patchPlant(plant.key, { name: e.target.value })}
                disabled={plant.added}
                className="flex-1 min-w-40"
                placeholder="Plant name"
              />
              <Input
                value={plant.species}
                onChange={(e) => patchPlant(plant.key, { species: e.target.value })}
                disabled={plant.added}
                className="flex-1 min-w-40"
                placeholder="Species (optional)"
              />
              <Button
                size="sm"
                onClick={() => handleAddPlant(plant.key)}
                disabled={!bedId || plant.added || plant.adding}
                title={!bedId ? "Create the bed above first" : undefined}
              >
                {plant.added ? "Added ✓" : plant.adding ? "Adding…" : "Add to garden"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Detected at ({Math.round(plant.detection.centroid.x)}, {Math.round(plant.detection.centroid.y)}) ·
              confidence {(plant.detection.confidence * 100).toFixed(0)}%
            </p>

            {generateSvgs && <SvgPanel state={plant.svg} />}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── SVG preview/copy panel ────────────────────────────────────────────────────
// Pulled into its own component so TypeScript narrows `state` to the "done"
// variant (with a `svg` field) inside this function, rather than needing
// casts at the call site.

function SvgPanel({ state }: { state: PlantSvgState }) {
  const [copied, setCopied] = useState(false);

  async function copy(svg: string) {
    try {
      await navigator.clipboard.writeText(svg);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can be unavailable (e.g. non-HTTPS context); the raw
      // SVG is still visible and selectable in the textarea below.
    }
  }

  if (state.status === "idle") {
    return <p className="text-xs text-muted-foreground">Icon not generated yet.</p>;
  }
  if (state.status === "loading") {
    return (
      <div className="rounded-lg border border-border p-3 bg-muted/30">
        <p className="text-xs text-muted-foreground">{state.message}</p>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="rounded-lg border border-border p-3 bg-muted/30">
        <p className="text-xs text-destructive">Error generating icon: {state.message}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border p-3 bg-muted/30">
      <div className="flex items-start gap-3">
        <div
          className="w-20 h-20 shrink-0 rounded-md border border-border bg-background overflow-hidden [&_svg]:w-full [&_svg]:h-full"
          dangerouslySetInnerHTML={{ __html: state.svg }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-medium">SVG (exploratory — copy to save elsewhere)</p>
            <Button size="sm" variant="outline" onClick={() => copy(state.svg)}>
              {copied ? "Copied ✓" : "Copy SVG"}
            </Button>
          </div>
          <Textarea
            readOnly
            value={state.svg}
            className="text-xs font-mono h-20 resize-none min-h-0"
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      </div>
    </div>
  );
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
