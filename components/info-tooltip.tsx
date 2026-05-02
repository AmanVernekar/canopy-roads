"use client"

import { Info } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface InfoTooltipProps {
  title: string
  body: React.ReactNode
}

export function InfoTooltip({ title, body }: InfoTooltipProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`What is ${title}?`}
          className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-ink-subtle hover:text-evidence-deep hover:bg-paper-deep transition-colors"
        >
          <Info size={10} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        className="w-64 bg-paper-elevated border-line-strong text-ink p-3"
      >
        <p className="text-[10px] font-mono text-evidence-deep uppercase tracking-widest mb-1.5">
          {title}
        </p>
        <div className="text-[11px] leading-relaxed text-ink-muted space-y-1.5">
          {body}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// Reusable explanations for the technical terms surfaced in the UI.
export const TERM_DEFINITIONS = {
  imd: {
    title: "IMD decile",
    body: (
      <>
        <p>
          UK government's <strong>Index of Multiple Deprivation</strong>. Each
          neighbourhood is ranked 1–10 against every other in England.
        </p>
        <p>
          <span className="text-heat-deep font-semibold">1</span> = most deprived 10%.{" "}
          <span className="text-evidence-deep font-semibold">10</span> = least deprived. Lower
          deciles often correlate with worse heat outcomes.
        </p>
      </>
    ),
  },
  vulnerability: {
    title: "Heat vulnerability",
    body: (
      <>
        <p>
          A <strong>0–1 composite score</strong> we compute from age profile
          (under-5 + over-65), deprivation, population density, and tree-canopy
          cover.
        </p>
        <p>
          Higher = more residents at risk on hot days. 0.7+ is severe; under
          0.4 is comparatively low.
        </p>
      </>
    ),
  },
  canopy: {
    title: "Canopy cover",
    body: (
      <>
        <p>
          The percentage of the area shaded by tree canopy from above. Source:
          Tree Equity Score / GLA i-Tree.
        </p>
        <p>
          UK urban average is ~16%. Below 10% in a dense neighbourhood is a
          strong signal for street-tree planting.
        </p>
      </>
    ),
  },
  density: {
    title: "Population density",
    body: (
      <>
        <p>
          Residents per hectare (ONS 2021 census). High density amplifies the
          urban heat island effect because more bodies, vehicles, and air-con
          units release waste heat into the same volume of air.
        </p>
      </>
    ),
  },
  lsoa: {
    title: "LSOA",
    body: (
      <>
        <p>
          <strong>Lower Layer Super Output Area</strong>. The smallest UK
          census geography — typically 400–1,200 households (~1,500 residents).
        </p>
        <p>
          Used by every UK government statistic, so it's the natural unit for
          targeting interventions and matching to funding criteria.
        </p>
      </>
    ),
  },
  treeEquity: {
    title: "Tree Equity Score",
    body: (
      <>
        <p>
          0–100 score from American Forests / Trees for Cities. Combines canopy
          gap, heat, deprivation, and health to flag where new trees deliver
          the most equity benefit.
        </p>
        <p>100 = no priority gap. Below 75 = priority for tree planting.</p>
      </>
    ),
  },
} as const
