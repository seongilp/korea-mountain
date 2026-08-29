#!/usr/bin/env python3
"""
앱 목록 화면이 쓰는 `public/data/mountains.json` 을 만든다.

배경: 이 파일은 원래 셸에서 한 번 손으로 변환하고 끝냈던 탓에 생성 스크립트가 없었다.
그래서 100대명산 데이터를 갱신해도 앱이 보는 목록은 따라오지 않는 상태였다.
읽는 쪽(build_peaks.py 의 hasMyeongsan 판정, app/page.tsx 의 직접 import)은 4곳인데
쓰는 쪽이 없었던 셈이다.

입력: data/processed/myeongsan100_index.json (한글 키)
      public/data/courses/*.json           (누적상승 재계산 등 후처리가 반영된 정본)
출력: public/data/mountains.json           (영문 키, 앱 스키마)

코스 통계는 processed 인덱스가 아니라 public/data/courses 에서 다시 집계한다.
후처리 스크립트들이 public 쪽만 제자리 갱신하기 때문에, processed 를 그대로 쓰면
갱신 전 값이 되살아난다.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
INDEX_SRC = ROOT / "data" / "processed" / "myeongsan100_index.json"
COURSE_DIR = ROOT / "public" / "data" / "courses"
OUT = ROOT / "public" / "data" / "mountains.json"


def main() -> None:
    source = json.loads(INDEX_SRC.read_text(encoding="utf-8"))

    rows = []
    for entry in source:
        name = entry["산이름"]
        bundle_path = COURSE_DIR / f"{name}.json"
        if not bundle_path.exists():
            print(f"  건너뜀(코스 번들 없음): {name}")
            continue

        features = json.loads(bundle_path.read_text(encoding="utf-8"))["courses"]["features"]
        distances = [f["properties"].get("거리_km") or 0 for f in features]
        peaks = [f["properties"].get("최고고도_m") for f in features]
        peaks = [p for p in peaks if p is not None]

        lon, lat = entry["대표좌표"]
        rows.append(
            {
                "name": name,
                "courses": len(features),
                "totalKm": round(sum(distances), 1),
                "longestKm": round(max(distances), 1) if distances else 0.0,
                # 고도가 전혀 없으면 0 이 아니라 null 이어야 정렬이 망가지지 않는다.
                "peakM": round(max(peaks), 1) if peaks else None,
                "lon": round(lon, 6),
                "lat": round(lat, 6),
            }
        )

    # 앱 목록이 고도 내림차순을 기대한다. 고도 미상은 뒤로 보낸다.
    rows.sort(key=lambda m: (m["peakM"] is None, -(m["peakM"] or 0)))

    OUT.write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"작성: {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024}KB, {len(rows)}개)")
    print("상위 3:", [(m["name"], m["peakM"]) for m in rows[:3]])


if __name__ == "__main__":
    main()
