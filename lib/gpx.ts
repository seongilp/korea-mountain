/**
 * 사용자 GPS 트랙(GPX·KML) 파서.
 *
 * 개인 위치 기록이라 **서버에 올리지 않고 브라우저 안에서만** 파싱한다. 그래서 이 파일은
 * 네트워크도 DOM 도 건드리지 않는 순수 함수만 둔다 — DOMParser 를 쓰지 않는 이유는
 * node 테스트 러너에 DOMParser 가 없어서다. GPX 는 구조가 얕고 태그 이름이 고정돼
 * 있어 정규식으로 충분히 안전하게 읽을 수 있다.
 *
 * 지원 범위:
 *  - GPX: trk/trkseg/trkpt, rte/rtept(경로는 세그먼트 하나로), wpt(웨이포인트).
 *  - KML: LineString/coordinates, gx:Track(gx:coord + when), Placemark/Point(웨이포인트).
 *    KML 은 이 정도만 — Polygon·NetworkLink 같은 건 등산 트랙에 안 나온다.
 */

export interface TrackPoint {
  lon: number;
  lat: number;
  /** 고도(m). 기록에 없으면 생략. */
  ele?: number;
  /** ISO 8601 문자열. 기록에 없으면 생략. */
  time?: string;
}

export interface Waypoint {
  lon: number;
  lat: number;
  ele?: number;
  name: string;
}

export interface TrackStats {
  /** 세그먼트 안에서만 누적한 거리. 끊긴 구간 사이 직선은 걷지 않은 길이라 더하지 않는다. */
  distanceKm: number;
  /** 고도 기록이 없으면 null. 0 으로 두면 "평지" 로 오독된다. */
  gainM: number | null;
  lossM: number | null;
  maxM: number | null;
  minM: number | null;
  /** 첫 점과 끝 점의 시각 차(초). 시각이 없으면 null. */
  durationSec: number | null;
  start: [number, number];
  end: [number, number];
}

export interface ParsedTrack {
  name: string;
  filename: string;
  format: 'gpx' | 'kml';
  /** 모든 세그먼트의 점을 순서대로 편 것. */
  points: TrackPoint[];
  /** 세그먼트별 `[lon, lat(, ele)]` 좌표 배열. GeoJSON 좌표와 같은 꼴이라 지도에 바로 올린다. */
  segments: number[][][];
  waypoints: Waypoint[];
  stats: TrackStats;
  /** 점 수 상한을 넘겨 균등 샘플링했는지. 사용자에게 알려야 거리 오차를 이해한다. */
  sampled: boolean;
}

/** 이 이상은 받지 않는다. 등산 트랙은 하루치가 커야 수백 KB 다. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** 이 이상이면 균등 샘플링한다. maplibre 는 괜찮지만 고도 프로파일 SVG 가 점마다 path 명령을 만든다. */
export const MAX_POINTS = 50_000;

/** 3m 미만 진동은 GPS 노이즈로 보고 버린다. lib/elevation.ts 와 같은 기준이어야 두 값이 안 어긋난다. */
const GAIN_THRESHOLD_M = 3;

/** 기존 코스 feature 와 같은 키로 채운 properties 를 구분하는 코스ID. 실제 코스ID 와 절대 안 겹친다. */
export const USER_TRACK_COURSE_ID = 'user-track';

/** 사용자에게 그대로 보여줄 수 있는 오류. 다른 예외는 "파일을 읽을 수 없습니다" 로 뭉뚱그린다. */
export class TrackParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrackParseError';
  }
}

/* ────────────────────────── 최소 XML 유틸 ────────────────────────── */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** `<tag>…</tag>` 안의 텍스트. 접두사(gx: 등)는 호출자가 넣는다. 없으면 undefined. */
function childText(xml: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(xml);
  if (!match) return undefined;
  const raw = match[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').trim();
  return decodeEntities(raw);
}

/** 태그 블록(여는 태그의 속성, 본문)을 문서 순서대로 돈다. 자기닫힘 태그는 본문이 빈 문자열. */
function* blocks(xml: string, tag: string): Generator<{ attrs: string; body: string }> {
  const pattern = new RegExp(`<${tag}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${tag}>)`, 'g');
  for (let match = pattern.exec(xml); match; match = pattern.exec(xml)) {
    yield { attrs: match[1] ?? '', body: match[2] ?? '' };
  }
}

function attr(attrs: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"|\\b${name}\\s*=\\s*'([^']*)'`).exec(attrs);
  return match ? (match[1] ?? match[2]) : undefined;
}

/* ────────────────────────── 점 검증 ────────────────────────── */

function isValidLonLat(lon: number, lat: number): boolean {
  return Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90;
}

/** 좌표가 깨진 점은 버리고, 고도·시각은 읽을 수 있을 때만 붙인다. */
function makePoint(lon: number, lat: number, ele?: string, time?: string): TrackPoint | null {
  if (!isValidLonLat(lon, lat)) return null;
  const point: TrackPoint = { lon, lat };
  const elevation = ele === undefined ? Number.NaN : Number(ele);
  if (Number.isFinite(elevation)) point.ele = elevation;
  if (time && Number.isFinite(Date.parse(time))) point.time = time;
  return point;
}

/* ────────────────────────── GPX ────────────────────────── */

function gpxPoints(body: string, tag: string): TrackPoint[] {
  const points: TrackPoint[] = [];
  for (const block of blocks(body, tag)) {
    const point = makePoint(
      Number(attr(block.attrs, 'lon')),
      Number(attr(block.attrs, 'lat')),
      childText(block.body, 'ele'),
      childText(block.body, 'time'),
    );
    if (point) points.push(point);
  }
  return points;
}

function parseGpx(xml: string): { name?: string; segments: TrackPoint[][]; waypoints: Waypoint[] } {
  const segments: TrackPoint[][] = [];
  let name: string | undefined;

  for (const trk of blocks(xml, 'trk')) {
    name ??= childText(trk.body, 'name');
    for (const seg of blocks(trk.body, 'trkseg')) segments.push(gpxPoints(seg.body, 'trkpt'));
  }
  // 경로(rte)는 계획된 선이라 세그먼트 하나로 본다.
  for (const rte of blocks(xml, 'rte')) {
    name ??= childText(rte.body, 'name');
    segments.push(gpxPoints(rte.body, 'rtept'));
  }
  name ??= childText(childText(xml, 'metadata') ?? '', 'name');

  const waypoints: Waypoint[] = [];
  for (const wpt of blocks(xml, 'wpt')) {
    const point = makePoint(Number(attr(wpt.attrs, 'lon')), Number(attr(wpt.attrs, 'lat')), childText(wpt.body, 'ele'));
    if (point) waypoints.push({ ...point, name: childText(wpt.body, 'name') ?? '' });
  }

  return { name, segments, waypoints };
}

/* ────────────────────────── KML ────────────────────────── */

/** `lon,lat[,alt]` 튜플이 공백으로 나열된 KML coordinates 텍스트. */
function kmlCoordinates(text: string): TrackPoint[] {
  const points: TrackPoint[] = [];
  for (const tuple of text.trim().split(/\s+/)) {
    if (!tuple) continue;
    const [lon, lat, alt] = tuple.split(',');
    const point = makePoint(Number(lon), Number(lat), alt);
    if (point) points.push(point);
  }
  return points;
}

/** gx:Track 은 `<when>` 과 `<gx:coord>` 가 같은 순서로 나란히 놓인다. 개수가 다르면 시각은 버린다. */
function kmlGxTrack(body: string): TrackPoint[] {
  const coords = [...blocks(body, 'gx:coord')].map((b) => b.body.trim());
  const whens = [...blocks(body, 'when')].map((b) => b.body.trim());
  const paired = whens.length === coords.length;
  const points: TrackPoint[] = [];
  coords.forEach((coord, index) => {
    const [lon, lat, alt] = coord.split(/\s+/);
    const point = makePoint(Number(lon), Number(lat), alt, paired ? whens[index] : undefined);
    if (point) points.push(point);
  });
  return points;
}

function parseKml(xml: string): { name?: string; segments: TrackPoint[][]; waypoints: Waypoint[] } {
  const segments: TrackPoint[][] = [];
  const waypoints: Waypoint[] = [];
  let name: string | undefined;

  for (const placemark of blocks(xml, 'Placemark')) {
    const label = childText(placemark.body, 'name');
    let hasLine = false;
    for (const line of blocks(placemark.body, 'LineString')) {
      hasLine = true;
      segments.push(kmlCoordinates(childText(line.body, 'coordinates') ?? ''));
    }
    for (const track of blocks(placemark.body, 'gx:Track')) {
      hasLine = true;
      segments.push(kmlGxTrack(track.body));
    }
    if (hasLine) {
      name ??= label;
      continue;
    }
    for (const point of blocks(placemark.body, 'Point')) {
      const [first] = kmlCoordinates(childText(point.body, 'coordinates') ?? '');
      if (first) waypoints.push({ ...first, name: label ?? '' });
    }
  }
  name ??= childText(childText(xml, 'Document') ?? '', 'name');

  return { name, segments, waypoints };
}

/* ────────────────────────── 샘플링 · 통계 ────────────────────────── */

/** 첫 점과 끝 점은 반드시 남기고 균등하게 솎는다. 끝점을 잃으면 정상 못 미쳐 끊긴 것처럼 보인다. */
function decimate(points: TrackPoint[], keep: number): TrackPoint[] {
  if (points.length <= keep || keep < 2) return points;
  const step = (points.length - 1) / (keep - 1);
  const out: TrackPoint[] = [];
  for (let i = 0; i < keep - 1; i += 1) out.push(points[Math.round(i * step)]);
  out.push(points[points.length - 1]);
  return out;
}

/** 전체 점 수가 상한을 넘으면 세그먼트마다 비례해서 솎는다. 짧은 세그먼트가 통째로 사라지진 않는다. */
function limitPoints(segments: TrackPoint[][]): { segments: TrackPoint[][]; sampled: boolean } {
  const total = segments.reduce((sum, seg) => sum + seg.length, 0);
  if (total <= MAX_POINTS) return { segments, sampled: false };
  const ratio = MAX_POINTS / total;
  return {
    segments: segments.map((seg) => decimate(seg, Math.max(2, Math.floor(seg.length * ratio)))),
    sampled: true,
  };
}

function haversineMeters(a: TrackPoint, b: TrackPoint): number {
  const radius = 6_371_000;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

/** 임계값 이상 변화만 누적한다. 작은 진동을 그대로 더하면 상승량이 몇 배로 부풀려진다. */
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

export function computeStats(segments: TrackPoint[][]): TrackStats {
  let meters = 0;
  let gain = 0;
  let loss = 0;
  const elevations: number[] = [];

  for (const seg of segments) {
    for (let i = 1; i < seg.length; i += 1) meters += haversineMeters(seg[i - 1], seg[i]);
    // 세그먼트 경계의 고도 차이는 실제 오르내림이 아니므로 세그먼트별로 따로 누적한다.
    const eles = seg.flatMap((p) => (p.ele === undefined ? [] : [p.ele]));
    if (eles.length >= 2) {
      const acc = accumulate(eles);
      gain += acc.gain;
      loss += acc.loss;
    }
    elevations.push(...eles);
  }

  const flat = segments.flat();
  const first = flat[0];
  const last = flat[flat.length - 1];
  const timed = flat.filter((p) => p.time);
  const durationSec =
    timed.length >= 2
      ? Math.round((Date.parse(timed[timed.length - 1].time!) - Date.parse(timed[0].time!)) / 1000)
      : null;
  const hasEle = elevations.length > 0;

  return {
    distanceKm: Math.round((meters / 1000) * 100) / 100,
    gainM: hasEle ? Math.round(gain) : null,
    lossM: hasEle ? Math.round(loss) : null,
    maxM: hasEle ? Math.round(Math.max(...elevations)) : null,
    minM: hasEle ? Math.round(Math.min(...elevations)) : null,
    // 음수 소요시간은 시각이 뒤섞인 기록이다. 없는 셈 친다.
    durationSec: durationSec !== null && durationSec > 0 ? durationSec : null,
    start: [first.lon, first.lat],
    end: [last.lon, last.lat],
  };
}

/* ────────────────────────── 진입점 ────────────────────────── */

function detectFormat(text: string, filename: string): 'gpx' | 'kml' {
  const head = text.slice(0, 4096).toLowerCase();
  // 확장자보다 내용을 먼저 믿는다. `.gpx` 로 저장된 KML 이 실제로 돌아다닌다.
  if (head.includes('<gpx')) return 'gpx';
  if (head.includes('<kml')) return 'kml';
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'gpx' || ext === 'kml') {
    throw new TrackParseError(`${ext.toUpperCase()} 파일로 보이지 않습니다. 내용이 깨졌거나 다른 형식입니다.`);
  }
  throw new TrackParseError('지원하지 않는 파일입니다. GPX 또는 KML 파일을 올려주세요.');
}

/**
 * 트랙 파일 텍스트 → 파싱 결과.
 *
 * 실패는 전부 `TrackParseError` 로 던지며 메시지는 그대로 화면에 띄울 수 있다.
 * 좌표가 깨진 점은 조용히 건너뛰되, 남은 점이 2개 미만이면 실패로 본다.
 */
export function parseTrackFile(text: string, filename: string): ParsedTrack {
  if (!text || !text.trim()) throw new TrackParseError('파일이 비어 있습니다.');
  if (text.length > MAX_FILE_BYTES) {
    throw new TrackParseError(`파일이 너무 큽니다. ${MAX_FILE_BYTES / 1024 / 1024}MB 이하만 올릴 수 있습니다.`);
  }

  const format = detectFormat(text, filename);
  const parsed = format === 'gpx' ? parseGpx(text) : parseKml(text);

  // 점이 하나뿐인 세그먼트는 선이 못 된다.
  const usable = parsed.segments.filter((seg) => seg.length >= 2);
  if (usable.length === 0) {
    throw new TrackParseError('트랙 좌표를 찾을 수 없습니다. 경로(트랙)가 기록된 파일인지 확인해주세요.');
  }

  const { segments, sampled } = limitPoints(usable);
  const points = segments.flat();
  const fallbackName = filename.replace(/\.[^.]+$/, '') || '내 트랙';

  return {
    name: parsed.name?.trim() || fallbackName,
    filename,
    format,
    points,
    segments: segments.map((seg) =>
      seg.map((p) => (p.ele === undefined ? [p.lon, p.lat] : [p.lon, p.lat, p.ele])),
    ),
    waypoints: parsed.waypoints,
    stats: computeStats(segments),
    sampled,
  };
}

/* ────────────────────────── GeoJSON 변환 ────────────────────────── */

/**
 * 파싱한 트랙 → 기존 코스 feature 와 같은 모양의 GeoJSON.
 *
 * properties 키를 공공데이터 코스(`코스ID`, `거리_km`, `누적상승_m` …)와 맞춰 두면
 * `buildProfile` 과 고도 프로파일 컴포넌트를 손대지 않고 그대로 재사용할 수 있다.
 * 고도가 없으면 최고·최저를 0 으로 둔다 — `hasElevation` 이 "둘 다 0" 을 미상 신호로 읽는다.
 */
export function toCourseFeature(track: ParsedTrack): GeoJSON.Feature {
  const { stats } = track;
  const geometry: GeoJSON.Geometry =
    track.segments.length === 1
      ? { type: 'LineString', coordinates: track.segments[0] }
      : { type: 'MultiLineString', coordinates: track.segments };

  return {
    type: 'Feature',
    id: USER_TRACK_COURSE_ID,
    geometry,
    properties: {
      출처: '내 트랙',
      그룹: track.name,
      코스ID: USER_TRACK_COURSE_ID,
      정점수: track.points.length,
      거리_km: stats.distanceKm,
      최저고도_m: stats.minM ?? 0,
      최고고도_m: stats.maxM ?? 0,
      누적상승_m: stats.gainM ?? 0,
    },
  };
}

/** 웨이포인트 → Point FeatureCollection. 지도 라벨 레이어에 그대로 올린다. */
export function toWaypointCollection(track: ParsedTrack): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: track.waypoints.map((w) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [w.lon, w.lat] },
      properties: { name: w.name, ele: w.ele ?? null },
    })),
  };
}

/** 트랙 전체를 감싸는 `[west, south, east, north]`. 웨이포인트도 포함한다. */
export function trackBounds(track: ParsedTrack): [number, number, number, number] {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  const extend = (lon: number, lat: number) => {
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  };
  for (const p of track.points) extend(p.lon, p.lat);
  for (const w of track.waypoints) extend(w.lon, w.lat);
  return [west, south, east, north];
}

/** 소요시간을 "2시간 15분" 꼴로. 1시간 미만은 분만. */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}분`;
  return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
}
