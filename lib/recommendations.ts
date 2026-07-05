/**
 * Tier 0 deterministic intervention recommendation.
 *
 * One rule-based recommendation per segment from its flood profile +
 * physical character. Deliberately simple and legible — this is the
 * placeholder the Tier 1 agent replaces for top-ranked segments (the agent
 * writes to recommendation_source: "agent"; this module is "deterministic").
 *
 * Language rules (context.md §10): "suggests", "for review" — never
 * "will flood" / "you should build".
 */

import type { RoadSegment } from "@/lib/segments"

export interface Recommendation {
  intervention: string
  rationale: string
}

export function deterministicRecommendation(
  seg: Pick<RoadSegment, "flood_score" | "road_class" | "extent_high_pct">
): Recommendation {
  const score = seg.flood_score ?? 0
  const extentHigh = seg.extent_high_pct ?? 0
  const isMainRoad =
    typeof seg.road_class === "string" && /^(A|B) Road/i.test(seg.road_class)

  if (score >= 0.6) {
    if (isMainRoad) {
      return {
        intervention: "Drainage capacity review + SuDS in adjacent verges",
        rationale:
          "High indicative surface-water accumulation on a classified road — suggests a gully/drainage capacity review with sustainable-drainage retrofits (e.g. verge bioretention) where highway constraints allow. Flagged for engineering review.",
      }
    }
    return {
      intervention: "Raingarden build-outs + permeable parking-bay surfacing",
      rationale:
        "High indicative surface-water accumulation on a residential/local street — suggests kerbside raingardens at low points and permeable resurfacing of parking bays to intercept runoff. Flagged for drainage-engineering review.",
    }
  }

  if (score >= 0.35 || extentHigh > 10) {
    return {
      intervention: "Raingarden at identified low point",
      rationale:
        "Moderate indicative surface-water risk — suggests a targeted raingarden or tree pit with structural soil at the segment's accumulation point. For officer review against local drainage records.",
    }
  }

  return {
    intervention: "No flood intervention indicated — monitor",
    rationale:
      "Low indicative surface-water risk on current national modelling. No action suggested; revisit when the council's own drainage records or the 2050s epoch layer indicate otherwise.",
  }
}
