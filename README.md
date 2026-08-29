# 산행 (sanhaeng)

전국 등산로를 지도에서 찾아보는 웹앱. 공공데이터포털의 등산 관련 공개 데이터를
지도 위에 올려 두고, 산·봉우리·국립공원 탐방로를 한 화면에서 훑어볼 수 있게 한다.

배포: **https://korea-mountain.vercel.app**

## 담고 있는 것

| 데이터셋 | 규모 |
|---|---|
| 산림청 100대명산 등산코스 | 100개 산 / 607 코스 / POI 22,989 |
| 전국 주요 봉우리 코스 | 4,492 봉우리 |
| 국립공원 탐방로 | 21개 공원 / 1,890 구간 (난이도·소요시간·통제여부 포함) |
| 국가숲길 | 6곳 / 56 코스 |

여기에 산악기상정보와 산불위험예보를 API 로 얹는다.

## 시작하기

```bash
npm install
cp .env.example .env.local   # 인증키 채우기 (§환경변수)
npm run dev
```

http://localhost:3000 을 연다.

지도와 코스 데이터는 `public/data/` 에 정적 파일로 이미 들어 있어서, 인증키 없이도
지도와 등산로는 그대로 뜬다. 키가 필요한 건 날씨·산불위험 같은 실시간 API 와
브이월드 배경지도뿐이다.

### 환경변수

`.env.example` 을 `.env.local` 로 복사해 채운다. 자세한 설명은 그 파일과
[`docs/OPERATIONS.md`](docs/OPERATIONS.md#3-환경변수) 에 있다.

| 이름 | 없으면 |
|---|---|
| `DATA_GO_KR_KEY` | 산악기상·산불위험 API 라우트가 500 |
| `NEXT_PUBLIC_VWORLD_KEY` | 브이월드 배경지도 버튼만 잠김 |

## 기술 스택

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui ·
MapLibre GL · Vercel 배포

## 구조

```
app/            페이지와 API 라우트 (mountain-weather, danger)
components/     지도와 탐색 UI
lib/            data.go.kr 클라이언트, 기상청 격자 변환, 생성된 코드표
data/raw/       원본 다운로드 (저장소 제외 — 재다운로드 가능)
data/processed/ GeoJSON 중간 산출물
data/scripts/   변환 스크립트 (파이썬 표준 라이브러리만 사용)
public/data/    배포되는 정적 데이터. CDN 이 직접 서빙한다
docs/           API 스펙과 운영 가이드
```

## 데이터 출처

전부 [공공데이터포털(data.go.kr)](https://www.data.go.kr) 공개 데이터다.

- 국립공원공단 — 국립공원 탐방로 공간데이터 (15003467, 2017년 기준)
- 한국등산트레킹지원센터 — 산림청 100대명산 (15098177), 전국 주요 봉우리 코스 (15108086, 2022-11-16),
  국가숲길 코스 (15108080)
- 산림청 국립산림과학원 — 산악기상정보 (15084696), 산불위험예보 (15084817)
- 기상청 — 단기예보 조회서비스 (15084084)

원본 조사 결과와 다운로드 재현 절차는 [`data/README.md`](data/README.md),
API 필드 수준 스펙은 [`docs/api-spec.md`](docs/api-spec.md) 에 정리돼 있다.

## 데이터 갱신 · 배포

```bash
npm run deploy   # vercel deploy --prod --archive=tgz
```

`--archive=tgz` 는 필수다. `public/data` 에 파일이 4,616개라 Hobby 플랜의
24시간당 5,000개 업로드 제한에 걸린다.

데이터 재생성은 스크립트 실행 순서가 중요하다 — 특히 **GPS 점프 분할 → 단순화** 순서를
거꾸로 하면 끊김 판정이 26%에서 60%로 부풀어 오른다.
전체 절차는 [`docs/OPERATIONS.md`](docs/OPERATIONS.md) 를 봐라.
