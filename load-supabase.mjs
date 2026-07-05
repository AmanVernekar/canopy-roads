/**
 * Load the road-segment GeoJSON into the canopy-roads Supabase project.
 *
 * Prereq: supabase/migrations/0001_road_segments.sql applied, and the three
 * Supabase values filled in .env.local.
 *
 * Usage: node load-supabase.mjs [areaSlug=peckham]
 */
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

const envText = readFileSync(".env.local", "utf-8")
for (const line of envText.split("\n")) {
  const m = /^([A-Z0-9_]+)\s*=\s*(\S+)/.exec(line.trim())
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error("✘ Supabase env values missing/blank in .env.local")
  process.exit(1)
}
const supa = createClient(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const area = process.argv[2] ?? "peckham"
const fc = JSON.parse(readFileSync(`public/data/segments-${area}.json`, "utf-8"))
console.log(`▸ ${fc.features.length} segments for ${area}`)

const BATCH = 200
let written = 0
for (let i = 0; i < fc.features.length; i += BATCH) {
  const slice = fc.features.slice(i, i + BATCH)
  const rows = slice.map((f) => {
    const p = f.properties
    return {
      segment_id: p.segment_id,
      os_link_id: p.os_link_id,
      usrn: p.usrn ?? null,
      street_name: p.street_name ?? null,
      road_number: p.road_number ?? null,
      road_class: p.road_class ?? null,
      area_slug: p.area_slug ?? area,
      length_m: p.length_m ?? null,
      // PostGIS geometry column accepts a GeoJSON object through PostgREST.
      geom: f.geometry,
      extent_high_pct: p.extent_high_pct ?? null,
      extent_medium_pct: p.extent_medium_pct ?? null,
      extent_low_pct: p.extent_low_pct ?? null,
      depth_03_pct: p.depth_03_pct ?? null,
      depth_max_m: p.depth_max_m ?? null,
      extent_2050s_pct: p.extent_2050s_pct ?? null,
      flood_score: p.flood_score ?? null,
      recommended_intervention: p.recommended_intervention ?? null,
      recommendation_rationale: p.recommendation_rationale ?? null,
      recommendation_source: p.recommendation_source ?? null,
    }
  })
  const { error } = await supa.from("road_segments").upsert(rows, { onConflict: "segment_id" })
  if (error) {
    console.error(`✘ batch ${i}: ${error.message}`)
    process.exit(1)
  }
  written += slice.length
  if (i % (BATCH * 5) === 0) console.log(`  ${written}/${fc.features.length}`)
}
console.log(`✓ wrote ${written} segments`)
