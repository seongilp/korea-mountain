/**
 * 산 고도(해발 m) → 색. 지도 핀·목록 dot·범례가 전부 이 표 하나를 본다.
 *
 * 계급 경계는 전국 봉우리(public/data/peaks.json, 4,490곳) 고도 분위수를 보고 잡았다.
 *   q10 266 · q25 360 · q50 516 · q75 721 · q90 980 · q99 1,488
 * 300 / 600 / 1,000 / 1,500 으로 끊으면 대략 15% · 40% · 35% · 9% · 1% 로 나뉘고,
 * 100대명산(99곳)도 0 · 12 · 43 · 37 · 8 로 마지막 구간까지 비지 않는다.
 *
 * 색은 다크 베이스맵(CARTO dark-matter) 위에서 읽히는 저→고 램프다.
 * 파랑 계열은 내 위치 점·선택 강조(#3182f6)와 겹치므로 쓰지 않는다.
 */

export interface ElevationBin {
  /** 이 구간의 하한(해발 m, 포함). 첫 구간은 0. */
  fromM: number;
  /** 범례 문구. */
  label: string;
  color: string;
}

/** 오름차순. `fromM` 이상이면 그 구간에 속한다(다음 구간 하한 미만). */
export const ELEVATION_BINS: readonly ElevationBin[] = [
  { fromM: 0, label: '~300m', color: '#34d399' }, // emerald-400
  { fromM: 300, label: '300~600m', color: '#a3e635' }, // lime-400
  { fromM: 600, label: '600~1000m', color: '#fbbf24' }, // amber-400
  { fromM: 1000, label: '1000~1500m', color: '#fb923c' }, // orange-400
  { fromM: 1500, label: '1500m+', color: '#f43f5e' }, // rose-500
];

/** 고도 기록이 없는(null / 0) 산. 램프 밖 중립 슬레이트. */
export const UNKNOWN_ELEVATION_COLOR = '#94a3b8'; // slate-400

/**
 * 고도를 색으로.
 *
 * `null`·`undefined`·`0`·NaN 은 미상으로 본다. 0 을 미상으로 읽는 이유는
 * lib/mountains.ts `peakLabel` 과 같다 — GPX 고도가 통째로 비어 0.0 으로 들어온 산이 있다.
 */
export function elevationColorFor(elevationM: number | null | undefined): string {
  if (elevationM === null || elevationM === undefined) return UNKNOWN_ELEVATION_COLOR;
  if (!Number.isFinite(elevationM) || elevationM <= 0) return UNKNOWN_ELEVATION_COLOR;
  const bin = [...ELEVATION_BINS].reverse().find((b) => elevationM >= b.fromM);
  return bin?.color ?? UNKNOWN_ELEVATION_COLOR;
}

/**
 * maplibre `circle-color` 용 step 표현식. 산 feature 의 `elevation` 속성을 읽는다.
 *
 * step 은 첫 인자가 숫자여야 하므로 미상(null/0)은 case 로 먼저 걸러 슬레이트로 보낸다.
 * 반환값을 그대로 `paint['circle-color']` 에 넣거나, 선택 강조 case 안에 중첩하면 된다.
 */
export function elevationStepExpression(property = 'elevation'): unknown[] {
  const [first, ...rest] = ELEVATION_BINS;
  const stops = rest.flatMap((b) => [b.fromM, b.color]);
  return [
    'case',
    ['<=', ['coalesce', ['get', property], 0], 0],
    UNKNOWN_ELEVATION_COLOR,
    ['step', ['get', property], first.color, ...stops],
  ];
}
