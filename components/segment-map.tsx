"use client"

import { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import maplibregl from "maplibre-gl"
import { useCanopyStore } from "@/lib/store"
import type { SegmentCollection } from "@/lib/segments"

// Dark Carto basemap — the road-risk ramp is designed against it. Reads as an
// ink illustration inside the paper-toned app frame (theme carried from v1).
const DARK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    },
  },
  layers: [{ id: "carto", type: "raster", source: "carto", minzoom: 0, maxzoom: 19 }],
}

// Risk ramp on dark ground: dim slate (negligible) → azure (moderate) →
// amber → red (high priority). Semantics over aesthetics: red = look here.
const SCORE_RAMP: (string | number)[] = [
  0, "#3d4a63",
  0.15, "#3573b9",
  0.4, "#38bdf8",
  0.6, "#fbbf24",
  0.8, "#f87171",
  1, "#ef4444",
]

export const SELECTED_COLOR = "#f0c674" // gold — consistent with v1 selection

export function SegmentMap({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)

  const segments = useCanopyStore((s) => s.segments)
  const setSegments = useCanopyStore((s) => s.setSegments)
  const selectedSegmentId = useCanopyStore((s) => s.selectedSegmentId)
  const setSelectedSegmentId = useCanopyStore((s) => s.setSelectedSegmentId)
  const hoveredSegmentId = useCanopyStore((s) => s.hoveredSegmentId)
  const setHoveredSegmentId = useCanopyStore((s) => s.setHoveredSegmentId)
  const setMapInstance = useCanopyStore((s) => s.setMapInstance)

  // Load the segment layer (bundled GeoJSON; Supabase becomes canonical later)
  useEffect(() => {
    let cancelled = false
    fetch("/data/segments-peckham.json")
      .then((r) => {
        if (!r.ok) throw new Error(`segments fetch ${r.status}`)
        return r.json()
      })
      .then((data: SegmentCollection) => {
        if (!cancelled) setSegments(data)
      })
      .catch((e) => console.error("[segments] load failed", e))
    return () => {
      cancelled = true
    }
  }, [setSegments])

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DARK_STYLE,
      center: [-0.07, 51.47],
      zoom: 13.4,
      attributionControl: false,
      canvasContextAttributes: { preserveDrawingBuffer: true }, // export snapshots later
    })
    mapRef.current = map
    setMapInstance(map)
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right")
    const ready = () => setMapLoaded(true)
    if (map.isStyleLoaded()) ready()
    else map.once("styledata", ready)
    return () => {
      map.remove()
      mapRef.current = null
      setMapInstance(null)
    }
  }, [setMapInstance])

  // Add segment layers when both map + data ready
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || !segments) return

    if (!map.getSource("segments")) {
      map.addSource("segments", {
        type: "geojson",
        data: segments as GeoJSON.FeatureCollection,
        promoteId: "segment_id",
      })

      // Fat invisible hit-area line so thin segments are clickable.
      map.addLayer({
        id: "segments-hit",
        type: "line",
        source: "segments",
        paint: { "line-color": "#000", "line-opacity": 0.001, "line-width": 14 },
      })

      map.addLayer({
        id: "segments-line",
        type: "line",
        source: "segments",
        layout: { "line-cap": "round" },
        paint: {
          "line-color": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "flood_score"], 0],
            ...SCORE_RAMP,
          ] as any,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            12, ["+", 0.8, ["*", 2.4, ["coalesce", ["get", "flood_score"], 0]]],
            16, ["+", 2.5, ["*", 6, ["coalesce", ["get", "flood_score"], 0]]],
          ] as any,
          "line-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            1,
            ["boolean", ["feature-state", "hovered"], false],
            1,
            0.85,
          ] as any,
        },
      })

      // Selected/hover halo drawn beneath the coloured line.
      map.addLayer(
        {
          id: "segments-halo",
          type: "line",
          source: "segments",
          layout: { "line-cap": "round" },
          paint: {
            "line-color": SELECTED_COLOR,
            "line-width": [
              "interpolate", ["linear"], ["zoom"],
              12, 6,
              16, 14,
            ] as any,
            "line-opacity": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              0.55,
              ["boolean", ["feature-state", "hovered"], false],
              0.25,
              0,
            ] as any,
            "line-blur": 2,
          },
        },
        "segments-line"
      )

      map.on("mousemove", "segments-hit", (e) => {
        map.getCanvas().style.cursor = "pointer"
        const id = e.features?.[0]?.properties?.segment_id as string | undefined
        if (id) useCanopyStore.getState().setHoveredSegmentId(id)
      })
      map.on("mouseleave", "segments-hit", () => {
        map.getCanvas().style.cursor = ""
        useCanopyStore.getState().setHoveredSegmentId(null)
      })
      map.on("click", "segments-hit", (e) => {
        const id = e.features?.[0]?.properties?.segment_id as string | undefined
        if (id) {
          const s = useCanopyStore.getState()
          s.setSelectedSegmentId(s.selectedSegmentId === id ? null : id)
        }
      })

      // Fit once to the data
      const coords: [number, number][] = []
      for (const f of segments.features) {
        for (const c of f.geometry.coordinates) coords.push(c as [number, number])
      }
      if (coords.length) {
        const lngs = coords.map((c) => c[0])
        const lats = coords.map((c) => c[1])
        map.fitBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          { padding: 40, duration: 700 }
        )
      }
    } else {
      ;(map.getSource("segments") as maplibregl.GeoJSONSource).setData(
        segments as GeoJSON.FeatureCollection
      )
    }
  }, [mapLoaded, segments])

  // Reflect selection/hover into feature-state (no layer re-paint churn).
  const prevSel = useRef<string | null>(null)
  const prevHov = useRef<string | null>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || !map.getSource("segments")) return
    if (prevSel.current && prevSel.current !== selectedSegmentId) {
      map.setFeatureState({ source: "segments", id: prevSel.current }, { selected: false })
    }
    if (selectedSegmentId) {
      map.setFeatureState({ source: "segments", id: selectedSegmentId }, { selected: true })
    }
    prevSel.current = selectedSegmentId
  }, [selectedSegmentId, mapLoaded])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || !map.getSource("segments")) return
    if (prevHov.current && prevHov.current !== hoveredSegmentId) {
      map.setFeatureState({ source: "segments", id: prevHov.current }, { hovered: false })
    }
    if (hoveredSegmentId) {
      map.setFeatureState({ source: "segments", id: hoveredSegmentId }, { hovered: true })
    }
    prevHov.current = hoveredSegmentId
  }, [hoveredSegmentId, mapLoaded])

  // When selection changes from the list side, ease the camera to the segment.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectedSegmentId || !segments) return
    const f = segments.features.find((x) => x.properties.segment_id === selectedSegmentId)
    if (!f) return
    const coords = f.geometry.coordinates as [number, number][]
    const mid = coords[Math.floor(coords.length / 2)]
    const current = map.getCenter()
    const dist = Math.abs(current.lng - mid[0]) + Math.abs(current.lat - mid[1])
    if (dist > 0.004) {
      map.easeTo({ center: mid, duration: 500 })
    }
  }, [selectedSegmentId, segments])

  return (
    <div className={`relative w-full h-full ${className ?? ""}`}>
      <div ref={containerRef} className="w-full h-full" />

      <AnimatePresence>
        {!mapLoaded && (
          <motion.div
            key="skeleton"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-paper-elevated flex items-center justify-center z-10"
          >
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-evidence/40 border-t-evidence rounded-full animate-spin" />
              <span className="text-ink-muted text-sm font-mono">Loading map…</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Risk legend */}
      <div className="absolute bottom-10 left-4 z-10 bg-paper-elevated/90 backdrop-blur-sm border border-line-strong/60 rounded-md px-3 py-2.5">
        <p className="text-[10px] font-mono text-ink-muted uppercase tracking-widest mb-1.5">
          Surface-water flood priority
        </p>
        <div
          className="w-32 h-2 rounded-sm"
          style={{
            background:
              "linear-gradient(to right, #3d4a63, #3573b9, #38bdf8, #fbbf24, #ef4444)",
          }}
        />
        <div className="flex justify-between mt-1">
          <span className="text-[9px] font-mono text-ink-subtle">Low</span>
          <span className="text-[9px] font-mono text-ink-subtle">High</span>
        </div>
        <p className="text-[8px] font-mono text-ink-subtle italic mt-1 max-w-[150px]">
          Indicative — for prioritisation, not property-level prediction
        </p>
      </div>
    </div>
  )
}
