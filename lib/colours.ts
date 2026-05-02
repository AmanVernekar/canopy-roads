import { interpolateYlOrRd, interpolatePuBu } from "d3-scale-chromatic"

export type VulnerabilityAxis = "heat" | "flood" | "combined"

/**
 * Heat-vulnerability colour — yellow → orange → red sequential scale.
 */
export function vulnerabilityColour(normalisedScore: number): string {
  const t = Math.max(0, Math.min(1, normalisedScore))
  return interpolateYlOrRd(t)
}

/**
 * Flood-vulnerability colour — pale → deep blue. Distinct from the heat ramp
 * so axis-switches read instantly. Inverted so saturation grows with risk.
 */
export function floodColour(normalisedScore: number): string {
  const t = Math.max(0, Math.min(1, normalisedScore))
  return interpolatePuBu(t)
}

/**
 * Combined heat + flood — 3×3 bivariate grid. Both low → cream, heat-only →
 * orange, flood-only → blue, both high → magenta. Read by anchoring the two
 * axes to discrete levels (low / mid / high) — easier to scan than a true
 * continuous bivariate ramp.
 */
const COMBINED_PALETTE = [
  // [heatBucket][floodBucket]
  ["#f5efe1", "#cee0eb", "#7ba6c9"], // low heat
  ["#f0c4a4", "#c5a8c0", "#7796b9"], // mid heat
  ["#cc6a3c", "#b96a86", "#84497a"], // high heat
]
function bucket(t: number): 0 | 1 | 2 {
  if (t < 0.34) return 0
  if (t < 0.67) return 1
  return 2
}
export function combinedColour(heatNorm: number, floodNorm: number): string {
  return COMBINED_PALETTE[bucket(heatNorm)][bucket(floodNorm)]
}

/**
 * Normalise a raw vulnerability score given the observed min/max range.
 */
export function normaliseScore(
  score: number,
  min: number,
  max: number
): number {
  if (max === min) return 0.5
  return (score - min) / (max - min)
}

/**
 * Cheap synthetic flood-vulnerability proxy. Used until per-LSOA EA flood
 * data is loaded into Supabase. Combines:
 *   - low canopy (impermeable surfaces dominate)
 *   - high density (more impervious area per ha)
 *   - low IMD decile (fewer resources to prevent / recover from flooding)
 *   - building count (proxy for amount of property at risk)
 *
 * Returns 0–1. Marked as a *proxy* in the UI so it isn't confused with the
 * EA Flood Risk From Surface Water layer.
 */
export function syntheticFloodScore(rec: {
  canopy_cover_pct?: number | null
  pop_density_per_ha?: number | null
  imd_decile?: number | null
  building_count?: number | null
}): number {
  const canopy = rec.canopy_cover_pct ?? 15
  const dens = rec.pop_density_per_ha ?? 80
  const imd = rec.imd_decile ?? 5
  const bld = rec.building_count ?? 200
  // Each component 0–1
  const impervious = Math.max(0, Math.min(1, (30 - canopy) / 30))
  const density = Math.max(0, Math.min(1, dens / 250))
  const deprivation = Math.max(0, Math.min(1, (11 - imd) / 10))
  const builtMass = Math.max(0, Math.min(1, bld / 1000))
  return Math.round(
    (0.4 * impervious + 0.25 * density + 0.15 * deprivation + 0.2 * builtMass) * 1000
  ) / 1000
}

// Field-journal accents on the dark map. Selected = warm gold so it pops
// against the heat-vulnerability palette without clashing.
export const SELECTED_STROKE = "#f0c674"
export const DEFAULT_STROKE = "rgba(255,255,255,0.45)"
export const HOVER_STROKE = "rgba(255,255,255,0.9)"

/**
 * Pick a polygon fill colour for the requested axis.
 * The LsoaFeature type is partial because we extend it via ad-hoc helpers.
 */
export function fillForAxis(
  axis: VulnerabilityAxis,
  rec: {
    vulnerability_score?: number | null
    canopy_cover_pct?: number | null
    pop_density_per_ha?: number | null
    imd_decile?: number | null
    building_count?: number | null
  },
  scoreNorm: number
): string {
  if (axis === "heat") return vulnerabilityColour(scoreNorm)
  const flood = syntheticFloodScore(rec)
  if (axis === "flood") return floodColour(flood)
  return combinedColour(scoreNorm, flood)
}
