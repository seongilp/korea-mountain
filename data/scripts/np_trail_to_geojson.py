"""국립공원 탐방로 공간데이터(15003467) CSV -> WGS84 GeoJSON LineString.

원본은 EUC-KR(CP949) CSV이며 한 행이 경로의 정점 1개다.
(국립공원관리번호, 분류코드, 일련번호, 코스ID) 단위로 묶어 LineString 을 만들고
Douglas-Peucker 로 단순화한다. 좌표는 이미 WGS84(경도 126~130 / 위도 33~39)라 재투영이 필요 없다.
"""
import csv
import io
import json
import zipfile
from pathlib import Path

RAW = Path(__file__).resolve().parents[1] / "raw" / "15003467_np_trail_spatial.zip"
OUT = Path(__file__).resolve().parents[1] / "processed" / "np_trails.geojson"
TOLERANCE_DEG = 0.00001  # 약 1m (원본 정점 간격이 1m 내외라 형상 보존을 우선)

ATTR_COLUMNS = (
    "국립공원관리번호", "공원사무소코드", "분류코드", "일련번호", "코스ID",
    "탐방코스(한글)", "탐방코스(영문)", "상세구간", "코스일정",
    "가는시간(분)", "오는시간(분)", "지리정보시스템 상 거리(m)", "난이도",
    "탐방로 통제여부", "통제구간 설명",
)


def _perpendicular_distance(pt, start, end):
    (x, y), (x1, y1), (x2, y2) = pt, start, end
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return ((x - x1) ** 2 + (y - y1) ** 2) ** 0.5
    return abs(dy * x - dx * y + x2 * y1 - y2 * x1) / (dx * dx + dy * dy) ** 0.5


def simplify(points, tolerance):
    """반복형 Douglas-Peucker (재귀 깊이 제한 회피)."""
    if len(points) < 3:
        return list(points)
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        first, last = stack.pop()
        if last <= first + 1:
            continue
        max_dist, index = 0.0, first
        for i in range(first + 1, last):
            d = _perpendicular_distance(points[i], points[first], points[last])
            if d > max_dist:
                max_dist, index = d, i
        if max_dist > tolerance:
            keep[index] = True
            stack.append((first, index))
            stack.append((index, last))
    return [p for p, k in zip(points, keep) if k]


def build_features(rows):
    groups = {}
    order = []
    for row in rows:
        key = (row["국립공원관리번호"], row["분류코드"], row["일련번호"], row["코스ID"])
        entry = groups.get(key)
        if entry is None:
            entry = groups[key] = {"attrs": row, "coords": []}
            order.append(key)
        try:
            lon, lat = float(row["경도"]), float(row["위도"])
        except (TypeError, ValueError):
            continue
        if not (124.0 < lon < 132.0 and 32.0 < lat < 39.5):
            continue
        entry["coords"].append((round(lon, 6), round(lat, 6)))

    features = []
    for key in order:
        entry = groups[key]
        coords = simplify(entry["coords"], TOLERANCE_DEG)
        if len(coords) < 2:
            continue
        attrs = entry["attrs"]
        props = {col: attrs.get(col, "") for col in ATTR_COLUMNS}
        props["정점수_원본"] = len(entry["coords"])
        props["공원코드"] = attrs["국립공원관리번호"][:5]
        features.append({
            "type": "Feature",
            "properties": props,
            "geometry": {"type": "LineString", "coordinates": [list(c) for c in coords]},
        })
    return features


def main():
    with zipfile.ZipFile(RAW) as zf:
        name = next(n for n in zf.namelist() if n.lower().endswith(".csv"))
        with zf.open(name) as fh:
            reader = csv.DictReader(io.TextIOWrapper(fh, encoding="cp949", errors="replace"))
            features = build_features(reader)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps({"type": "FeatureCollection", "crs_note": "WGS84 (EPSG:4326)",
                    "features": features}, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"features={len(features)} out={OUT} size={OUT.stat().st_size:,}")


if __name__ == "__main__":
    main()
