#!/usr/bin/env python3
"""
국립공원 탐방로를 공원별로 쪼개 public/ 에 배치한다.

주의: 그룹 키로 `공원코드` 를 쓰면 안 된다. 그 필드는 우리가 만든 파생값인데
`국립공원관리번호[:5]` 로 자른 것이고, CSV 단계에서 관리번호 앞자리 0이 이미
사라져 자릿수가 어긋나 있다. 정본은 `공원사무소코드`(4자리, 앞자리 0 보정 필요)다.
출처: 국립공원공단 「국립공원 정밀관리도 코드정의서 v2.5」 → lib/park-codes.ts
"""

from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SRC = ROOT / "data" / "processed" / "np_trails.geojson"
OUT_DIR = ROOT / "public" / "data" / "np-trails"
INDEX = ROOT / "public" / "data" / "np-parks.json"
PARK_CODES_TS = ROOT / "lib" / "park-codes.ts"


def load_park_names() -> dict[str, str]:
    """생성된 TS 에서 사무소코드 → 공원명 표를 읽는다. 단일 출처를 유지하기 위함이다."""
    text = PARK_CODES_TS.read_text(encoding="utf-8")
    block = re.search(r"PARK_NAME_BY_OFFICE[^=]*=\s*\{(.*?)\n\}", text, re.S)
    if not block:
        raise SystemExit("lib/park-codes.ts 에서 PARK_NAME_BY_OFFICE 를 찾지 못했습니다.")
    return dict(re.findall(r"'(\d+)'\s*:\s*'([^']+)'", block.group(1)))


def office_code(props: dict) -> str:
    return str(props.get("공원사무소코드") or "").zfill(4)


def main() -> None:
    names = load_park_names()
    features = json.loads(SRC.read_text(encoding="utf-8"))["features"]

    groups: dict[str, list] = defaultdict(list)
    unmapped: set[str] = set()

    for feature in features:
        props = feature["properties"]
        code = office_code(props)
        park = names.get(code)
        if park is None:
            unmapped.add(code)
            park = f"미상({code})"

        distance = float(props.get("지리정보시스템 상 거리(m)") or 0) or None
        feature["properties"] = {
            "id": props.get("국립공원관리번호"),
            "park": park,
            "officeCode": code,
            "name": props.get("탐방코스(한글)"),
            "section": props.get("상세구간"),
            "distM": distance,
            "upMin": float(props.get("가는시간(분)") or 0) or None,
            "downMin": float(props.get("오는시간(분)") or 0) or None,
            "difficulty": float(props.get("난이도") or 0) or None,
            "closed": props.get("탐방로 통제여부") == "1",
            "closedNote": props.get("통제구간 설명"),
        }
        groups[park].append(feature)

    if unmapped:
        print(f"경고: 매핑되지 않은 사무소코드 {sorted(unmapped)}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for stale in OUT_DIR.glob("*.json"):
        stale.unlink()

    index = []
    total = 0
    for park, feats in groups.items():
        path = OUT_DIR / f"{park}.json"
        path.write_text(
            json.dumps(
                {"type": "FeatureCollection", "features": feats},
                ensure_ascii=False,
                separators=(",", ":"),
            ),
            encoding="utf-8",
        )
        total += path.stat().st_size

        lons, lats = [], []
        for feature in feats:
            for lon, lat in feature["geometry"]["coordinates"][::20]:
                lons.append(lon)
                lats.append(lat)

        index.append(
            {
                "park": park,
                "courses": len(feats),
                "closed": sum(1 for f in feats if f["properties"]["closed"]),
                "lon": round(sum(lons) / len(lons), 5),
                "lat": round(sum(lats) / len(lats), 5),
            }
        )

    index.sort(key=lambda p: -p["courses"])
    INDEX.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print(f"{len(groups)}개 공원, 합계 {total / 1024 / 1024:.1f}MB")
    print("상위:", [(p["park"], p["courses"], p["closed"]) for p in index[:6]])
    print("통제 합계:", sum(p["closed"] for p in index))


if __name__ == "__main__":
    main()
