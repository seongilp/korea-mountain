import { API } from './api-registry';
import { callDataGo, extractItems } from './datago';
import { STATION_BY_OBSID } from './mtweather-stations';

/**
 * 산악기상 실황.
 *
 * 함정: `tm`(관측시각) 없이 호출하면 모든 필드가 '-' 로 온다. 지점 목록만 나오고
 * 관측값은 비어 있다. 반대로 `tm` 만 주면 513개 지점을 한 번에 받는다 — 전국이 1콜이다.
 * 그리고 응답에 위경도가 없어 lib/mtweather-stations.ts 로 좌표를 붙여야 한다.
 */

export interface RawMtWeather {
  obsid: number;
  obsname: string;
  tm: string;
  /** 기온 2m (℃) */
  tm2m: string;
  /** 습도 2m (%) */
  hm2m: string;
  /** 풍속 2m (m/s) */
  ws2m: string;
  /** 풍향 문자열 */
  wd2mstr: string;
  /** 시간 강수량 (mm) */
  rn: string;
  /** 기압 (hPa) */
  pa: string;
}

export interface StationObservation {
  obsid: number;
  name: string;
  lon: number;
  lat: number;
  alt: number | null;
  observedAt: string;
  tempC: number | null;
  humidity: number | null;
  windMs: number | null;
  windDir: string | null;
  rainMm: number | null;
}

/** '-' 를 null 로. 이 API 는 결측을 문자열 '-' 로 표현한다. */
function num(value: string | undefined): number | null {
  if (value === undefined || value === '-' || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** KST 기준 정시 문자열 YYYYMMDDHH00. offsetHours 만큼 과거로 물린다. */
export function kstHourStamp(offsetHours = 0): string {
  const kstMs = Date.now() + 9 * 60 * 60 * 1000 - offsetHours * 60 * 60 * 1000;
  const d = new Date(kstMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}00`;
}

async function fetchAt(tm: string): Promise<RawMtWeather[]> {
  const payload = await callDataGo<unknown>(
    API.mtWeather,
    { pageNo: 1, numOfRows: 600, tm },
    { revalidate: 1800 },
  );
  return extractItems<RawMtWeather>(payload).items;
}

/**
 * 최근 관측을 가져온다.
 *
 * 관측값은 정시 이후 몇십 분 뒤에 올라온다. 현재 시각의 정시가 아직 비어 있을 수 있어
 * 값이 있는 시각이 나올 때까지 한 시간씩 뒤로 물린다.
 */
export async function fetchLatestObservations(maxLookbackHours = 4): Promise<{
  observedAt: string;
  stations: StationObservation[];
}> {
  for (let offset = 0; offset <= maxLookbackHours; offset += 1) {
    const tm = kstHourStamp(offset);
    const rows = await fetchAt(tm);
    const withValues = rows.filter((row) => num(row.tm2m) !== null);
    if (withValues.length === 0) continue;

    const stations: StationObservation[] = [];
    for (const row of withValues) {
      // 기술문서(454지점)보다 API(513지점)가 많다. 좌표를 모르는 지점은 지도에 못 올린다.
      const station = STATION_BY_OBSID.get(row.obsid);
      if (!station) continue;
      stations.push({
        obsid: row.obsid,
        name: station.name || row.obsname,
        lon: station.lon,
        lat: station.lat,
        alt: station.alt,
        observedAt: row.tm,
        tempC: num(row.tm2m),
        humidity: num(row.hm2m),
        windMs: num(row.ws2m),
        windDir: row.wd2mstr === '-' ? null : (row.wd2mstr ?? null),
        rainMm: num(row.rn),
      });
    }
    return { observedAt: withValues[0].tm, stations };
  }
  return { observedAt: '', stations: [] };
}
