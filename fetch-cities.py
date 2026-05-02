"""
Fetch LSOA-level climate-vulnerability dataset for the demo cities:
    Greater London (33 boroughs) + Manchester city + Birmingham city.

Output:
    public/data/lsoas-{slug}.json   (per-city, ~5–30 MB each)

Run:
    python fetch-cities.py
    python fetch-cities.py --skip-osm     # quick: boundaries + IMD + Census + TES only
    python fetch-cities.py --only london  # one city at a time

Notes:
- Boundaries, IMD, Census, and Tree Equity all come from open national datasets
  in a single pass — no per-city loop for those, we just filter.
- OSM streets are fetched per Local Authority District via Overpass to keep each
  query under the 25k-element timeout. Buildings are dropped (only counts kept)
  because the full building geometries blow up the JSON to hundreds of MB and
  the agent doesn't actually use building shapes.
- Flood-risk score is derived from a public EA layer if available; otherwise
  zero — heat is the default vulnerability axis for now.
"""

import argparse
import io
import json
import os
import sys
import time
import zipfile
from pathlib import Path

import pandas as pd
import requests
import geopandas as gpd
from shapely.geometry import LineString, Polygon, shape
from shapely.ops import unary_union

# ────────────────────────────────────────────────────────────────────────
# Cities we ship.
# Each city has:
#   - slug:         output filename suffix
#   - lad_codes:    list of ONS LAD 2024 codes whose LSOAs belong to this city
#   - lad_names:    matching LAD name prefixes (used to filter the LSOA21NM
#                   field, which encodes the LAD name)
# ────────────────────────────────────────────────────────────────────────
LONDON_BOROUGHS = [
    ("E09000001", "City of London"),
    ("E09000002", "Barking and Dagenham"),
    ("E09000003", "Barnet"),
    ("E09000004", "Bexley"),
    ("E09000005", "Brent"),
    ("E09000006", "Bromley"),
    ("E09000007", "Camden"),
    ("E09000008", "Croydon"),
    ("E09000009", "Ealing"),
    ("E09000010", "Enfield"),
    ("E09000011", "Greenwich"),
    ("E09000012", "Hackney"),
    ("E09000013", "Hammersmith and Fulham"),
    ("E09000014", "Haringey"),
    ("E09000015", "Harrow"),
    ("E09000016", "Havering"),
    ("E09000017", "Hillingdon"),
    ("E09000018", "Hounslow"),
    ("E09000019", "Islington"),
    ("E09000020", "Kensington and Chelsea"),
    ("E09000021", "Kingston upon Thames"),
    ("E09000022", "Lambeth"),
    ("E09000023", "Lewisham"),
    ("E09000024", "Merton"),
    ("E09000025", "Newham"),
    ("E09000026", "Redbridge"),
    ("E09000027", "Richmond upon Thames"),
    ("E09000028", "Southwark"),
    ("E09000029", "Sutton"),
    ("E09000030", "Tower Hamlets"),
    ("E09000031", "Waltham Forest"),
    ("E09000032", "Wandsworth"),
    ("E09000033", "Westminster"),
]

CITIES = {
    "london": {
        "slug": "london",
        "label": "Greater London",
        "lads": LONDON_BOROUGHS,
    },
    "manchester": {
        "slug": "manchester",
        "label": "Manchester (city)",
        "lads": [("E08000003", "Manchester")],
    },
    "birmingham": {
        "slug": "birmingham",
        "label": "Birmingham (city)",
        "lads": [("E08000025", "Birmingham")],
    },
}

RAW_DIR = Path("./raw")
RAW_DIR.mkdir(exist_ok=True)
OUT_DIR = Path("./public/data")
OUT_DIR.mkdir(parents=True, exist_ok=True)

OVERPASS = "https://overpass-api.de/api/interpreter"
OVERPASS_HEADERS = {
    "User-Agent": "canopy-climate-planner/0.2 (aman@adiathermal.co.uk)"
}


def log(msg):
    print(f"[fetch] {msg}", flush=True)


# ────────────────────────────────────────────────────────────────────────
# Boundaries — pulled in one query for ALL target LADs to minimise round-trips.
# ────────────────────────────────────────────────────────────────────────
def fetch_boundaries(all_lads):
    log(f"Fetching LSOA 2021 boundaries for {len(all_lads)} LADs…")
    LSOA_URL = (
        "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/"
        "LSOA_2021_EW_BSC_V4_RUC/FeatureServer/0/query"
    )
    # The endpoint doesn't carry the LAD code; LSOA21NM is "<LAD name> XXXY".
    # Build a (LIKE 'X %' OR LIKE 'Y %' …) clause per LAD name. Special case
    # "City of London" — its LSOAs use that exact prefix.
    where = " OR ".join([f"LSOA21NM LIKE '{name} %'" for _, name in all_lads])
    features = []
    offset = 0
    while True:
        params = {
            "where": where,
            "outFields": "LSOA21CD,LSOA21NM",
            "outSR": "4326",
            "f": "geojson",
            "resultRecordCount": 2000,
            "resultOffset": offset,
        }
        r = requests.get(LSOA_URL, params=params, timeout=120)
        r.raise_for_status()
        gj = r.json()
        page = gj.get("features", [])
        features.extend(page)
        if len(page) < 2000:
            break
        offset += 2000
    log(f"  → {len(features)} LSOAs total")
    return features


# ────────────────────────────────────────────────────────────────────────
# IMD 2019 — ONS Excel, single download, keyed on LSOA 2011 (~99% match to 2021).
# ────────────────────────────────────────────────────────────────────────
def fetch_imd():
    log("Fetching IMD 2019…")
    url = (
        "https://assets.publishing.service.gov.uk/government/uploads/system/"
        "uploads/attachment_data/file/833970/"
        "File_1_-_IMD2019_Index_of_Multiple_Deprivation.xlsx"
    )
    p = RAW_DIR / "imd2019.xlsx"
    if not p.exists():
        r = requests.get(url, timeout=180)
        r.raise_for_status()
        p.write_bytes(r.content)
    df = pd.read_excel(p, sheet_name="IMD2019")
    code_col = next(c for c in df.columns if "LSOA code" in c)
    decile_col = next(c for c in df.columns if "Decile" in c and "IMD" in c)
    return {row[code_col]: int(row[decile_col]) for _, row in df.iterrows()}


# ────────────────────────────────────────────────────────────────────────
# Census 2021 ages by LSOA via NOMIS. Chunked to 100 LSOAs per call.
# ────────────────────────────────────────────────────────────────────────
def fetch_census(lsoa_codes):
    log(f"Fetching Census 2021 age structure for {len(lsoa_codes)} LSOAs…")
    NOMIS_BASE = "https://www.nomisweb.co.uk/api/v01/dataset/NM_2020_1.data.json"
    age_map = {}
    for i in range(0, len(lsoa_codes), 100):
        chunk = ",".join(lsoa_codes[i : i + 100])
        params = {
            "date": "latest",
            "geography": chunk,
            "measures": "20100",
            "select": "geography_code,c2021_age_19,obs_value",
        }
        for attempt in range(3):
            try:
                r = requests.get(NOMIS_BASE, params=params, timeout=180)
                if r.ok:
                    break
            except requests.RequestException:
                pass
            time.sleep(2)
        else:
            log(f"  ⚠ NOMIS chunk {i//100} failed after 3 attempts")
            continue
        for obs in r.json().get("obs", []):
            code = obs["geography"]["geogcode"]
            band_id = obs["c2021_age_19"]["value"]
            age_map.setdefault(code, {})[band_id] = obs["obs_value"]["value"]
        if (i // 100) % 10 == 0:
            log(f"  → {i + 100}/{len(lsoa_codes)}")
    return age_map


# ────────────────────────────────────────────────────────────────────────
# Tree Equity Score UK — single England-wide CSV.
# ────────────────────────────────────────────────────────────────────────
def fetch_tes():
    log("Fetching Tree Equity Score UK (England-wide CSV)…")
    p = RAW_DIR / "england_tes.csv"
    if not p.exists():
        url = "https://tes-uk-app-data-share.s3.amazonaws.com/england/england_csv.zip"
        r = requests.get(url, timeout=180)
        r.raise_for_status()
        with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
            csv_name = next(n for n in zf.namelist() if n.lower().endswith(".csv"))
            p.write_bytes(zf.read(csv_name))
    df = pd.read_csv(p, low_memory=False)
    out = {}
    for _, row in df.iterrows():
        code = row["bge_code"]
        canopy = row.get("treecanopy")
        score = row.get("tes")
        out[code] = {
            "canopy_cover_pct": round(float(canopy) * 100, 1) if pd.notna(canopy) else None,
            "tree_equity_score": round(float(score), 1) if pd.notna(score) else None,
        }
    return out


# ────────────────────────────────────────────────────────────────────────
# OSM streets per LAD via Overpass. Buildings just counted, not stored.
# ────────────────────────────────────────────────────────────────────────
def fetch_osm_for_lad(lad_code, lad_name):
    """Streets + building count for one LAD. Bins by LSOA in caller."""
    # Overpass area lookup by ISO code is unreliable for English LADs; use a
    # name-based area filter against admin_level=8 boundaries.
    streets_q = f"""
[out:json][timeout:180];
relation["admin_level"="8"]["name"="{lad_name}"]["boundary"="administrative"];
map_to_area->.lad;
(
  way["highway"~"^(primary|secondary|tertiary|residential|unclassified|living_street)$"](area.lad);
);
out geom;
"""
    buildings_q = f"""
[out:json][timeout:240];
relation["admin_level"="8"]["name"="{lad_name}"]["boundary"="administrative"];
map_to_area->.lad;
(
  way["building"](area.lad);
);
out center;
"""
    streets, buildings = [], []
    for label, q, target in [("streets", streets_q, streets), ("buildings", buildings_q, buildings)]:
        for attempt in range(3):
            try:
                r = requests.post(
                    OVERPASS, data={"data": q}, headers=OVERPASS_HEADERS, timeout=400
                )
                if r.ok:
                    target.extend(r.json().get("elements", []))
                    break
                log(f"  ⚠ Overpass {label} {lad_name} attempt {attempt+1}: HTTP {r.status_code}")
            except requests.RequestException as e:
                log(f"  ⚠ Overpass {label} {lad_name} attempt {attempt+1}: {e}")
            time.sleep(8)
        else:
            log(f"  ⚠ Overpass {label} {lad_name} gave up after 3 attempts")
    return streets, buildings


# ────────────────────────────────────────────────────────────────────────
# Glue.
# ────────────────────────────────────────────────────────────────────────
def build_for_city(city_key, boundaries_for_city, imd, age_map, tes, gdf_for_city, skip_osm=False):
    cfg = CITIES[city_key]
    log(f"\n=== Building {cfg['label']} ({len(boundaries_for_city)} LSOAs) ===")

    OUT = {}
    lsoa_polys = {}
    for f in boundaries_for_city:
        code = f["properties"].get("LSOA21CD") or f["properties"].get("LSOA22CD")
        name = f["properties"].get("LSOA21NM") or f["properties"].get("LSOA22NM")
        # Identify the LAD from the LSOA name prefix.
        lad_name = next(
            (n for _, n in cfg["lads"] if name.startswith(n + " ")), None
        )
        OUT[code] = {
            "name": name,
            "city": cfg["slug"],
            "lad_name": lad_name,
            "geometry": f["geometry"],
            "imd_decile": imd.get(code),
            "vulnerability_score": None,
            "vulnerability_flood": None,
            "canopy_cover_pct": tes.get(code, {}).get("canopy_cover_pct"),
            "tree_equity_score": tes.get(code, {}).get("tree_equity_score"),
            "building_count": 0,
            "population": None,
            "pop_density_per_ha": None,
            "pct_over_65": None,
            "pct_under_5": None,
            "streets": [],
        }
        lsoa_polys[code] = shape(f["geometry"])

    # Population + density
    for code, bands in age_map.items():
        if code not in OUT:
            continue
        total = bands.get(0)
        if not total:
            continue
        OUT[code]["population"] = total
        under_5 = bands.get(1, 0)
        over_65 = sum(bands.get(b, 0) for b in (14, 15, 16, 17, 18))
        OUT[code]["pct_under_5"] = round(100 * under_5 / total, 1)
        OUT[code]["pct_over_65"] = round(100 * over_65 / total, 1)

    # Density needs polygon area in m². gdf_for_city is already in EPSG:27700.
    for _, row in gdf_for_city.iterrows():
        code = row.get("LSOA21CD") or row.get("LSOA22CD")
        if code in OUT and OUT[code]["population"]:
            area_ha = row.geometry.area / 10000
            OUT[code]["pop_density_per_ha"] = round(OUT[code]["population"] / area_ha, 1)

    # OSM streets per LAD
    if not skip_osm:
        for lad_code, lad_name in cfg["lads"]:
            log(f"OSM: {lad_name}")
            streets, buildings = fetch_osm_for_lad(lad_code, lad_name)
            log(f"  → {len(streets)} streets, {len(buildings)} buildings (centroids)")

            # Bin streets by LSOA centroid containment.
            for el in streets:
                geom = el.get("geometry")
                if not geom or len(geom) < 2:
                    continue
                coords = [(p["lon"], p["lat"]) for p in geom]
                centroid = LineString(coords).centroid
                for code, poly in lsoa_polys.items():
                    if poly.contains(centroid):
                        OUT[code]["streets"].append({
                            "id": el["id"],
                            "name": el.get("tags", {}).get("name"),
                            "highway": el.get("tags", {}).get("highway"),
                            "coords": coords,
                        })
                        break

            # Buildings — just count, don't store geometry.
            for el in buildings:
                if "center" in el:
                    pt = (el["center"]["lon"], el["center"]["lat"])
                elif "geometry" in el and el["geometry"]:
                    pt = (el["geometry"][0]["lon"], el["geometry"][0]["lat"])
                else:
                    continue
                from shapely.geometry import Point
                p = Point(pt)
                for code, poly in lsoa_polys.items():
                    if poly.contains(p):
                        OUT[code]["building_count"] += 1
                        break
            time.sleep(1)  # polite Overpass rate

    # Composite vulnerability (heat axis)
    def safe_minmax(values):
        vals = [v for v in values if v is not None]
        if not vals:
            return lambda x: 0
        lo, hi = min(vals), max(vals)
        if hi == lo:
            return lambda x: 0.5
        return lambda x: (x - lo) / (hi - lo) if x is not None else 0

    imd_norm = safe_minmax([(11 - v["imd_decile"]) for v in OUT.values() if v["imd_decile"]])
    age_norm = safe_minmax([(v.get("pct_over_65") or 0) + (v.get("pct_under_5") or 0) for v in OUT.values()])
    canopy_norm = safe_minmax([v.get("canopy_cover_pct") for v in OUT.values()])
    dens_norm = safe_minmax([v.get("pop_density_per_ha") for v in OUT.values()])

    for code, v in OUT.items():
        imd_score = imd_norm(11 - v["imd_decile"]) if v["imd_decile"] else 0
        age_score = age_norm((v.get("pct_over_65") or 0) + (v.get("pct_under_5") or 0))
        canopy_score = 1 - canopy_norm(v.get("canopy_cover_pct"))
        dens_score = dens_norm(v.get("pop_density_per_ha"))
        v["vulnerability_score"] = round(
            0.35 * imd_score + 0.25 * age_score + 0.25 * canopy_score + 0.15 * dens_score, 3
        )

    out_path = OUT_DIR / f"lsoas-{cfg['slug']}.json"
    with out_path.open("w") as f:
        json.dump(OUT, f, separators=(",", ":"))
    size_mb = out_path.stat().st_size / 1024 / 1024
    log(f"✓ Wrote {out_path} ({size_mb:.1f} MB) for {len(OUT)} LSOAs")
    return OUT


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=list(CITIES.keys()), help="Only run for one city")
    ap.add_argument("--skip-osm", action="store_true", help="Skip OSM (fast metadata-only build)")
    args = ap.parse_args()

    selected = [args.only] if args.only else list(CITIES.keys())
    all_lads = []
    for k in selected:
        all_lads.extend(CITIES[k]["lads"])

    # 1. National datasets
    boundaries = fetch_boundaries(all_lads)
    imd = fetch_imd()
    tes = fetch_tes()

    # Build a global geodataframe so we can compute per-LSOA areas in EPSG:27700.
    gdf = gpd.GeoDataFrame.from_features(boundaries, crs="EPSG:4326").to_crs("EPSG:27700")

    # Census per-LSOA in chunks (one big call across all selected cities).
    all_codes = [
        f["properties"].get("LSOA21CD") or f["properties"].get("LSOA22CD") for f in boundaries
    ]
    age_map = fetch_census(all_codes)

    # 2. Per-city build
    for city_key in selected:
        cfg = CITIES[city_key]
        lad_names = {n for _, n in cfg["lads"]}
        city_features = [
            f for f in boundaries
            if any((f["properties"].get("LSOA21NM") or "").startswith(n + " ") for n in lad_names)
        ]
        # Filter geodataframe to this city's LSOAs.
        city_codes = {
            f["properties"].get("LSOA21CD") or f["properties"].get("LSOA22CD")
            for f in city_features
        }
        city_gdf = gdf[gdf["LSOA21CD"].isin(city_codes)] if "LSOA21CD" in gdf.columns else gdf

        build_for_city(city_key, city_features, imd, age_map, tes, city_gdf, skip_osm=args.skip_osm)


if __name__ == "__main__":
    main()
