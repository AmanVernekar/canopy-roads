/**
 * v2 core domain types — road segments.
 *
 * Mirrors the pipeline output (pipeline/*.py → public/data/segments-*.json)
 * and, later, the road_segments PostGIS table. Properties are FLAT — exactly
 * what GeoPandas writes — so no transform layer sits between pipeline and UI.
 * Keep pipeline, this file, and the SQL schema in sync.
 *
 * Scoring philosophy (context.md §5): deterministic and transparent. Raw
 * metrics ship alongside derived scores so the UI can reweight without
 * re-ingest. The combined score is ALWAYS computed client-side from the axis
 * scores + user-adjustable weights — never baked into the data.
 */

export interface RoadSegment {
  segment_id: string
  os_link_id: string
  usrn?: string | null
  street_name: string | null
  road_number: string | null
  road_class: string | null
  area_slug: string
  length_m: number

  // ── flood axis (EA RoFSW / NaFRA2, indicative national modelling) ──
  /** % of the 10m-buffered footprint in the High risk band (>= 1-in-30). */
  extent_high_pct: number | null
  /** % in the Medium band (1-in-30 → 1-in-100). */
  extent_medium_pct: number | null
  /** % in the Low band (1-in-100 → 1-in-1000). */
  extent_low_pct: number | null
  /** % of footprint where modelled depth exceeds 0.3m. */
  depth_03_pct: number | null
  /** Deepest depth threshold present (0.3 / 0.6 / 0.9), 0 if flooded shallow, null if dry. */
  depth_max_m: number | null
  /** % in the 2050s (central allowance) climate-epoch extent. */
  extent_2050s_pct: number | null
  /** 0–1 deterministic score — formula in pipeline/flood_metrics.py. */
  flood_score: number | null

  // ── heat axis (Tier 1 — null until ingested) ──
  heat_lst_mean?: number | null
  heat_utci_mean?: number | null
  canopy_pct?: number | null
  impervious_pct?: number | null
  heat_score?: number | null

  // ── recommendation ──
  /** Tier 0: deterministic rule. Tier 1+: agent-generated, evidence-cited. */
  recommended_intervention: string | null
  recommendation_rationale: string | null
  recommendation_source: "deterministic" | "agent" | null
}

/** GeoJSON feature as loaded from public/data/segments-<area>.json. */
export interface SegmentFeature {
  type: "Feature"
  geometry: GeoJSON.LineString
  properties: RoadSegment
}

export interface SegmentCollection {
  type: "FeatureCollection"
  features: SegmentFeature[]
}

/** User-adjustable axis weights for the combined priority score. */
export interface ScoreWeights {
  flood: number
  heat: number
}

export const DEFAULT_WEIGHTS: ScoreWeights = { flood: 0.5, heat: 0.5 }

/**
 * Combined priority score — the ONLY place it is computed. Transparent:
 * weighted mean of available axis scores, renormalised when an axis is
 * missing (Tier 0 has flood only, so combined == flood until heat lands).
 */
export function combinedScore(
  seg: Pick<RoadSegment, "flood_score" | "heat_score">,
  w: ScoreWeights = DEFAULT_WEIGHTS
): number | null {
  const parts: Array<[number, number]> = []
  if (seg.flood_score != null) parts.push([seg.flood_score, w.flood])
  if (seg.heat_score != null) parts.push([seg.heat_score, w.heat])
  if (parts.length === 0) return null
  const totalW = parts.reduce((a, [, pw]) => a + pw, 0)
  if (totalW === 0) return null
  return parts.reduce((a, [s, pw]) => a + s * pw, 0) / totalW
}
