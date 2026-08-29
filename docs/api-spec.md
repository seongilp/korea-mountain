# 등산/산 관련 공공데이터포털 OpenAPI 스펙 정리

조사일: 2026-08-29
출처: `https://www.data.go.kr/data/{ID}/openapi.do` 상세 페이지 (문서 스펙만 수집, 실제 호출 테스트는 하지 않음)

---

## 한눈에 보기

| ID | 이름 | 유형 | 대표 엔드포인트 | 좌표계 | 일일한도(개발계정) |
|---|---|---|---|---|---|
| 15084696 | 산림청 국립산림과학원_산악기상정보 | REST | `https://apis.data.go.kr/1400377/mtweather/mountListSearch` | **응답에 좌표 없음** (지점 좌표는 기술문서 docx에만 존재) | 10,000 |
| 15058662 | 산림청_산정보 서비스 (3,368개 산) | REST | `https://apis.data.go.kr/1400000/service/cultureInfoService2/mntInfoOpenAPI2` | 좌표 필드 없음 (주소 문자열만) | 10,000 |
| 15158970 | 산림청_산림공간정보_등산로정보_GW | REST | `https://apis.data.go.kr/1400000/trailInfoService/getforestspatialdataservice` | 좌표 없음 (파일/URL 링크만) | 1,000 |
| 15158915 | 산림청_명산등산로_GW | REST | `https://apis.data.go.kr/1400000/cultureInfoService/gdTrailInfoOpenAPI` | 좌표 필드 없음 | 1,000 |
| 15158969 | 산림청_백두대간_등산로정보_GW | REST | `https://apis.data.go.kr/1400000/trailInfoService/gettrailservice` | 좌표 없음 (구간 텍스트 + 파일) | 1,000 |
| 15097966 | 한국등산트레킹지원센터_숲길 연결망 POI정보 | REST | `https://apis.data.go.kr/B553662/poiInfoService/getPoiInfoList` | lat/lot 십진도 — 샘플값상 WGS84로 보임 (**명시 없음 — 실측 필요**) | 10,000 |
| 15097947 | 한국등산트레킹지원센터_100대명산 숲길POI정보 | REST | `https://apis.data.go.kr/B553662/fmmtnFrtrlPoiInfoService/getFmmtnFrtrlPoiInfoList` | 동일 (**명시 없음 — 실측 필요**) | 10,000 |
| 15097949 | 한국등산트레킹지원센터_100대명산 관광POI정보 | REST | `https://apis.data.go.kr/B553662/sghtngPoiInfoService/getSghtngPoiInfoList` | 동일 (**명시 없음 — 실측 필요**) | 10,000 |
| 15108067 | 한국등산트레킹지원센터_전국주요봉우리 위험지역 POI | REST | `https://apis.data.go.kr/B553662/dangerInfoService/getDangerInfoList` | 동일 (**명시 없음 — 실측 필요**) | 10,000 |
| 15084817 | 산림청 국립산림과학원_산불위험예보정보 | REST | `https://apis.data.go.kr/1400377/forestPointV2/forestPointListSigunguSearchV2` | 좌표 없음 (행정구역 코드 기반) | 1,000 |
| 15084084 | 기상청_단기예보 조회서비스 | REST | `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst` | **격자 nx/ny (Lambert Conformal Conic, 5km 격자)** — WGS84 아님, 변환 필요 | 10,000 |

**11개 전부 REST. LINK 유형 없음.**

---

## 1. 15084696 — 산림청 국립산림과학원_산악기상정보

| 항목 | 값 |
|---|---|
| OpenAPI 명 | 산림청 국립산림과학원_산악기상정보 |
| 제공기관 | 산림청 국립산림과학원 (연구기획과) |
| API 유형 | REST |
| 데이터 포맷 | JSON + XML |
| 서비스 URL | `https://apis.data.go.kr/1400377/mtweather` |
| 심의 | 개발단계: 자동승인 / 운영단계: 자동승인 |
| 트래픽 | 개발계정 10,000 / 운영계정 활용사례 등록 시 증설 |
| 등록/수정일 | 2021-08-24 / 2025-08-20 |
| 참고문서 | `03_산악기상정보_기술문서_v1.5(수정본).docx` → `https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=FILE_000000003110361&fileDetailSn=1` |

### 오퍼레이션 (1개)

`GET https://apis.data.go.kr/1400377/mtweather/mountListSearch` — 산악기상정보 조회

#### 요청 파라미터

| 이름 | 필수 | 크기 | 샘플 | 설명 |
|---|---|---|---|---|
| `ServiceKey` | 필수 | 100 | (URL Encode된 인증키) | 공공데이터포털 인증키 |
| `pageNo` | 필수 | 4 | `1` | 페이지번호 |
| `numOfRows` | 필수 | 4 | `10` | 한 페이지 결과 수 |
| `_type` | 옵션 | 4 | `xml` | `xml` / `json` 출력 방식 — **JSON 지원됨** |
| `localArea` | 옵션 | 5 | `1` | 지역코드 |
| `obsid` | 옵션 | 10 | `1910` | 지점번호 |
| `tm` | 옵션 | 20 | `202106301809` | 관측시간 (`YYYYMMDDHHMI`) |

#### 응답 필드

| 이름 | 타입 | 샘플 | 설명 |
|---|---|---|---|
| `resultCode` | string | `00` | 검색결과 코드 |
| `resultMsg` | string | `NORMAL SERVICE.` | 검색결과 메시지 |
| `numOfRows` / `pageNo` / `totalCount` | string | | 페이징 |
| `localarea` | string | `1` | 지역코드 (**요청은 `localArea`, 응답은 `localarea` — 대소문자 다름**) |
| `obsid` | string | `1910` | 지점번호 |
| `obsname` | string | `홍릉수목원임외` | 산이름(관측지점명) |
| `tm` | string | `2021-06-30 18:09` | 관측시간 |
| `tm2m` / `tm10m` | number | `25.3` / `26.7` | 2m / 10m 기온(℃) |
| `hm2m` / `hm10m` | number | `71.5` / `67.5` | 2m / 10m 습도(%) |
| `ws2m` / `ws10m` | number | `0.0` / `0.7` | 2m / 10m 풍속(m/s) |
| `wd2m` / `wd10m` | number | `57.1` / `358.5` | 2m / 10m 풍향(도) |
| `wd2mstr` / `wd10mstr` | string | `ENE` / `N` | 풍향 방위 문자 |
| `pa` | number | `1000.7` | 기압(hPa) |
| `rn` | number | `10.5` | 전도식 강우량(mm) |
| `cprn` | number | `10.4` | 무게식 강우량(mm) |
| `ts` | number | `26.8` | 지면온도(℃) |

> **좌표**: 응답에 위경도가 **없다**. 상세 설명에 "기술문서 내 관측지점의 지역명, 산이름, 지점번호, 경도, 위도, 고도 참조" 라고 명시되어 있으므로, 지점 좌표 테이블은 위 docx를 받아 별도 정적 데이터로 관리해야 한다. 문서상 좌표계 명시 없음 — **실측 필요**(경/위도 표기이므로 WGS84 가능성 높음).
> 일부 지점은 보안상 비공개.

---

## 2. 15058662 — 산림청_산정보 서비스 (국내 소재 3,368개 설명)

| 항목 | 값 |
|---|---|
| 제공기관 | 산림청 (산림빅데이터팀) |
| API 유형 | REST |
| 데이터 포맷 | **XML 전용** (`produces: application/xml`) |
| 서비스 URL | `https://apis.data.go.kr/1400000/service/cultureInfoService2` |
| 심의 | 개발/운영 모두 자동승인 |
| 트래픽 | 개발계정 10,000 |
| 등록/수정일 | 2015-12-24 / 2025-09-11 |
| 참고문서 | `OpenAPI활용가이드_산림청_산정보(국내 소재 3,368개 설명)_v2.6.docx` → `https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=FILE_000000002657027&fileDetailSn=1` |

### 오퍼레이션 (3개)

#### 2-1. `GET /mntInfoOpenAPI2` — 산정보 목록 검색

| 파라미터 | 필수 | 샘플 | 설명 |
|---|---|---|---|
| `ServiceKey` | 필수 | | 인증키 (**대문자 S**) |
| `searchWrd` | 옵션 | `북한산` | 산명 부분일치 검색 |
| `pageNo` | 옵션 | `1` | 페이지번호 |
| `numOfRows` | 옵션 | `10` | 한 페이지 결과 수 |

응답 `body.items.item`:

| 필드 | 타입 | 설명 |
|---|---|---|
| `mntilistno` | string | 산코드 (다른 오퍼레이션의 `mntiListNo` 입력값) |
| `mntiname` | string | 산명 |
| `mntisname` | string | 산정보 부제 |
| `mntihigh` | number | 산 높이(m) |
| `mntiadd` | string | 산정보 소재지 (주소 문자열) |
| `mntiadmin` / `mntiadminnum` | string | 관리주체 / 관리자 전화번호 |
| `mntisummary` | string | 산정보 개관 |
| `mntidetails` | string | 산 상세정보 내용 |
| `mntitop` | string | 100대명산 선정이유 |
| `mntinfdt` | string | 데이터 기준일자 |

#### 2-2. `GET /frtrlSectnOpenAPI2` — 숲길구간 검색

| 파라미터 | 필수 | 샘플 | 설명 |
|---|---|---|---|
| `ServiceKey` | 필수 | | 인증키 |
| `mntiListNo` | 옵션 | `113500101` | 산정보ID (**요청은 camelCase `mntiListNo`, 응답은 소문자 `mntilistno`**) |
| `pageNo` / `numOfRows` | 옵션 | | 페이징 |

응답 `item`: `frtrlsectnnm` (숲길구간명) — 필드 1개뿐.

#### 2-3. `GET /mntInfoImgOpenAPI2` — 산 이미지 정보 검색

| 파라미터 | 필수 | 샘플 | 설명 |
|---|---|---|---|
| `ServiceKey` | 필수 | | 인증키 |
| `mntiListNo` | **필수** | `111100101` | 목록에서 조회된 산정보코드 |
| `pageNo` / `numOfRows` | 옵션 | | 페이징 |

응답 `item`: `imgno`(이미지순번), `imgname`(이미지명), `imgfilename`(이미지파일명 — 경로 `www.forest.go.kr/images/data/down/mountain/`)

> **좌표**: 없음. 소재지는 주소 문자열(`mntiadd`)뿐이라 지도에 찍으려면 지오코딩이 필요하다.
> **JSON**: 문서상 XML 전용. `_type=json` 언급 없음.

---

## 3. 15158970 — 산림청_산림공간정보_등산로정보_GW

| 항목 | 값 |
|---|---|
| 제공기관 | 산림청 기획조정관 산림빅데이터팀 |
| API 유형 | REST (Swagger 2.0 명세 제공) |
| 데이터 포맷 | **XML 전용** |
| 서비스 URL | `https://apis.data.go.kr/1400000/trailInfoService` |
| 심의 | **개발단계: 심의승인** / 운영단계: 자동승인 |
| 트래픽 | 개발계정 1,000 |
| 등록/수정일 | 2014-12-09 / 2026-06-08 |
| 참고문서 | 없음 |

### 오퍼레이션 (1개)

`GET https://apis.data.go.kr/1400000/trailInfoService/getforestspatialdataservice` — 등산로 위치 정보

| 파라미터 | 필수 | 설명 |
|---|---|---|
| `serviceKey` | 필수 | 인증키 (**소문자 s**) |
| `pageNo` | 옵션 | 페이지번호 |
| `numOfRows` | 옵션 | 한 페이지 결과 수 |
| `mntnNm` | 옵션 | 산이름 |

응답 `body.items.item`:

| 필드 | 타입 | 설명 |
|---|---|---|
| `mntnnm` | string | 산명 |
| `mntninfourl` | string | 등산로 URL |
| `mntnfile` | string | 등산로 파일 다운로드 |
| `mntnimg` | string | 등산로 이미지 |

> **좌표**: 없음. "산림공간정보 등산로정보"라는 이름과 달리 실제로는 **공간 좌표/지오메트리를 전혀 반환하지 않고 외부 파일·이미지 링크만** 준다. 지도에 선을 그리려면 `mntnfile`이 가리키는 파일(형식·좌표계 미상)을 받아서 직접 파싱해야 한다 — **실측 필요**.

---

## 4. 15158915 — 산림청_명산등산로_GW

| 항목 | 값 |
|---|---|
| 제공기관 | 산림청 기획조정관 산림빅데이터팀 |
| API 유형 | REST (Swagger 2.0) |
| 데이터 포맷 | **XML 전용** |
| 서비스 URL | `https://apis.data.go.kr/1400000/cultureInfoService` |
| 심의 | 개발/운영 모두 자동승인 |
| 트래픽 | 개발계정 1,000 |
| 등록/수정일 | 2014-03-21 / 2026-06-05 |
| 참고문서 | 없음 |

### 오퍼레이션 (2개)

#### 4-1. `GET /gdTrailInfoOpenAPI` — 명산등산로 검색

| 파라미터 | 필수 | 설명 |
|---|---|---|
| `serviceKey` | 필수 | 인증키 |
| `pageNo` / `numOfRows` | 옵션 | 페이징 |
| `searchMtNm` | 옵션 | 산명 |
| `searchArNm` | 옵션 | 지역명 |

응답 `item`:

| 필드 | 설명 |
|---|---|
| `mntncd` | 산코드 |
| `mntnm` | 산명 |
| `subnm` | 산정보 부제 |
| `areanm` | 산정보 소재지 |
| `mntheight` | 산 높이 |
| `aeatreason` | 100대명산 선정이유 |
| `overview` | 산정보 개관 |
| `details` | 산정보 내용 |
| `transport` | 대중교통정보 설명 |
| `tourisminf` | 주변관광정보 설명 |
| `etccourse` | 주변관광 기타코스 설명 |
| `flashurl` | flashurl 정보 |
| `videourl` | 추가컬럼 경로 |

#### 4-2. `GET /gdTrailInfoImgOpenAPI` — 명산등산로 조회(상세)

| 파라미터 | 필수 | 샘플 | 설명 |
|---|---|---|---|
| `serviceKey` | 필수 | | 인증키 |
| `pageNo` / `numOfRows` | 옵션 | | 페이징 |
| `searchWrd` | 옵션 | `469000401` (예: 남망산) | **이름이 `searchWrd`인데 실제로는 산코드를 넣는다** |

응답 `item`: `num`(순번), `seq`(산행추가순번), `titl`(산행추가제목), `content`(산행추가설명), `image`(산행이미지순번)

> **좌표**: 없음. 소재지 문자열(`areanm`)만 제공.

---

## 5. 15158969 — 산림청_백두대간_등산로정보_GW

| 항목 | 값 |
|---|---|
| 제공기관 | 산림청 기획조정관 산림빅데이터팀 |
| API 유형 | REST (Swagger 2.0) |
| 데이터 포맷 | **XML 전용** |
| 서비스 URL | `https://apis.data.go.kr/1400000/trailInfoService` |
| 심의 | 개발/운영 모두 자동승인 |
| 트래픽 | 개발계정 1,000 |
| 등록/수정일 | 2014-12-09 / 2026-06-10 |
| 참고문서 | 없음 |

### 오퍼레이션 (1개)

`GET https://apis.data.go.kr/1400000/trailInfoService/gettrailservice` — 백두대간 등산로 정보 조회

| 파라미터 | 필수 | 설명 |
|---|---|---|
| `serviceKey` | 필수 | 인증키 |
| `pageNo` / `numOfRows` | 옵션 | 페이징 |
| `searchWrd` | 옵션 | 산이름 검색 |

응답 `item`:

| 필드 | 설명 |
|---|---|
| `baekduId` | 백두 ID |
| `baekdugbn` / `baekdugbnname` | 백두 구분 / 구분 명칭 |
| `baekdusections` | 백두 구간 시작 |
| `baekdusectione` | 백두 구간 도착 |
| `baekduvia` | 백두 경유지 |
| `baekdudistance` | 지도상 거리 |
| `baekdurealdistance` | 실제 거리 |
| `baekduspect` | 주요 볼거리 |
| `mntloca` | 위치 (문자열) |
| `mntname` | 파일 산이름 |
| `mntnnm` | 산이름 |
| `mntnfile` | 파일 다운로드 |

> **좌표**: 없음. `mntloca`는 좌표가 아니라 위치 설명 텍스트. 실제 트랙은 `mntnfile`을 별도로 받아야 하고 그 형식/좌표계는 문서에 없음 — **실측 필요**.
> **주의**: 15158970과 서비스 URL(`trailInfoService`)이 동일하다. 두 데이터셋에 각각 활용신청해야 하는지, 하나의 서비스키로 둘 다 되는지 확인 필요.

---

## 6. 15097966 — 한국등산트레킹지원센터_숲길 연결망 POI정보 서비스

| 항목 | 값 |
|---|---|
| 제공기관 | 한국등산트레킹지원센터 (기획조정실) |
| API 유형 | REST |
| 데이터 포맷 | JSON + XML |
| 서비스 URL | `https://apis.data.go.kr/B553662/poiInfoService` |
| 심의 | 개발단계: 자동승인 / **운영단계: 심의승인** |
| 트래픽 | 개발계정 10,000 |
| 등록/수정일 | 2022-01-04 / 2025-11-12 |
| 전체 건수 | `totalCount` 샘플 76,202 |
| 참고문서 | `KMOS-APR-B07_01_01_오픈API 활용자가이드_(숲길 연결망POI정보 조회 서비스)_V1.4.docx` → `https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=FILE_000000002632524&fileDetailSn=1` |

### 오퍼레이션 (1개)

`GET https://apis.data.go.kr/B553662/poiInfoService/getPoiInfoList` — 숲길 연결망 POI 정보 조회

#### 요청 파라미터

| 이름 | 필수 | 크기 | 샘플 | 설명 |
|---|---|---|---|---|
| `serviceKey` | 필수 | 100 | | 인증키 (**소문자 s**) |
| `pageNo` | 옵션 | 4 | `1` | 페이지번호 |
| `numOfRows` | 옵션 | 4 | `1` | 한 페이지 결과 수 |
| `type` | 옵션 | 4 | `xml` | **`_type`이 아니라 `type`** — `xml`/`json` |
| `srchFrtrlNm` | 옵션 | 100 | `부산광역시 둘레길` | 숲길명 |
| `srchPlaceTpeCd` | 옵션 | 10 | `SIGN` | 장소유형코드 (아래 코드표) |

**장소유형코드**: `PEAK`봉우리 · `SPRING`샘터 · `SCENERY`경관자원 · `TOILET`화장실 · `REST`쉼터 · `CAMP`야영장 · `CULTURAL`문화자원 · `DANGER`위험지역 · `ENTRY`등산로입구 · `INFO`안내소 · `PHOTO`포토존 · `SHELTER`대피소 · `VIEW`조망점 · `WILD`야생동물 · `SIGN`갈림길 · `STORE`편의점 · `FOOD`음식점 · `PARK`주차장 · `TRANS`대중교통

#### 응답 필드

| 이름 | 타입 | 샘플 | 설명 |
|---|---|---|---|
| `resultCode` / `resultMsg` | string | `0` / `NORMAL_SERVICE` | 결과 |
| `numOfRows` / `pageNo` / `totalCount` | | `76202` | 페이징 |
| `poiId` | string | `0000037988` | 관심지점식별자 (**10자리 zero-padded 문자열**) |
| `frtrlId` | string | `0000000275` | 숲길식별자 |
| `frtrlNm` | string | `부산광역시 둘레길` | 숲길명 |
| **`lat`** | number | `35.186039` | **위도** |
| **`lot`** | number | `129.15416` | **경도 — `lon`/`lng`이 아니라 `lot`** |
| `aslAltide` | number | `368` | 해발고도(m) |
| `orgnPlaceTpeCd` / `orgnPlaceTpeNm` | string | `SIGN` / `갈림길` | 원천장소유형 코드/명 |
| `placeNm` | string | `갈림길` | 장소명 |
| `dscrtCn` | string | `안부.체육시설` | 설명내용 |
| `orgnExmnnPrgrsDrcntNm` | string | | 원천조사진행방향명 |
| `sgnpstDstn1Nm` ~ `sgnpstDstn4Nm` | string | `옥녀봉` | 이정표 목적지 1~4명 |
| `orgnSgnpstDstn1DrcntNm` ~ `4DrcntNm` | string | `유턴`,`직진`,`우` | 이정표 목적지 방향명 |
| `orgnSgnpstDstn1DrcntCd` ~ `4DrcntCd` | string | `UT`,`ST`,`TL`,`BR` | 이정표 목적지 방향코드 |
| `crtrDt` | string | `2022-10-26 01:14:09` | 기준일시 |

> **좌표계**: 페이지에 명시 없음. 샘플값(35.186039, 129.15416)이 부산 장산 일대와 일치하므로 실무상 WGS84 십진도로 보이나, **명시 없음 — 실측 필요**.

---

## 7. 15097947 — 한국등산트레킹지원센터_100대명산 숲길POI정보 서비스

| 항목 | 값 |
|---|---|
| 제공기관 | 한국등산트레킹지원센터 |
| API 유형 | REST |
| 데이터 포맷 | JSON + XML |
| 서비스 URL | `https://apis.data.go.kr/B553662/fmmtnFrtrlPoiInfoService` |
| 심의 | 개발단계: 자동승인 / **운영단계: 심의승인** |
| 트래픽 | 개발계정 10,000 |
| 등록/수정일 | 2022-01-04 / 2025-11-12 |
| 전체 건수 | `totalCount` 샘플 28,204 |
| 참고문서 | `KMOS-APR-B07_01_02_오픈API 활용자가이드_(100대명산 숲길POI정보 조회 서비스)_V1.4.docx` → `https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=FILE_000000002632526&fileDetailSn=1` |

### 오퍼레이션 (1개)

`GET https://apis.data.go.kr/B553662/fmmtnFrtrlPoiInfoService/getFmmtnFrtrlPoiInfoList`

요청 파라미터·응답 필드는 **15097966(숲길 연결망 POI)과 완전히 동일한 스키마**다. `serviceKey`(필수), `pageNo`, `numOfRows`, `type`, `srchFrtrlNm`(샘플 `가리왕산`), `srchPlaceTpeCd`(전체 19개 코드 지원).

응답 샘플: `poiId=0000000292`, `frtrlId=0000000003`, `lat=37.461731`, `lot=128.535599`, `aslAltide=1007.32`, `frtrlNm=가리왕산`.

> **좌표계**: 명시 없음 — 실측 필요 (십진도, WGS84로 보임).
> 이 API의 오퍼레이션 설명이 포털에 "10대명산 숲길POI 정보를 조회"로 **오타** 등록되어 있다 (실제는 100대명산).

---

## 8. 15097949 — 한국등산트레킹지원센터_100대명산 관광POI정보 서비스

| 항목 | 값 |
|---|---|
| 제공기관 | 한국등산트레킹지원센터 |
| API 유형 | REST |
| 데이터 포맷 | JSON + XML |
| 서비스 URL | `https://apis.data.go.kr/B553662/sghtngPoiInfoService` |
| 심의 | 개발단계: 자동승인 / **운영단계: 심의승인** |
| 트래픽 | 개발계정 10,000 |
| 등록/수정일 | 2022-01-04 / 2025-11-12 |
| 전체 건수 | `totalCount` 샘플 1,955 |
| 참고문서 | `KMOS-APR-B07_01_04_오픈API 활용자가이드_(100대명산 관광POI정보 조회 서비스)_V1.4.docx` → `https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=FILE_000000002632576&fileDetailSn=1` |

### 오퍼레이션 (1개)

`GET https://apis.data.go.kr/B553662/sghtngPoiInfoService/getSghtngPoiInfoList`

스키마는 15097966/15097947과 동일. 차이점은 `srchPlaceTpeCd`의 **문서상 허용값이 `CULTURAL`(문화자원) 하나뿐**이라는 점 (샘플 `srchFrtrlNm=가지산`).

응답 샘플: `poiId=0000000531`, `lat=35.586239`, `lot=128.996658`, `aslAltide=376.075`, `placeNm=백연사`, `orgnPlaceTpeCd=CULTURAL`.

> 이정표 관련 필드(`sgnpstDstn*`)는 스키마에는 있으나 샘플이 전부 비어 있다 — 관광POI에는 사실상 채워지지 않는 것으로 보인다.
> **좌표계**: 명시 없음 — 실측 필요.

---

## 9. 15108067 — 한국등산트레킹지원센터_전국주요봉우리 위험지역 POI 정보 서비스

| 항목 | 값 |
|---|---|
| 제공기관 | 한국등산트레킹지원센터 |
| API 유형 | REST (Swagger 2.0) |
| 데이터 포맷 | JSON + XML |
| 서비스 URL | `https://apis.data.go.kr/B553662/dangerInfoService` |
| 심의 | 개발단계: 자동승인 / **운영단계: 심의승인** |
| 트래픽 | 개발계정 10,000 |
| 등록/수정일 | 2022-11-16 / 2025-11-12 |
| 참고문서 | 없음 |

### 오퍼레이션 (1개)

`GET https://apis.data.go.kr/B553662/dangerInfoService/getDangerInfoList` — 전국주요봉우리 위험지역정보 조회

| 파라미터 | 필수 | 타입 | 설명 |
|---|---|---|---|
| `serviceKey` | 필수 | string | 인증키 |
| `pageNo` | 옵션 | number | 페이지 번호 |
| `numOfRows` | 옵션 | number | 한 페이지 결과 수 |
| `type` | 옵션 | string | 데이터 타입 (`xml`/`json`) |
| `srchFrtrlNm` | 옵션 | string | 숲길명 |
| `srchPlaceTpeCd` | 옵션 | string | 장소유형코드 |

응답 (`header` + `body.items.item`):

| 필드 | 타입 | 설명 |
|---|---|---|
| `resultCode` / `resultMsg` | string | 응답코드 / 응답메시지 |
| `pageNo` / `numOfRows` / `totalCount` | number | 페이징 |
| `poiId` | string | 관심지점식별자 |
| `frtrlId` / `frtrlNm` | string | 숲길식별자 / 숲길명 |
| **`lat`** | number | 위도 |
| **`lot`** | number | 경도 |
| `aslAltide` | number | 해발고도 |
| `plcTypeCd` | string | 장소유형코드 (**다른 KMOS API의 `orgnPlaceTpeCd`와 필드명이 다름**) |
| `plcNm` | string | 장소명 (**다른 API는 `placeNm`**) |
| `explnCn` | string | 설명내용 (**다른 API는 `dscrtCn`**) |
| `crtrDt` | string | 기준일시 |

> **좌표계**: 명시 없음 — 실측 필요.

---

## 10. 15084817 — 산림청 국립산림과학원_산불위험예보정보

| 항목 | 값 |
|---|---|
| 제공기관 | 산림청 국립산림과학원 (연구기획과) |
| API 유형 | REST (Swagger 2.0) |
| 데이터 포맷 | JSON + XML |
| 서비스 URL | `https://apis.data.go.kr/1400377/forestPointV2` |
| 심의 | 개발/운영 모두 자동승인 |
| 트래픽 | **개발계정 1,000** |
| 공간/시간범위 | 전국 / 2021년 8월 ~ 2025년 2월 (포털 표기) |
| 등록/수정일 | 2021-08-24 / 2026-04-02 |
| 참고문서 | 없음 |

3시간 간격으로 72시간 예측 제공. 02·05·08·11·14·17·20·23시 기준 분석 → 03·06·09·12·15·18·21·24시 주기로 배포.

### 오퍼레이션 (3개)

#### 10-1. `GET /forestPointListGeongugSearchV2` — 산불위험지수(전국)

| 파라미터 | 필수 | 설명 |
|---|---|---|
| `ServiceKey` | 필수 | 인증키 (**대문자 S**) |
| `pageNo` | 필수 | 페이지번호 |
| `numOfRows` | 필수 | 한 페이지 결과 수 |
| `_type` | 옵션 | `xml`/`json` — **JSON 지원** |
| `excludeForecast` | 옵션 | 예보정보 제외 여부 (`1` 제외 / `0` 포함) |

#### 10-2. `GET /forestPointListSidoSearchV2` — 산불위험지수(시도)

위 파라미터 + `localAreas` (시도 코드 2자리, 콤마로 중복 지정 가능)

#### 10-3. `GET /forestPointListSigunguSearchV2` — 산불위험지수(시군구)

위 파라미터 + `localAreas` (시군구 코드 5자리) + `upplocalcd` (시도 코드 2자리)

#### 공통 응답 필드

| 필드 | 타입 | 설명 |
|---|---|---|
| `resultCode` / `resultMsg` | string | 결과 |
| `numOfRows` / `pageNo` / `totalCount` | string | 페이징 |
| `analdate` | string | 데이터기준일자 |
| `regioncode` | string | 산불위험 최상위 지역코드 |
| `doname` | string | 시도 명칭 |
| `sigucode` / `sigun` / `upplocalcd` | string | 시군구 코드 / 시군구 명칭 / 시도 코드 (**시군구 오퍼레이션에만 존재**) |
| `area` | string | 면적 |
| `meanavg` / `maxi` / `mini` / `std` | string | 예보지수 평균 / 최댓값 / 최솟값 / 표준편차 |
| `d1` / `d2` / `d3` / `d4` | string | 예보지수 등급별 값 — 낮음 / 다소높음 / 높음 / 매우높음 |
| `searchcd` | string | 검색코드 (**전국 오퍼레이션에만 존재**) |

> **좌표**: 없음. 행정구역 코드 기반이므로 지도에 칠하려면 행정경계 폴리곤을 별도로 조달해야 한다.

---

## 11. 15084084 — 기상청_단기예보 조회서비스

| 항목 | 값 |
|---|---|
| 제공기관 | 기상청 (국가기후데이터센터) |
| API 유형 | REST |
| 데이터 포맷 | JSON + XML |
| 서비스 URL | `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0` |
| 이용허락범위 | **공공저작물 출처표시 (제1유형)** — 다른 10개와 달리 출처 표시 의무 있음 |
| 심의 | 개발/운영 모두 자동승인 |
| 트래픽 | 개발계정 10,000 |
| 등록/수정일 | 2021-06-28 / 2026-07-09 |
| 참고문서 | `기상청41_단기예보 조회서비스_오픈API활용가이드_2607.zip` → `https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=FILE_000000003671875&fileDetailSn=1` |

전국을 5km × 5km 격자로 나눈 읍면동 단위 예보.

### 오퍼레이션 (4개)

#### 11-1. `GET /getUltraSrtNcst` — 초단기실황조회

| 파라미터 | 필수 | 샘플 | 설명 |
|---|---|---|---|
| `ServiceKey` | 필수 | | 인증키 (**대문자 S**) |
| `pageNo` | 필수 | `1` | 페이지번호 |
| `numOfRows` | 필수 | `1000` | 한 페이지 결과 수 |
| `dataType` | 옵션 | `XML` | **`_type`이 아니라 `dataType`** — `XML`/`JSON`, 기본 XML |
| `base_date` | 필수 | `20210628` | 발표일자 |
| `base_time` | 필수 | `0600` | 발표시각 (정시 단위) |
| `nx` | 필수 | `55` | 예보지점 X 좌표 (격자) |
| `ny` | 필수 | `127` | 예보지점 Y 좌표 (격자) |

응답: `resultCode`, `resultMsg`, `numOfRows`, `pageNo`, `totalCount`, `dataType`, `baseDate`, `baseTime`, `nx`, `ny`, `category`(자료구분코드, 예 `RN1`), `obsrValue`(실황 값 — RN1/T1H/UUU/VVV/WSD는 실수)

#### 11-2. `GET /getUltraSrtFcst` — 초단기예보조회

파라미터는 11-1과 동일하되 `base_time` 샘플 `0630` (**30분 단위**).
응답에 `fcstDate`(예측일자), `fcstTime`(예측시간), `fcstValue`(예보 값) 추가. `category` 샘플 `LGT`(낙뢰).
예보시점부터 6시간까지.

#### 11-3. `GET /getVilageFcst` — 단기예보조회

파라미터는 11-1과 동일하되 `base_time` 샘플 `0500` (**하루 8회 발표: 02·05·08·11·14·17·20·23시**).
응답: `baseDate`, `baseTime`, `fcstDate`, `fcstTime`, `category`(샘플 `TMP`), `fcstValue`, `nx`, `ny`.

#### 11-4. `GET /getFcstVersion` — 예보버전조회

| 파라미터 | 필수 | 샘플 | 설명 |
|---|---|---|---|
| `ServiceKey`, `pageNo`, `numOfRows` | 필수 | | 공통 |
| `dataType` | 옵션 | `XML` | 응답자료형식 |
| `ftype` | 필수 | `ODAM` | 파일구분 — `ODAM`:동네예보실황 / `VSRT`:동네예보초단기 / `SHRT`:동네예보단기 |
| `basedatetime` | 필수 | `202106280800` | 발표일시분 (**언더스코어 없는 소문자 `basedatetime`** — 다른 오퍼레이션의 `base_date`/`base_time`과 명명 규칙이 다름) |

응답: `version`(파일 생성 시간, 샘플 `20210628092217`), `filetype`(**요청은 `ftype`, 응답은 `filetype`**)

> **좌표계**: `nx`/`ny`는 **기상청 격자 좌표(Lambert Conformal Conic 투영, 5km 격자)**로 WGS84 경위도가 아니다. 위경도 → 격자 변환식(기상청 표준 LCC 파라미터: 기준위도 30°N/60°N, 기준경도 126°E, 원점 38°N/126°E, 격자간격 5km, XO=43, YO=136)을 직접 구현해야 한다. 변환식은 참고문서 zip에 포함되어 있다.

---

## 함정과 주의사항

### 좌표 관련 (가장 치명적)

1. **산악기상정보(15084696)는 응답에 위경도가 없다.** 관측지점의 경도/위도/고도는 오직 참고문서 `03_산악기상정보_기술문서_v1.5(수정본).docx` 안에만 있다. 지점 좌표 테이블을 docx에서 추출해 정적 데이터로 프로젝트에 심어야 한다. 그 좌표의 좌표계도 문서에 명시가 없다 — **실측 필요**.
2. **"산림공간정보_등산로정보"(15158970)에는 공간정보가 없다.** 이름과 달리 응답 필드가 산명 + URL + 파일링크 + 이미지링크 4개뿐이다. 등산로 라인을 지도에 그릴 목적이라면 이 API로는 불가능하고, `mntnfile`이 가리키는 파일을 별도로 받아 형식과 좌표계를 실측해야 한다. 백두대간(15158969)도 마찬가지.
3. **KMOS(한국등산트레킹지원센터) 4개 API의 경도 필드명은 `lot`이다.** `lon`/`lng`가 아니다. `lat`/`lot` 오타처럼 보이지만 이게 정식 스펙이다.
4. **11개 중 좌표계를 명시한 API는 하나도 없다.** KMOS 4개는 샘플값이 국내 십진도 경위도와 정확히 맞아떨어져 WGS84로 추정되지만 문서 근거가 없다. EPSG:5186 등 국내 좌표계인 API는 발견되지 않았으나(애초에 좌표를 주는 API가 KMOS 4개뿐), 실제 호출 후 검증이 필요하다.
5. **기상청 단기예보의 `nx`/`ny`는 WGS84가 아니다.** Lambert Conformal Conic 5km 격자 좌표라서 위경도에서 격자로 변환하는 코드를 반드시 넣어야 한다.

### 파라미터 명명 불일치

6. **서비스키 파라미터 이름의 대소문자가 API마다 다르다.** 대문자 `ServiceKey`: 15084696, 15058662, 15084817, 15084084 / 소문자 `serviceKey`: 15158915, 15158969, 15158970, 15097966, 15097947, 15097949, 15108067. 공통 클라이언트를 만들 때 API별로 분기해야 한다.
7. **응답 포맷 파라미터 이름이 3가지다.** `_type` (산악기상정보, 산불위험예보) / `type` (KMOS 4개) / `dataType` (기상청). 산림청 GW 계열(15058662, 15158915/969/970)은 아예 **XML 전용**이고 포맷 파라미터 자체가 없다.
8. **요청 파라미터명과 응답 필드명이 다른 경우가 있다.** 산악기상정보 `localArea`(요청) → `localarea`(응답), 산정보 `mntiListNo`(요청) → `mntilistno`(응답), 기상청 `ftype`(요청) → `filetype`(응답).
9. **15158915의 `searchWrd`는 검색어가 아니라 산코드를 받는다.** 샘플이 `469000401(예:남망산)`이다. 같은 이름의 파라미터가 15158969에서는 실제로 산이름 검색어다.
10. **KMOS 4개 API 사이에서도 응답 필드명이 통일되어 있지 않다.** 15108067만 `plcTypeCd`/`plcNm`/`explnCn`을 쓰고, 나머지 3개는 `orgnPlaceTpeCd`/`placeNm`/`dscrtCn`을 쓴다.

### 심의·트래픽

11. **LINK 유형은 하나도 없다. 11개 전부 REST**라 data.go.kr 활용신청만 하면 되고 별도 기관 가입은 필요 없다.
12. **15158970(산림공간정보 등산로정보)만 개발단계가 심의승인이다.** 나머지 10개는 개발단계 자동승인이라 신청 즉시 쓸 수 있다. 다만 KMOS 4개(15097966/947/949, 15108067)와 15158970은 **운영단계**가 심의승인이므로 실서비스 전환 시 심사를 거쳐야 한다.
13. **개발계정 일일 1,000건짜리가 4개 있다** (15084817 산불위험, 15158915 명산등산로, 15158969 백두대간, 15158970 산림공간정보). 지도 화면에서 사용자마다 호출하는 구조라면 금방 소진된다 — 서버 사이드 캐싱 전제로 설계해야 한다.

### 기타

14. **15158969와 15158970은 서비스 URL이 `.../1400000/trailInfoService`로 동일하다.** 데이터셋은 둘이므로 각각 활용신청이 필요한지, 하나의 키로 두 경로가 다 열리는지 신청 후 확인 필요.
15. **15084817의 시간범위가 포털상 "2021년 8월 ~ 2025년 2월"로 표기되어 있다.** 실시간 예보 API인데 과거 범위처럼 적혀 있어, 현재도 갱신되는지 실제 호출로 확인 필요.
16. **15097947의 오퍼레이션 설명이 "10대명산 숲길POI 정보를 조회"로 오타 등록되어 있다.** 실제 데이터는 100대명산이다.
17. **참고문서 다운로드 URL 패턴**은 `https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId={FILE_ID}&fileDetailSn=1` 이다. 다만 포털이 다운로드 횟수를 제한하고 CAPTCHA를 요구할 수 있다.
18. **15158915/969/970과 15058662, 15084817, 15108067은 포털 상세 페이지에 요청/응답 표가 HTML로 렌더링되지 않고 Swagger 2.0 JSON으로 임베드되어 있다.** 페이지 텍스트만 긁으면 스펙이 안 보인다. HTML 소스의 `const swaggerJson = \`...\`` 안에 전체 명세가 들어 있다.
