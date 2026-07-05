# Canopy — road-network climate-risk ranking

Canopy scores and ranks individual street segments for combined **surface-water-flood** and **heat** risk, proposes evidence-cited hyperlocal interventions per segment, and exports the result as a **GIS-ready layer** (GeoJSON / GeoPackage) that drops straight into a council's own QGIS / ArcGIS / web GIS.

Built for highways officers and asset managers deciding where limited adaptation capital goes — asset-level, not neighbourhood-level.

> This is the v2 pivot of [Canopy v1](https://github.com/AmanVernekar/v0-canopy), which planned interventions at LSOA (neighbourhood) level. v1 remains live; v2 changes the unit of analysis to the individual road segment.

## How it works

1. **Road network spine** — OS Open Roads centreline links (USRN-joinable), subdivided into ~100m segments.
2. **Flood axis** — Environment Agency *Risk of Flooding from Surface Water* (2m-grid modelling) intersected per segment: depth/likelihood/hazard at 1-in-30 and 1-in-100, plus the 2050s climate epoch.
3. **Heat axis** — hyperlocal land-surface temperature, thermal comfort (UTCI), canopy and imperviousness intersected per segment.
4. **Deterministic scoring** — transparent, reweightable flood / heat / combined priority scores. No LLM in the scoring loop.
5. **Agentic reasoning** — for top-ranked segments, an agent reasons about which specific intervention fits that segment's risk profile, physical character, and constraints, with peer-reviewed evidence cited (OpenAlex) — and explains *why* in plain language.
6. **Export** — ranked segments with full attribute table, usable without this UI.

### Honesty framing

EA surface-water modelling is indicative and national-scale — **not** property-level prediction. Canopy frames segment scores as *prioritisation for officer review*, carries the EA suitability/confidence flag, and keeps recommendation language calibrated ("flags", "suggests", "for review"). Priority weights are visible and adjustable, not authoritative.

## Stack

Next.js 15 · AI SDK v5 (Claude Sonnet 4.5, prompt-cached) · MapLibre GL · Supabase (Postgres + PostGIS) · Python data pipeline (GeoPandas) · OS Open Roads · EA RoFSW · OpenAlex

## Development

```bash
pnpm install
pnpm dev
```

Requires `.env.local` with `ANTHROPIC_API_KEY`, Supabase keys, and (optionally) `BRIGHT_DATA_TOKEN` + `OPENALEX_EMAIL`. Data-ingest scripts live in `/pipeline`.

## Status

Prototype under active development. Data integration still maturing — see honesty framing above.
