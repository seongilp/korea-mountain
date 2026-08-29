"""GPX zip(100대명산 / 국가숲길) -> WGS84 GeoJSON.

GPX 좌표계는 규격상 항상 WGS84라 재투영이 필요 없다.
코스 1개(GPX 파일 1개)당 Feature 1개(LineString, [lon, lat, ele])를 만들고,
GPX 안의 <wpt>(들머리·정상·쉼터 등 POI)는 별도 FeatureCollection 으로 뽑는다.
"""
import json
import math
import re
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

DATA = Path(__file__).resolve().parents[1]
NS = {"g": "http://www.topografix.com/GPX/1/1"}
SOURCES = (
    ("15098177_100myeongsan.zip", "myeongsan100", "100대명산"),
    ("15108080_forestroad_gpx.zip", "national_forest_trails", "국가숲길"),
)


def _haversine_km(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371.0088 * 2 * math.asin(math.sqrt(h))


def _point(el):
    ele = el.find("g:ele", NS)
    try:
        z = round(float(ele.text), 1) if ele is not None and ele.text else None
    except ValueError:
        z = None
    lon, lat = round(float(el.get("lon")), 6), round(float(el.get("lat")), 6)
    return [lon, lat, z] if z is not None else [lon, lat]


def _text(el, tag):
    node = el.find(f"g:{tag}", NS)
    return (node.text or "").strip() if node is not None else ""


def parse_gpx(raw, group, course_id, source):
    root = ET.fromstring(raw)
    coords = [_point(p) for p in root.iterfind(".//g:trkpt", NS)]
    if len(coords) < 2:
        return None, []

    elevations = [c[2] for c in coords if len(c) > 2]
    length_km = sum(_haversine_km(coords[i], coords[i + 1]) for i in range(len(coords) - 1))
    gain = sum(max(0.0, elevations[i + 1] - elevations[i]) for i in range(len(elevations) - 1)) if elevations else None

    props = {
        "출처": source,
        "그룹": group,          # 산 이름 또는 숲길 이름
        "코스ID": course_id,
        "정점수": len(coords),
        "거리_km": round(length_km, 2),
        "최저고도_m": min(elevations) if elevations else None,
        "최고고도_m": max(elevations) if elevations else None,
        "누적상승_m": round(gain) if gain is not None else None,
    }
    line = {"type": "Feature", "properties": props,
            "geometry": {"type": "LineString", "coordinates": coords}}

    waypoints = []
    for w in root.iterfind("g:wpt", NS):
        pt = _point(w)
        waypoints.append({
            "type": "Feature",
            "properties": {"출처": source, "그룹": group, "코스ID": course_id,
                           "이름": _text(w, "name"), "종류": _text(w, "sym")},
            "geometry": {"type": "Point", "coordinates": pt},
        })
    return line, waypoints


def convert(zip_name, out_stem, source):
    lines, points = [], []
    with zipfile.ZipFile(DATA / "raw" / zip_name, metadata_encoding="cp949") as zf:
        for name in sorted(zf.namelist()):
            if not name.lower().endswith(".gpx"):
                continue
            parts = name.split("/")
            group = re.sub(r"^\d+_", "", parts[-2]) if len(parts) > 1 else ""
            course_id = Path(parts[-1]).stem
            line, wpts = parse_gpx(zf.read(name), group, course_id, source)
            if line:
                lines.append(line)
                points.extend(wpts)

    for suffix, feats in (("", lines), ("_waypoints", points)):
        if not feats:
            continue
        out = DATA / "processed" / f"{out_stem}{suffix}.geojson"
        out.write_text(json.dumps({"type": "FeatureCollection", "crs_note": "WGS84 (EPSG:4326)",
                                   "features": feats}, ensure_ascii=False), encoding="utf-8")
        print(f"{out.name}: features={len(feats)} size={out.stat().st_size:,}")


def main():
    (DATA / "processed").mkdir(parents=True, exist_ok=True)
    for zip_name, stem, source in SOURCES:
        convert(zip_name, stem, source)


if __name__ == "__main__":
    main()
