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
