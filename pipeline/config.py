"""Shared pipeline config for the Canopy v2 road-segment data spine."""

from pathlib import Path

# Demo area: Peckham / Rye Lane corridor, Southwark.
# Covers Peckham High St + Rye Lane down to Peckham Rye common, Bellenden
# Road area to the west, Queens Road fringe to the east. ~2.1 x 2.2 km.
# (lng_min, lat_min, lng_max, lat_max) in WGS84.
PECKHAM_BBOX = (-0.085, 51.460, -0.055, 51.480)

AREA_SLUG = "peckham"

# Segmentation rule (see DECISIONS.md): OS Open Roads links are the asset
# unit; links longer than MAX_LINK_M are subdivided into equal chunks of
# roughly TARGET_CHUNK_M so scores reflect local variation.
MAX_LINK_M = 200.0
TARGET_CHUNK_M = 100.0

REPO_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = REPO_ROOT / "raw"
OUT_DIR = REPO_ROOT / "pipeline" / "out"
PUBLIC_DATA_DIR = REPO_ROOT / "public" / "data"

for d in (RAW_DIR, OUT_DIR, PUBLIC_DATA_DIR):
    d.mkdir(parents=True, exist_ok=True)

# British National Grid — all spatial maths happens in metres.
BNG = "EPSG:27700"
WGS84 = "EPSG:4326"
