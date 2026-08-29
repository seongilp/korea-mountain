# 등산 정적 데이터셋 조사 결과

조사일: 2026-08-29 / 대상: 공공데이터포털(data.go.kr) 파일데이터 8건

## 결론 요약

- data.go.kr **파일데이터는 로그인 없이 `curl`만으로 다운로드된다** (쿠키·인증키 불필요). 5건 확보.
- 나머지 3건(산림청 2건, 경기도 1건)은 파일데이터가 아니라 **"기관자체 다운로드(제공데이터URL 기재)"** 유형으로,
  포털에는 파일이 없고 외부 링크만 있다. 산림청 2건은 실제로는 OpenAPI(인증키 필요), 경기도 1건은 원본 링크가 오류 페이지.
- 확보한 지오메트리는 전부 **WGS84(EPSG:4326)** 라 재투영이 필요 없었다. pyproj/GDAL 없이 순수 파이썬으로 GeoJSON 변환 완료.

## 데이터셋 표

| 데이터셋 | ID | 로그인 | 받은 형식 | 크기 | 인코딩 | 좌표계 | 행/피처 수 | 주요 컬럼 | 상태 |
|---|---|---|---|---|---|---|---|---|---|
| 국립공원공단_국립공원 탐방로 공간데이터 | 15003467 | 불필요 | ZIP(CSV 181MB + HWP 코드정의서) | zip 7.2MB | **EUC-KR(CP949)** | WGS84 경위도 | 910,110행 → 1,890 코스 | 국립공원관리번호, 공원사무소코드, 코스ID, 탐방코스(한글/영문), 상세구간, 가는/오는시간(분), 지리정보시스템 상 거리(m), 난이도, 탐방로 통제여부, 경도, 위도 | **확보 + 변환 완료** |
| 국립공원공단_탐방로 등급제 정보 | 15032340 | 불필요 | **PDF(3쪽) 뿐** | 327KB | - | - | - | 등급제 분석기준 설명 문서 (데이터 아님) | 확보했으나 사용 불가 |
| 국립공원공단_시간별·일별 탐방객 통계 | 15107577 | 불필요 | CSV | 2.3MB | **UTF-8 (BOM 있음)** | - | 37,188행 (2018-01-01~2026-03) | 순번, 국립공원, 사무소, 관리지구, 탐방지역, 일자, 전체 탐방객수 | 확보(**설악산만**) |
| 한국등산트레킹지원센터_산림청 100대명산 | 15098177 | 불필요 | ZIP(GPX 607개) | 5.6MB | UTF-8 | **WGS84 (GPX 규격)** | 100개 산 / 607 코스 / POI 22,989 | trkpt(lat/lon/ele), wpt(이름, sym=갈림길·쉼터·조망점·화장실 등) | **확보 + 변환 완료** |
| 한국등산트레킹지원센터_국가숲길 코스 | 15108080 | 불필요 | ZIP(GPX 56개 + XLSX 범례) | 1.1MB | UTF-8 | **WGS84 (GPX 규격)** | 6개 숲길 / 56 코스 | trkpt(lat/lon/ele) | **확보 + 변환 완료** |
| 산림청_등산로(산림문화·휴양정보) | 3034022 | - | 파일 없음 | - | - | - | - | - | **실패**: 제공형태가 "기관자체 다운로드", forest.go.kr로 이동하면 data.go.kr **OpenAPI(3062614, 인증키 필요)** 로 연결 |
| 산림청_숲길(산림문화·휴양정보) | 3034163 | - | 파일 없음 | - | - | - | - | - | **실패**: 위와 동일(OpenAPI 방식) |
| 경기도_주요 산 등산로 | 15048566 | - | 파일 없음 | - | - | - | - | - | **실패**: 경기데이터드림 원본 링크(`data.gg.go.kr .. infId=9N4G2QVL5BYN1PDHN8RP26556`)가 오류 페이지 반환 |

## 다운로드 방법 (재현 가능)

로그인·인증키 없이 두 단계면 된다.

```bash
# 1) atchFileId 조회 (JSON) — publicDataDetailPk 는 상세 페이지의 hidden input 또는 다운로드 버튼 onclick 인자
curl -sL "https://www.data.go.kr/tcs/dss/selectFileDataDownload.do?publicDataPk=15098177&publicDataDetailPk=uddi:f63db570-86cf-473e-918d-eb466e767877&fileDetailSn=1"

# 2) 실제 파일 내려받기
curl -sL -o out.zip "https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=FILE_000000002504862&fileDetailSn=1&insertDataPrcus=N"
```

일부 데이터셋은 상세 페이지 JSON-LD(`"@type":"DataDownload"`)에 `contentUrl` 로 2번 URL이 그대로 박혀 있다.

## 산출물

### `raw/` (원본 그대로)

| 파일 | 설명 |
|---|---|
| `15003467_np_trail_spatial.zip` | 국립공원 탐방로 CSV(EUC-KR) + 코드정의서 HWP |
| `15032340_trail_grade.pdf` | 탐방로 등급제 분석기준 문서 |
| `15098177_100myeongsan.zip` | 100대명산 GPX 607개 (ZIP 내부 파일명 CP949) |
| `15107577_seoraksan_daily.csv` | 설악산 일별 탐방객 통계 |
| `15108080_forestroad_gpx.zip` | 국가숲길 GPX 56개 + 범례 XLSX |
| `15108080_국가숲길_코스범례.xlsx` | 위 ZIP에서 추출한 숲길·코스 범례 |

### `processed/` (WGS84 GeoJSON, UTF-8)

| 파일 | 크기 | 피처 | 내용 |
|---|---|---|---|
| `np_trails.geojson` | 4.3MB | 1,890 LineString | 국립공원 21곳 탐방로 구간. 속성에 코스명·상세구간·소요시간·난이도·통제여부(통제 311건) 포함. 정점 간격 1m 내외 원본을 1m 허용오차 Douglas-Peucker로 단순화(910,110 → 124,116점) |
| `myeongsan100.geojson` | 9.8MB | 607 LineString | 100대명산 등산코스. 좌표는 `[lon, lat, 고도]`, 속성에 거리_km·최저/최고고도·누적상승 |
| `myeongsan100_waypoints.geojson` | 5.5MB | 22,989 Point | 100대명산 코스 상 POI(갈림길 3,679 / 쉼터 1,510 / 조망점 598 / 화장실 346 등) |
| `myeongsan100_index.json` | 18KB | 100 | 산별 요약(코스수, 총·최장 거리, 최고고도, 대표좌표). 목록·검색 화면용 경량 인덱스 |
| `national_forest_trails.geojson` | 4.7MB | 56 LineString | 국가숲길 6곳(지리산둘레길, 백두대간트레일, DMZ펀치볼둘레길, 울진금강소나무숲길, 대관령숲길, 내포문화숲길) |

### `scripts/` (변환 스크립트, 재실행 가능)

- `np_trail_to_geojson.py` — 15003467 CSV(EUC-KR) → LineString GeoJSON
- `gpx_to_geojson.py` — 100대명산 / 국가숲길 GPX → LineString + Waypoint GeoJSON
- `build_mountain_index.py` — 100대명산 GeoJSON → 산별 요약 인덱스

## 주의사항

- **좌표 변환 도구 불필요**: 확보한 3종 지오메트리는 모두 WGS84라 pyproj/GDAL 없이 처리했다. (이 머신에는 pyproj·ogr2ogr 없음)
- 15003467 CSV는 **EUC-KR**, 15107577 CSV는 **UTF-8 BOM**. ZIP 내부 파일명은 **CP949** (`zipfile.ZipFile(..., metadata_encoding="cp949")` 필요).
- 15003467의 `가는시간(분)` 컬럼은 값이 2~3 수준이라 실제로는 시간 단위로 보인다. `지리정보시스템 상 거리(m)` 도 값 범위상 km로 추정되며, 한 행(구간)의 실제 도상 거리는 0.5~1km 수준이다. 컬럼명을 그대로 믿지 말 것.
- 15003467은 2017년 기준 데이터라 이후 신설·폐쇄 구간이 반영되어 있지 않다.
- 15107577은 포털에서 국립공원별로 별도 파일을 제공하는데, 이 publicDataPk 로는 **설악산 파일 1개만** 노출된다. 다른 공원 통계가 필요하면 별도 데이터셋 ID를 찾아야 한다.
- `myeongsan100.geojson` 은 9.8MB라 웹에서 통째로 불러오기엔 크다. 목록은 `myeongsan100_index.json`, 상세는 산 단위 분할 로딩을 권장.
