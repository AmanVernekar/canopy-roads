import { interpolateYlOrRd } from "d3-scale-chromatic"

/**
 * Map a normalised [0, 1] vulnerability score to a hex colour
 * using the YlOrRd sequential scale.
 */
export function vulnerabilityColour(normalisedScore: number): string {
  // Clamp to [0, 1]
  const t = Math.max(0, Math.min(1, normalisedScore))
  return interpolateYlOrRd(t)
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

// Field-journal accents on the dark map. Selected = warm gold so it pops
// against the heat-vulnerability palette without clashing.
export const SELECTED_STROKE = "#f0c674" // warm gold (paler than fund accent for visibility on dark map)
export const DEFAULT_STROKE = "rgba(255,255,255,0.45)"
export const HOVER_STROKE = "rgba(255,255,255,0.9)"
