#!/usr/bin/env python3
"""
lib/mountain-heights.ts 의 산 높이 표가 우리 데이터와 이름으로 얼마나 맞물리는지 측정한다.

측정만 한다 — 어떤 파일도 고치지 않는다. 매칭률을 알아야 이 표를 UI 에 붙일지 판단할 수 있다.

이름 매칭은 세 단계로 나눠 센다. 어느 단계까지 자동화할 수 있는지가 다르기 때문이다.
  - 유일 매칭  : 후보 1건. 그대로 쓸 수 있다.
  - 다중 매칭  : 동명이산. 주소 없이는 못 고른다. UI 에 쓰려면 좌표/주소 대조가 필요하다.
  - 미매칭     : 표에 없다. 봉우리 이름(예: "○○봉")은 산 목록에 없는 경우가 많다.

사용: python3 data/scripts/report_height_match.py
"""

from __future__ import annotations

import collections
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "processed" / "mountain_heights.json"


def norm(name: str) -> str:
    return unicodedata.normalize("NFC", (name or "").strip())


def base_name(name: str) -> str:
    """"설악산(대청봉)" 처럼 괄호로 봉우리를 덧붙인 이름에서 산 이름만 뽑는다."""
    return norm(re.sub(r"\s*\(.*?\)\s*", "", name))


def index_keys(name: str) -> list[str]:
    """색인 키. API 는 큰 산을 `설악산_대청봉` 으로 넣어 두므로 `_` 앞부분도 키로 쓴다."""
    n = norm(name)
    base = n.split("_")[0]
    return [n] if base == n else [n, base]


def report(label: str, names: list[str], index: dict[str, list]) -> None:
    unique = multi = missing = 0
    by_base = 0
    missing_samples: list[str] = []
    for raw in names:
        found = index.get(norm(raw))
        if found is None:
            alt = index.get(base_name(raw))
            if alt is not None:
                by_base += 1
                found = alt
        if found is None:
            missing += 1
            if len(missing_samples) < 8:
                missing_samples.append(raw)
        elif len(found) == 1:
            unique += 1
        else:
            multi += 1

    total = len(names)
    matched = unique + multi
    print(f"\n[{label}] {total:,}건")
    print(f"  매칭      {matched:,} ({matched / total:.1%})  ← 이 중 괄호 제거로 붙은 건 {by_base}건")
    print(f"    유일    {unique:,} ({unique / total:.1%})")
    print(f"    다중    {multi:,} ({multi / total:.1%})  동명이산이라 주소 없이는 못 고른다")
    print(f"  미매칭    {missing:,} ({missing / total:.1%})  예: {', '.join(missing_samples)}")


def main() -> None:
    rows = json.loads(CACHE.read_text(encoding="utf-8"))
    index: dict[str, list] = collections.defaultdict(list)
    rows = [r for r in rows if r["heightM"] > 0]   # 높이 0 은 결측이라 매칭돼도 쓸모가 없다
    for row in rows:
        for key in index_keys(row["name"]):
            index[key].append(row)
    print(f"높이 표: {len(rows):,}건 / 고유 이름 {len(index):,}개")

    mountains = json.loads((ROOT / "public" / "data" / "mountains.json").read_text(encoding="utf-8"))
    peaks = json.loads((ROOT / "public" / "data" / "peaks.json").read_text(encoding="utf-8"))

    report("100대명산 (mountains.json)", [m["name"] for m in mountains], index)
    report("전국주요봉우리 (peaks.json)", [p["name"] for p in peaks], index)


if __name__ == "__main__":
    main()
