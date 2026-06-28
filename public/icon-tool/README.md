# Plant Icon Tracer

A standalone tool for turning a plant photo into a hand-finishable SVG silhouette — the first step toward building agraria's own plant-icon set instead of using stock icons.

It's plain HTML/JS dropped into `public/`, not a Next.js page. No build step, no server-side code, nothing sent anywhere — the photo and the model both stay in your browser.

## Using it

Once agraria is deployed, open `https://<your-app>.vercel.app/icon-tool`. (Locally: `npm run dev`, then `http://localhost:3000/icon-tool`.)

1. Upload a plant photo — ideally one plant, reasonably separated from its background.
2. Click on the plant in the image. That point is the prompt for Segment Anything (SAM), the model that finds the plant's outline.
3. Click **Segment plant**. First run downloads the SAM model (~375 MB) — it's cached by the browser after that, so later sessions are fast. This can take a little while and a noticeable chunk of bandwidth the first time.
4. The traced silhouette appears alongside two sliders:
   - **Simplify** — how aggressively the outline is reduced to fewer points. Lower = more detail/noisier edges, higher = smoother/blockier.
   - **Smoothing** — how rounded the corners between points are. `0` gives a sharp-edged polygon; higher values round it off.
   Both update instantly — no need to re-run SAM to adjust them.
5. The fill/outline color is sampled automatically from the plant's average color in the photo.
6. Type a file name (matches agraria's plant-slug convention, e.g. `strawberry`, `tomato-cherry`) and hit **Export SVG**.

If the traced outline is wrong (wrong object, weird shape), just click a different point on the photo and segment again — the image stays loaded.

## What this is for

The exported SVG is a rough starting trace, not a finished icon — open it in any vector editor (Illustrator, Figma, Inkscape) and clean it up into the actual plant icon. The point of this tool is to skip the "draw a blob in the right silhouette" step, not to replace hand-finishing.

## How it works

- **Segmentation**: [Transformers.js](https://huggingface.co/docs/transformers.js) running [SAM](https://huggingface.co/Xenova/sam-vit-base) (Segment Anything) fully client-side, via WebGPU/WASM. Same model + loading pattern as the `ground-view` project's instance-segmentation step.
- **Tracing**: a small from-scratch library (`trace-core.js`) — Moore-neighbor boundary tracing on the binary mask, Ramer-Douglas-Peucker simplification adapted for closed contours, and quadratic-Bezier corner smoothing. It deliberately only traces the *outer* boundary, so interior holes (e.g. light gaps between leaves) don't punch holes in the silhouette.
- **Color**: a plain average of the photo's pixels under the mask.

`trace-core.js` has no DOM dependencies, so the same functions were verified against a synthetic test mask (with a deliberate concavity, an interior hole, and a thin protrusion) in Node before being wired into this page.

## Known limitations

- Works one plant/point at a time — no auto-detection of "all plants in this photo" yet. That's a reasonable next step once this hand-finishing loop feels good.
- SAM's first-run download is large. Nothing to do about that with a fully client-side model; it's a one-time cost per browser.
- I could not exercise the live SAM model end-to-end in my sandbox (it has no route to the CDN the model downloads from), so the segmentation step is verified by code-reading and by how closely it mirrors `ground-view`'s already-working SAM call, not by an actual run. The tracing math (the riskier, newly-written part) *was* verified end-to-end against a synthetic mask. Worth doing a real first pass yourself before relying on it.
