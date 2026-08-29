#!/usr/bin/env python3
"""
100대명산 코스 GeoJSON(10MB)을 산별 파일로 쪼갠다.

클라이언트에 10MB 를 통째로 보낼 수는 없다. 목록 화면은 public/data/mountains.json(11KB)만
쓰고, 사용자가 산을 고르면 그 산의 코스만 받아 가게 한다.

입력:  data/processed/myeongsan100.geojson
       data/processed/myeongsan100_waypoints.geojson
출력:  public/data/courses/{산이름}.json  (코스 + 해당 산 POI)

정적 파일로 CDN 이 직접 서빙한다. public/ 밖에 두면 Vercel 함수 번들에 포함되지 않아
런타임 fs 읽기가 실패한다.
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
PROCESSED = ROOT / "data" / "processed"
OUT_DIR = ROOT / "public" / "data" / "courses"


def main() -> None:
    courses = json.loads((PROCESSED / "myeongsan100.geojson").read_text(encoding="utf-8"))
    waypoints = json.loads((PROCESSED / "myeongsan100_waypoints.geojson").read_text(encoding="utf-8"))

    by_mountain: dict[str, dict[str, list]] = defaultdict(lambda: {"courses": [], "pois": []})

    for feature in courses["features"]:
        name = feature["properties"].get("그룹")
        if name:
            by_mountain[name]["courses"].append(feature)

    for feature in waypoints["features"]:
        name = feature["properties"].get("그룹")
        if name:
            by_mountain[name]["pois"].append(feature)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for existing in OUT_DIR.glob("*.json"):
        existing.unlink()

    total = 0
    largest = ("", 0)
    for name, bundle in by_mountain.items():
        payload = {
            "name": name,
            "courses": {"type": "FeatureCollection", "features": bundle["courses"]},
            "pois": {"type": "FeatureCollection", "features": bundle["pois"]},
        }
        path = OUT_DIR / f"{name}.json"
        path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        size = path.stat().st_size
        total += size
        if size > largest[1]:
            largest = (name, size)

    print(f"{len(by_mountain)}개 산, 합계 {total / 1024 / 1024:.1f}MB")
    print(f"최대: {largest[0]} {largest[1] / 1024:.0f}KB")


if __name__ == "__main__":
    main()
