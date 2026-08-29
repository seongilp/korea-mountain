/** 목록 화면이 쓰는 경량 산 인덱스. public/data/mountains.json 과 같은 스키마. */
export interface MountainSummary {
  name: string;
  courses: number;
  totalKm: number;
  longestKm: number;
  /**
   * 기록된 코스가 도달한 최고 고도. **봉우리의 실제 높이가 아니다.**
   * 예: '지리산(천왕봉)' 의 28개 코스는 둘레길 성격이라 834m 에서 끝나지만
   * 천왕봉 자체는 1,915m 다. 화면에서는 '코스 최고점' 으로 표기한다.
   * GPX 에 고도가 없으면 null. 0 으로 채우면 정렬이 망가진다.
   */
  peakM: number | null;
  lon: number;
  lat: number;
  /** 전국 봉우리 데이터에만 있는 선택 필드. */
  region?: string;
  /** 이름을 파일명으로 못 쓰는 경우의 실제 파일명. */
  file?: string;
  /** 100대명산과 이름이 겹치는 봉우리 표시. */
  hasMyeongsan?: boolean;
}

export interface MountainBundle {
  name: string;
  courses: GeoJSON.FeatureCollection;
  pois: GeoJSON.FeatureCollection;
}

/**
 * 산별 코스 번들 경로.
 *
 * public/ 아래의 정적 파일이라 CDN 이 직접 서빙한다. 서버 함수를 거치지 않으므로
 * 호출 비용이 0 이고, Vercel 함수 번들 포함 여부(outputFileTracing)를 신경 쓸 필요도 없다.
 */
export function courseBundleUrl(name: string): string {
  return `/data/courses/${encodeURIComponent(name)}.json`;
}

/**
 * 봉우리별 코스 번들 경로.
 *
 * 봉우리 이름에 괄호나 슬래시가 섞여 있어 파일명으로 바로 못 쓰는 경우가 있다.
 * 인덱스가 `file` 을 주면 그것을 쓰고, 없으면 이름을 그대로 인코딩한다.
 */
export function peakCourseUrl(name: string, file?: string): string {
  // 인덱스의 `file` 은 확장자까지 포함한 실제 파일명이다 (예: '제석봉_5383010669.json').
  // 이름만 있는 경우에만 확장자를 붙인다.
  return `/data/peak-courses/${encodeURIComponent(file ?? `${name}.json`)}`;
}

/**
 * 목록/지도에서 항목을 식별하는 고유 키.
 *
 * 봉우리 이름은 유일하지 않다 — 국사봉 54개, 옥녀봉 46개처럼 492종 1,915개가 겹친다.
 * 봉우리의 실체는 10자리 코드이고, `file` 이 그 코드를 포함한 파일명이다.
 * 이름으로 선택하면 동명 봉우리 중 첫 번째만 잡힌다.
 */
export function mountainKey(mountain: MountainSummary): string {
  return mountain.file ?? mountain.name;
}
