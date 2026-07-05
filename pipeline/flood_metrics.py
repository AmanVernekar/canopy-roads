"""
Stage 2 of the v2 data spine: per-segment flood metrics + score.

Data source: EA "Risk of Flooding from Surface Water" (NaFRA2, 2m-grid
modelling) via the Defra Data Services Platform WMS — the only keyless
programmatic route (there is no WFS / vector bbox API for this product; the
retired per-likelihood datasets on data.gov.uk must not be used).

Approach: one GetMap raster pull per layer for the demo bbox at 2m/px
(matching the source model resolution), pixel-classify, then zonal-stats per
buffered road segment locally. Rasters are cached in raw/rofsw/.

Layers used
  main service  …/nafra2-risk-of-flooding-from-surface-water/wms
    rofsw               → Risk_band polygons rendered as 3 colours
                           High (>=1-in-30)  = rgb(85, 91, 157)
                           Medium (30–100)   = rgb(154, 159, 222)
                           Low (100–1000)    = rgb(195, 224, 255)
                           (empirically probed 2026-07-05; see DECISIONS.md)
    rofsw_0_3m_depth / _0_6m_ / _0_9m_ → depth-threshold masks
  climate service …/nafra2-risk-of-flooding-from-surface-water-climate-change/wms
    rofsw_cc01          → 2050s central-allowance extent (UKCP18 RCP8.5)

SCORE FORMULA (transparent, absolute-anchored so scores aggregate across
areas — context.md §6):

  flood_score = clamp01(
      0.45 * high_pct/100          # % of segment footprint in High band
    + 0.20 * med_pct/100
    + 0.05 * low_pct/100
    + 0.20 * min(depth_max/0.9, 1) # deepest threshold present (m)
    + 0.10 * max(0, cc1_pct - any_pct)/100   # 2050s uplift vs today
  )

HONESTY: RoFSW is indicative national modelling — the EA states it is not
property-level and its Confidence attribute is not yet decision-grade. All
outputs are prioritisation signals for officer review, and the UI carries
this framing.

Run:  python pipeline/flood_metrics.py
In :  pipeline/out/segments-base.geojson  (from fetch_roads.py)
Out:  public/data/segments-peckham.json   (app-ready, EPSG:4326)
"""

import io
import sys
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import requests
from PIL import Image
from rasterio import features as rfeatures
from rasterio.transform import from_bounds
from shapely.geometry import box

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import (
    AREA_SLUG,
    BNG,
    OUT_DIR,
    PECKHAM_BBOX,
    PUBLIC_DATA_DIR,
    RAW_DIR,
    WGS84,
)

SEGMENT_BUFFER_M = 10.0   # half-width footprint around centreline
PIXEL_M = 2.0             # raster resolution — matches RoFSW source grid

WMS_MAIN = "https://environment.data.gov.uk/spatialdata/nafra2-risk-of-flooding-from-surface-water/wms"
WMS_CC = "https://environment.data.gov.uk/spatialdata/nafra2-risk-of-flooding-from-surface-water-climate-change/wms"

# Empirically-probed legend colours for the `rofsw` risk-band layer.
BAND_COLOURS = {
    "high": (85, 91, 157),
    "medium": (154, 159, 222),
    "low": (195, 224, 255),
}

ROFSW_CACHE = RAW_DIR / "rofsw"
ROFSW_CACHE.mkdir(parents=True, exist_ok=True)


def log(msg: str) -> None:
    print(f"[flood] {msg}", flush=True)


def bbox_bng() -> tuple[float, float, float, float]:
    b = gpd.GeoSeries([box(*PECKHAM_BBOX)], crs=WGS84).to_crs(BNG).total_bounds
    return (float(b[0]), float(b[1]), float(b[2]), float(b[3]))


def getmap(service: str, layer: str, bbox: tuple, width: int, height: int) -> Image.Image:
    cache = ROFSW_CACHE / f"{layer}.png"
    if cache.exists():
        log(f"  {layer}: cached")
        return Image.open(cache).convert("RGBA")
    params = {
        "service": "WMS",
        "version": "1.3.0",
        "request": "GetMap",
        "layers": layer,
        "styles": "",
        "crs": "EPSG:27700",
        "bbox": ",".join(str(v) for v in bbox),
        "width": width,
        "height": height,
        "format": "image/png",
        "transparent": "true",
    }
    r = requests.get(service, params=params, timeout=180)
    r.raise_for_status()
    if not r.headers.get("content-type", "").startswith("image/"):
        raise RuntimeError(f"{layer}: WMS returned {r.headers.get('content-type')}: {r.text[:200]}")
    img = Image.open(io.BytesIO(r.content)).convert("RGBA")
    img.save(cache)
    log(f"  {layer}: fetched {len(r.content)/1e3:.0f} kB")
    return img


def classify_bands(img: Image.Image) -> np.ndarray:
    """rofsw layer → int raster: 0 none, 1 low, 2 medium, 3 high.

    Nearest-known-colour with alpha gating; anti-aliased edge pixels resolve
    to their closest band.
    """
    a = np.asarray(img, dtype=np.int16)
    rgb, alpha = a[..., :3], a[..., 3]
    out = np.zeros(rgb.shape[:2], dtype=np.uint8)
    dists = {}
    for name, col in BAND_COLOURS.items():
        dists[name] = np.abs(rgb - np.array(col)).sum(axis=-1)
    stacked = np.stack([dists["low"], dists["medium"], dists["high"]])  # 1,2,3
    nearest = np.argmin(stacked, axis=0) + 1
    mindist = np.min(stacked, axis=0)
    mask = (alpha > 128) & (mindist < 90)
    out[mask] = nearest[mask]
    return out


def presence_mask(img: Image.Image) -> np.ndarray:
    a = np.asarray(img)
    return (a[..., 3] > 128).astype(np.uint8)


def main() -> None:
    seg_path = OUT_DIR / "segments-base.geojson"
    if not seg_path.exists():
        raise SystemExit("run pipeline/fetch_roads.py first")
    segs = gpd.read_file(seg_path).to_crs(BNG)
    log(f"{len(segs)} segments loaded")

    bbox = bbox_bng()
    width = int(round((bbox[2] - bbox[0]) / PIXEL_M))
    height = int(round((bbox[3] - bbox[1]) / PIXEL_M))
    transform = from_bounds(*bbox, width, height)
    log(f"raster grid {width}x{height} @ {PIXEL_M}m/px")

    log("fetching WMS layers…")
    band_img = getmap(WMS_MAIN, "rofsw", bbox, width, height)
    d03 = getmap(WMS_MAIN, "rofsw_0_3m_depth", bbox, width, height)
    d06 = getmap(WMS_MAIN, "rofsw_0_6m_depth", bbox, width, height)
    d09 = getmap(WMS_MAIN, "rofsw_0_9m_depth", bbox, width, height)
    cc1 = getmap(WMS_CC, "rofsw_cc01", bbox, width, height)

    bands = classify_bands(band_img)
    m03, m06, m09 = presence_mask(d03), presence_mask(d06), presence_mask(d09)
    mcc = presence_mask(cc1)
    log(
        f"pixel coverage — high {(bands==3).mean()*100:.1f}% med {(bands==2).mean()*100:.1f}% "
        f"low {(bands==1).mean()*100:.1f}% | ≥0.3m {m03.mean()*100:.1f}% | cc1 {mcc.mean()*100:.1f}%"
    )

    log("zonal stats per segment…")
    rows = []
    for i, seg in enumerate(segs.geometry):
        buf = seg.buffer(SEGMENT_BUFFER_M, cap_style=2)
        # Window-limited rasterize: burn buffer onto the shared grid.
        mask = rfeatures.rasterize(
            [(buf, 1)], out_shape=(height, width), transform=transform, fill=0, dtype="uint8"
        ).astype(bool)
        n = int(mask.sum())
        if n == 0:
            rows.append(dict(high=0.0, med=0.0, low=0.0, d03=0.0, d06=0.0, d09=0.0, cc=0.0))
            continue
        rows.append(
            dict(
                high=round(100 * float((bands[mask] == 3).sum()) / n, 1),
                med=round(100 * float((bands[mask] == 2).sum()) / n, 1),
                low=round(100 * float((bands[mask] == 1).sum()) / n, 1),
                d03=round(100 * float(m03[mask].sum()) / n, 1),
                d06=round(100 * float(m06[mask].sum()) / n, 1),
                d09=round(100 * float(m09[mask].sum()) / n, 1),
                cc=round(100 * float(mcc[mask].sum()) / n, 1),
            )
        )
        if i % 200 == 0:
            log(f"  {i}/{len(segs)}")
    m = pd.DataFrame(rows)

    def depth_max(r) -> float | None:
        if r.d09 > 1:
            return 0.9
        if r.d06 > 1:
            return 0.6
        if r.d03 > 1:
            return 0.3
        if (r.high + r.med + r.low) > 0:
            return 0.0
        return None

    m["depth_max"] = m.apply(depth_max, axis=1)
    any_pct = m.high + m.med + m.low

    def score(r, any_p) -> float:
        # NaN-safe: depth_max is None/NaN for dry segments, and `NaN or 0.0`
        # evaluates to NaN (truthy), which then poisons min/max comparisons.
        dm = r.depth_max
        if dm is None or dm != dm:  # NaN check
            dm = 0.0
        d = min(dm / 0.9, 1.0)
        uplift = max(0.0, r.cc - any_p) / 100.0
        raw = 0.45 * r.high / 100 + 0.20 * r.med / 100 + 0.05 * r.low / 100 + 0.20 * d + 0.10 * uplift
        return round(max(0.0, min(1.0, raw)), 3)

    m["flood_score"] = [score(r, a) for r, a in zip(m.itertuples(), any_pct)]

    segs["extent_high_pct"] = m.high.values
    segs["extent_medium_pct"] = m.med.values
    segs["extent_low_pct"] = m.low.values
    segs["depth_03_pct"] = m.d03.values
    segs["depth_max_m"] = m.depth_max.values
    segs["extent_2050s_pct"] = m.cc.values
    segs["flood_score"] = m.flood_score.values

    log("attaching Tier-0 recommendations…")
    recs = segs.apply(_recommend, axis=1)
    segs["recommended_intervention"] = [r[0] for r in recs]
    segs["recommendation_rationale"] = [r[1] for r in recs]
    segs["recommendation_source"] = "deterministic"

    out = segs.to_crs(WGS84)
    out_path = PUBLIC_DATA_DIR / f"segments-{AREA_SLUG}.json"
    out.to_file(out_path, driver="GeoJSON")
    log(f"✓ wrote {out_path} ({out_path.stat().st_size/1e6:.1f} MB, {len(out)} segments)")
    log(
        "flood_score distribution:\n"
        + pd.cut(segs["flood_score"], [0, 0.1, 0.35, 0.6, 1.0], include_lowest=True)
        .value_counts()
        .sort_index()
        .to_string()
    )
    top = segs.nlargest(8, "flood_score")[["street_name", "road_class", "flood_score", "extent_high_pct"]]
    log("top segments:\n" + top.to_string())


def _recommend(row) -> tuple[str, str]:
    """Python twin of lib/recommendations.ts — keep the two in sync."""
    score = row.get("flood_score") or 0
    e_high = row.get("extent_high_pct") or 0
    is_main = str(row.get("road_class") or "").startswith(("A Road", "B Road"))
    if score >= 0.6:
        if is_main:
            return (
                "Drainage capacity review + SuDS in adjacent verges",
                "High indicative surface-water accumulation on a classified road — suggests a gully/drainage capacity review with sustainable-drainage retrofits where highway constraints allow. Flagged for engineering review.",
            )
        return (
            "Raingarden build-outs + permeable parking-bay surfacing",
            "High indicative surface-water accumulation on a residential/local street — suggests kerbside raingardens at low points and permeable resurfacing of parking bays. Flagged for drainage-engineering review.",
        )
    if score >= 0.35 or e_high > 10:
        return (
            "Raingarden at identified low point",
            "Moderate indicative surface-water risk — suggests a targeted raingarden or tree pit with structural soil at the segment's accumulation point. For officer review against local drainage records.",
        )
    return (
        "No flood intervention indicated — monitor",
        "Low indicative surface-water risk on current national modelling. No action suggested; revisit when local drainage records or the 2050s epoch layer indicate otherwise.",
    )


if __name__ == "__main__":
    main()
