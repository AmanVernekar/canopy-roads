"""
Stage 3 of the v2 data spine: per-segment heat metrics + score (Tier 1).

Interim heat stack (see DECISIONS.md — WRI Cool Cities 1m data is UI-export
only, so this uses the direct-download fallback; upgrade path flagged):

  - Land surface temperature: GLA "Major Summer Heat Spots" — Landsat-8
    summer average LST per Urban Atlas land-use polygon (°C, June 2020).
    raw/heat/avgLST_London_UrbanAtlas.gpkg
  - Canopy: GLA Curio Canopy hexagon aggregates (canopy_per %, ~small hexes).
    raw/heat/shp-hexagon-files/gla-canopy-hex.shp

Both EPSG:27700, both London Datastore direct downloads (CC BY / OGL-family;
attribution carried in the export).

Per segment (10m buffered footprint): area-weighted mean LST and canopy %.

SCORE FORMULA (absolute-anchored, transparent):

  lst_norm       = clamp01((lst_mean − 27) / (35 − 27))   # °C anchors, London summer LST
  canopy_deficit = clamp01(1 − canopy_pct / 30)           # 30% ≈ healthy urban canopy
  heat_score     = clamp01(0.6·lst_norm + 0.4·canopy_deficit)

Anchors chosen against the London-wide distribution (27°C ≈ cool/vegetated,
35°C ≈ hottest urban fabric in this dataset) — printed at runtime for checking.

HONESTY: LST is modelled/satellite-derived summer average, not measured air
temperature; canopy hexes are coarser than segments. Scores are prioritisation
signals, upgradeable to WRI 1m UTCI when exported.

Run:  python pipeline/heat_metrics.py
In :  public/data/segments-peckham.json   (flood-enriched, from flood_metrics.py)
Out:  public/data/segments-peckham.json   (heat fields added in place)
"""

import sys
import warnings
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.geometry import box

warnings.filterwarnings("ignore")
sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import AREA_SLUG, BNG, PECKHAM_BBOX, PUBLIC_DATA_DIR, RAW_DIR, WGS84

SEGMENT_BUFFER_M = 10.0
LST_PATH = RAW_DIR / "heat" / "avgLST_London_UrbanAtlas.gpkg"
HEX_PATH = RAW_DIR / "heat" / "shp-hexagon-files" / "gla-canopy-hex.shp"

# Score anchors — documented in module docstring.
LST_COOL_C = 27.0
LST_HOT_C = 35.0
CANOPY_GOOD_PCT = 30.0
W_LST = 0.6
W_CANOPY = 0.4


def log(msg: str) -> None:
    print(f"[heat] {msg}", flush=True)


def clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def weighted_mean(seg_buffer, gdf, value_col) -> float | None:
    """Area-weighted mean of value_col over polygons intersecting the buffer."""
    idx = list(gdf.sindex.query(seg_buffer, predicate="intersects"))
    if not idx:
        return None
    total_area = 0.0
    acc = 0.0
    for i in idx:
        poly = gdf.geometry.iloc[i]
        v = gdf[value_col].iloc[i]
        if v is None or v != v:
            continue
        inter = seg_buffer.intersection(poly)
        if inter.is_empty:
            continue
        a = inter.area
        acc += float(v) * a
        total_area += a
    if total_area == 0:
        return None
    return acc / total_area


def main() -> None:
    seg_path = PUBLIC_DATA_DIR / f"segments-{AREA_SLUG}.json"
    if not seg_path.exists():
        raise SystemExit("run pipeline/flood_metrics.py first")
    segs = gpd.read_file(seg_path).to_crs(BNG)
    log(f"{len(segs)} segments loaded")

    bbox_geom = gpd.GeoSeries([box(*PECKHAM_BBOX)], crs=WGS84).to_crs(BNG).geometry[0]
    # Generous margin so edge segments still get polygons.
    clip_geom = bbox_geom.buffer(200)

    log("reading LST polygons (London-wide, clipping)…")
    lst = gpd.read_file(LST_PATH)
    if lst.crs is None:
        lst = lst.set_crs(BNG)
    lst = lst.to_crs(BNG)
    # Print London-wide distribution so the anchors stay honest.
    q = lst["avgLST"].quantile([0.05, 0.5, 0.95])
    log(f"  London avgLST p5={q.iloc[0]:.1f}°C median={q.iloc[1]:.1f}°C p95={q.iloc[2]:.1f}°C (anchors {LST_COOL_C}–{LST_HOT_C})")
    lst = gpd.clip(lst, clip_geom)
    log(f"  {len(lst)} LST polygons in area")

    log("reading canopy hexagons…")
    hexes = gpd.read_file(HEX_PATH)
    if hexes.crs is None:
        hexes = hexes.set_crs(BNG)
    hexes = gpd.clip(hexes.to_crs(BNG), clip_geom)
    log(f"  {len(hexes)} hexes in area")

    log("computing per-segment heat metrics…")
    buffers = segs.geometry.buffer(SEGMENT_BUFFER_M, cap_style=2)
    lst_means, canopies, scores = [], [], []
    for i, buf in enumerate(buffers):
        lst_mean = weighted_mean(buf, lst, "avgLST")
        canopy = weighted_mean(buf, hexes, "canopy_per")
        if lst_mean is None and canopy is None:
            score = None
        else:
            lst_norm = clamp01(((lst_mean if lst_mean is not None else LST_COOL_C) - LST_COOL_C) / (LST_HOT_C - LST_COOL_C))
            deficit = clamp01(1 - (canopy if canopy is not None else CANOPY_GOOD_PCT) / CANOPY_GOOD_PCT)
            score = round(clamp01(W_LST * lst_norm + W_CANOPY * deficit), 3)
        lst_means.append(round(lst_mean, 2) if lst_mean is not None else None)
        canopies.append(round(canopy, 1) if canopy is not None else None)
        scores.append(score)
        if i % 300 == 0:
            log(f"  {i}/{len(segs)}")

    segs["heat_lst_mean"] = lst_means
    segs["canopy_pct"] = canopies
    segs["heat_score"] = scores

    # Recommendations are owned by the FINAL pipeline stage so they can see
    # both axes. Overwrites the flood-only rules written by flood_metrics.py.
    log("attaching combined-axis recommendations…")
    recs = segs.apply(_recommend, axis=1)
    segs["recommended_intervention"] = [r[0] for r in recs]
    segs["recommendation_rationale"] = [r[1] for r in recs]
    segs["recommendation_source"] = "deterministic"

    out = segs.to_crs(WGS84)
    out.to_file(seg_path, driver="GeoJSON")
    log(f"✓ updated {seg_path} ({seg_path.stat().st_size/1e6:.1f} MB)")
    hs = pd.Series([s for s in scores if s is not None])
    log(
        f"heat_score: n={len(hs)} min={hs.min():.2f} median={hs.median():.2f} max={hs.max():.2f}"
    )
    top = segs.nlargest(6, "heat_score")[["street_name", "road_class", "heat_score", "heat_lst_mean", "canopy_pct"]]
    log("hottest segments:\n" + top.to_string())


def _recommend(row) -> tuple[str, str]:
    """Rule-based, both axes. Language calibrated per context honesty rules —
    'suggests', 'for review', never 'will flood' / 'you should build'.
    The Tier-1 agent replaces these for top-ranked segments."""
    flood = row.get("flood_score") or 0
    heat = row.get("heat_score") or 0
    canopy = row.get("canopy_pct")
    canopy = canopy if canopy == canopy and canopy is not None else 15  # NaN-safe
    is_main = str(row.get("road_class") or "").startswith(("A Road", "B Road"))

    hot = heat >= 0.75
    sparse = canopy < 10
    wet = flood >= 0.6
    damp = 0.35 <= flood < 0.6

    if wet and hot:
        return (
            "Combined package: raingardens + street trees",
            "High indicative surface-water accumulation AND high summer heat with sparse canopy — suggests a combined package of kerbside raingardens with tree pits (structural soil), addressing both axes in one intervention. Flagged for drainage-engineering and highways review.",
        )
    if wet:
        if is_main:
            return (
                "Drainage capacity review + SuDS in adjacent verges",
                "High indicative surface-water accumulation on a classified road — suggests a gully/drainage capacity review with sustainable-drainage retrofits where highway constraints allow. Flagged for engineering review.",
            )
        return (
            "Raingarden build-outs + permeable parking-bay surfacing",
            "High indicative surface-water accumulation on a residential/local street — suggests kerbside raingardens at low points and permeable resurfacing of parking bays. Flagged for drainage-engineering review.",
        )
    if hot and sparse:
        if is_main:
            return (
                "Street trees + shade structures at dwell points",
                "Among the hottest segments in the area with very low canopy on a classified/high-street road — suggests street tree planting where footway width and services allow, with shade structures at bus stops and dwell points as a faster complement. Reflective surfacing is a candidate at resurfacing time. For highways review.",
            )
        return (
            "Street tree planting (tree pits with structural soil)",
            "High modelled summer heat with very low canopy on a residential street — suggests systematic street-tree planting; tree pits with structural soil also intercept runoff. For highways and services review.",
        )
    if hot:
        return (
            "Shade & surface review",
            "High modelled summer heat despite moderate canopy — suggests reviewing shade at dwell points and considering higher-albedo surfacing at the next resurfacing cycle. For officer review.",
        )
    if damp:
        return (
            "Raingarden at identified low point",
            "Moderate indicative surface-water risk — suggests a targeted raingarden or tree pit at the segment's accumulation point. For officer review against local drainage records.",
        )
    return (
        "No intervention indicated — monitor",
        "Low indicative risk on both axes under current modelling. No action suggested; revisit when local records or the 2050s epoch layer indicate otherwise.",
    )


if __name__ == "__main__":
    main()
