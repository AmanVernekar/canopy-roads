"""
Stage 1 of the v2 data spine: road-segment framework.

Downloads OS Open Roads (GB, ESRI Shapefile flavour — internally tiled by
100km grid square), extracts the TQ tile (London), clips to the demo bbox,
subdivides long links into ~100m chunks, and writes the base segment layer.

Run:  python pipeline/fetch_roads.py
Out:  pipeline/out/segments-base.geojson  (EPSG:4326)

The OS Downloads API needs no key for OpenData products.
"""

import io
import json
import sys
import zipfile
from pathlib import Path

import geopandas as gpd
import requests
from shapely.geometry import box
from shapely.ops import substring

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import (
    AREA_SLUG,
    BNG,
    MAX_LINK_M,
    OUT_DIR,
    PECKHAM_BBOX,
    RAW_DIR,
    TARGET_CHUNK_M,
    WGS84,
)

OPROAD_URL = (
    "https://api.os.uk/downloads/v1/products/OpenRoads/downloads"
    "?area=GB&format=ESRI%C2%AE+Shapefile&redirect"
)
OPROAD_ZIP = RAW_DIR / "oproad_essh_gb.zip"


def log(msg: str) -> None:
    print(f"[roads] {msg}", flush=True)


def download_oproad() -> None:
    if OPROAD_ZIP.exists() and OPROAD_ZIP.stat().st_size > 500_000_000:
        log(f"cached: {OPROAD_ZIP.name} ({OPROAD_ZIP.stat().st_size/1e6:.0f} MB)")
        return
    log("downloading OS Open Roads GB shapefile (~600 MB, one-time)…")
    with requests.get(OPROAD_URL, stream=True, timeout=600) as r:
        r.raise_for_status()
        done = 0
        with OPROAD_ZIP.open("wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 22):
                f.write(chunk)
                done += len(chunk)
                if done % (1 << 27) < (1 << 22):
                    log(f"  {done/1e6:.0f} MB…")
    log(f"downloaded {OPROAD_ZIP.stat().st_size/1e6:.0f} MB")


def extract_tq_roadlink() -> Path:
    """Pull just the TQ RoadLink shapefile set out of the GB zip."""
    target_dir = RAW_DIR / "oproad_tq"
    marker = target_dir / "TQ_RoadLink.shp"
    if marker.exists():
        log("cached: TQ_RoadLink extracted")
        return marker
    target_dir.mkdir(exist_ok=True)
    with zipfile.ZipFile(OPROAD_ZIP) as zf:
        members = [n for n in zf.namelist() if "TQ_RoadLink" in n]
        if not members:
            raise RuntimeError(
                "TQ_RoadLink not found in archive — listing sample: "
                + ", ".join(zf.namelist()[:10])
            )
        for m in members:
            data = zf.read(m)
            (target_dir / Path(m).name).write_bytes(data)
            log(f"  extracted {Path(m).name} ({len(data)/1e6:.1f} MB)")
    return marker


def chunk_line(geom, n_chunks: int):
    """Split a LineString into n roughly equal-length parts."""
    total = geom.length
    return [
        substring(geom, i * total / n_chunks, (i + 1) * total / n_chunks)
        for i in range(n_chunks)
    ]


def build_segments(shp_path: Path) -> gpd.GeoDataFrame:
    log("reading TQ RoadLink…")
    gdf = gpd.read_file(shp_path)
    if gdf.crs is None:
        gdf = gdf.set_crs(BNG)
    log(f"  {len(gdf)} links in TQ tile")

    # Clip to demo bbox (bbox given in WGS84; reproject bbox to BNG).
    bbox_wgs = gpd.GeoSeries([box(*PECKHAM_BBOX)], crs=WGS84).to_crs(BNG)
    clipped = gpd.clip(gdf, bbox_wgs.geometry[0])
    log(f"  {len(clipped)} links intersect {AREA_SLUG} bbox")

    # Drop motorways (none expected in Peckham) and null geometries.
    fn_col = next(
        (c for c in clipped.columns if c.lower() in ("function", "roadfunc")), None
    )
    if fn_col:
        clipped = clipped[clipped[fn_col].str.lower() != "motorway"]
    clipped = clipped[~clipped.geometry.is_empty & clipped.geometry.notna()]

    # Column names in OS Open Roads shapefiles are truncated to 10 chars.
    def col(*cands):
        for c in cands:
            if c in clipped.columns:
                return c
        return None

    id_col = col("identifier", "id")
    name_col = col("name1", "roadname")
    class_col = col("class", "roadclassi")
    number_col = col("roadnumber", "ref")

    rows = []
    for _, r in clipped.iterrows():
        geom = r.geometry
        if geom.geom_type == "MultiLineString":
            parts = list(geom.geoms)
        else:
            parts = [geom]
        for pi, part in enumerate(parts):
            length = part.length
            if length < 5:  # sliver from clipping
                continue
            n = 1
            if length > MAX_LINK_M:
                n = max(2, round(length / TARGET_CHUNK_M))
            for ci, chunk in enumerate(chunk_line(part, n) if n > 1 else [part]):
                link_id = str(r[id_col]) if id_col else f"row{_}"
                seg_id = f"{link_id}:{pi}:{ci}" if (n > 1 or len(parts) > 1) else link_id
                rows.append(
                    {
                        "segment_id": seg_id,
                        "os_link_id": link_id,
                        "street_name": (r[name_col] if name_col else None),
                        "road_number": (r[number_col] if number_col else None),
                        "road_class": (r[class_col] if class_col else None),
                        "area_slug": AREA_SLUG,
                        "length_m": round(chunk.length, 1),
                        "geometry": chunk,
                    }
                )

    seg = gpd.GeoDataFrame(rows, crs=BNG)
    log(f"  {len(seg)} segments after subdivision (rule: >{MAX_LINK_M:.0f}m → ~{TARGET_CHUNK_M:.0f}m chunks)")
    return seg


def main() -> None:
    download_oproad()
    shp = extract_tq_roadlink()
    seg = build_segments(shp)
    out = seg.to_crs(WGS84)
    out_path = OUT_DIR / "segments-base.geojson"
    out.to_file(out_path, driver="GeoJSON")
    log(f"✓ wrote {out_path} ({out_path.stat().st_size/1e6:.1f} MB, {len(out)} segments)")
    # Quick sanity summary
    if "road_class" in out.columns:
        log("class distribution:\n" + out["road_class"].value_counts().to_string())


if __name__ == "__main__":
    main()
