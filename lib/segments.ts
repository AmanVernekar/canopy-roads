/**
 * v2 core domain types — road segments.
 *
 * Mirrors the pipeline output (pipeline/*.py → public/data/segments-*.json)
 * and, later, the road_segments PostGIS table. Keep the three in sync.
 *
 * Scoring philosophy (context.md §5): deterministic and transparent. Raw
 * metrics are stored alongside derived scores so the UI can reweight without
 * re-ingest. The combined score is ALWAYS computed client-side from the axis
 * scores + user-adjustable weights — never baked in.
 */

export type RoadClass =
  | "A Road"
  | "B Road"
  | "Classified Unnumbered"
  | "Unclassified"
  | "Unknown"
  | string

export interface FloodMetrics {
  /** % of the buffered segment footprint inside the 1-in-30 RoFSW extent. */
  extent_1in30_pct: number | null
  /** % inside the 1-in-100 extent. */
  extent_1in100_pct: number | null
  /** Max modelled depth band (m) intersecting the segment at 1-in-30. */
  depth_1in30_max: number | null
  /** Max modelled depth band (m) at 1-in-100. */
  depth_1in100_max: number | null
  /** EA hazard band if available (e.g. "Danger for some"). */
  hazard_band: string | null
  /** RoFSW suitability/confidence flag — surfaced verbatim in UI. */
  confidence: string | null
  /** % inside the 2050s (central allowance) climate-epoch extent. */
  extent_2050s_pct: number | null
}

export interface HeatMetrics {
  /** Mean land-surface temperature along segment (°C, modelled). */
  lst_mean: number | null
  /** Mean UTCI thermal-comfort index (°C equivalent, modelled). */
  utci_mean: number | null
  canopy_pct: number | null
  impervious_pct: number | null
}

export interface SegmentContext {
  /** Nearby heat-vulnerable assets (schools/care homes/hospitals) within 150m. */
  vulnerable_assets: Array<{ type: string; name: string; distance_m: number }>
  footfall_class: "high" | "medium" | "low" | null
  conservation_area: boolean | null
  existing_trees_count: number | null
}

export interface RoadSegment {
  segment_id: string
  os_link_id: string
  usrn: string | null
  street_name: string | null
  road_number: string | null
  road_class: RoadClass
  area_slug: string
  length_m: number
  flood: FloodMetrics
  /** 0–1 deterministic flood score. Formula documented in pipeline/flood_metrics.py. */
  flood_score: number | null
  heat: HeatMetrics | null
  /** 0–1 deterministic heat score (Tier 1+). */
  heat_score: number | null
  context: SegmentContext | null
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
