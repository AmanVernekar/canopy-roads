# v2 build decisions — for review

Running log of decisions made autonomously during the roads-pivot build. Newest at the bottom. Flagged items (⚑) are ones you may want to revisit.

## Locked in earlier chats (pre-AFK)
- Repo `canopy-roads`, public, product name stays **Canopy**. v1 repo/deployment untouched.
- Fork = clone of v1 with full git history (not a fresh v0.dev generation).
- LSOA mode stripped from v2 UI (code lives on in git history).
- Demo area: **Peckham / Rye Lane corridor**.
- Segmentation rule: OS Open Roads links as the asset unit; links >200m subdivided into ~100m chunks.
- `context.md` (the v2 pivot doc) kept gitignored/local-only — it summarises a private council conversation and the repo is public.

## Made during this run
<!-- entries appended as work proceeds -->

1. **OS Open Roads sourcing**: the keyless OS Downloads API only offers GB-wide files (no regional tiles at the API level), so the pipeline downloads the 606MB GB shapefile once, caches it in `raw/` (gitignored), and extracts just the TQ (London) tile. Verified the API works without an account.
2. **Demo bbox**: Peckham box `(-0.085, 51.460) → (-0.055, 51.480)` — Rye Lane + Peckham High St + Bellenden + Queens Road fringe, ~4.6 km².
3. **Motorways excluded** from the segment set (none in Peckham anyway); every other road class kept, including unclassified/local streets — they're where SuDS/greening usually lands.
4. **Clipping slivers <5m dropped** during segmentation.
5. **Combined score is computed client-side only** from stored per-axis scores + user-adjustable weights (renormalised when an axis is missing). Raw metrics stored alongside scores so reweighting never needs re-ingest. Tier 0 = flood axis only, so combined == flood for now.
6. **Tier 0 layout**: left strip = area overview + provenance/honesty notes; centre = segment map; right = ranked segment list + selected-segment detail + GeoJSON export. Agent chat panel dormant until Tier 1. (⚑ review — this reinterprets the v1 3-column layout for v2.)
7. **Data-flow pattern**: same as v1 — precomputed bundled GeoJSON (`public/data/segments-peckham.json`) is the dev/fallback path; Supabase/PostGIS becomes the canonical store when the new project exists. App code reads the bundle if Supabase env is absent.
