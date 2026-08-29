#!/usr/bin/env python3
"""전국 주요 봉우리 코스 GPX zip -> 앱용 봉우리 인덱스 + 봉우리별 코스 번들.

출처: data.go.kr 15108086 한국등산트레킹지원센터_전국 주요 봉우리 코스_20221116

입력 zip 내부 구조는 `{봉우리코드}_{봉우리명}/{봉우리명}_{코스ID}.gpx` 이고,
**파일명이 CP949** 라 zipfile 에 metadata_encoding="cp949" 를 줘야 한다.

산출물 (100대명산 파이프라인 gpx_to_geojson.py / split_by_mountain.py 와 같은 규약):
  public/data/peaks.json            봉우리 인덱스
  public/data/peak-courses/{file}   봉우리별 {name, courses, pois} 번들

주의: 봉우리명은 유일하지 않다(국사봉 54개, 옥녀봉 46개 …). 봉우리의 실체는 10자리 코드다.
따라서 파일명은 이름이 유일할 때만 `{이름}.json`, 겹치면 `{이름}_{코드}.json` 을 쓰고
인덱스의 `file` 필드에 실제 파일명을 담는다. 클라이언트는 항상 `file` 을 써야 한다.

100대명산과 이름이 겹치는 봉우리에는 hasMyeongsan=true 플래그만 달고 양쪽 데이터를 모두 남긴다.
(public/data/mountains.json 과 public/data/courses/ 는 건드리지 않는다.)

원본은 Tranggle 트랙이라 정점 간격이 촘촘하다(전체 86MB). 용량이 문제라면
`--simplify 5` 처럼 Douglas-Peucker 허용오차(m)를 주면 5분의 1로 줄어든다.
거리·누적상승 등 통계는 항상 원본 해상도로 먼저 계산하므로 간소화해도 값은 바뀌지 않는다.

usage: python3 build_peaks.py <peaks.zip> [--simplify <meters>]
"""
from __future__ import annotations

import json
import math
import re
import statistics
import sys
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT_INDEX = ROOT / "public" / "data" / "peaks.json"
OUT_DIR = ROOT / "public" / "data" / "peak-courses"
MYEONGSAN = ROOT / "public" / "data" / "mountains.json"

NS = {"g": "http://www.topografix.com/GPX/1/1"}
SOURCE = "전국주요봉우리"

COORD_PRECISION = 5      # 약 1.1m. 6자리는 등산 경로에 과하고 파일만 커진다.
GAIN_THRESHOLD_M = 3.0   # GPS 고도 노이즈 컷. 기존 100대명산 스크립트에는 임계값이 없어
                         # 누적상승이 과대평가됐다. 여기서는 3m 미만 상승은 무시한다.
KR_BBOX = (124.0, 132.0, 33.0, 39.0)  # lon_min, lon_max, lat_min, lat_max
REGION_OUTLIER_DEG = 1.0  # 같은 코드 그룹 중앙값에서 이만큼 벗어나면 region 을 신뢰하지 않는다.

# 봉우리코드 앞 5자리(= 관할 기관 코드로 추정)별 시도.
# 코드 자체가 행정구역 코드는 아니라서, 그룹별 좌표 중앙값을 보고 수작업으로 붙였다.
# (예: 부산이 32130/52130 두 코드로 갈리고, 32 는 대구·울산·부산에 걸친다.)
REGION_BY_CODE = {
    "11110": "서울특별시", "12310": "인천광역시",
    "13110": "경기도", "13180": "경기도",
    "23220": "강원도",
    "32130": "부산광역시", "32230": "대구광역시", "32250": "대구광역시",
    "32630": "울산광역시", "32650": "울산광역시",
    "33730": "경상북도", "33750": "경상북도", "33830": "경상남도",
    "43340": "충청북도",
    "52130": "부산광역시", "53830": "경상남도", "53850": "경상남도",
    "63560": "전라북도", "63580": "전라북도",
    "72460": "광주광역시", "72470": "광주광역시", "72480": "전라남도",
    "73660": "전라남도", "73670": "전라남도",
    "82570": "대전광역시", "82970": "세종특별자치시",
    "83470": "충청남도", "83480": "충청남도",
}


def haversine_km(a: list, b: list) -> float:
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371.0088 * 2 * math.asin(math.sqrt(h))


def parse_point(el: ET.Element) -> list | None:
    try:
        lon = round(float(el.get("lon")), COORD_PRECISION)
        lat = round(float(el.get("lat")), COORD_PRECISION)
    except (TypeError, ValueError):
        return None
    ele = el.find("g:ele", NS)
    try:
        z = round(float(ele.text), 1) if ele is not None and ele.text else None
    except ValueError:
        z = None
    return [lon, lat, z] if z is not None else [lon, lat]


def text_of(el: ET.Element, tag: str) -> str:
    node = el.find(f"g:{tag}", NS)
    return (node.text or "").strip() if node is not None else ""


def cumulative_gain(elevations: list[float]) -> float:
    """3m 이상 오른 구간만 누적. 임계값 미만 변화는 GPS 노이즈로 보고 버린다."""
    gain, base = 0.0, elevations[0]
    for z in elevations[1:]:
        if z - base >= GAIN_THRESHOLD_M:
            gain += z - base
            base = z
        elif z < base:
            base = z
    return gain


def simplify(points: list, tolerance_m: float) -> list:
    """Douglas-Peucker. 위경도를 등거리 근사로 m 로 환산해 수직거리를 잰다."""
    if tolerance_m <= 0 or len(points) < 3:
        return points
    kx = math.cos(math.radians(points[0][1])) * 111_320.0
    ky = 110_540.0

    def perpendicular(p, a, b) -> float:
        ax, ay, bx, by, px, py = a[0] * kx, a[1] * ky, b[0] * kx, b[1] * ky, p[0] * kx, p[1] * ky
        dx, dy = bx - ax, by - ay
        if dx == 0 and dy == 0:
            return math.hypot(px - ax, py - ay)
        t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
        return math.hypot(px - ax - t * dx, py - ay - t * dy)

    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        far_i, far_d = -1, 0.0
        for k in range(i + 1, j):
            d = perpendicular(points[k], points[i], points[j])
            if d > far_d:
                far_i, far_d = k, d
        if far_d > tolerance_m:
            keep[far_i] = True
            stack.append((i, far_i))
            stack.append((far_i, j))
    return [p for p, k in zip(points, keep) if k]


def parse_gpx(raw: bytes, group: str, course_id: str, tolerance_m: float = 0.0) -> tuple[dict | None, list[dict]]:
    try:
        root = ET.fromstring(raw)
    except ET.ParseError:
        return None, []

    coords = [p for p in (parse_point(p) for p in root.iterfind(".//g:trkpt", NS)) if p]
    if len(coords) < 2:
        return None, []

    # ele 가 통째로 0인 GPX 가 있다. 0m 는 실제 값처럼 보여 정렬을 망치므로 없는 값으로 취급한다.
    elevations = [c[2] for c in coords if len(c) > 2]
    if not any(z for z in elevations):
        elevations = []

    length_km = sum(haversine_km(coords[i], coords[i + 1]) for i in range(len(coords) - 1))
    props = {
        "출처": SOURCE,
        "그룹": group,
        "코스ID": course_id,
        "정점수": len(coords),
        "거리_km": round(length_km, 2),
        "최저고도_m": min(elevations) if elevations else None,
        "최고고도_m": max(elevations) if elevations else None,
        "누적상승_m": round(cumulative_gain(elevations)) if elevations else None,
    }
    # 통계는 원본 해상도로 계산한 뒤에 좌표만 줄인다.
    line = {"type": "Feature", "properties": props,
            "geometry": {"type": "LineString", "coordinates": simplify(coords, tolerance_m)}}

    pois = []
    for w in root.iterfind("g:wpt", NS):
        pt = parse_point(w)
        if not pt:
            continue
        pois.append({
            "type": "Feature",
            "properties": {"출처": SOURCE, "그룹": group, "코스ID": course_id,
                           "이름": text_of(w, "name"), "종류": text_of(w, "sym")},
            "geometry": {"type": "Point", "coordinates": pt},
        })
    return line, pois


def safe_slug(name: str) -> str:
    """파일명으로 쓸 수 있는 형태로. 경로 구분자·예약문자·선행 점을 제거한다."""
    slug = unicodedata.normalize("NFC", name)
    slug = re.sub(r'[/\\:*?"<>|\x00-\x1f]', "_", slug).replace("..", "_")
    slug = slug.strip().strip(".")
    return slug or "unnamed"


def read_zip(zip_path: Path, tolerance_m: float = 0.0) -> dict[str, dict]:
    """봉우리코드 -> {name, code, courses, pois} 로 모은다."""
    peaks: dict[str, dict] = {}
    with zipfile.ZipFile(zip_path, metadata_encoding="cp949") as zf:
        for entry in sorted(zf.namelist()):
            if not entry.lower().endswith(".gpx"):
                continue
            parts = entry.split("/")
            if len(parts) < 2:
                continue
            folder = unicodedata.normalize("NFC", parts[-2])
            code, _, name = folder.partition("_")
            name = name or folder
            course_id = Path(unicodedata.normalize("NFC", parts[-1])).stem

            line, pois = parse_gpx(zf.read(entry), name, course_id, tolerance_m)
            if not line:
                continue
            peak = peaks.setdefault(folder, {"name": name, "code": code, "courses": [], "pois": []})
            peak["courses"].append(line)
            peak["pois"].extend(pois)
    return peaks


def assign_files(peaks: dict[str, dict]) -> None:
    """이름이 유일하면 `{이름}.json`, 겹치면 `{이름}_{코드}.json`."""
    counts = Counter(safe_slug(p["name"]) for p in peaks.values())
    used: set[str] = set()
    for folder in sorted(peaks):
        peak = peaks[folder]
        slug = safe_slug(peak["name"])
        stem = slug if counts[slug] == 1 else f"{slug}_{peak['code']}"
        while stem in used:                       # 이론상 남는 충돌까지 방어
            stem = f"{stem}_{peak['code']}"
        used.add(stem)
        peak["file"] = f"{stem}.json"


def assign_regions(peaks: dict[str, dict]) -> int:
    """코드 앞 5자리로 시도를 붙인다.

    코드는 봉우리 위치가 아니라 관할 기관을 가리키는 것으로 보여, 그룹 중앙값에서 크게
    벗어난 봉우리는 다른 시도일 수 있다. 그런 봉우리는 가장 가까운 다른 코드 그룹이
    같은 시도일 때만 유지하고(울릉도처럼 멀지만 같은 도인 경우), 아니면 null 로 둔다.
    """
    groups = defaultdict(list)
    for peak in peaks.values():
        groups[peak["code"][:5]].append(peak)

    centers = {prefix: (statistics.median(p["lon"] for p in members),
                        statistics.median(p["lat"] for p in members))
               for prefix, members in groups.items()}

    unknown = 0
    for prefix, members in groups.items():
        region = REGION_BY_CODE.get(prefix)
        mlon, mlat = centers[prefix]
        for p in members:
            off = abs(p["lon"] - mlon) > REGION_OUTLIER_DEG or abs(p["lat"] - mlat) > REGION_OUTLIER_DEG
            if off:
                nearest = min((c for c in centers if c != prefix),
                              key=lambda c: math.hypot(centers[c][0] - p["lon"], centers[c][1] - p["lat"]),
                              default=None)
                off = REGION_BY_CODE.get(nearest) != region
            p["region"] = None if (region is None or off) else region
            unknown += p["region"] is None
    return unknown


def summarize(peak: dict) -> dict:
    """코스들을 인덱스 항목으로 집계. 대표 좌표는 코스 시작점들의 평균."""
    props = [c["properties"] for c in peak["courses"]]
    peaks_m = [p["최고고도_m"] for p in props if p["최고고도_m"] is not None]
    starts = [c["geometry"]["coordinates"][0] for c in peak["courses"]]
    return {
        "name": peak["name"],
        "file": peak["file"],
        "courses": len(props),
        "totalKm": round(sum(p["거리_km"] for p in props), 1),
        "longestKm": round(max(p["거리_km"] for p in props), 1),
        # 고도 정보가 없으면 0 이 아니라 null. 0m 는 실제 값처럼 보여 정렬을 망친다.
        "peakM": round(max(peaks_m), 1) if peaks_m else None,
        "lon": round(sum(s[0] for s in starts) / len(starts), COORD_PRECISION),
        "lat": round(sum(s[1] for s in starts) / len(starts), COORD_PRECISION),
    }


def main() -> None:
    args = sys.argv[1:]
    tolerance_m = 0.0
    if "--simplify" in args:
        i = args.index("--simplify")
        try:
            tolerance_m = float(args[i + 1])
        except (IndexError, ValueError):
            sys.exit("--simplify 뒤에 허용오차(m)를 숫자로 줘야 한다")
        del args[i:i + 2]
    if len(args) != 1:
        sys.exit("usage: python3 build_peaks.py <peaks.zip> [--simplify <meters>]")
    zip_path = Path(args[0]).expanduser()
    if not zip_path.is_file():
        sys.exit(f"zip 을 찾을 수 없다: {zip_path}")

    peaks = read_zip(zip_path, tolerance_m)
    assign_files(peaks)

    myeongsan = {m["name"] for m in json.loads(MYEONGSAN.read_text(encoding="utf-8"))} \
        if MYEONGSAN.is_file() else set()

    index, out_of_range, no_elevation = [], [], 0
    for folder in sorted(peaks):
        peak = peaks[folder]
        entry = summarize(peak)
        entry["code"] = peak["code"]
        if entry["peakM"] is None:
            no_elevation += 1
        if peak["name"] in myeongsan:
            entry["hasMyeongsan"] = True

        lo_lon, hi_lon, lo_lat, hi_lat = KR_BBOX
        bad = [c for c in peak["courses"]
               for x, y, *_ in c["geometry"]["coordinates"]
               if not (lo_lon <= x <= hi_lon and lo_lat <= y <= hi_lat)]
        if bad:
            out_of_range.append((peak["name"], peak["code"], len(bad)))

        peak["entry"] = entry
        index.append(entry)

    for peak in peaks.values():
        peak["lon"], peak["lat"] = peak["entry"]["lon"], peak["entry"]["lat"]
    unknown_region = assign_regions(peaks)
    for peak in peaks.values():
        peak["entry"]["region"] = peak["region"]

    index.sort(key=lambda e: (-(e["peakM"] or -1), e["name"]))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for existing in OUT_DIR.glob("*.json"):
        existing.unlink()

    total_bytes, largest = 0, ("", 0)
    for peak in peaks.values():
        payload = {
            "name": peak["name"],
            "courses": {"type": "FeatureCollection", "features": peak["courses"]},
            "pois": {"type": "FeatureCollection", "features": peak["pois"]},
        }
        path = OUT_DIR / peak["file"]
        path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        size = path.stat().st_size
        total_bytes += size
        if size > largest[1]:
            largest = (peak["file"], size)

    OUT_INDEX.parent.mkdir(parents=True, exist_ok=True)
    OUT_INDEX.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    courses = sum(e["courses"] for e in index)
    print(f"봉우리 {len(index):,}개 / 코스 {courses:,}개")
    print(f"peaks.json {OUT_INDEX.stat().st_size / 1024:.0f}KB")
    print(f"peak-courses/ 합계 {total_bytes / 1024 / 1024:.1f}MB, 최대 {largest[0]} {largest[1] / 1024:.0f}KB")
    print(f"고도 없는 봉우리 {no_elevation}개 / region 미상 {unknown_region}개 / 100대명산 겹침 "
          f"{sum(1 for e in index if e.get('hasMyeongsan'))}개")
    if out_of_range:
        print(f"한국 범위({KR_BBOX}) 이탈 봉우리 {len(out_of_range)}개: {out_of_range[:20]}")
    else:
        print("좌표 범위 이탈 없음")


if __name__ == "__main__":
    main()
