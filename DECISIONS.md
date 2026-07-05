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
8. **RoFSW acquisition = WMS raster sampling, not vector download.** Research found the old per-likelihood RoFSW datasets are retired; the live NaFRA2 product has NO WFS/vector API, and the area-download tool needs a browser. So the pipeline does one keyless WMS GetMap pull per layer at 2m/px (matching the source model grid), classifies pixels by the EA's legend colours (empirically probed: High=rgb(85,91,157), Medium=rgb(154,159,222), Low=rgb(195,224,255)), and zonal-stats per segment locally. ⚑ Upgrade path: manually export real vector polygons from the EA explore tool for the demo area and drop into raw/rofsw/.
9. **Flood score formula** (absolute-anchored, documented in pipeline/flood_metrics.py): `0.45·high% + 0.20·med% + 0.05·low% + 0.20·min(depth_max/0.9,1) + 0.10·2050s-uplift`. Segment footprint = 10m buffer around centreline. Depth from the 0.3/0.6/0.9m threshold masks; 2050s uplift from the Climate Change 1 (2050s central allowance) layer.
10. **USRN deferred** (⚑): OS Open Roads doesn't carry USRN; the authoritative join needs ~410MB of Linked-Identifier CSVs, or a spatial join against OS Open USRN (283MB). Deferred to the Supabase/Tier-3 pass — the schema has the column, currently null.
11. **Fixed a NaN scoring bug** before it shipped: dry segments (depth_max=None→NaN) scored 1.0 because `NaN or 0.0` is NaN and `min(1.0, NaN)` returns 1.0. Result after fix: 28 of 1,148 Peckham segments score >0.6 — top hits Grove Vale + Copeland Road, both real-world Southwark flood spots (good sanity signal).
12. **Heat axis (Tier 1) sourcing decided by research**: WRI Cool Cities is UI-export-only (S3 blocked, London unconfirmed in their API) — plan is manual GeoTIFF export; fallback stack = Curio Canopy (25cm canopy) + Landsat-8 heat spots + GLA Climate Risk Mapping, all direct-download from London Datastore.
13. **Tier 0 UI shipped**: risk-ramped segment lines (slate→azure→amber→red = semantic priority) on the dark basemap, invisible fat hit-lines for clickability, gold selection halo, ranked list (top 200 shown) with street-name filter, selected-segment detail (raw metrics grid + rule-based suggestion + honesty note), GeoJSON export with rank + combined score + attribution baked into the attribute table.
14. **v1 leftovers**: v1 components (agent panel, LSOA map, dossier) remain in the tree, unmounted — they compile (build passes) and Tier 1 will rework the agent panel. v1's Supabase migration + LSOA loader were deleted; replaced by `supabase/migrations/0001_road_segments.sql` (PostGIS) + a new `load-supabase.mjs` for segments.
15. **Verification gap** (⚑): Chrome MCP never connected (needs your signed-in Chrome session), so in-browser visual/interaction testing is NOT done. Verified instead: `next build` passes, page SSR-renders all three columns, segment JSON serves (1.2MB, 1148 LineStrings, all keys match the TS types). First thing to eyeball when back: map renders lines + click-select + export button.
16. **v2 dev server runs on port 3001** (v1 keeps 3000).
17. **Heat axis shipped early (Tier 1 data, ⚑ tier-jump)**: since the fallback stack was direct-download, I built it rather than wait — Landsat-8 summer LST per Urban Atlas polygon (GLA "heat spots" gpkg, 161MB) + Curio Canopy hexagon aggregates (0.8MB). Per-segment area-weighted means; heat_score = 0.6·LST-norm (anchors 27–35°C) + 0.4·canopy-deficit (30% = healthy). WRI Cool Cities 1m UTCI remains the flagged upgrade (needs manual browser export).
18. **Validation moment**: the hottest segments in the area are Rye Lane and Peckham High Street (LST ~35.5°C, 4.3% canopy) — precisely the "hot high street" the council conversation predicted. Grove Vale + Copeland Road top the flood ranking. The data spine reproduces local knowledge.
19. **Recommendations moved to the final pipeline stage** (heat_metrics.py) so rules see both axes — e.g. "Combined package: raingardens + street trees" where hot AND wet (22 segments), "Street trees + shade structures at dwell points" for hot sparse-canopy high streets (56). The unused TypeScript twin (lib/recommendations.ts) was deleted; Python owns the rules until the Tier-1 agent replaces them for top segments.
20. **Weights UI live**: flood↔heat slider in the left panel (single slider, weights sum to 1), re-ranks the list, recolours the map (combined score computed client-side per feature), and is stamped into the GeoJSON export (weight_flood/weight_heat columns) so an exported ranking is reproducible.
21. Agent (LLM) work — per-segment intervention reasoning, evidence citations — is NOT started. That's the next major block and I stopped here deliberately: it's the piece most worth discussing shape/UX for before building.
