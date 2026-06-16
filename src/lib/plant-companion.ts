/**
 * Fetches and caches plant data from the An Incomplete Gardening Companion
 * dataset hosted on GitHub Pages. The lightweight index (~4,682 plants) is
 * loaded once and held in memory for the process lifetime.
 *
 * Data source: https://open-grove-labs.github.io/an-incomplete-gardening-companion/
 */

import { gunzipSync } from "zlib";

const BASE_URL =
  "https://open-grove-labs.github.io/an-incomplete-gardening-companion";

// Compact shape from the lightweight index (abbreviated keys)
type LightPlant = {
  f?: string;     // full scientific name
  c?: string[];   // common names
  cv?: string[];  // cultivar names
  g?: string;     // genus
  sp?: string;    // species epithet
  t?: string[];   // plant type (Shrub, Perennial, Annual…)
  z?: string[];   // USDA hardiness zones
  a?: string[];   // attracts (pollinators, birds…)
  r?: string[];   // resistance to challenges
  m?: string[];   // maintenance level
  l?: string[];   // light requirements
  s?: string[];   // soil preference
  ph?: string[];  // soil pH
  d?: string[];   // drainage
  p?: string[];   // problems / pests
  v?: string[];   // additional value
  tg?: string[];  // tags
  sup?: number[]; // companion-planting supports (indices into plantIndex)
  supBy?: number[]; // supported-by (indices into plantIndex)
};

type LightweightIndex = { plantIndex: string[] } & Record<string, LightPlant>;

let indexCache: LightweightIndex | null = null;

async function fetchIndex(): Promise<LightweightIndex> {
  if (indexCache) return indexCache;
  const res = await fetch(`${BASE_URL}/light-weight-data-set.json.gz`);
  if (!res.ok) throw new Error(`Plant index fetch failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  indexCache = JSON.parse(gunzipSync(buf).toString("utf8")) as LightweightIndex;
  return indexCache;
}

/**
 * Converts a scientific species string to the companion dataset's slug format.
 *
 * Examples:
 *   "Solanum lycopersicum"  → "solanum-lycopersicum"
 *   "Fragaria × ananassa"   → "fragaria-x-ananassa"
 *   "Brassica oleracea"     → "brassica-oleracea"
 *   "Mentha"                → "mentha"
 */
export function toCompanionSlug(species: string | null | undefined): string | null {
  if (!species) return null;
  return species
    .toLowerCase()
    .trim()
    .replace(/×/g, "x")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export type CompanionPlant = {
  fullName: string | null;
  commonNames: string[];
  plantType: string[];
  light: string[];
  hardinessZone: string[];
  maintenance: string[];
  resistance: string[];
  tags: string[];
  companionSlugs: string[];   // slugs of plants this one supports
  supportedBySlugs: string[]; // slugs of plants that support this one
};

/**
 * Look up a plant in the lightweight index by its companion slug.
 * Returns null if not found or if the fetch fails.
 */
export async function getCompanionPlant(
  slug: string
): Promise<CompanionPlant | null> {
  try {
    const index = await fetchIndex();
    const raw = index[slug];
    if (!raw) return null;
    return {
      fullName: raw.f ?? null,
      commonNames: raw.c ?? [],
      plantType: raw.t ?? [],
      light: raw.l ?? [],
      hardinessZone: raw.z ?? [],
      maintenance: raw.m ?? [],
      resistance: raw.r ?? [],
      tags: raw.tg ?? [],
      companionSlugs:
        (raw.sup ?? []).map((i) => index.plantIndex[i]).filter(Boolean),
      supportedBySlugs:
        (raw.supBy ?? []).map((i) => index.plantIndex[i]).filter(Boolean),
    };
  } catch {
    return null;
  }
}
