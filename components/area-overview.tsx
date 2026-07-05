"use client"

import { useMemo } from "react"
import { Droplets, Info, Layers, Route } from "lucide-react"
import { useCanopyStore } from "@/lib/store"
import { combinedScore } from "@/lib/segments"

function Band({
  label,
  count,
  total,
  colour,
}: {
  label: string
  count: number
  total: number
  colour: string
}) {
  const pct = total ? (100 * count) / total : 0
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-mono text-ink-muted">{label}</span>
        <span className="text-[11px] font-mono text-ink">{count}</span>
      </div>
      <div className="h-1.5 bg-paper-deep rounded overflow-hidden mt-0.5">
        <div className={`h-full rounded ${colour}`} style={{ width: `${Math.max(1, pct)}%` }} />
      </div>
    </div>
  )
}

export function AreaOverview() {
  const segments = useCanopyStore((s) => s.segments)

  const stats = useMemo(() => {
    if (!segments) return null
    const scores = segments.features.map((f) => combinedScore(f.properties) ?? 0)
    const total = scores.length
    const high = scores.filter((s) => s >= 0.6).length
    const moderate = scores.filter((s) => s >= 0.35 && s < 0.6).length
    const mild = scores.filter((s) => s >= 0.1 && s < 0.35).length
    const low = total - high - moderate - mild
    const km = segments.features.reduce((a, f) => a + f.properties.length_m, 0) / 1000
    const futureUplift = segments.features.filter(
      (f) =>
        (f.properties.extent_2050s_pct ?? 0) >
        (f.properties.extent_high_pct ?? 0) +
          (f.properties.extent_medium_pct ?? 0) +
          (f.properties.extent_low_pct ?? 0) +
          10
    ).length
    return { total, high, moderate, mild, low, km, futureUplift }
  }, [segments])

  return (
    <div className="h-full flex flex-col overflow-y-auto shade-scroll">
      {/* ── Area card ── */}
      <div className="p-4 border-b border-line">
        <p className="text-[9px] font-mono text-ink-subtle uppercase tracking-widest mb-2">
          Study area
        </p>
        <p className="text-base font-serif font-semibold text-ink leading-tight">
          Peckham · Rye Lane corridor
        </p>
        <p className="text-[11px] text-ink-muted mt-1 leading-relaxed">
          London Borough of Southwark — road network scored for surface-water
          flood priority at street-segment level.
        </p>
        {stats && (
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div className="bg-paper-elevated border border-line rounded-md p-2.5">
              <div className="flex items-center gap-1.5">
                <Route size={10} className="text-ink-subtle" />
                <span className="text-[9px] font-mono text-ink-subtle uppercase tracking-widest">
                  Segments
                </span>
              </div>
              <p className="text-base font-mono font-medium text-ink mt-0.5">{stats.total}</p>
            </div>
            <div className="bg-paper-elevated border border-line rounded-md p-2.5">
              <div className="flex items-center gap-1.5">
                <Layers size={10} className="text-ink-subtle" />
                <span className="text-[9px] font-mono text-ink-subtle uppercase tracking-widest">
                  Network
                </span>
              </div>
              <p className="text-base font-mono font-medium text-ink mt-0.5">
                {stats.km.toFixed(0)}
                <span className="text-xs text-ink-subtle ml-1">km</span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Priority distribution ── */}
      {stats && (
        <div className="p-4 border-b border-line space-y-2">
          <p className="text-[9px] font-mono text-ink-subtle uppercase tracking-widest mb-1 flex items-center gap-1.5">
            <Droplets size={9} />
            Flood priority bands
          </p>
          <Band label="High (≥0.60)" count={stats.high} total={stats.total} colour="bg-danger" />
          <Band label="Moderate (0.35–0.60)" count={stats.moderate} total={stats.total} colour="bg-warn" />
          <Band label="Mild (0.10–0.35)" count={stats.mild} total={stats.total} colour="bg-flood" />
          <Band label="Negligible" count={stats.low} total={stats.total} colour="bg-ink-faint" />
          <p className="text-[10px] text-ink-muted leading-relaxed pt-1">
            {stats.futureUplift > 0 && (
              <>
                <span className="font-mono text-flood-deep">{stats.futureUplift}</span>{" "}
                segments show materially wider flood extent in the 2050s
                climate scenario than today.
              </>
            )}
          </p>
        </div>
      )}

      {/* ── Provenance + honesty ── */}
      <div className="p-4 space-y-2.5 flex-1">
        <p className="text-[9px] font-mono text-ink-subtle uppercase tracking-widest flex items-center gap-1.5">
          <Info size={9} />
          Data & framing
        </p>
        <div className="space-y-2 text-[10px] text-ink-muted leading-relaxed">
          <p>
            <span className="font-medium text-ink">Road network:</span> OS Open
            Roads (OGL). Links subdivided into ~100m scoring segments.
          </p>
          <p>
            <span className="font-medium text-ink">Flood modelling:</span>{" "}
            EA Risk of Flooding from Surface Water (OGL) — 2m-grid national
            modelling incl. the 2050s central-allowance climate scenario.
          </p>
          <p className="bg-fund-soft/50 border-l-2 border-fund/50 rounded-r px-2 py-1.5 text-fund-deep">
            Scores are <strong>indicative prioritisation signals</strong> for
            officer review — the EA states this modelling is not suitable for
            property-level decisions. Suggested interventions are drafts
            requiring drainage-engineering and highways sign-off.
          </p>
          <p>
            Scoring formula is fixed and transparent: 45% High-band extent, 20%
            Medium, 5% Low, 20% depth, 10% 2050s uplift. Heat axis lands next —
            weights become adjustable then.
          </p>
        </div>
      </div>
    </div>
  )
}
