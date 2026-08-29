#!/usr/bin/env python3
"""
GPX 세그먼트 이어붙이기로 생긴 가짜 직선을 끊는다.

원인: gpx_to_geojson.py 가 `.//trkpt` 로 모든 <trkseg> 의 점을 하나의 LineString 에
합쳤다. GPS 수신이 끊긴 구간이나 원래 분리된 세그먼트가 직선으로 연결돼
지도에 실제로 없는 길이 그려진다. 설악산 한 코스에는 2.2km 짜리 직선이 있었다.

해결: 인접 정점 간 거리가 임계값을 넘으면 그 지점에서 끊어 MultiLineString 으로 만든다.
거리·누적상승 같은 통계 속성은 원본 기준으로 이미 계산돼 있어 건드리지 않는다.
(점프 구간이 거리에 포함돼 과대평가되지만, 원본 수치를 임의로 고쳐 쓰지 않는다.
 대신 끊긴 조각 수를 `조각수` 속성으로 남겨 데이터 품질을 드러낸다.)
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
TARGETS = [
    ROOT / "public" / "data" / "courses",
    ROOT / "public" / "data" / "peak-courses",
]

# 정점 간격이 보통 10m 안팎이라 200m 는 20배다. 이 이상은 실제 경로로 보기 어렵다.
GAP_THRESHOLD_M = 200.0


def haversine(a, b) -> float:
    radius = 6_371_000.0
    lat1, lon1 = math.radians(a[1]), math.radians(a[0])
    lat2, lon2 = math.radians(b[1]), math.radians(b[0])
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 2 * radius * math.asin(math.sqrt(h))


def split_at_gaps(coords: list, threshold: float) -> list[list]:
    parts: list[list] = [[coords[0]]] if coords else []
    for i in range(1, len(coords)):
        if haversine(coords[i - 1], coords[i]) > threshold:
            parts.append([coords[i]])
        else:
            parts[-1].append(coords[i])
    # 점 1개짜리 조각은 선으로 그릴 수 없다.
    return [p for p in parts if len(p) >= 2]


def main() -> None:
    threshold = float(sys.argv[1]) if len(sys.argv) > 1 else GAP_THRESHOLD_M
    split_features = 0
    total_features = 0
    dropped = 0

    for directory in TARGETS:
        if not directory.exists():
            continue
        for path in sorted(directory.glob("*.json")):
            bundle = json.loads(path.read_text(encoding="utf-8"))
            changed = False

            for feature in bundle["courses"]["features"]:
                geometry = feature["geometry"]
                if geometry["type"] != "LineString":
                    continue
                total_features += 1

                parts = split_at_gaps(geometry["coordinates"], threshold)
                if not parts:
                    dropped += 1
                    continue
                if len(parts) == 1:
                    continue

                geometry["type"] = "MultiLineString"
                geometry["coordinates"] = parts
                feature["properties"]["조각수"] = len(parts)
                split_features += 1
                changed = True

            if changed:
                path.write_text(
                    json.dumps(bundle, ensure_ascii=False, separators=(",", ":")),
                    encoding="utf-8",
                )

    print(f"코스 {total_features:,}개 중 {split_features:,}개를 끊었다 ({threshold:.0f}m 초과 점프)")
    if dropped:
        print(f"정점 부족으로 선을 못 만든 코스 {dropped}개")


if __name__ == "__main__":
    main()
