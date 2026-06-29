"use client";

// Photo-scan suggestion flow — single plant per photo.
//
// 1. Upload/take a close-up photo of one plant → detectSinglePlant()
//    (src/lib/garden-vision/single-plant.ts) finds the plant's centroid and
//    bounding box. Unlike the multi-blob heuristic pipeline (built for wide
//    shots of a whole bed), this always returns exactly one detection — a
//    close-up photo's disconnected leaf/stem blobs are treated as one plant
//    instead of several.
// 2. The detection becomes a frontend-only "suggestion" (default name
//    "Plant 1", editable name/species) — nothing is written to the database
//    until the user picks an existing bed from the dropdown and clicks "Add
//    to garden". Bed *creation* isn't part of this flow; pick one of the
//    garden's existing beds (create one from the garden page first if there
//    are none yet).
// 3. Optional: "Generate plant icon (SVG)" reuses the SAM-based tracer from
//    public/icon-tool (ported, typed, in src/lib/icon-trace) — instead of a
//    manual click, it uses the detection's centroid as the point prompt.
//    The generated SVG is shown with a copyable code block; it is NOT saved
//    anywhere automatically — this is an exploratory step for reviewing
//    icons to possibly save for broader use later.

import { useRef, useState, useCallback } from "react";
import { gql } from "@apollo/client";
import { useMutation } from "@apollo/client/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  detectSinglePlant,
  type PlantInstanceDetection,
} from "@/lib/garden-vision";
import {
  SamSegmenter,
  traceBoundary,
  simplifyClosed,
  polygonToSmoothPath,
  averageColor,
  rgbToHex,
} from "@/lib/icon-trace";

const MAX_DIM = 1600; // cap getImageData size
const TRACE_EPSILON = 2;
const TRACE_SMOOTHING = 1;

const CREATE_PLANT = gql`mutation CreatePlant($input: CreatePlantInput!) { createPlant(input: $input) { id } }`;

type PlantSvgState =
  | { status: "idle" }
  | { status: "loading"; message: string }
  | { status: "error"; message: string }
  | { status: "done"; svg: string };

type PlantSuggestion = {
  name: string;
  species: string;
  detection: PlantInstanceDetection;
  svg: PlantSvgState;
  added: boolean;
  adding: boolean;
};

export function PhotoScanFlow({
  beds,
}: {
  beds: { id: string; name: string }[];
}) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const samRef = useRef<SamSegmenter | null>(null);

  const [detecting, setDetecting] = useState(false);
  const [detectStatus, setDetectStatus] = useState<string | null>(null);
  const [plant, setPlant] = useState<PlantSuggestion | null>(null);

  const [bedId, setBedId] = useState<string>(beds[0]?.id ?? "");

  const [generateSvg, setGenerateSvg] = useState(false);

  const [createPlant] = useMutation(CREATE_PLANT);

  function patchPlant(patch: Partial<PlantSuggestion>) {
    setPlant((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  const generateOneSvg = useCallback(async (detection: PlantInstanceDetection) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const mark = (svg: PlantSvgState) => setPlant((prev) => (prev ? { ...prev, svg } : prev));

    mark({ status: "loading", message: "Waiting…" });
    try {
      if (!samRef.current) samRef.current = new SamSegmenter();
      const sam = samRef.current;

      await sam.loadModel((progress) => {
        mark({
          status: "loading",
          message: `Downloading SAM model: ${progress.pct}% (${progress.loadedMB.toFixed(0)} / ${progress.totalMB.toFixed(0)} MB, cached after first use)`,
        });
      });

      // Encoding runs the SAM vision encoder on the main thread (no
      // progress events available, unlike the download above) and can take
      // several seconds — long enough to visibly stall the page. Set the
      // message, then yield one frame so the browser actually paints it
      // before the blocking work starts; the spinner in SvgPanel keeps
      // rendering after that and, if it does freeze mid-spin, the frozen
      // frame itself is a clearer "still working" signal than static text.
      mark({
        status: "loading",
        message: "Encoding photo… this can take several seconds and may briefly freeze the page",
      });
      await new Promise(requestAnimationFrame);
      await sam.encodeImage(canvas);

      mark({ status: "loading", message: "Segmenting…" });
      await new Promise(requestAnimationFrame);
      const mask = await sam.segmentPoint(detection.centroid);
      const contour = traceBoundary(mask, canvas.width, canvas.height);
      const simplified = simplifyClosed(contour, TRACE_EPSILON);
      const path = polygonToSmoothPath(simplified, TRACE_SMOOTHING);

      const ctx = canvas.getContext("2d");
      const rgba = ctx?.getImageData(0, 0, canvas.width, canvas.height).data;
      const color = rgba
        ? averageColor(rgba, mask, canvas.width, canvas.height)
        : { r: 100, g: 140, b: 90 };
      // Outline only — a filled blob in a flat average color reads as a
      // shapeless splotch, especially at icon size. An unfilled stroke in
      // the detected color keeps the silhouette legible.
      const stroke = rgbToHex(color);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas.width} ${canvas.height}">\n  <path d="${path}" fill="none" stroke="${stroke}" stroke-width="4" stroke-linejoin="round"/>\n</svg>`;
      mark({ status: "done", svg });
    } catch (err) {
      mark({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  function onFile(file: File) {
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    setPlant(null);
    setDetectStatus(null);
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
      const detection = detectSinglePlant(data, w, h);

      const suggestion: PlantSuggestion = {
        name: "Plant 1",
        species: "",
        detection,
        svg: { status: "idle" },
        added: false,
        adding: false,
      };
      setPlant(suggestion);
      setDetectStatus(`Plant detected · confidence ${(detection.confidence * 100).toFixed(0)}%`);

      if (generateSvg) {
        void generateOneSvg(detection);
      }
    } catch (err) {
      setDetectStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDetecting(false);
    }
  }

  function toggleGenerateSvg(checked: boolean) {
    setGenerateSvg(checked);
    if (checked && plant) {
      void generateOneSvg(plant.detection);
    }
  }

  async function handleAddPlant() {
    if (!bedId || !plant) return;
    patchPlant({ adding: true });
    await createPlant({
      variables: { input: { bedId, name: plant.name, species: plant.species || undefined } },
    });
    patchPlant({ adding: false, added: true });
  }

  function reset() {
    setImgUrl(null);
    setPlant(null);
    setDetectStatus(null);
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
              Click to take or upload a close-up photo of one plant
            </button>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imgUrl} alt="Uploaded plant photo" className="rounded-lg max-h-80 mx-auto" />
          )}

          <label className="flex items-center gap-2 mt-4 text-sm">
            <input
              type="checkbox"
              checked={generateSvg}
              onChange={(e) => toggleGenerateSvg(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Generate plant icon (SVG)
          </label>

          <div className="flex gap-2 mt-3">
            <Button onClick={runDetection} disabled={!imgUrl || detecting}>
              {detecting ? "Analyzing…" : "Detect plant"}
            </Button>
            <Button variant="outline" onClick={reset} disabled={!imgUrl}>
              New photo
            </Button>
          </div>
          {detectStatus && (
            <p className="text-sm text-muted-foreground mt-2 flex items-center gap-2">
              {detecting && <Spinner />}
              {detectStatus}
            </p>
          )}
        </CardContent>
      </Card>

      {plant && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={plant.name}
                onChange={(e) => patchPlant({ name: e.target.value })}
                disabled={plant.added}
                className="flex-1 min-w-40"
                placeholder="Plant name"
              />
              <Input
                value={plant.species}
                onChange={(e) => patchPlant({ species: e.target.value })}
                disabled={plant.added}
                className="flex-1 min-w-40"
                placeholder="Species (optional)"
              />
            </div>

            {beds.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                This garden has no beds yet — go back and create one before adding a plant.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={bedId}
                  onChange={(e) => setBedId(e.target.value)}
                  disabled={plant.added}
                  className="flex-1 min-w-40"
                >
                  {beds.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
                <Button onClick={handleAddPlant} disabled={!bedId || plant.added || plant.adding}>
                  {plant.added ? "Added ✓" : plant.adding ? "Adding…" : "Add to garden"}
                </Button>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Detected at ({Math.round(plant.detection.centroid.x)}, {Math.round(plant.detection.centroid.y)}) ·
              confidence {(plant.detection.confidence * 100).toFixed(0)}%
            </p>

            {generateSvg && <SvgPanel state={plant.svg} />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Loading spinner ───────────────────────────────────────────────────────────
// Pure CSS animation (Tailwind's `animate-spin`, a GPU-composited transform)
// rather than anything driven by JS ticks/intervals. During encodeImage() the
// main thread can be blocked for several seconds running the SAM vision
// encoder, so a JS-driven indicator (e.g. a percentage counter) would just
// sit frozen with no way to tell "stuck" from "not started". A CSS spinner
// keeps animating right up until the thread actually blocks, and a frozen
// mid-spin frame is itself a recognizable "the browser is busy" signal.
function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4 text-muted-foreground shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
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
      <div className="rounded-lg border border-border p-3 bg-muted/30 flex items-center gap-2">
        <Spinner />
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
