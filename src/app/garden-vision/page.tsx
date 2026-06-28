import { GardenVisionDemo } from "./GardenVisionDemo";

export default function GardenVisionPage() {
  return (
    <div className="max-w-3xl mx-auto py-6">
      <h1 className="text-2xl font-bold mb-1">Garden Vision (prototype)</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Upload a garden photo to see the heuristic plant-detection pipeline run — camera
        geometry, plant blobs, and a projected 6-inch-grid map. This is a detection demo
        only; nothing here is saved to a Garden or Bed yet.
      </p>
      <GardenVisionDemo />
    </div>
  );
}
