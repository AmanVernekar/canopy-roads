"use client"

import { useEffect, useState } from "react"
import { AgentPanel } from "@/components/agent-panel"
// Static import keeps lib/store in a single bundle, so AgentPanel and LsoaMap
// share the same Zustand instance. We delay actually rendering LsoaMap until
// client-side mount because maplibre touches window.
import { LsoaMap } from "@/components/lsoa-map"

export default function Page() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-200">
      {/* ── Left column: 60% ── */}
      <section className="relative flex flex-col" style={{ width: "60%" }}>
        {/* Header bar */}
        <header className="flex-shrink-0 flex items-center gap-3 px-5 h-12 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-sm z-20">
          <div className="flex items-baseline gap-2.5">
            <span
              className="text-lg font-semibold tracking-tight text-zinc-100"
              style={{ fontFamily: "var(--font-geist-sans)", letterSpacing: "-0.03em" }}
            >
              Canopy
            </span>
            <span className="text-[11px] text-zinc-600 font-mono hidden sm:inline">
              Urban heat intervention planner
            </span>
          </div>
          <div className="flex-1" />
          <a
            href="#"
            className="text-[11px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            About
          </a>
        </header>

        {/* Map fills remaining height */}
        <div className="flex-1 relative">
          {mounted && <LsoaMap />}
        </div>
      </section>

      {/* ── Right column: 40% ── */}
      <section
        className="flex flex-col border-l border-zinc-800/60 overflow-y-auto shade-scroll"
        style={{ width: "40%", scrollbarWidth: "thin", scrollbarColor: "#27272a transparent" }}
      >
        <AgentPanel />
      </section>
    </main>
  )
}
