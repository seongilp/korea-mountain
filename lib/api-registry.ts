/**
 * data.go.kr API 별 호출 규약.
 *
 * 이 포털은 겉보기와 달리 API 마다 관례가 다르다. 실측으로 확인한 차이:
 *  - 서비스키 파라미터명: `serviceKey` / `ServiceKey`
 *  - 응답 포맷 파라미터: `_type=json` / `type=json` / `dataType=JSON`, 아예 없는 것(XML 전용)
 *  - 성공 resultCode: `00` / `0`
 * 하나로 뭉뚱그리면 조용히 XML 을 받거나 정상 응답을 에러로 오판한다.
 */

export type JsonFormatParam = '_type' | 'type' | 'dataType' | null;

export interface ApiDescriptor {
  /** data.go.kr 데이터 ID. 문서 추적용. */
  id: string;
  label: string;
  endpoint: string;
  serviceKeyParam: 'serviceKey' | 'ServiceKey';
  /** null 이면 JSON 을 지원하지 않는다(XML 전용). */
  jsonParam: JsonFormatParam;
  jsonValue: string;
  /** 정상으로 취급할 resultCode 집합. */
  okCodes: readonly string[];
  /** 개발계정 일일 트래픽. 캐시 수명을 정하는 근거. */
  dailyQuota: number;
}

const KMOS_OK = ['0', '00'] as const;

/** 한국등산트레킹지원센터(B553662) 계열: type=json, resultCode 0, lat/lot 은 WGS84(실측 확인). */
function kmos(id: string, label: string, path: string): ApiDescriptor {
  return {
    id,
    label,
    endpoint: `https://apis.data.go.kr/B553662/${path}`,
    serviceKeyParam: 'serviceKey',
    jsonParam: 'type',
    jsonValue: 'json',
    okCodes: KMOS_OK,
    dailyQuota: 10_000,
  };
}

export const API = {
  /** 산악기상 관측지점 목록 + 실시간 관측값. 응답에 좌표가 없어 별도 지점 테이블이 필요하다. */
  mtWeather: {
    id: '15084696',
    label: '산악기상정보',
    endpoint: 'https://apis.data.go.kr/1400377/mtweather/mountListSearch',
    serviceKeyParam: 'serviceKey',
    jsonParam: '_type',
    jsonValue: 'json',
    okCodes: ['00'],
    dailyQuota: 10_000,
  },

  /** 100대명산 숲길 POI. 갈림길·쉼터·조망점 등. */
  forestTrailPoi: kmos(
    '15097947',
    '100대명산 숲길POI',
    'fmmtnFrtrlPoiInfoService/getFmmtnFrtrlPoiInfoList',
  ),

  /** 숲길 연결망 POI. */
  networkPoi: kmos('15097966', '숲길 연결망 POI', 'poiInfoService/getPoiInfoList'),

  /** 100대명산 관광 POI. */
  tourPoi: kmos('15097949', '100대명산 관광POI', 'sghtngPoiInfoService/getSghtngPoiInfoList'),

  /** 전국 주요 봉우리 위험지역 POI. 총 44,804건. */
  dangerPoi: kmos('15108067', '봉우리 위험지역 POI', 'dangerInfoService/getDangerInfoList'),

  /** 기상청 초단기실황. 위경도가 아니라 격자 nx/ny 를 받는다. lib/kma-grid.ts 참고. */
  kmaNowcast: {
    id: '15084084',
    label: '기상청 초단기실황',
    endpoint: 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst',
    serviceKeyParam: 'serviceKey',
    jsonParam: 'dataType',
    jsonValue: 'JSON',
    okCodes: ['00'],
    dailyQuota: 10_000,
  },

  /** 기상청 단기예보. */
  kmaForecast: {
    id: '15084084',
    label: '기상청 단기예보',
    endpoint: 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst',
    serviceKeyParam: 'serviceKey',
    jsonParam: 'dataType',
    jsonValue: 'JSON',
    okCodes: ['00'],
    dailyQuota: 10_000,
  },
} satisfies Record<string, ApiDescriptor>;

export type ApiName = keyof typeof API;
