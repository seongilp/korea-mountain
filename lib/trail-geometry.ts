/** 브이월드 3D 에 등산로를 얹기 위한 GeoJSON 전처리. maplibre 와 무관하게 순수 함수로 둔다. */

/** 브이월드에 넘길 한 가닥의 선. `[lon, lat]` 만 쓴다. */
export interface TrailLine {
  points: [number, number][];
  /** `#rrggbb`. 누적상승 기준 난이도 색. */
  color: string;
  /** 어느 코스의 가닥인지. 선택 강조에 쓴다. */
  courseId: string;
}

/** 코스 하나당 점 상한. 실제 데이터 최대는 1,839점인데 Cesium 지면고정 선은 점 수에 민감하다. */
const MAX_POINTS = 400;

/** trail-map.tsx 의 line-color interpolate 와 같은 스톱. 두 지도가 다른 색을 쓰면 범례가 거짓말이 된다. */
const DIFFICULTY_STOPS: [number, [number, number, number]][] = [
  [0, [0x4a, 0xde, 0x80]],
  [300, [0xfb, 0xbf, 0x24]],
  [700, [0xfb, 0x92, 0x3c]],
  [1200, [0xf8, 0x7f, 0x71]],
];

/**
 * 고도 정보가 없는 코스의 색. 난이도 팔레트(초록~빨강) 밖의 중립 회색이다.
 *
 * 이게 없으면 누적상승 0 이 팔레트 맨 앞의 초록, 즉 '가장 쉬움' 으로 칠해진다.
 * 대암산 1코스가 그랬다 — 28.7km 인데 초록이었다. 결측을 0 으로 단언한 셈이라
 * 사용자를 오도한다. 미상은 미상으로 보여야 한다.
 */
export const UNKNOWN_DIFFICULTY_COLOR = '#94a3b8';

/**
 * 이 코스에 고도 기록이 있나.
 *
 * 원본 GPX 고도가 전부 0.0 인 코스가 있다(7,355개 중 1개, 대암산). 그런 코스는
 * 최고고도와 최저고도가 **둘 다** 정확히 0 이다. 실제 코스라면 해발 0m 를 한 번도
 * 벗어나지 않는 등산로여야 하는데 그런 건 없으므로, 이 조합을 결측 신호로 쓴다.
 */
export function hasElevation(properties: GeoJSON.GeoJsonProperties): boolean {
  const max = Number(properties?.['최고고도_m']);
  const min = Number(properties?.['최저고도_m']);
  if (!Number.isFinite(max) || !Number.isFinite(min)) return false;
  return !(max === 0 && min === 0);
}

function toHex(channel: number): string {
  return Math.round(channel).toString(16).padStart(2, '0');
}

/** 누적상승(m) → 난이도 색. maplibre 의 `['interpolate', ['linear'], …]` 을 그대로 옮긴 것. */
export function difficultyColor(gainM: number): string {
  const first = DIFFICULTY_STOPS[0];
  const last = DIFFICULTY_STOPS[DIFFICULTY_STOPS.length - 1];
  if (gainM <= first[0]) return `#${first[1].map(toHex).join('')}`;
  if (gainM >= last[0]) return `#${last[1].map(toHex).join('')}`;

  for (let i = 1; i < DIFFICULTY_STOPS.length; i += 1) {
    const [toStop, toColor] = DIFFICULTY_STOPS[i];
    if (gainM > toStop) continue;
    const [fromStop, fromColor] = DIFFICULTY_STOPS[i - 1];
    const t = (gainM - fromStop) / (toStop - fromStop);
    return `#${fromColor.map((c, k) => toHex(c + (toColor[k] - c) * t)).join('')}`;
  }
  return `#${last[1].map(toHex).join('')}`;
}

/**
 * 점 수를 상한 이하로 균등하게 솎는다. 첫 점과 끝 점은 반드시 남긴다 —
 * 끝점을 잃으면 등산로가 정상 못 미쳐 끊긴 것처럼 보인다.
 */
function decimate(points: [number, number][]): [number, number][] {
  if (points.length <= MAX_POINTS) return points;
  const step = (points.length - 1) / (MAX_POINTS - 1);
  const out: [number, number][] = [];
  for (let i = 0; i < MAX_POINTS - 1; i += 1) out.push(points[Math.round(i * step)]);
  out.push(points[points.length - 1]);
  return out;
}

/** GeoJSON 좌표 배열(`[lon, lat, ele]`)에서 고도를 버리고 `[lon, lat]` 만 남긴다. */
function toPairs(coordinates: GeoJSON.Position[]): [number, number][] {
  return coordinates
    .filter((c) => Number.isFinite(c[0]) && Number.isFinite(c[1]))
    .map((c) => [c[0], c[1]] as [number, number]);
}

/**
 * 코스 FeatureCollection → 브이월드에 그릴 선 목록.
 *
 * 코스의 40%가 MultiLineString 이다 (GPS 점프 구간을 끊어 둔 것). 이어 붙이면 산을 가로지르는
 * 가짜 직선이 생기므로 가닥마다 별개의 선으로 그린다.
 */
export function toTrailLines(courses: GeoJSON.FeatureCollection | null | undefined): TrailLine[] {
  if (!courses) return [];
  const lines: TrailLine[] = [];

  for (const feature of courses.features) {
    const geometry = feature.geometry;
    if (!geometry) continue;

    const gain = Number(feature.properties?.['누적상승_m'] ?? 0);
    const color = hasElevation(feature.properties)
      ? difficultyColor(Number.isFinite(gain) ? gain : 0)
      : UNKNOWN_DIFFICULTY_COLOR;
    const courseId = String(feature.properties?.['코스ID'] ?? '');

    const strands: GeoJSON.Position[][] =
      geometry.type === 'LineString'
        ? [geometry.coordinates]
        : geometry.type === 'MultiLineString'
          ? geometry.coordinates
          : [];

    for (const strand of strands) {
      const points = decimate(toPairs(strand));
      // 브이월드의 LineStringZ.setPoints 는 점이 2개 미만이면 조용히 무시한다.
      if (points.length > 1) lines.push({ points, color, courseId });
    }
  }

  return lines;
}

/** 선 목록을 감싸는 `[west, south, east, north]`. 비어 있으면 null. */
export function boundsOf(lines: TrailLine[]): [number, number, number, number] | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  for (const line of lines) {
    for (const [lon, lat] of line.points) {
      if (lon < west) west = lon;
      if (lon > east) east = lon;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
  }

  return Number.isFinite(west) ? [west, south, east, north] : null;
}
