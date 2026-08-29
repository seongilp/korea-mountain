#!/usr/bin/env python3
"""
산림청_산정보 서비스(data.go.kr 15058662)에서 산의 **실제 높이**를 받아 lib/mountain-heights.ts 로 만든다.

왜 필요한가:
  우리 데이터의 `peakM` 은 "기록된 GPX 코스가 도달한 최고 고도" 지 산의 높이가 아니다.
  둘레길 성격의 코스만 있는 산은 실제보다 훨씬 낮게 나오고(지리산 834m),
  GPS 고도 오차가 큰 코스는 실제보다 높게 나온다(제석봉 1,936.7m).
  이 API 가 유일한 공식 높이 출처다.

함정 세 가지:
  1. 인증키는 **Encoding 키**라 `%2F` 같은 퍼센트 인코딩이 이미 들어 있다.
     urlencode 로 한 번 더 감싸면 SERVICE_KEY_IS_NOT_REGISTERED_ERROR 가 난다.
     그래서 쿼리스트링을 직접 문자열로 조립한다.
  2. 응답은 XML 이 기본이다(`_type=json` 도 동작하지만, JSON 은 mntilistno 를 숫자로 주기 때문에
     앞자리 0이 날아갈 위험이 있다. 식별자는 문자열로 다루는 편이 안전해 XML 을 쓴다).
  3. **산 이름은 유일하지 않다.** 같은 이름의 산이 전국에 여러 개 있다.
     그래서 조회 헬퍼는 배열을 돌려주고, 임의로 하나를 고르지 않는다.

좌표는 이 API 에 없다. 없는 값을 만들어 내지 않는다.

추가로 확인한 함정 두 가지:
  4. **4,705건 중 1,319건은 mntihigh 가 0.0 이다** (높이 미상). 0m 를 실제 높이로 믿으면
     "가장 낮은 산" 정렬이 통째로 망가진다. 그래서 높이 0 이하 행은 MOUNTAIN_HEIGHTS 에서 뺀다.
     (남는 실측 높이는 3,358건 — api-spec 의 "3,368개 산" 서술과 거의 일치한다.)
  5. 큰 산은 이름이 `설악산_대청봉` 처럼 **`산_최고봉` 형태**로 들어 있다(29건).
     "설악산" 으로 그냥 찾으면 없다고 나온다. 그래서 `_` 앞부분으로도 색인한다.

사용: set -a; . ~/.env; set +a; python3 data/scripts/fetch_mountain_heights.py
"""

from __future__ import annotations

import json
import os
import ssl
import sys
import time
import unicodedata
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "processed" / "mountain_heights.json"
OUT_TS = ROOT / "lib" / "mountain-heights.ts"

ENDPOINT = "https://apis.data.go.kr/1400000/service/cultureInfoService2/mntInfoOpenAPI2"
PAGE_SIZE = 500          # 1000 은 간헐적으로 타임아웃이 났다. 500 이 안정적이다.
MAX_PAGES = 40
RETRIES = 3

# 이 머신의 python.org 빌드는 CA 번들이 비어 있어(cert_store_stats x509=0)
# 그대로 두면 CERTIFICATE_VERIFY_FAILED 가 난다. 검증을 끄지 않고 번들 경로를 찾아 준다.
CA_CANDIDATES = ("/etc/ssl/cert.pem", "/usr/local/etc/openssl@3/cert.pem")


def ssl_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    if ctx.cert_store_stats()["x509"] == 0:
        for path in CA_CANDIDATES:
            if Path(path).is_file():
                return ssl.create_default_context(cafile=path)
        raise SystemExit("신뢰할 CA 번들을 찾지 못했다. 검증을 끄는 대신 CA 경로를 지정하라.")
    return ctx


SSL_CTX = ssl_context()


def fetch_page(key: str, page: int) -> tuple[list[dict], int]:
    # 인증키를 재인코딩하지 않기 위해 f-string 으로 직접 붙인다. (함정 1)
    url = f"{ENDPOINT}?serviceKey={key}&numOfRows={PAGE_SIZE}&pageNo={page}"
    last: Exception | None = None
    for attempt in range(RETRIES):
        try:
            with urllib.request.urlopen(url, timeout=60, context=SSL_CTX) as res:
                raw = res.read()
            break
        except (urllib.error.URLError, TimeoutError) as exc:  # noqa: PERF203
            last = exc
            time.sleep(2 * (attempt + 1))
    else:
        raise SystemExit(f"{page}쪽 요청 실패: {last}")

    root = ET.fromstring(raw)
    code = root.findtext(".//resultCode")
    if code not in (None, "00"):
        raise SystemExit(f"API 오류 {code}: {root.findtext('.//resultMsg')}")

    total = int(root.findtext(".//totalCount") or 0)
    rows = []
    for item in root.iterfind(".//item"):
        def get(tag: str) -> str:
            return unicodedata.normalize("NFC", (item.findtext(tag) or "").strip())

        try:
            height = float(get("mntihigh"))
        except ValueError:
            # 높이가 비어 있는 행은 이 파일의 존재 이유를 못 채운다. 버린다.
            continue
        rows.append({
            "name": get("mntiname"),
            "address": get("mntiadd"),
            "heightM": round(height, 1),
            "listNo": get("mntilistno"),
        })
    return rows, total


def fetch_all(key: str) -> list[dict]:
    rows: list[dict] = []
    total = None
    for page in range(1, MAX_PAGES + 1):
        chunk, reported = fetch_page(key, page)
        if total is None:
            total = reported
            print(f"totalCount={total}")
        rows.extend(chunk)
        print(f"  {page}쪽: +{len(chunk)} (누적 {len(rows)})")
        if not chunk or len(rows) >= (total or 0):
            break
    return rows


def dedupe(rows: list[dict]) -> list[dict]:
    """listNo 가 식별자다. 실제로 28건이 완전히 동일한 내용으로 두 번 온다(내용이 다른 충돌은 없음)."""
    seen: dict[str, dict] = {}
    for row in rows:
        seen.setdefault(row["listNo"] or f"{row['name']}|{row['address']}", row)
    return sorted(seen.values(), key=lambda r: (r["name"], r["address"]))


def with_height(rows: list[dict]) -> list[dict]:
    """높이 0 이하 행 제외. 0m 는 결측을 뜻하는데 실제 값처럼 보여 정렬·비교를 망친다."""
    return [r for r in rows if r["heightM"] > 0]


def render_ts(rows: list[dict]) -> str:
    body = ",\n".join(
        "  { name: %s, address: %s, heightM: %s, listNo: %s }"
        % (json.dumps(r["name"], ensure_ascii=False),
           json.dumps(r["address"], ensure_ascii=False),
           r["heightM"],
           json.dumps(r["listNo"], ensure_ascii=False))
        for r in rows
    )
    return f"""// 산림청_산정보 서비스(data.go.kr 15058662)에서 받은 산 높이 표.
// 생성: data/scripts/fetch_mountain_heights.py — 손으로 고치지 말 것.
//
// 이 표가 존재하는 이유: mountains.json / peaks.json 의 `peakM` 은 GPX 코스가 도달한
// 최고 고도지 산의 실제 높이가 아니다(둘레길만 기록된 산은 낮게, GPS 오차가 큰 코스는 높게 나온다).
//
// 주의 1: 이 API 에는 **좌표가 없다**. 주소 문자열이 유일한 위치 단서다.
// 주의 2: **산 이름은 유일하지 않다.** 같은 이름의 산이 여러 곳에 있으므로
//         이름만으로 하나를 고르면 안 된다. heightsByName() 은 배열을 돌려준다.
// 주의 3: 원본 4,705건 중 1,319건은 높이가 0.0(결측)이라 여기서 제외했다. 남은 건수는 아래 상수 참고.
// 주의 4: 큰 산은 `설악산_대청봉` 처럼 `산_최고봉` 형태로 들어 있다. 그래서 `_` 앞부분으로도 색인한다.

export interface MountainHeight {{
  name: string;
  address: string;
  heightM: number;
  listNo: string;
}}

export const MOUNTAIN_HEIGHTS: MountainHeight[] = [
{body},
];

const BY_NAME = new Map<string, MountainHeight[]>();
const BY_BASE = new Map<string, MountainHeight[]>();

function push(index: Map<string, MountainHeight[]>, key: string, value: MountainHeight): void {{
  const bucket = index.get(key);
  if (bucket) bucket.push(value);
  else index.set(key, [value]);
}}

for (const m of MOUNTAIN_HEIGHTS) {{
  push(BY_NAME, m.name, m);
  // `설악산_대청봉` 은 `설악산` 으로도 찾을 수 있어야 한다.
  const base = m.name.split('_')[0];
  if (base !== m.name) push(BY_BASE, base, m);
}}

/**
 * 이름으로 후보를 모두 돌려준다. 정확히 일치하는 이름이 없으면 `산_최고봉` 표기의 앞부분으로 한 번 더 찾는다.
 * 동명이산이 흔하므로 호출부가 주소로 좁혀야 한다.
 * 결과가 2건 이상이면 "높이를 특정할 수 없다"는 뜻이지, 첫 번째가 정답이라는 뜻이 아니다.
 */
export function heightsByName(name: string): MountainHeight[] {{
  const key = name.normalize('NFC').trim();
  return BY_NAME.get(key) ?? BY_BASE.get(key) ?? [];
}}

/** 이름 + 주소 일부(시·도, 시·군 등)로 좁힌다. 그래도 여러 건이면 그대로 돌려준다. */
export function heightsByNameNear(name: string, addressHint: string): MountainHeight[] {{
  const all = heightsByName(name);
  const hint = addressHint.normalize('NFC').trim();
  if (!hint) return all;
  const narrowed = all.filter((m) => m.address.includes(hint));
  return narrowed.length > 0 ? narrowed : all;
}}

/** 후보가 정확히 1건일 때만 높이를 준다. 애매하면 null — 임의로 고르지 않는다. */
export function uniqueHeightM(name: string): number | null {{
  const found = heightsByName(name);
  return found.length === 1 ? found[0].heightM : null;
}}

/** 실측 높이가 들어 있는 산의 수. 원본 4,705건에서 중복 28건과 높이 결측 1,319건을 뺀 값이다. */
export const MOUNTAIN_HEIGHT_COUNT = {len(rows)};
"""


def main() -> None:
    key = os.environ.get("HORSE", "").strip()
    if "--cached" in sys.argv[1:] and CACHE.is_file():
        rows = with_height(json.loads(CACHE.read_text(encoding="utf-8")))
        print(f"캐시 사용: {len(rows)}건 (높이 결측 제외 후)")
    else:
        if not key:
            sys.exit("환경변수 HORSE(인증키)가 필요하다: set -a; . ~/.env; set +a")
        # 캐시에는 높이 결측 행까지 원본 그대로 남긴다. 걸러낸 결과만 저장하면
        # 나중에 "몇 건이 결측이었나" 를 다시 셀 수 없다.
        raw = dedupe(fetch_all(key))
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        CACHE.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
        print(f"수집 {len(raw)}건 중 높이 결측 {len(raw) - len(with_height(raw))}건 제외")
        rows = with_height(raw)

    OUT_TS.write_text(render_ts(rows), encoding="utf-8")
    names = {r["name"] for r in rows}
    dup = len(rows) - len(names)
    print(f"{OUT_TS.relative_to(ROOT)}: {len(rows)}건 / 고유 이름 {len(names)}개 / 동명 중복 {dup}건")
    print(f"크기 {OUT_TS.stat().st_size / 1024:.0f}KB")


if __name__ == "__main__":
    main()
