"use client"

import { useEffect, useState } from "react"
import { HelpCircle, MapPin } from "lucide-react"
import { AgentPanel } from "@/components/agent-panel"
// Static import keeps lib/store in a single bundle, so AgentPanel and LsoaMap
// share the same Zustand instance. We delay actually rendering LsoaMap until
// client-side mount because maplibre touches window.
import { LsoaMap } from "@/components/lsoa-map"
import { IntroModal } from "@/components/intro-modal"
import { useCanopyStore, CITIES, type CitySlug } from "@/lib/store"

export default function Page() {
  const [mounted, setMounted] = useState(false)
  const [introOpen, setIntroOpen] = useState<boolean | undefined>(undefined)
  const selectedCity = useCanopyStore((s) => s.selectedCity)
  const setSelectedCity = useCanopyStore((s) => s.setSelectedCity)
  useEffect(() => setMounted(true), [])

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-paper text-ink">
      {/* ── Left column: 60% — map (intentionally dark, sits like an
          ink illustration on cream paper) ── */}
      <section className="relative flex flex-col" style={{ width: "60%" }}>
        {/* Header bar — paper-toned, document-like */}
        <header className="flex-shrink-0 flex items-center gap-3 px-5 h-12 border-b border-line bg-paper-elevated/95 backdrop-blur-sm z-20">
          <div className="flex items-baseline gap-2.5">
            <span
              className="text-lg font-semibold tracking-tight text-ink font-serif"
              style={{ letterSpacing: "-0.01em" }}
            >
              Canopy
            </span>
            <span className="text-[11px] text-ink-subtle font-mono hidden sm:inline">
              Climate adaptation planner · heat + flood
            </span>
          </div>
          <div className="flex-1" />
          {/* City selector */}
          <div className="flex items-center gap-1.5 mr-2">
            <MapPin size={11} className="text-ink-subtle" />
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value as CitySlug)}
              aria-label="Select city"
              className="bg-paper border border-line rounded px-2 py-1 text-[11px] font-mono text-ink hover:border-line-strong focus:outline-none focus:border-evidence/60 transition-colors"
            >
              {CITIES.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => setIntroOpen(true)}
            aria-label="Show intro"
            className="flex items-center gap-1 text-[11px] font-mono text-ink-subtle hover:text-ink transition-colors"
          >
            <HelpCircle size={12} />
            How this works
          </button>
        </header>

        {/* Map fills remaining height */}
        <div className="flex-1 relative">
          {mounted && <LsoaMap />}
        </div>
      </section>

      {/* ── Right column: 40% — agent / dossier ── */}
      <section
        className="flex flex-col border-l border-line overflow-y-auto shade-scroll bg-paper"
        style={{ width: "40%" }}
      >
        <AgentPanel />
      </section>

      {/* First-load intro + reopen-via-help-button. */}
      <IntroModal openOverride={introOpen} onClose={() => setIntroOpen(undefined)} />
    </main>
  )
}
