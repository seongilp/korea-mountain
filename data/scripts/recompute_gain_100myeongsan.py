#!/usr/bin/env python3
"""
100대명산 코스의 `누적상승_m` 을 봉우리 데이터와 같은 3m 임계값 방식으로 다시 계산한다.

왜 필요한가:
  지도는 `누적상승_m` 으로 코스 난이도 색을 칠하는데, 두 데이터셋의 계산법이 달랐다.
  - gpx_to_geojson.py: 임계값 없이 인접 정점의 상승분을 전부 합산 → GPS 고도 노이즈가
    그대로 누적돼 과대평가된다. (설악산 기준 99.4 m/km)
  - build_peaks.py:    3m 미만 상승은 노이즈로 보고 버린다.        (설악산 기준 61.4 m/km)
  같은 산인데 탭을 바꾸면 난이도 색이 달라지고, 범례의 "~300m / ~700m" 절대값 기준이
  두 개가 된다. 봉우리 쪽(임계값 있음)이 물리적으로 더 타당하므로 그쪽으로 통일한다.

왜 원본 zip 에서 다시 계산하는가:
  public/data/courses/*.json 의 좌표는 이미 GPS 점프 분할(split_track_gaps.py)을 거쳤고
  일부는 MultiLineString 이다. 잘린 좌표로 누적상승을 재계산하면 조각 경계의 고도차가
  누락돼 또 다른 수치가 나온다. 원본 GPX 의 전체 고도 시퀀스가 유일한 정본이다.

무엇을 건드리는가:
  public/data/courses/*.json 의 `누적상승_m` 속성 하나뿐이다.
  geometry(coordinates)는 절대 손대지 않는다 — 단순화·점프분할이 이미 끝났다.

사용: python3 data/scripts/recompute_gain_100myeongsan.py [--dry-run]
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ZIP_PATH = ROOT / "data" / "raw" / "15098177_100myeongsan.zip"
COURSES_DIR = ROOT / "public" / "data" / "courses"

NS = {"g": "http://www.topografix.com/GPX/1/1"}

# build_peaks.py 와 같은 값을 쓴다. 이 상수가 두 데이터셋의 유일한 공통 기준이다.
GAIN_THRESHOLD_M = 3.0


def cumulative_gain(elevations: list[float]) -> float:
    """3m 이상 오른 구간만 누적. build_peaks.py:98 과 동일한 구현이어야 한다."""
    gain, base = 0.0, elevations[0]
    for z in elevations[1:]:
        if z - base >= GAIN_THRESHOLD_M:
            gain += z - base
            base = z
        elif z < base:
            base = z
    return gain


def elevations_of(raw: bytes) -> list[float]:
    """GPX 전체 trkpt 의 고도 시퀀스. 세그먼트 구분 없이 이어 붙인다.

    gpx_to_geojson.py / build_peaks.py 둘 다 `.//trkpt` 로 전 세그먼트를 이어 붙였고,
    기존 `누적상승_m` 도 그 기준으로 계산됐다. 비교 가능성을 위해 같은 방식을 유지한다.
    """
    root = ET.fromstring(raw)
    values: list[float] = []
    for pt in root.iterfind(".//g:trkpt", NS):
        ele = pt.find("g:ele", NS)
        if ele is None or not ele.text:
            continue
        try:
            values.append(round(float(ele.text), 1))
        except ValueError:
            continue
    # ele 가 통째로 0인 GPX 가 있다. 0m 를 실제 값으로 믿으면 안 된다. (build_peaks.py:154)
    if not any(values):
        return []
    return values


def read_raw_gains() -> dict[tuple[str, str], int]:
    """원본 zip → {(산이름, 코스ID): 누적상승_m}"""
    gains: dict[tuple[str, str], int] = {}
    with zipfile.ZipFile(ZIP_PATH, metadata_encoding="cp949") as zf:
        for entry in sorted(zf.namelist()):
            if not entry.lower().endswith(".gpx"):
                continue
            parts = entry.split("/")
            if len(parts) < 2:
                continue
            # 폴더명이 "12_설악산" 형태라 앞의 일련번호를 뗀다. (gpx_to_geojson.py 와 동일)
            group = re.sub(r"^\d+_", "", unicodedata.normalize("NFC", parts[-2]))
            course_id = Path(unicodedata.normalize("NFC", parts[-1])).stem

            elevations = elevations_of(zf.read(entry))
            if len(elevations) < 2:
                continue
            gains[(group, course_id)] = round(cumulative_gain(elevations))
    return gains


def main() -> None:
    dry_run = "--dry-run" in sys.argv[1:]
    gains = read_raw_gains()
    print(f"원본 GPX 에서 누적상승 재계산: {len(gains)}개 코스")

    updated = missing = unchanged = 0
    before_sum = after_sum = 0

    for path in sorted(COURSES_DIR.glob("*.json")):
        bundle = json.loads(path.read_text(encoding="utf-8"))
        changed = False
        for feature in bundle["courses"]["features"]:
            props = feature["properties"]
            key = (props.get("그룹"), props.get("코스ID"))
            new = gains.get(key)
            if new is None:
                # 원본에 없는 코스는 값을 지우지 않고 그대로 둔다. 데이터를 잃지 않는 편이 낫다.
                missing += 1
                continue
            old = props.get("누적상승_m")
            if old is not None:
                before_sum += old
            after_sum += new
            if old == new:
                unchanged += 1
                continue
            props["누적상승_m"] = new
            updated += 1
            changed = True

        if changed and not dry_run:
            path.write_text(
                json.dumps(bundle, ensure_ascii=False, separators=(",", ":")),
                encoding="utf-8",
            )

    print(f"갱신 {updated}개 / 변화없음 {unchanged}개 / 원본 미발견 {missing}개")
    if before_sum:
        print(f"누적상승 합계 {before_sum:,}m → {after_sum:,}m ({after_sum / before_sum:.1%})")
    if dry_run:
        print("(--dry-run: 파일을 쓰지 않았다)")


if __name__ == "__main__":
    main()
