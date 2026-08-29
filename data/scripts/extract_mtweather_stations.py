#!/usr/bin/env python3
"""산악기상정보 API(data.go.kr 15084696) 관측지점 좌표 테이블 추출기.

좌표는 API 응답에 없고 참고문서 docx 안의 표에만 있다. 이 스크립트는
docx(= zip)의 word/document.xml 을 표준 라이브러리만으로 파싱해
`lib/mtweather-stations.ts` 를 생성한다. python-docx 등 외부 의존성 없음.

사용법:
    set -a; . ~/.env; set +a          # $HORSE = data.go.kr Encoding 인증키
    python3 data/scripts/extract_mtweather_stations.py

주의: $HORSE 는 Encoding 키라 %2F 등이 이미 들어 있다. urlencode 를 다시
하면 SERVICE_KEY_IS_NOT_REGISTERED_ERROR 가 나므로 URL 에 그대로 붙인다.
"""

from __future__ import annotations

import io
import json
import ssl
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

DOCX_URL = (
    "https://www.data.go.kr/cmm/cmm/fileDownload.do"
    "?atchFileId=FILE_000000003110361&fileDetailSn=1"
)
API_URL = "https://apis.data.go.kr/1400377/mtweather/mountListSearch"

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

# 한국 영토 대략 범위 — 좌표계 검증용
LON_RANGE = (124.0, 132.0)
LAT_RANGE = (33.0, 39.0)

# macOS 시스템 파이썬은 루트 CA 번들이 없어 https 검증이 실패한다. certifi 가
# 있으면 그 번들을 쓰고, 없으면 기본 컨텍스트로 둔다.
def _ssl_context() -> ssl.SSLContext | None:
    try:
        import certifi
    except ImportError:
        return None
    return ssl.create_default_context(cafile=certifi.where())


SSL_CTX = _ssl_context()


def http_get(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=60, context=SSL_CTX) as resp:
        return resp.read()


ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "scripts" / ".cache-mtweather.docx"
OUT = ROOT / "lib" / "mtweather-stations.ts"


def fetch_docx() -> bytes:
    if CACHE.exists():
        return CACHE.read_bytes()
    data = http_get(DOCX_URL)
    if not data.startswith(b"PK"):
        raise SystemExit("참고문서 다운로드 실패: zip(docx) 이 아니다")
    CACHE.write_bytes(data)
    return data


def cell_text(tc: ET.Element) -> str:
    return "".join(t.text or "" for t in tc.iter(W + "t")).strip()


def find_station_table(docx_bytes: bytes) -> list[list[str]]:
    """헤더가 (지점번호, 위도, 경도) 를 포함하는 표를 찾아 행 리스트로 반환."""
    with zipfile.ZipFile(io.BytesIO(docx_bytes)) as z:
        root = ET.fromstring(z.read("word/document.xml"))
    for tbl in root.iter(W + "tbl"):
        rows = tbl.findall(W + "tr")
        if not rows:
            continue
        header = [cell_text(c) for c in rows[0].findall(W + "tc")]
        if "지점번호" in header and "위도" in header and "경도" in header:
            return [[cell_text(c) for c in r.findall(W + "tc")] for r in rows]
    raise SystemExit("docx 에서 관측지점 표를 찾지 못했다")


def parse_stations(rows: list[list[str]]) -> tuple[list[dict], list[list[str]]]:
    header = rows[0]
    idx = {name: header.index(name) for name in ("산이름", "지점번호", "위도", "경도", "고도")}
    stations: list[dict] = []
    skipped: list[list[str]] = []
    for row in rows[1:]:
        if len(row) < len(header):
            skipped.append(row)
            continue
        obsid_raw = row[idx["지점번호"]]
        if not re.fullmatch(r"\d+", obsid_raw):
            skipped.append(row)
            continue
        try:
            lat = float(row[idx["위도"]])
            lon = float(row[idx["경도"]])
        except ValueError:
            skipped.append(row)
            continue
        alt_raw = row[idx["고도"]]
        alt = float(alt_raw) if re.fullmatch(r"-?\d+(\.\d+)?", alt_raw) else None
        stations.append(
            {
                "obsid": int(obsid_raw),
                "name": row[idx["산이름"]],
                "lon": lon,
                "lat": lat,
                "alt": alt,
            }
        )
    return stations, skipped


def validate_bounds(stations: list[dict]) -> list[dict]:
    return [
        s
        for s in stations
        if not (LON_RANGE[0] <= s["lon"] <= LON_RANGE[1] and LAT_RANGE[0] <= s["lat"] <= LAT_RANGE[1])
    ]


def fetch_api_stations(key: str) -> dict[int, str]:
    """API 전체 페이지를 돌며 {obsid: obsname} 을 모은다."""
    found: dict[int, str] = {}
    page = 1
    while True:
        url = f"{API_URL}?serviceKey={key}&pageNo={page}&numOfRows=500&_type=json"
        payload = json.loads(http_get(url).decode("utf-8"))
        body = payload["response"]["body"]
        items = body.get("items", {}).get("item", [])
        if isinstance(items, dict):
            items = [items]
        for item in items:
            found[int(item["obsid"])] = str(item["obsname"])
        total = int(body["totalCount"])
        if len(found) >= total or not items:
            return found
        page += 1


def render_ts(stations: list[dict]) -> str:
    lines = [
        "// 산악기상정보 관측지점 좌표 테이블 — 자동 생성 파일. 직접 수정하지 마라.",
        "//",
        "// 출처: 산림청 국립산림과학원_산악기상정보 (data.go.kr 15084696) 참고문서",
        "//       `03_산악기상정보_기술문서_v1.5(수정본).docx` 의 관측지점 표",
        f"//       {DOCX_URL}",
        "//",
        "// 배경: mountListSearch API 응답에는 위경도가 없다. 지점 좌표는 위 기술문서에만",
        "//       존재하므로 정적 데이터로 관리한다.",
        "// 좌표계: 문서상 명시 없으나 값이 한국 영역의 십진도 경/위도이므로 WGS84 로 간주.",
        "//        소수점 2자리까지만 제공 — 약 1km 오차가 있으니 정밀 위치용으로 쓰지 마라.",
        "//",
        "// 재생성: python3 data/scripts/extract_mtweather_stations.py",
        "",
        "export interface MtWeatherStation {",
        "  obsid: number;",
        "  name: string;",
        "  lon: number;",
        "  lat: number;",
        "  alt: number | null;",
        "}",
        "",
        "export const MT_WEATHER_STATIONS: MtWeatherStation[] = [",
    ]
    for s in sorted(stations, key=lambda x: x["obsid"]):
        alt = "null" if s["alt"] is None else repr(s["alt"]).rstrip("0").rstrip(".")
        name = s["name"].replace("\\", "\\\\").replace("'", "\\'")
        lines.append(
            f"  {{ obsid: {s['obsid']}, name: '{name}', "
            f"lon: {s['lon']}, lat: {s['lat']}, alt: {alt} }},"
        )
    lines += [
        "];",
        "",
        "export const STATION_BY_OBSID = new Map<number, MtWeatherStation>(",
        "  MT_WEATHER_STATIONS.map((s) => [s.obsid, s]),",
        ");",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    rows = find_station_table(fetch_docx())
    stations, skipped = parse_stations(rows)
    print(f"docx 표 행 수: {len(rows) - 1}, 파싱 성공: {len(stations)}, 건너뜀: {len(skipped)}")

    dupes = len(stations) - len({s["obsid"] for s in stations})
    if dupes:
        print(f"경고: obsid 중복 {dupes}건")

    out_of_range = validate_bounds(stations)
    if out_of_range:
        print(f"경고: 한국 범위를 벗어난 좌표 {len(out_of_range)}건 -> {out_of_range[:5]}")
    else:
        print("좌표 범위 검증 통과 (경도 124~132, 위도 33~39)")

    key = os.environ.get("HORSE")
    if key:
        api = fetch_api_stations(key)
        doc_ids = {s["obsid"] for s in stations}
        matched = doc_ids & api.keys()
        print(f"API 지점 수: {len(api)}, docx 지점 수: {len(doc_ids)}, 매칭: {len(matched)}")
        print(f"API 에만 있음(좌표 없음): {sorted(api.keys() - doc_ids)}")
        print(f"docx 에만 있음(폐지 추정): {sorted(doc_ids - api.keys())}")
        name_mismatch = [
            (i, next(s["name"] for s in stations if s["obsid"] == i), api[i])
            for i in sorted(matched)
            if next(s["name"] for s in stations if s["obsid"] == i) != api[i]
        ]
        print(f"이름 불일치: {len(name_mismatch)}건 -> {name_mismatch[:10]}")
    else:
        print("HORSE 미설정 — API 교차검증 건너뜀")

    OUT.write_text(render_ts(stations), encoding="utf-8")
    print(f"생성: {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
