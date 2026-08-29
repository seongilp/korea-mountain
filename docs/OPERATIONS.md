# 운영 가이드

배포·데이터 갱신·환경변수·할당량을 다룬다. API 필드 수준의 스펙은 [`api-spec.md`](./api-spec.md),
원본 데이터셋 조사 결과는 [`../data/README.md`](../data/README.md) 를 봐라.

---

## 1. 데이터 파이프라인

### 1.1 전체 그림

원본은 셋으로 갈라진다. 서로 독립이라 필요한 갈래만 돌리면 된다.

```
data/raw/*.zip ─┬─ 국립공원 탐방로 ──→ data/processed/np_trails.geojson ──→ public/data/np-trails/
                └─ 100대명산 GPX ───→ data/processed/myeongsan100*.geojson ─→ public/data/courses/

(별도 zip, 저장소에 없음) 전국 주요 봉우리 ────────────────────────────────→ public/data/peak-courses/
```

`public/` 아래 산출물만이 배포되는 실체다. `data/processed/` 는 중간 산출물이고,
`data/raw/` 는 재다운로드 가능하므로 저장소에서 제외한다(§4).

### 1.2 갈래 A — 국립공원 탐방로 (data.go.kr 15003467)

| 순서 | 명령 | 입력 | 출력 |
|---|---|---|---|
| A-1 | `npm run data:np-geojson` | `data/raw/15003467_np_trail_spatial.zip` (EUC-KR CSV, 910,110행) | `data/processed/np_trails.geojson` (1,890 LineString) |
| A-2 | `npm run data:park-codes` | 위 zip 안의 HWP 코드정의서 + A-1 결과 | `lib/park-codes.ts` |
| A-3 | `npm run data:split-np` | A-1 결과 + `lib/park-codes.ts` | `public/data/np-trails/{공원명}.json` (21개), `public/data/np-parks.json` |
| A-4 | `npm run data:np-geom-dist` | `public/data/np-trails/` | 같은 파일 제자리 갱신 (`geomDistM`, `distMismatch` 속성 추가) |

**순서 의존성**

- **A-2 는 A-1 뒤에 와야 한다.** `extract_park_codes.py` 는 코드정의서에서 뽑은 사무소 코드 중
  실제로 `np_trails.geojson` 에 등장하는 것만 남기고, 공원코드→사무소코드 대응도 그 파일에서 만든다.
  A-1 없이 돌리면 대응표가 비거나 어긋난다.
- **A-3 는 A-2 가 만든 `lib/park-codes.ts` 를 파싱해서** 사무소코드→공원명 표를 읽는다.
  파일이 없거나 `PARK_NAME_BY_OFFICE` 블록을 못 찾으면 그 자리에서 `SystemExit` 로 죽는다.
- A-3 는 그룹 키로 **`공원사무소코드`(4자리, 앞자리 0 보정)** 를 쓴다. `공원코드` 는 변환 과정에서
  만든 파생값이고 CSV 단계에서 앞자리 0이 이미 날아가 자릿수가 어긋나 있다 — 쓰면 안 된다.
- **A-4 는 A-3 이 만든 `public/data/np-trails/` 를 제자리에서 고친다.** A-3 를 다시 돌리면
  디렉터리를 새로 쓰므로 A-4 도 반드시 다시 돌려야 한다. 원본 컬럼값(`distM`)은 덮어쓰지 않고
  지오메트리 실측값을 나란히 붙이는 방식이라 여러 번 돌려도 결과가 같다.

### 1.3 갈래 B — 100대명산 / 국가숲길 GPX (15098177, 15108080)

| 순서 | 명령 | 입력 | 출력 |
|---|---|---|---|
| B-1 | `npm run data:gpx-geojson` | `data/raw/15098177_100myeongsan.zip`, `data/raw/15108080_forestroad_gpx.zip` | `data/processed/myeongsan100.geojson`, `myeongsan100_waypoints.geojson`, `national_forest_trails.geojson` |
| B-2 | `npm run data:mountain-index` | B-1 의 `myeongsan100.geojson` | `data/processed/myeongsan100_index.json` |
| B-3 | `npm run data:split-mountains` | B-1 의 코스 + 웨이포인트 | `public/data/courses/{산이름}.json` (100개) |
| B-4 | `npm run data:finalize` | `public/data/courses/`, `public/data/peak-courses/` | 같은 파일을 제자리 갱신 |
| B-5 | `npm run data:recompute-gain` | `data/raw/15098177_100myeongsan.zip` + `public/data/courses/` | 같은 파일의 `누적상승_m` 만 갱신 |

**순서 의존성**

- B-2·B-3 는 둘 다 B-1 결과를 읽는다. 서로는 독립이라 순서를 바꿔도 된다.
- B-3 는 실행 전에 `public/data/courses/*.json` 을 전부 지우고 다시 쓴다.
  중간에 죽으면 디렉터리가 비어 있는 상태로 남으니 재실행할 것.
- **B-4 는 반드시 B-3 뒤에.** 자세한 내용은 §1.5.
- **B-5 는 B-3(과 B-4) 뒤에.** `public/data/courses/*.json` 을 제자리에서 고치므로
  B-3 를 다시 돌리면 값이 날아간다. `--dry-run` 으로 먼저 확인할 수 있다.
  geometry 는 건드리지 않고 `누적상승_m` 속성 하나만 바꾸므로 B-4 와 순서를 바꿔도 되지만,
  B-3 → B-4 → B-5 로 고정해 두는 편이 헷갈리지 않는다.
- B-5 는 **`data/raw/` 의 원본 zip 이 필요하다**(§4). 잘린 좌표로 재계산하면 조각 경계의
  고도차가 누락되기 때문에 원본 GPX 의 전체 고도 시퀀스를 정본으로 쓴다.

**B-5 가 왜 필요한가**: `gpx_to_geojson.py` 는 임계값 없이 상승분을 전부 더해서 GPS 고도
노이즈가 그대로 누적되고(설악산 99.4 m/km), `build_peaks.py` 는 3m 미만을 버린다(61.4 m/km).
같은 산인데 탭을 바꾸면 난이도 색이 달라졌다. 물리적으로 타당한 봉우리 쪽 방식으로 통일한 것이다.

### 1.4 갈래 C — 전국 주요 봉우리 (15108086)

원본 zip 은 저장소에 없다. data.go.kr 에서 「한국등산트레킹지원센터_전국 주요 봉우리 코스_20221116」 을 받아라.

```bash
npm run data:peaks -- ~/Downloads/15108086_peaks.zip
npm run data:finalize
```

| 순서 | 명령 | 출력 |
|---|---|---|
| C-1 | `npm run data:peaks -- <zip 경로> [--simplify <미터>]` | `public/data/peaks.json` (805KB), `public/data/peak-courses/*.json` (4,492개) |
| C-2 | `npm run data:finalize` | 같은 파일을 제자리 갱신 |

- zip 내부 파일명이 **CP949** 라 `metadata_encoding="cp949"` 로 읽는다. 스크립트가 알아서 한다.
- 봉우리명은 유일하지 않다(국사봉 54개, 옥녀봉 46개). 실체는 10자리 코드이고,
  이름이 겹치면 파일명이 `{이름}_{코드}.json` 이 된다. **클라이언트는 항상 인덱스의 `file` 필드를 써야 한다.**
- C-1 도 실행 전에 `public/data/peak-courses/*.json` 을 전부 지운다.
- C-1 은 `public/data/mountains.json` 을 읽기만 하고 건드리지 않는다(100대명산 이름 겹침에 `hasMyeongsan` 플래그를 달기 위해).
  따라서 **갈래 B 가 먼저 돌아 있어야** 이 플래그가 제대로 붙는다.

### 1.5 ⚠️ 가장 중요한 순서: GPS 점프 분할 → 단순화

`npm run data:finalize` 는 이 순서를 강제하려고 묶어 둔 것이다. 개별로 돌린다면 반드시:

```bash
npm run data:split-gaps    # 1) split_track_gaps.py — 200m 넘는 정점 간격에서 끊어 MultiLineString 화
npm run data:simplify      # 2) simplify_peaks.py — Douglas-Peucker 6m 허용오차
```

**거꾸로 하면 안 된다.** 단순화를 먼저 하면 직선 구간의 중간 정점이 사라져 남은 두 점 사이 간격이
200m 임계값을 넘고, 실제로는 멀쩡한 경로가 GPS 끊김으로 오판된다.
**실측: 순서를 바꿨더니 끊김 판정이 26% → 60% 로 부풀었다.**

두 스크립트 모두 **멱등이 아니라는 점**도 기억해라. `data:simplify` 를 두 번 돌리면 정점이 또 줄어든다.
원본에서 다시 만들 때는 C-1(또는 B-3)부터 다시 돌려야 한다.

두 스크립트 다 임계값을 인자로 받는다: `npm run data:split-gaps -- 300`, `npm run data:simplify -- 8`.

### 1.6 부수 산출물

| 명령 | 하는 일 | 비고 |
|---|---|---|
| `npm run data:stations` | 산악기상 관측지점 좌표표를 참고문서 docx 에서 뽑아 `lib/mtweather-stations.ts` 생성 | 좌표가 API 응답에 없어서 필요하다. 실행에 `DATA_GO_KR_KEY` 필요 |
| `npm run data:heights` | 산림청 산정보 API(15058662)에서 산의 **실제 높이**를 받아 `lib/mountain-heights.ts` + `data/processed/mountain_heights.json` 생성 | `DATA_GO_KR_KEY` 필요. §6.2 참고 |
| `npm run data:height-report` | 위 높이표가 `mountains.json` / `peaks.json` 의 이름과 얼마나 맞물리는지 측정 | 읽기 전용 리포트. 아무 파일도 고치지 않는다. `data:heights` 뒤에 |
| `npm run data:verify-grid` | `lib/kma-grid.ts` 의 기상청 격자 변환을 왕복 검증 | 생성이 아니라 검증. 실패 개수를 종료코드로 낸다 |

`data:heights` 가 만드는 높이표는 **`peakM` 과 다른 값**이다. `peakM` 은 "기록된 GPX 코스가
도달한 최고 고도"라 둘레길만 있는 산은 실제보다 훨씬 낮게(지리산 834m), GPS 오차가 큰 코스는
높게 나온다. 산정보 API 가 유일한 공식 높이 출처다.

### 1.7 알려진 빈틈: `public/data/mountains.json`

앱 목록 화면이 쓰는 `public/data/mountains.json`(11KB)은 **어느 스크립트도 만들지 않는다.**
`data/processed/myeongsan100_index.json` 과 내용은 같지만 키가 영문(`name`, `courses`, `totalKm`,
`longestKm`, `peakM`, `lon`, `lat`)이라 스키마가 다르다 — 어느 시점에 수동으로 변환된 것으로 보인다.
`lib/mountains.ts` 의 `MountainSummary` 가 정본 스키마다.
100대명산 데이터를 갱신하면 이 파일은 **자동으로 따라오지 않으니** 손으로 맞춰야 한다.
장기적으로는 `build_mountain_index.py` 가 이 스키마로 바로 내보내게 고치는 편이 낫다.

---

## 2. 배포

프로젝트: Vercel `korea-mountain` → https://korea-mountain.vercel.app (Hobby 플랜)

```bash
npm run deploy            # vercel deploy --prod --archive=tgz
npm run deploy:preview    # 프리뷰
```

### 2.1 `--archive=tgz` 는 선택이 아니다

`public/data` 에만 **4,616개 파일**이 있다. Hobby 플랜은 24시간당 **5,000개 파일 업로드 제한**이 있고
(`api-upload-free`), 평범한 `vercel deploy --prod` 는 파일을 하나씩 올려서 하루 한 번이면 한도를 친다.
`--archive=tgz` 는 프로젝트 전체를 tarball 하나로 묶어 올리므로 파일 수 카운트를 우회한다.
**항상 이 플래그를 써라.** `npm run deploy` 에 박아 둔 이유가 이것이다.

파일 수 현황:

| 경로 | 파일 수 | 크기 |
|---|---|---|
| `public/data/peak-courses/` | 4,492 | 28MB |
| `public/data/courses/` | 100 | 14MB |
| `public/data/np-trails/` | 21 | 3.3MB |
| `public/data/*.json` | 3 | 0.8MB |
| **합계** | **4,616** | **46MB** |

peak-courses 가 늘어나면 tarball 방식으로도 다른 한도(배포 크기)에 걸릴 수 있으니
`build_peaks.py --simplify` 허용오차를 키우는 쪽을 먼저 검토해라.

### 2.2 프로젝트 rename 후에는 SSO 보호를 다시 꺼야 한다

프로젝트 이름을 바꾸면 Vercel 이 **배포 보호(SSO/Vercel Authentication)를 다시 켜 버린다.**
그대로 두면 배포는 성공하는데 접속하면 로그인 벽이 뜬다. 실제로 겪었고, 이렇게 풀었다:

```bash
vercel project protection disable korea-mountain --sso
```

rename 직후에는 항상 익명 브라우저로 배포 URL 을 한 번 열어 확인해라.

### 2.3 로컬 링크가 옛 이름을 가리킬 수 있다

`.vercel/project.json` 의 `projectName` 이 아직 `sanhaeng` 이다(rename 이전 값).
`projectId` 로 붙으므로 배포 자체는 정상 동작하지만, 헷갈리면 다시 링크해라.

```bash
vercel link
```

`.vercel/` 은 커밋하지 않는다(머신마다 다르고 토큰성 정보가 섞인다).

---

## 3. 환경변수

`.env.example` 을 `.env.local` 로 복사해서 채운다. **`.env.local` 은 커밋 금지** — `.gitignore` 로 막아 뒀다.
Vercel 쪽은 대시보드 또는 `vercel env add` 로 따로 넣어야 한다(로컬 파일은 배포에 안 올라간다).

| 이름 | 발급처 | 노출 | 용도 |
|---|---|---|---|
| `DATA_GO_KR_KEY` | data.go.kr → 마이페이지 → 개발계정 일반 인증키 | **서버 전용** | `lib/datago.ts` 의 `serviceKey`. `app/api/mountain-weather`, `app/api/danger` 가 쓴다 |
| `NEXT_PUBLIC_VWORLD_KEY` | vworld.kr → 오픈API 인증키 | 클라이언트 노출(설계상 정상) | 브이월드 배경지도. `components/mountain-explorer.tsx` |

### 3.1 `DATA_GO_KR_KEY` — Encoding 키를 넣어라

발급 화면에 Encoding / Decoding 두 가지가 나온다. **Encoding 키**(`%2F`, `%2B`, `%3D` 가 이미 들어 있는 쪽)를
쓴다. `lib/datago.ts` 는 `%` 가 들어 있으면 그대로, 없으면 한 번 인코딩해서 붙인다.
Encoding 키를 다시 인코딩하면 `%` 가 `%25` 로 바뀌어 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR` 가 난다.
키가 없으면 API 라우트가 `NO_KEY` 로 500 을 낸다.

### 3.2 `NEXT_PUBLIC_VWORLD_KEY` — 도메인에 묶인다

브이월드는 키를 **발급 시 등록한 도메인에 묶고 Referer 로 검사**한다. 클라이언트에 노출되는 것이
이 API 의 정상 동작이다. 대신 **도메인마다 등록이 필요**하니 `localhost` 와
`korea-mountain.vercel.app` 을 각각 넣어 둬라. 도메인이 안 맞으면 지도 타일이 조용히 안 뜬다.
키가 비면 브이월드 버튼만 잠기고 나머지 기능은 그대로 돈다.

`NEXT_PUBLIC_*` 는 **빌드 시점에 번들에 구워진다.** Vercel 에서 값을 바꿨으면 재배포해야 반영된다.

---

## 4. 저장소에 무엇을 커밋하는가

| 경로 | 커밋 | 근거 |
|---|---|---|
| `.env.local` | ✗ | 인증키. `.env*` 로 차단 |
| `.env.example` | ✓ | 키 없는 템플릿. `!.env.example` 로 예외 |
| `data/raw/` (17MB) | ✗ | data.go.kr 에서 재다운로드 가능하고 절차가 `data/README.md` 에 있다. 파생물이 전부 커밋돼 있어 없어도 개발·배포에 지장 없다 |
| `__pycache__/`, `*.pyc` | ✗ | 파이썬 바이트코드 캐시 |
| `data/processed/` (24MB) | ✓ | `public/data/` 분할의 직접 입력. 이걸 두면 `data/raw/` 재다운로드 없이 배포 산출물을 다시 만들 수 있다 — 재현성의 경계선을 여기 둔다 |
| `public/data/` (46MB / 4,616개) | ✓ | **배포 산출물 그 자체.** CDN 이 직접 서빙한다. 빠지면 지도에 아무것도 안 뜬다 |
| `lib/park-codes.ts`, `lib/mtweather-stations.ts` | ✓ | 생성물이지만 원본이 HWP/DOCX 라 재생성 비용이 크고, 앱 코드가 직접 import 한다 |
| `.vercel/`, `node_modules/`, `.next/`, `*.tsbuildinfo` | ✗ | 머신 로컬 / 빌드 산출물 |

**`data/raw/` 가 없으면 못 돌리는 스크립트**가 넷 있다. 이 갈래를 다시 만들어야 할 때만
원본을 다시 받으면 된다.

| 스크립트 | 필요한 원본 |
|---|---|
| `data:np-geojson` (A-1) | `15003467_np_trail_spatial.zip` |
| `data:park-codes` (A-2) | `15003467_np_trail_spatial.zip` |
| `data:gpx-geojson` (B-1) | `15098177_100myeongsan.zip`, `15108080_forestroad_gpx.zip` |
| `data:recompute-gain` (B-5) | `15098177_100myeongsan.zip` |

---

## 5. API 할당량

`docs/api-spec.md` 에 데이터셋별 상세가 있다. 요약:

| 등급 | 일일 한도(개발계정) | 해당 데이터셋 |
|---|---|---|
| 일반 | **10,000회** | 15084696 산악기상, 15058662 산정보, 15084084 기상청 단기예보, 15097966/15097947/15097949 트레킹센터 POI, 15108067 위험지역 POI |
| 산림청 GW 계열 | **1,000회** | 15158970 산림공간정보 등산로, 15158915 명산등산로, 15158969 백두대간, 15084817 산불위험예보 |

**1,000회짜리가 넷 있다.** 지도 화면에서 사용자마다 호출하는 구조면 금방 소진된다 —
서버 사이드 캐싱을 전제로 설계해야 한다. 운영계정으로 올리면(활용사례 등록 심의) 증설 가능하다.

---

## 6. 알려진 한계

### 6.1 데이터 기준일

| 데이터 | 기준일 | 영향 |
|---|---|---|
| 국립공원 탐방로 (15003467) | **2017년** | 이후 신설·폐쇄 구간이 반영돼 있지 않다 |
| 전국 주요 봉우리 코스 (15108086) | **2022-11-16** | 이후 변경 미반영 |
| 국립공원 정밀관리도 코드정의서 v2.5 | **2013-05-14** | `lib/park-codes.ts` 의 출처. 이후 신설된 공원사무소는 없다 |

### 6.2 데이터 자체의 함정

- 15003467 의 `가는시간(분)` 은 값 범위상 실제로는 **시간** 단위로 보인다. 컬럼명을 그대로 믿지 마라.
- `지리정보시스템 상 거리(m)`(→ `distM`)의 **단위는 미터가 맞다.** 격포코스 실측 14.74km 가
  컬럼값 14,745.88m 와 일치했다. `data/README.md` 의 "km 로 추정" 서술은 틀렸다.
  다만 1,890개 중 일부는 컬럼값과 실제 선 길이가 크게 어긋난다. 어느 쪽이 옳은지는 제공기관만
  알 수 있으므로 `add_np_trail_geom_distance.py`(A-4)가 실측값 `geomDistM` 을 나란히 붙이고,
  25% 이상 차이나면 `distMismatch: true` 를 단다. **컬럼값은 덮어쓰지 않는다.**
- 산 높이(`peakM`)는 산의 높이가 아니라 **코스가 도달한 최고 고도**다. §1.6 참고.
  산정보 API 로 받은 공식 높이는 4,705건 중 **1,319건이 `mntihigh=0.0`(높이 미상)** 이라
  0 이하를 걸러야 하고, 큰 산은 이름이 `설악산_대청봉` 형태로 들어 있어 그냥 "설악산" 으로는
  찾을 수 없다. 산 이름은 유일하지도 않다(동명이산).
- 봉우리 코스의 거리·누적상승 통계는 **원본 정점 기준**으로 계산돼 있고, GPS 점프 분할 뒤에도
  고치지 않는다. 점프 구간이 거리에 포함돼 과대평가되지만 원본 수치를 임의로 바꾸지 않는 쪽을 택했다.
  대신 끊긴 조각 수가 `조각수` 속성에 남는다.
- 탐방객 통계(15107577)는 이 publicDataPk 로 **설악산 파일 하나만** 노출된다.
- 15032340 「탐방로 등급제」 는 PDF 설명 문서일 뿐 데이터가 아니다.
- 기상청 단기예보(15084084)는 **WGS84 가 아니라 Lambert 격자 nx/ny** 를 쓴다.
  변환은 `lib/kma-grid.ts`, 검증은 `npm run data:verify-grid`.

### 6.3 운영 공백

- **에러 모니터링이 없다.** 프로덕션 예외는 Vercel 함수 로그를 직접 봐야 알 수 있다.
  Sentry 같은 것을 붙이는 게 다음 과제다.
- data.go.kr 은 **실패해도 HTTP 200** 을 주고, JSON 을 요청해도 인증 오류는 XML 로 온다.
  `lib/datago.ts` 가 두 형태를 다 검사한다 — 새 API 를 붙일 때 이 경로를 우회하지 마라.
