"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AreaOverview } from "@/components/area-overview"
import { SegmentPanel } from "@/components/segment-panel"
// Map touches window — render only after client mount.
import { SegmentMap } from "@/components/segment-map"

// Minimum widths in percent so a column can't be dragged into invisibility.
const MIN_LEFT_PCT = 12
const MIN_RIGHT_PCT = 18
const MIN_CENTRE_PCT = 28
const STORAGE_KEY = "canopy-roads:column-widths-v1"

export default function Page() {
  const [mounted, setMounted] = useState(false)

  // Column widths in percent; centre = 100 - left - right.
  const [leftPct, setLeftPct] = useState(20)
  const [rightPct, setRightPct] = useState(28)
  const draggingRef = useRef<"left" | "right" | null>(null)

  useEffect(() => {
    setMounted(true)
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (typeof parsed?.left === "number" && typeof parsed?.right === "number") {
          setLeftPct(parsed.left)
          setRightPct(parsed.right)
        }
      }
    } catch {
      /* ignore */
    }
  }, [])

  const persist = useCallback((l: number, r: number) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ left: l, right: r }))
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return
      const vw = window.innerWidth || 1
      const xPct = (e.clientX / vw) * 100
      if (draggingRef.current === "left") {
        setLeftPct(Math.max(MIN_LEFT_PCT, Math.min(xPct, 100 - rightPct - MIN_CENTRE_PCT)))
      } else {
        setRightPct(
          Math.max(MIN_RIGHT_PCT, Math.min(100 - xPct, 100 - leftPct - MIN_CENTRE_PCT))
        )
      }
    }
    const onUp = () => {
      if (draggingRef.current) {
        draggingRef.current = null
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
        persist(leftPct, rightPct)
      }
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [leftPct, rightPct, persist])

  const startDrag = (which: "left" | "right") => (e: React.MouseEvent) => {
    e.preventDefault()
    draggingRef.current = which
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
  }

  const centrePct = Math.max(MIN_CENTRE_PCT, 100 - leftPct - rightPct)

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-paper text-ink">
      {/* ── Left: area overview + provenance ── */}
      <aside style={{ width: `${leftPct}%` }} className="flex flex-col h-full">
        <div className="flex-shrink-0 h-12 border-b border-line bg-paper-elevated/95 flex items-center px-4">
          <span className="text-[10px] font-mono text-ink-subtle uppercase tracking-widest">
            Area
          </span>
        </div>
        <div className="flex-1 min-h-0">
          <AreaOverview />
        </div>
      </aside>

      <ResizeHandle onMouseDown={startDrag("left")} />

      {/* ── Centre: segment map ── */}
      <section className="relative flex flex-col" style={{ width: `${centrePct}%` }}>
        <header className="flex-shrink-0 flex items-center gap-3 px-5 h-12 border-b border-line bg-paper-elevated/95 backdrop-blur-sm z-20">
          <div className="flex items-baseline gap-2.5">
            <span
              className="text-lg font-semibold tracking-tight text-ink font-serif"
              style={{ letterSpacing: "-0.01em" }}
            >
              Canopy
            </span>
            <span className="text-[11px] text-ink-subtle font-mono hidden sm:inline">
              Road-network climate-risk ranking · prototype
            </span>
          </div>
          <div className="flex-1" />
          <span className="text-[10px] font-mono text-ink-subtle hidden md:inline">
            Southwark · Peckham demo
          </span>
        </header>
        <div className="flex-1 relative">{mounted && <SegmentMap />}</div>
      </section>

      <ResizeHandle onMouseDown={startDrag("right")} />

      {/* ── Right: ranked segments + detail + export ── */}
      <section
        className="flex flex-col bg-paper overflow-hidden"
        style={{ width: `${rightPct}%` }}
      >
        <div className="flex-shrink-0 h-12 border-b border-line bg-paper-elevated/95 flex items-center px-4">
          <span className="text-[10px] font-mono text-ink-subtle uppercase tracking-widest">
            Priority ranking
          </span>
        </div>
        <div className="flex-1 min-h-0">
          <SegmentPanel />
        </div>
      </section>
    </main>
  )
}

function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      className="group relative flex-shrink-0 w-1 cursor-col-resize bg-line hover:bg-line-strong transition-colors"
    >
      <div className="absolute inset-y-0 -left-1.5 -right-1.5" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-8 bg-ink-faint opacity-0 group-hover:opacity-60 rounded transition-opacity" />
    </div>
  )
}
