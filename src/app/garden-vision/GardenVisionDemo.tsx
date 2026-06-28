"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createGardenVisionPipeline, type PlantMapResult } from "@/lib/garden-vision";

const MAX_DIM = 1600; // cap getImageData size; the pipeline downsamples internally anyway

export function GardenVisionDemo() {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [result, setResult] = useState<PlantMapResult | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function onFile(file: File) {
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    setSvg(null);
    setResult(null);
    setStatus(null);
  }

  async function run() {
    if (!imgUrl) return;
    setBusy(true);
    setStatus("Analyzing…");
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
      const { data } = ctx.getImageData(0, 0, w, h);

      const pipeline = createGardenVisionPipeline();
      const mapResult = await pipeline.analyze(data, w, h);
      const svgString = pipeline.toSvg(mapResult, { svgWidth: 640, svgHeight: 480 });

      setResult(mapResult);
      setSvg(svgString);
      setStatus(
        `${mapResult.plantPositions.length} plant${mapResult.plantPositions.length === 1 ? "" : "s"} detected · geometry confidence ${(mapResult.geometry.confidence * 100).toFixed(0)}%`,
      );
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setImgUrl(null);
    setSvg(null);
    setResult(null);
    setStatus(null);
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
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          {!imgUrl ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-border rounded-lg py-10 text-center text-sm text-muted-foreground hover:bg-accent/40 transition-colors"
            >
              Click to upload a garden photo
            </button>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imgUrl} alt="Uploaded garden photo" className="rounded-lg max-h-80 mx-auto" />
          )}

          <div className="flex gap-2 mt-4">
            <Button onClick={run} disabled={!imgUrl || busy}>
              {busy ? "Analyzing…" : "Run detection"}
            </Button>
            <Button variant="outline" onClick={reset} disabled={!imgUrl}>
              New photo
            </Button>
          </div>
          {status && <p className="text-sm text-muted-foreground mt-2">{status}</p>}
        </CardContent>
      </Card>

      {svg && (
        <Card>
          <CardContent className="p-5">
            <p className="text-sm font-medium mb-3">Detected map</p>
            <div
              className="rounded-lg overflow-hidden border border-border"
              // The pipeline builds this SVG string itself (no user-supplied HTML) —
              // see src/lib/garden-vision/heuristic-pipeline.ts toSvg().
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardContent className="p-5">
            <p className="text-sm font-medium mb-3">Raw result</p>
            <pre className="text-xs bg-muted rounded-lg p-3 overflow-auto max-h-80">
              {JSON.stringify(result.plantPositions, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
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
