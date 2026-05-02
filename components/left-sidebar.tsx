"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { History, Sparkles, ArrowRight } from "lucide-react"
import { useCanopyStore, type ParsedDossier } from "@/lib/store"
import { getSessionId } from "@/lib/session"
import { InterventionsBanner } from "@/components/interventions-banner"

interface SavedAnalysis {
  id: string
  lsoa_code: string
  area_name: string | null
  updated_at: string
  parsed_dossier: ParsedDossier | null
}

/**
 * Left context column — separate from the agent panel so live decision-making
 * (interventions banner) and historical context (saved analyses) don't crowd
 * the chat trace.
 */
export function LeftSidebar() {
  const selectedLsoa = useCanopyStore((s) => s.selectedLsoa)
  const setSelectedLsoa = useCanopyStore((s) => s.setSelectedLsoa)
  const messages = useCanopyStore((s) => s.liveMessages)
  const [analyses, setAnalyses] = useState<SavedAnalysis[]>([])

  // Refresh saved analyses for this session whenever the agent finishes a
  // turn (selectedLsoa or messages length changes). Best-effort.
  useEffect(() => {
    let cancelled = false
    const sid = getSessionId()
    if (!sid) return
    fetch(`/api/analyses?session=${encodeURIComponent(sid)}`)
      .then((r) => (r.ok ? r.json() : { analyses: [] }))
      .then((data) => {
        if (!cancelled) setAnalyses(data?.analyses ?? [])
      })
      .catch(() => {
        /* silent */
      })
    return () => {
      cancelled = true
    }
  }, [selectedLsoa, messages.length])

  return (
    <aside className="h-full flex flex-col overflow-hidden bg-paper-elevated/60 border-r border-line">
      {/* ─── Saved analyses ─── */}
      <div className="flex-shrink-0 border-b border-line p-3 max-h-[40vh] overflow-y-auto shade-scroll">
        <p className="text-[9px] font-mono text-ink-subtle uppercase tracking-widest mb-2 flex items-center gap-1.5">
          <History size={9} />
          Recent analyses
        </p>
        {analyses.length === 0 ? (
          <p className="text-[11px] text-ink-subtle italic py-1">
            Your past dossiers will appear here.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {analyses.map((a) => {
              const active = a.lsoa_code === selectedLsoa
              return (
                <li key={a.id}>
                  <button
                    onClick={() => setSelectedLsoa(a.lsoa_code)}
                    className={`w-full text-left rounded-md p-2 border transition-colors ${
                      active
                        ? "bg-evidence-soft border-evidence/40"
                        : "bg-paper border-line hover:border-line-strong"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p
                          className={`text-[12px] font-medium leading-tight truncate ${
                            active ? "text-evidence-deep" : "text-ink"
                          }`}
                        >
                          {a.area_name ?? a.lsoa_code}
                        </p>
                        <p className="text-[9px] font-mono text-ink-subtle mt-0.5 truncate">
                          {a.lsoa_code}
                          {a.parsed_dossier?.place_archetype &&
                            ` · ${a.parsed_dossier.place_archetype}`}
                        </p>
                      </div>
                      <ArrowRight
                        size={11}
                        className={
                          active ? "text-evidence-deep" : "text-ink-faint"
                        }
                      />
                    </div>
                    {a.parsed_dossier?.realistic_coverage_pct != null && (
                      <p className="text-[9px] font-mono text-ink-subtle mt-1">
                        £
                        {(a.parsed_dossier.total_cost_gbp ?? 0).toLocaleString()}{" "}
                        · {Math.round(a.parsed_dossier.realistic_coverage_pct)}
                        % realistic
                      </p>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* ─── Live interventions banner ─── */}
      <div className="flex-1 overflow-y-auto shade-scroll p-3">
        <p className="text-[9px] font-mono text-ink-subtle uppercase tracking-widest mb-2 flex items-center gap-1.5">
          <Sparkles size={9} />
          On the table
        </p>
        <AnimatePresence mode="wait">
          {messages.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <p className="text-[11px] text-ink-subtle italic">
                When the agent proposes interventions, they'll appear here —
                accepted, considered, or dropped.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="banner"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <InterventionsBanner messages={messages} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </aside>
  )
}
