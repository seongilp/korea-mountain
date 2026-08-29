#!/usr/bin/env python3
"""
국립공원 탐방로에 지오메트리로 실측한 거리 `geomDistM` 을 붙이고, 컬럼값과의 불일치를 표시한다.

배경:
  `distM` 은 원본 CSV 의 `지리정보시스템 상 거리(m)` 컬럼 그대로다. 단위는 **미터가 맞다**
  (격포코스 실측 14.74km = 컬럼 14745.88m 로 검증됨 — data/README.md 의 "km 로 추정" 서술은 틀렸다).
  다만 1,890개 중 일부는 컬럼값과 실제 선 길이가 크게 어긋난다. 어느 쪽이 옳은지는
  원본 제공기관만 알 수 있으므로 **컬럼값을 덮어쓰지 않고** 실측값을 나란히 둔다.

붙이는 속성:
  - `geomDistM`     : 지오메트리를 haversine 으로 합산한 길이(m). 소수 2자리.
  - `distMismatch`  : 컬럼값 대비 25% 이상 차이나면 true. (차이가 없으면 아예 붙이지 않는다 —
                       모든 피처에 false 를 넣으면 파일만 커진다.)

주의: 좌표는 읽기만 한다. 단순화(1m 허용오차 Douglas-Peucker)를 이미 거친 좌표라
      실측값도 원본 대비 미세하게 짧을 수 있지만, 1m 허용오차에서 생기는 오차는
      25% 임계값에 비하면 무시할 수준이다.

사용: python3 data/scripts/add_np_trail_geom_distance.py
"""

from __future__ import annotations

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TRAILS_DIR = ROOT / "public" / "data" / "np-trails"

EARTH_R_M = 6_371_008.8          # WGS84 평균 반지름
MISMATCH_RATIO = 0.25            # 컬럼값 대비 25% 이상 벌어지면 불일치로 본다.


def haversine_m(a: list, b: list) -> float:
    lat1, lon1 = math.radians(a[1]), math.radians(a[0])
    lat2, lon2 = math.radians(b[1]), math.radians(b[0])
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 2 * EARTH_R_M * math.asin(math.sqrt(h))


def line_length_m(coords: list) -> float:
    return sum(haversine_m(coords[i], coords[i + 1]) for i in range(len(coords) - 1))


def geometry_length_m(geometry: dict) -> float | None:
    """LineString / MultiLineString 모두 지원. 조각 사이의 빈 구간은 더하지 않는다."""
    kind = geometry.get("type")
    coords = geometry.get("coordinates") or []
    if kind == "LineString":
        return line_length_m(coords) if len(coords) >= 2 else None
    if kind == "MultiLineString":
        parts = [line_length_m(c) for c in coords if len(c) >= 2]
        return sum(parts) if parts else None
    return None


def main() -> None:
    total = mismatch = no_column = no_geom = 0
    worst: list[tuple[float, str, str, float, float]] = []

    for path in sorted(TRAILS_DIR.glob("*.json")):
        bundle = json.loads(path.read_text(encoding="utf-8"))
        for feature in bundle["features"]:
            props = feature["properties"]
            total += 1

            measured = geometry_length_m(feature["geometry"])
            if measured is None:
                no_geom += 1
                continue
            props["geomDistM"] = round(measured, 2)

            column = props.get("distM")
            if not column:
                # 컬럼값이 없으면 비교 자체가 불가능하다. 없는 판정을 만들지 않는다.
                no_column += 1
                props.pop("distMismatch", None)
                continue

            diff = abs(measured - column) / column
            if diff >= MISMATCH_RATIO:
                props["distMismatch"] = True
                mismatch += 1
                worst.append((diff, props.get("park", ""), props.get("name", ""), column, measured))
            else:
                props.pop("distMismatch", None)

        path.write_text(
            json.dumps(bundle, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )

    print(f"코스 {total:,}개: geomDistM 부여 {total - no_geom:,}개, 지오메트리 부족 {no_geom}개")
    print(f"컬럼값 없음 {no_column}개 / 25% 이상 불일치 {mismatch}개 ({mismatch / max(total, 1):.1%})")
    print("\n괴리가 큰 상위 10건 (공원 / 코스 / 컬럼값m / 실측m / 차이):")
    for diff, park, name, column, measured in sorted(worst, reverse=True)[:10]:
        print(f"  {park:8s} {name[:22]:24s} {column:10,.1f} {measured:10,.1f} {diff:6.0%}")


if __name__ == "__main__":
    main()
