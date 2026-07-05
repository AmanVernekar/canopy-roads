"use client"

import { useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Download,
  Droplets,
  ListOrdered,
  MapPin,
  Search,
  X,
} from "lucide-react"
import { useCanopyStore } from "@/lib/store"
import { combinedScore, type RoadSegment, type SegmentFeature } from "@/lib/segments"

function scoreColour(score: number | null): string {
  const s = score ?? 0
  if (s >= 0.6) return "text-danger"
  if (s >= 0.35) return "text-warn"
  if (s >= 0.15) return "text-flood"
  return "text-ink-subtle"
}

function scoreBarColour(score: number | null): string {
  const s = score ?? 0
  if (s >= 0.6) return "bg-danger"
  if (s >= 0.35) return "bg-warn"
  if (s >= 0.15) return "bg-flood"
  return "bg-ink-faint"
}

function segLabel(p: RoadSegment): string {
  return p.street_name ?? p.road_number ?? "Unnamed street"
}

/** Download the current ranked segment set as a self-contained GeoJSON. */
function exportGeoJSON(features: SegmentFeature[]) {
  const ranked = features.map((f, i) => ({
    ...f,
    properties: {
      ...f.properties,
      rank: i + 1,
      combined_score: combinedScore(f.properties),
      // Self-containment: attribution + framing carried in the file itself.
      _source:
        "Canopy prototype — OS Open Roads (OGL) x EA Risk of Flooding from Surface Water (OGL, indicative). Scores are prioritisation signals for officer review, not property-level prediction.",
    },
  }))
  const fc = { type: "FeatureCollection", features: ranked }
  const blob = new Blob([JSON.stringify(fc)], { type: "application/geo+json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "canopy-segments-peckham-ranked.geojson"
  a.click()
  URL.revokeObjectURL(url)
}

export function SegmentPanel() {
  const segments = useCanopyStore((s) => s.segments)
  const selectedSegmentId = useCanopyStore((s) => s.selectedSegmentId)
  const setSelectedSegmentId = useCanopyStore((s) => s.setSelectedSegmentId)
  const setHoveredSegmentId = useCanopyStore((s) => s.setHoveredSegmentId)
  const [query, setQuery] = useState("")

  const ranked = useMemo(() => {
    if (!segments) return []
    const fs = [...segments.features]
    fs.sort(
      (a, b) => (combinedScore(b.properties) ?? 0) - (combinedScore(a.properties) ?? 0)
    )
    return fs
  }, [segments])

  const visible = useMemo(() => {
    if (!query.trim()) return ranked
    const q = query.trim().toLowerCase()
    return ranked.filter((f) =>
      (f.properties.street_name ?? "").toLowerCase().includes(q)
    )
  }, [ranked, query])

  const selected = useMemo(
    () =>
      selectedSegmentId
        ? ranked.find((f) => f.properties.segment_id === selectedSegmentId) ?? null
        : null,
    [ranked, selectedSegmentId]
  )
  const selectedRank = selected
    ? ranked.findIndex((f) => f.properties.segment_id === selectedSegmentId) + 1
    : null

  if (!segments) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-xs font-mono text-ink-subtle">Loading segments…</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Selected segment detail ── */}
      <AnimatePresence>
        {selected && (
          <motion.div
            key={selected.properties.segment_id}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex-shrink-0 border-b border-line p-4 bg-paper-elevated max-h-[55%] overflow-y-auto shade-scroll"
          >
            <SegmentDetail
              seg={selected.properties}
              rank={selectedRank!}
              total={ranked.length}
              onClose={() => setSelectedSegmentId(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Ranked list header ── */}
      <div className="flex-shrink-0 px-4 pt-3 pb-2 space-y-2">
        <div className="flex items-center gap-2">
          <p className="text-[9px] font-mono text-ink-subtle uppercase tracking-widest flex-1 flex items-center gap-1.5">
            <ListOrdered size={10} />
            Ranked segments ({visible.length})
          </p>
          <button
            onClick={() => exportGeoJSON(ranked)}
            className="flex items-center gap-1.5 text-[10px] font-mono text-evidence-deep bg-evidence-soft hover:bg-evidence-soft/80 border border-evidence/40 rounded-md px-2 py-1 transition-colors"
            title="Ranked GeoJSON with full attribute table — drops into QGIS/ArcGIS"
          >
            <Download size={10} />
            GeoJSON
          </button>
        </div>
        <div className="relative">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by street name…"
            className="w-full bg-paper border border-line rounded-md pl-7 pr-3 py-1.5 text-[12px] text-ink placeholder:text-ink-subtle focus:outline-none focus:border-evidence/60 transition-colors"
          />
        </div>
      </div>

      {/* ── Ranked list ── */}
      <div className="flex-1 overflow-y-auto shade-scroll px-4 pb-4 space-y-1">
        {visible.slice(0, 200).map((f) => {
          const p = f.properties
          const score = combinedScore(p) ?? 0
          const rank = ranked.indexOf(f) + 1
          const active = p.segment_id === selectedSegmentId
          return (
            <button
              key={p.segment_id}
              onClick={() => setSelectedSegmentId(active ? null : p.segment_id)}
              onMouseEnter={() => setHoveredSegmentId(p.segment_id)}
              onMouseLeave={() => setHoveredSegmentId(null)}
              className={`w-full text-left rounded-md border px-2.5 py-2 transition-colors ${
                active
                  ? "bg-fund-soft border-fund/50"
                  : "bg-paper-elevated border-line hover:border-line-strong"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-ink-subtle w-8 flex-shrink-0">
                  #{rank}
                </span>
                <span className="text-[12px] font-medium text-ink truncate flex-1">
                  {segLabel(p)}
                </span>
                <span className={`text-[12px] font-mono ${scoreColour(score)}`}>
                  {score.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1 pl-10">
                <div className="flex-1 h-1 bg-paper-deep rounded overflow-hidden">
                  <div
                    className={`h-full rounded ${scoreBarColour(score)}`}
                    style={{ width: `${Math.max(2, score * 100)}%` }}
                  />
                </div>
                <span className="text-[9px] font-mono text-ink-subtle">
                  {p.road_class ?? "—"} · {Math.round(p.length_m)}m
                </span>
              </div>
            </button>
          )
        })}
        {visible.length > 200 && (
          <p className="text-[10px] font-mono text-ink-subtle text-center pt-2">
            Showing top 200 — use the filter or export for the full set.
          </p>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value, unit }: { label: string; value: string | number | null; unit?: string }) {
  return (
    <div className="bg-paper-deep rounded p-2">
      <p className="text-[8px] font-mono text-ink-subtle uppercase tracking-widest">{label}</p>
      <p className="text-[12px] font-mono text-ink mt-0.5">
        {value ?? "—"}
        {value != null && unit ? <span className="text-ink-subtle ml-0.5">{unit}</span> : null}
      </p>
    </div>
  )
}

function SegmentDetail({
  seg,
  rank,
  total,
  onClose,
}: {
  seg: RoadSegment
  rank: number
  total: number
  onClose: () => void
}) {
  const score = combinedScore(seg)
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[9px] font-mono text-ink-subtle uppercase tracking-widest flex items-center gap-1.5">
            <MapPin size={9} />
            Segment · rank #{rank} of {total}
          </p>
          <p className="text-base font-serif font-semibold text-ink leading-tight mt-0.5">
            {segLabel(seg)}
          </p>
          <p className="text-[10px] font-mono text-ink-muted mt-0.5">
            {seg.road_class ?? "Unclassified"} · {Math.round(seg.length_m)}m ·{" "}
            {seg.segment_id}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-ink-subtle hover:text-ink flex-shrink-0 p-1 rounded hover:bg-paper-deep"
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>

      {/* Score strip */}
      <div className="flex items-center gap-3 bg-paper-deep rounded-md p-2.5">
        <Droplets size={14} className="text-flood flex-shrink-0" />
        <div className="flex-1">
          <div className="flex items-baseline justify-between">
            <span className="text-[9px] font-mono text-ink-subtle uppercase tracking-widest">
              Flood priority score
            </span>
            <span className={`text-base font-mono font-semibold ${scoreColour(score)}`}>
              {(score ?? 0).toFixed(2)}
            </span>
          </div>
          <div className="h-1.5 bg-paper rounded overflow-hidden mt-1">
            <div
              className={`h-full rounded ${scoreBarColour(score)}`}
              style={{ width: `${Math.max(2, (score ?? 0) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Raw metrics — transparency over the score */}
      <div className="grid grid-cols-3 gap-1.5">
        <Metric label="High band" value={seg.extent_high_pct} unit="%" />
        <Metric label="Med band" value={seg.extent_medium_pct} unit="%" />
        <Metric label="Low band" value={seg.extent_low_pct} unit="%" />
        <Metric label="Depth ≥0.3m" value={seg.depth_03_pct} unit="%" />
        <Metric label="Max depth" value={seg.depth_max_m} unit="m" />
        <Metric label="2050s extent" value={seg.extent_2050s_pct} unit="%" />
      </div>

      {/* Recommendation */}
      {seg.recommended_intervention && (
        <div className="bg-evidence-soft/50 border-l-2 border-evidence/50 rounded-r-md p-2.5 space-y-1">
          <p className="text-[9px] font-mono text-evidence-deep uppercase tracking-widest">
            Suggested for review
            <span className="ml-2 normal-case tracking-normal text-ink-subtle">
              ({seg.recommendation_source === "agent" ? "agent-reasoned" : "rule-based"})
            </span>
          </p>
          <p className="text-[12px] font-medium text-ink">{seg.recommended_intervention}</p>
          {seg.recommendation_rationale && (
            <p className="text-[11px] text-ink-muted leading-relaxed">
              {seg.recommendation_rationale}
            </p>
          )}
        </div>
      )}

      <p className="text-[9px] font-mono text-ink-subtle italic leading-relaxed">
        Indicative national-scale modelling (EA RoFSW) — a prioritisation signal
        for officer review, not a property-level flood prediction.
      </p>
    </div>
  )
}
