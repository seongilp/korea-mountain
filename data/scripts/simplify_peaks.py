#!/usr/bin/env python3
"""
봉우리 코스 지오메트리를 단순화한다.

원본은 정점 간격이 약 10m 라 4,492개 봉우리 합계가 95MB 다. 배포와 전송에 과하다.
Douglas-Peucker 로 형상을 유지한 채 정점을 줄인다. 고도는 남는 정점의 값을 그대로
가져가므로 고도 프로파일과 3D 표시에 영향이 없다.

거리/누적상승 같은 통계 속성은 원본 정점 기준으로 이미 계산돼 있으므로 건드리지 않는다.

순서 주의: 반드시 split_track_gaps.py 로 GPS 점프를 끊은 **뒤에** 실행해야 한다.
단순화를 먼저 하면 직선 구간의 중간점이 사라져 그 간격이 GPS 끊김으로 오판된다.
(실측: 순서를 바꿨더니 끊김 판정이 26% → 60% 로 부풀었다.)
"""

from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DIR = ROOT / "public" / "data" / "peak-courses"

# 위경도 → 미터 근사에 쓰는 값. 한국 위도대(약 36도)에서 경도 1도는 약 90km.
LAT_M = 111_320.0
LON_M = 90_000.0

TOLERANCE_M = 6.0  # 원본 간격이 약 10m 라 형상 손실 없이 절반 이하로 줄어든다.


def perpendicular_distance(point, start, end) -> float:
    """등거리 근사 평면에서의 점-선분 거리(미터)."""
    px, py = (point[0] - start[0]) * LON_M, (point[1] - start[1]) * LAT_M
    ex, ey = (end[0] - start[0]) * LON_M, (end[1] - start[1]) * LAT_M
    seg = math.hypot(ex, ey)
    if seg == 0:
        return math.hypot(px, py)
    return abs(px * ey - py * ex) / seg


def douglas_peucker(points: list, tolerance: float) -> list:
    """재귀 대신 스택을 쓴다. 코스당 수천 정점이라 재귀는 한계에 걸린다."""
    if len(points) < 3:
        return points

    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]

    while stack:
        first, last = stack.pop()
        if last <= first + 1:
            continue
        worst, worst_index = 0.0, first
        for i in range(first + 1, last):
            d = perpendicular_distance(points[i], points[first], points[last])
            if d > worst:
                worst, worst_index = d, i
        if worst > tolerance:
            keep[worst_index] = True
            stack.append((first, worst_index))
            stack.append((worst_index, last))

    return [p for p, k in zip(points, keep) if k]


def main() -> None:
    tolerance = float(sys.argv[1]) if len(sys.argv) > 1 else TOLERANCE_M
    before = after = 0
    points_before = points_after = 0
    files = sorted(DIR.glob("*.json"))

    for path in files:
        before += path.stat().st_size
        bundle = json.loads(path.read_text(encoding="utf-8"))
        for feature in bundle["courses"]["features"]:
            geometry = feature["geometry"]
            # split_track_gaps.py 를 거치면 MultiLineString 이 섞인다. 조각마다 따로 단순화한다.
            is_multi = geometry["type"] == "MultiLineString"
            parts = geometry["coordinates"] if is_multi else [geometry["coordinates"]]

            reduced = []
            for part in parts:
                points_before += len(part)
                simplified = douglas_peucker(part, tolerance)
                # 좌표 자릿수도 줄인다. 6자리면 약 0.1m 분해능이라 등산로에 충분하다.
                rounded = [
                    [round(c[0], 6), round(c[1], 6)] + ([round(c[2], 1)] if len(c) > 2 else [])
                    for c in simplified
                ]
                points_after += len(rounded)
                if len(rounded) >= 2:
                    reduced.append(rounded)

            if not reduced:
                continue
            geometry["coordinates"] = reduced if is_multi else reduced[0]
        path.write_text(
            json.dumps(bundle, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
        )
        after += path.stat().st_size

    print(f"파일 {len(files)}개")
    print(f"정점 {points_before:,} → {points_after:,} ({points_after / points_before * 100:.0f}%)")
    print(f"크기 {before / 1024 / 1024:.0f}MB → {after / 1024 / 1024:.0f}MB")


if __name__ == "__main__":
    main()
