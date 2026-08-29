/**
 * 등산로 고도 프로파일 계산.
 *
 * 코스 지오메트리의 정점은 [lon, lat, ele] 이고, GPS 점프를 끊은 코스는 MultiLineString 이다.
 * 조각 사이는 실제로 이어지지 않은 구간이므로 거리를 누적하되 프로파일에서는 끊어 그린다 —
 * 이어 붙이면 없는 오르막/내리막이 생긴다.
 */

/** 프로파일의 한 점. distanceKm 는 코스 시작점부터의 누적 거리. */
export interface ProfilePoint {
  distanceKm: number;
  elevationM: number;
}

export interface ElevationProfile {
  /** 조각별 점 목록. 조각이 하나면 길이 1. */
  segments: ProfilePoint[][];
  totalKm: number;
  minM: number;
  maxM: number;
  /** 3m 미만 상승은 GPS 노이즈로 보고 버린다. 데이터 파이프라인과 같은 기준. */
  gainM: number;
  lossM: number;
}

const GAIN_THRESHOLD_M = 3;

function haversineMeters(a: number[], b: number[]): number {
  const radius = 6_371_000;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

function linesOf(geometry: GeoJSON.Geometry): number[][][] {
  if (geometry.type === 'LineString') return [geometry.coordinates];
  if (geometry.type === 'MultiLineString') return geometry.coordinates;
  return [];
}

/** 임계값 이상 변화만 누적한다. 작은 진동을 그대로 더하면 상승량이 부풀려진다. */
function accumulate(elevations: number[]): { gain: number; loss: number } {
  let gain = 0;
  let loss = 0;
  let anchor = elevations[0];

  for (const value of elevations) {
    const delta = value - anchor;
    if (Math.abs(delta) < GAIN_THRESHOLD_M) continue;
    if (delta > 0) gain += delta;
    else loss -= delta;
    anchor = value;
  }
  return { gain, loss };
}

export function buildProfile(geometry: GeoJSON.Geometry): ElevationProfile | null {
  const lines = linesOf(geometry);
  if (lines.length === 0) return null;

  const segments: ProfilePoint[][] = [];
  const allElevations: number[] = [];
  let cumulativeM = 0;

  for (const line of lines) {
    const points: ProfilePoint[] = [];
    for (let i = 0; i < line.length; i += 1) {
      const coord = line[i];
      if (i > 0) cumulativeM += haversineMeters(line[i - 1], coord);
      // 고도가 없는 정점은 프로파일에 못 쓴다. 거리는 계속 누적한다.
      if (coord.length < 3) continue;
      points.push({ distanceKm: cumulativeM / 1000, elevationM: coord[2] });
      allElevations.push(coord[2]);
    }
    if (points.length >= 2) segments.push(points);
  }

  if (allElevations.length < 2) return null;

  // 상승·하강은 조각별로 따로 계산해 합친다. 조각 경계의 고도 차이는 실제 오르내림이 아니다.
  let gainM = 0;
  let lossM = 0;
  for (const segment of segments) {
    const { gain, loss } = accumulate(segment.map((p) => p.elevationM));
    gainM += gain;
    lossM += loss;
  }

  return {
    segments,
    totalKm: cumulativeM / 1000,
    minM: Math.min(...allElevations),
    maxM: Math.max(...allElevations),
    gainM: Math.round(gainM),
    lossM: Math.round(lossM),
  };
}
