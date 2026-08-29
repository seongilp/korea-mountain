#!/usr/bin/env python3
"""국립공원 공원사무소코드 → 사무소명/공원명 매핑 추출.

출처: data/raw/15003467_np_trail_spatial.zip 내부
      `국립공원_정밀관리도_코드정의서_v2.5.hwp`
      → "1. 정밀관리도 코드 부여체계 > 1) 공원사무소 코드 (PO_CD)" 표
      (국립공원공단, 문서번호 NP_DBO_B_006, v2.5 / 2013-05-14)

HWP 5.0 = OLE2 복합문서. 외부 패키지 없이 순수 파이썬으로
OLE2 FAT/디렉토리를 파싱해 BodyText/Section0 스트림을 재조립하고,
FileHeader 압축 플래그에 따라 raw deflate 해제한 뒤
HWPTAG_PARA_TEXT(=67) 레코드에서 UTF-16LE 텍스트를 뽑는다.

산출물: lib/park-codes.ts

실행: python3 data/scripts/extract_park_codes.py
"""

from __future__ import annotations

import json
import re
import struct
import sys
import zipfile
import zlib
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ZIP_PATH = ROOT / "data" / "raw" / "15003467_np_trail_spatial.zip"
TRAILS_PATH = ROOT / "data" / "processed" / "np_trails.geojson"
OUT_PATH = ROOT / "lib" / "park-codes.ts"

HWPTAG_PARA_TEXT = 67
OLE_SIGNATURE = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
ENDOFCHAIN = 0xFFFFFFFA  # 이 값 이상은 모두 종료/특수 섹터 표식


# --------------------------------------------------------------------------
# OLE2 복합문서 파서 (읽기 전용, 새 객체만 만들고 입력은 변형하지 않는다)
# --------------------------------------------------------------------------


def parse_ole2(data: bytes) -> dict[str, bytes]:
    """OLE2 복합문서 바이트를 {스트림명: 바이트} 로 푼다."""
    if data[:8] != OLE_SIGNATURE:
        raise ValueError("OLE2 시그니처가 아니다 — HWP 5.0 파일이 맞는지 확인하라")

    sector_size = 1 << struct.unpack_from("<H", data, 30)[0]
    mini_sector_size = 1 << struct.unpack_from("<H", data, 32)[0]
    fat_count = struct.unpack_from("<I", data, 44)[0]
    dir_start = struct.unpack_from("<I", data, 48)[0]
    mini_cutoff = struct.unpack_from("<I", data, 56)[0]
    minifat_start = struct.unpack_from("<I", data, 60)[0]
    minifat_count = struct.unpack_from("<I", data, 64)[0]
    difat_start = struct.unpack_from("<I", data, 68)[0]
    difat_count = struct.unpack_from("<I", data, 72)[0]

    def sector(n: int) -> bytes:
        off = 512 + n * sector_size
        return data[off : off + sector_size]

    # DIFAT: 헤더에 109개, 나머지는 별도 섹터 체인
    difat = list(struct.unpack_from("<109I", data, 76))
    nxt = difat_start
    for _ in range(difat_count):
        if nxt >= ENDOFCHAIN:
            break
        vals = struct.unpack_from("<%dI" % (sector_size // 4), sector(nxt), 0)
        difat = difat + list(vals[:-1])
        nxt = vals[-1]
    difat = [x for x in difat[:fat_count] if x < ENDOFCHAIN]

    fat: list[int] = []
    for fat_sector in difat:
        fat = fat + list(struct.unpack_from("<%dI" % (sector_size // 4), sector(fat_sector), 0))

    def chain(start: int) -> list[int]:
        out: list[int] = []
        seen: set[int] = set()
        n = start
        while n < ENDOFCHAIN and n not in seen:
            seen.add(n)
            out.append(n)
            n = fat[n] if n < len(fat) else ENDOFCHAIN
        return out

    def read_chain(start: int, size: int | None = None) -> bytes:
        buf = b"".join(sector(n) for n in chain(start))
        return buf if size is None else buf[:size]

    # 디렉토리 엔트리(128바이트 고정)
    dir_bytes = read_chain(dir_start)
    entries: list[tuple[str, int, int, int]] = []
    for off in range(0, len(dir_bytes) - 127, 128):
        e = dir_bytes[off : off + 128]
        name_len = struct.unpack_from("<H", e, 64)[0]
        name = e[: max(0, name_len - 2)].decode("utf-16-le", "replace")
        entry_type = e[66]  # 1=storage, 2=stream, 5=root
        entries.append((name, entry_type, struct.unpack_from("<I", e, 116)[0], struct.unpack_from("<I", e, 120)[0]))

    if not entries:
        raise ValueError("OLE2 디렉토리가 비어 있다")

    # 미니 스트림은 루트 엔트리 체인에 담겨 있다
    _, _, root_start, root_size = entries[0]
    ministream = read_chain(root_start, root_size) if root_size else b""
    minifat: list[int] = []
    if minifat_count:
        mf = read_chain(minifat_start)
        minifat = list(struct.unpack_from("<%dI" % (len(mf) // 4), mf, 0))

    def read_mini(start: int, size: int) -> bytes:
        out = b""
        seen: set[int] = set()
        n = start
        while n < ENDOFCHAIN and n not in seen:
            seen.add(n)
            out += ministream[n * mini_sector_size : (n + 1) * mini_sector_size]
            n = minifat[n] if n < len(minifat) else ENDOFCHAIN
        return out[:size]

    streams: dict[str, bytes] = {}
    for name, entry_type, start, size in entries:
        if entry_type != 2:
            continue
        streams[name] = read_mini(start, size) if size < mini_cutoff else read_chain(start, size)
    return streams


# --------------------------------------------------------------------------
# HWP 본문 텍스트 추출
# --------------------------------------------------------------------------

# HWP 인라인/확장 제어문자는 코드 1개 + 12바이트 데이터 + 코드 1개 = 16바이트를 차지한다.
CONTROL_CHARS = frozenset({1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23})


def hwp_section_text(section: bytes) -> list[str]:
    """Section 스트림에서 문단 텍스트 목록을 뽑는다. 표는 셀 단위로 한 줄씩 나온다."""
    paragraphs: list[str] = []
    pos = 0
    while pos + 4 <= len(section):
        header = struct.unpack_from("<I", section, pos)[0]
        tag = header & 0x3FF
        size = (header >> 20) & 0xFFF
        pos += 4
        if size == 0xFFF:  # 확장 길이
            size = struct.unpack_from("<I", section, pos)[0]
            pos += 4
        body = section[pos : pos + size]
        pos += size
        if tag != HWPTAG_PARA_TEXT:
            continue
        chars: list[str] = []
        i = 0
        while i + 1 < len(body):
            code = struct.unpack_from("<H", body, i)[0]
            if code in CONTROL_CHARS:
                i += 16
            elif code < 32:
                chars.append(" ")
                i += 2
            else:
                chars.append(chr(code))
                i += 2
        paragraphs.append("".join(chars))
    return paragraphs


def extract_hwp_paragraphs(zip_path: Path) -> list[str]:
    if not zip_path.is_file():
        raise FileNotFoundError(f"원본 ZIP이 없다: {zip_path}")
    # ZIP 내부 파일명이 CP949 라 metadata_encoding 이 필요하다.
    with zipfile.ZipFile(zip_path, metadata_encoding="cp949") as zf:
        hwp_names = [n for n in zf.namelist() if n.lower().endswith(".hwp")]
        if not hwp_names:
            raise ValueError(f"ZIP 안에 HWP 코드정의서가 없다: {zip_path}")
        raw = zf.read(hwp_names[0])

    streams = parse_ole2(raw)
    header = streams.get("FileHeader")
    if header is None or len(header) < 40:
        raise ValueError("FileHeader 스트림을 읽지 못했다")
    compressed = bool(struct.unpack_from("<I", header, 36)[0] & 1)

    paragraphs: list[str] = []
    for name in sorted(n for n in streams if n.startswith("Section")):
        body = streams[name]
        if compressed:
            body = zlib.decompress(body, -15)  # raw deflate
        paragraphs = paragraphs + hwp_section_text(body)
    return paragraphs


# --------------------------------------------------------------------------
# 공원사무소 코드표 파싱
# --------------------------------------------------------------------------

OFFICE_CODE_RE = re.compile(r"^\d{4}$")


def parse_office_table(paragraphs: list[str]) -> dict[str, str]:
    """"1) 공원사무소 코드 (PO_CD)" 표에서 {4자리 사무소코드: 사무소명} 을 뽑는다.

    표는 (사무소코드, 사무소명) 3쌍이 한 행인 6열 구조지만, 셀이 읽기 순서대로
    선형화되므로 코드 뒤에 오는 셀이 곧 그 코드의 명칭이다.
    """
    cells = [p.strip() for p in paragraphs]
    try:
        start = next(i for i, c in enumerate(cells) if "공원사무소 코드" in c and "PO_CD" in c)
    except StopIteration:
        raise ValueError("HWP에서 공원사무소 코드표 제목을 찾지 못했다") from None
    try:
        end = next(i for i in range(start + 1, len(cells)) if "분류코드" in cells[i] and "CLASS_CD" in cells[i])
    except StopIteration:
        end = len(cells)

    offices: dict[str, str] = {}
    window = cells[start:end]
    for i, cell in enumerate(window):
        if not OFFICE_CODE_RE.match(cell) or i + 1 >= len(window):
            continue
        name = window[i + 1]
        # 명칭 셀은 한글 이름이어야 한다 (다음 코드 셀이 아님)
        if not name or OFFICE_CODE_RE.match(name):
            continue
        offices[cell] = name
    if len(offices) < 20:
        raise ValueError(f"사무소 코드가 너무 적게 파싱됐다 ({len(offices)}건) — 표 구조를 확인하라")
    return offices


def derive_park_names(offices: dict[str, str]) -> dict[str, str]:
    """사무소코드 → 공원명. 공원명은 대표사무소(XX01)의 명칭이다.

    코드정의서 예시가 `1001 / 주왕산 / 주왕산공원사무소` 로 대표사무소명을 곧 공원명으로
    쓰고 있고, 분소(XX02, XX03)의 명칭은 대표사무소명(을 줄인 형태) + 방위 접미사 구조다.
    예: 1201 다도해해상 / 1202 다도해서부. 공통 접두사를 실제로 검증해 추측을 막는다.
    """
    min_shared_prefix = 3  # '다도해' 처럼 축약형 분소명까지 허용하는 최소 공통 접두사

    park_names: dict[str, str] = {}
    for code, name in offices.items():
        head = offices.get(code[:2] + "01")
        if head is None:
            raise ValueError(f"{code}({name}) 의 대표사무소 {code[:2]}01 이 표에 없다")
        shared = 0
        while shared < min(len(name), len(head)) and name[shared] == head[shared]:
            shared += 1
        if shared < min(min_shared_prefix, len(head)):
            raise ValueError(
                f"{code}({name}) 과 대표사무소명 '{head}' 의 공통 접두사가 {shared}자뿐이다 — 수동 확인 필요"
            )
        park_names[code] = head
    return park_names


# --------------------------------------------------------------------------
# 검증 + 출력
# --------------------------------------------------------------------------


def load_trail_codes() -> tuple[set[str], dict[str, set[str]]]:
    """np_trails.geojson 에 실제로 등장하는 사무소코드와 공원코드→사무소코드 대응."""
    if not TRAILS_PATH.is_file():
        return set(), {}
    with TRAILS_PATH.open(encoding="utf-8") as fp:
        data = json.load(fp)
    office_codes: set[str] = set()
    by_park: dict[str, set[str]] = defaultdict(set)
    for feature in data["features"]:
        props = feature["properties"]
        office = str(props["공원사무소코드"]).zfill(4)
        office_codes.add(office)
        park = props.get("공원코드")
        if park:
            by_park[str(park)].add(office)
    return office_codes, dict(by_park)


def ts_record(entries: dict[str, str]) -> str:
    return "\n".join(f"  '{k}': '{v}'," for k, v in sorted(entries.items()))


def main() -> int:
    paragraphs = extract_hwp_paragraphs(ZIP_PATH)
    offices = parse_office_table(paragraphs)
    park_by_office = derive_park_names(offices)

    used_offices, park_to_offices = load_trail_codes()
    missing = sorted(c for c in used_offices if c not in offices)
    if missing:
        print(f"[경고] 코드정의서에 없는 사무소코드: {missing}", file=sys.stderr)

    # 공원코드는 우리 변환본의 파생 필드다. 코드정의서에는 없으므로
    # 사무소코드 매핑을 통해서만 이름을 붙인다. 한 공원코드가 여러 사무소를
    # 가리키더라도 공원명이 하나로 수렴할 때만 채운다.
    park_by_parkcode: dict[str, str] = {}
    ambiguous: list[str] = []
    for park_code, office_set in park_to_offices.items():
        names = {park_by_office[o] for o in office_set if o in park_by_office}
        if len(names) == 1:
            park_by_parkcode[park_code] = names.pop()
        else:
            ambiguous.append(park_code)
    if ambiguous:
        print(f"[경고] 공원명이 하나로 좁혀지지 않는 공원코드: {sorted(ambiguous)}", file=sys.stderr)

    ts = f"""// 국립공원 코드 → 이름 매핑
//
// 출처: 국립공원공단 「국립공원 정밀관리도 코드정의서 v2.5」
//       (문서번호 NP_DBO_B_006, 2013-05-14)
//       1. 정밀관리도 코드 부여체계 > 1) 공원사무소 코드 (PO_CD) 표
//
// 원본 파일: data/raw/15003467_np_trail_spatial.zip
//            └ 국립공원_정밀관리도_코드정의서_v2.5.hwp
// 데이터셋:  공공데이터포털 15003467 국립공원공단_국립공원 탐방로 공간데이터
//            https://www.data.go.kr/data/15003467/fileData.do
//
// 이 파일은 자동 생성된다. 직접 고치지 말고
// `python3 data/scripts/extract_park_codes.py` 를 다시 실행하라.

/**
 * 공원사무소코드(4자리, 코드정의서 PO_CD) → 사무소명.
 * 분소가 있는 공원은 방위 접미사가 붙는다 (예: '1502' → '북한산서부').
 * np_trails.geojson 의 `공원사무소코드` 는 앞자리 0이 빠져 있으니
 * 조회 전에 `String(code).padStart(4, '0')` 로 정규화하라.
 */
export const OFFICE_NAME_BY_CODE: Record<string, string> = {{
{ts_record(offices)}
}};

/**
 * 공원사무소코드(4자리) → 국립공원명.
 * 대표사무소(XX01)의 명칭이 곧 공원명이다 — 코드정의서의 식별코드 예시
 * (`1001` / `주왕산` / `주왕산공원사무소`)와, 분소명이 대표사무소명을
 * 접두사로 갖는다는 사실을 추출 시점에 검증한다.
 */
export const PARK_NAME_BY_OFFICE: Record<string, string> = {{
{ts_record(park_by_office)}
}};

/**
 * 공원코드 → 국립공원명.
 *
 * 주의: `공원코드` 는 코드정의서에 존재하지 않는다. np_trails.geojson 변환 과정에서
 * `국립공원관리번호`의 앞 5자리를 잘라 만든 파생 필드이고, 앞자리 0이 빠진 관리번호
 * 때문에 자릿수가 어긋나 있다 (예: '20105' 는 사무소 0201, '15000' 은 사무소 1501).
 * 아래 매핑은 geojson 안의 실제 공원코드↔사무소코드 대응을 통해 이름을 붙인 것이다.
 * 새 코드를 다룰 때는 `PARK_NAME_BY_OFFICE` 를 쓰는 편이 안전하다.
 */
export const PARK_NAME_BY_CODE: Record<string, string> = {{
{ts_record(park_by_parkcode)}
}};

/** 4자리로 정규화한 뒤 공원명을 찾는다. 모르는 코드면 undefined. */
export function parkNameByOffice(code: string | number): string | undefined {{
  return PARK_NAME_BY_OFFICE[String(code).padStart(4, '0')];
}}
"""
    OUT_PATH.write_text(ts, encoding="utf-8")

    print(f"사무소 {len(offices)}개, 공원 {len(set(park_by_office.values()))}곳 → {OUT_PATH}")
    print(f"geojson 사용 사무소코드 {len(used_offices)}개 중 매핑됨 {len(used_offices) - len(missing)}개")
    print(f"geojson 공원코드 {len(park_to_offices)}개 중 매핑됨 {len(park_by_parkcode)}개")
    return 1 if missing or ambiguous else 0


if __name__ == "__main__":
    sys.exit(main())
