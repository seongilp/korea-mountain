/**
 * 이 앱이 쓰는 모든 데이터의 출처·기준일·라이선스 단일 출처(single source of truth).
 *
 * 이 파일을 따로 두는 이유는 두 가지다.
 *
 * 1. **이용 조건**: 공공데이터포털(data.go.kr) 데이터는 출처 표시가 이용 조건이다.
 *    화면 여기저기에 문구를 흩어 놓으면 데이터셋을 추가할 때 빠뜨린다.
 * 2. **안전**: 등산로 데이터는 대부분 과거 기준인데 지도에 그려 놓으면 현재형처럼 보인다.
 *    특히 국립공원 탐방로는 2017년 기준이라 통제 여부가 지금과 다를 수 있다.
 *    기준일(`asOf`)을 데이터와 같은 자리에 강제로 적게 해서, 화면이 항상 기준일을
 *    같이 보여줄 수 있게 한다.
 *
 * 값을 채울 때 **추측하지 마라.** 확인되지 않은 기준일은 `ASOF_UNKNOWN` 을 쓰고,
 * 근거가 되는 정황은 `note` 에 적는다.
 */

/** 기준일을 확인하지 못했을 때 쓰는 값. 임의의 날짜로 채우지 마라. */
export const ASOF_UNKNOWN = '확인 필요';

/** 데이터 성격. 화면에서 배지 색/그룹을 나누는 데 쓴다. */
export type DataSourceKind =
  /** 등산로·코스 지오메트리. 안전 고지가 가장 중요한 부류다. */
  | 'trail'
  /** 코드표·지점 좌표 등 참조용 정적 데이터. */
  | 'reference'
  /** 실시간 관측/예보 API. */
  | 'live'
  /** 배경지도·지형 타일 등 지도 서비스. */
  | 'basemap';

export interface DataSource {
  /** 화면/코드에서 참조할 키. */
  id: string;
  /** 사람이 읽는 이름. */
  label: string;
  /** 제공기관. */
  provider: string;
  /** data.go.kr 데이터 ID 등. 포털 데이터가 아니면 빈 문자열. */
  datasetId: string;
  /** 원본 데이터셋 페이지. */
  url: string;
  /** 기준일. 알 수 없으면 `ASOF_UNKNOWN`. */
  asOf: string;
  /** 실시간 여부. false 면 화면에서 "과거 기록" 으로 다뤄야 한다. */
  realtime: boolean;
  kind: DataSourceKind;
  /** 이용 조건 표기 문구. 확인 못 한 경우 생략한다. */
  license?: string;
  /** 주의사항. 이 데이터를 믿으면 안 되는 지점을 적는다. */
  note?: string;
}

export const DATA_SOURCES: DataSource[] = [
  {
    id: 'np-trails',
    label: '국립공원 탐방로 공간데이터',
    provider: '국립공원공단',
    datasetId: '15003467',
    url: 'https://www.data.go.kr/data/15003467/fileData.do',
    // 배포 ZIP 안의 파일명이 `..._2017년.csv` 라 2017년 기준인 것은 확실하다.
    // 다만 2017년 중 언제인지는 원본에 적혀 있지 않다.
    asOf: '2017년',
    realtime: false,
    kind: 'trail',
    note:
      '탐방로 통제여부가 2017년 시점 값입니다. 지금 열린 구간이 통제로, 통제된 구간이 개방으로 보일 수 있습니다. ' +
      '현재 통제 정보는 국립공원공단에서 확인하세요. (2017년 중 정확한 기준일은 원본에 없습니다.)',
  },
  {
    id: 'peaks',
    label: '전국 주요 봉우리 코스',
    provider: '한국등산트레킹지원센터',
    datasetId: '15108086',
    url: 'https://www.data.go.kr/data/15108086/fileData.do',
    // 데이터셋 이름 자체에 `_20221116` 이 붙어 있다.
    asOf: '2022-11-16',
    realtime: false,
    kind: 'trail',
    note: '개인 GPS 기록(트랙) 기반이라 공식 등산로가 아닌 길이 섞여 있을 수 있습니다.',
  },
  {
    id: 'myeongsan100',
    label: '산림청 100대명산 등산코스',
    provider: '한국등산트레킹지원센터 / 산림청',
    datasetId: '15098177',
    url: 'https://www.data.go.kr/data/15098177/fileData.do',
    // 배포 ZIP 안 GPX 607개의 타임스탬프가 모두 2022-01-10 이지만
    // 이는 압축 시점일 뿐 데이터 기준일이라는 근거가 없다.
    asOf: ASOF_UNKNOWN,
    realtime: false,
    kind: 'trail',
    note:
      '산 이름으로 묶인 GPX 트랙 모음입니다. 같은 산 이름 아래 정상 코스가 아닌 둘레길 성격 트랙이 ' +
      '섞여 있는 경우가 확인됐습니다(예: 지리산(천왕봉)). 배포 파일의 타임스탬프는 2022-01-10 이지만 ' +
      '압축 시점일 뿐이라 기준일로 쓰지 않습니다.',
  },
  {
    id: 'park-codes',
    label: '국립공원 정밀관리도 코드정의서 v2.5',
    provider: '국립공원공단',
    datasetId: '15003467',
    url: 'https://www.data.go.kr/data/15003467/fileData.do',
    // 문서 표지의 개정일. 문서번호 NP_DBO_B_006.
    asOf: '2013-05-14',
    realtime: false,
    kind: 'reference',
    note: '공원사무소코드 → 사무소명 매핑에만 씁니다. 이후 신설·개편된 사무소는 반영되어 있지 않습니다.',
  },
  {
    id: 'mtweather',
    label: '산악기상정보 (실시간 관측)',
    provider: '산림청 국립산림과학원',
    datasetId: '15084696',
    url: 'https://www.data.go.kr/data/15084696/openapi.do',
    asOf: '실시간',
    realtime: true,
    kind: 'live',
    note: '관측지점 좌표는 API 응답이 아니라 기술문서(v1.5)의 표에서 가져왔고, 소수점 2자리라 약 1km 오차가 있습니다.',
  },
  {
    id: 'danger-poi',
    label: '전국 주요 봉우리 위험지역 POI',
    provider: '한국등산트레킹지원센터',
    datasetId: '15108067',
    url: 'https://www.data.go.kr/data/15108067/openapi.do',
    // OpenAPI 로 그때그때 받아오지만 내용은 갱신 주기가 있는 정적 목록이다.
    // 포털에 갱신 기준일이 명시돼 있지 않아 단정하지 않는다.
    asOf: ASOF_UNKNOWN,
    realtime: false,
    kind: 'reference',
    note: '위험지역이 표시되지 않았다고 해서 안전한 구간이라는 뜻은 아닙니다.',
  },
  {
    id: 'vworld',
    label: '브이월드 3D 지도',
    provider: '국토교통부 공간정보 오픈플랫폼',
    datasetId: '',
    url: 'https://www.vworld.kr',
    asOf: ASOF_UNKNOWN,
    realtime: false,
    kind: 'basemap',
    note: '3D 지형 보기에만 사용합니다.',
  },
  {
    id: 'carto-basemap',
    label: '배경지도 (Dark Matter)',
    provider: 'CARTO',
    datasetId: '',
    url: 'https://carto.com/attributions',
    asOf: ASOF_UNKNOWN,
    realtime: false,
    kind: 'basemap',
    license: '© CARTO, © OpenStreetMap contributors',
    note: '지도 타일 데이터는 OpenStreetMap 기여자들이 만든 것입니다.',
  },
  {
    id: 'osm',
    label: 'OpenStreetMap',
    provider: 'OpenStreetMap contributors',
    datasetId: '',
    url: 'https://www.openstreetmap.org/copyright',
    asOf: '지속 갱신',
    realtime: false,
    kind: 'basemap',
    license: 'ODbL 1.0',
  },
  {
    id: 'terrain-tiles',
    label: '지형 고도 타일 (Terrarium)',
    provider: 'AWS Open Data — Terrain Tiles',
    datasetId: '',
    url: 'https://registry.opendata.aws/terrain-tiles/',
    asOf: ASOF_UNKNOWN,
    realtime: false,
    kind: 'basemap',
    note: '지도 음영기복 표현용입니다. 코스 고도 수치는 이 타일이 아니라 GPX 원본 값을 씁니다.',
  },
];

/** 실시간이 아닌 데이터셋. 안전 고지에서 "과거 기록" 으로 묶어 보여주는 대상. */
export const ARCHIVAL_SOURCES = DATA_SOURCES.filter((s) => !s.realtime);

/** id 로 하나 찾기. 없으면 undefined — 호출부에서 처리하라. */
export function findDataSource(id: string): DataSource | undefined {
  return DATA_SOURCES.find((s) => s.id === id);
}

/** 산행 전 현재 통제 정보를 확인할 공식 창구. */
export const OFFICIAL_LINKS = [
  {
    label: '국립공원공단',
    description: '국립공원 탐방로 통제·개방 현황',
    url: 'https://www.knps.or.kr',
  },
  {
    label: '산림청 숲나들e',
    description: '국유림 등산로·휴양림 이용 정보',
    url: 'https://www.foresttrip.go.kr',
  },
] as const;
