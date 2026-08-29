// 기상청 단기예보 격자(nx, ny) ↔ WGS84 위경도 변환.
//
// 기상청 동네예보/단기예보 API(data.go.kr 15084084)는 위경도가 아니라 5km
// 격자 좌표 nx/ny 를 입력으로 받는다. 격자는 Lambert Conformal Conic 투영이며,
// 아래 상수는 기상청이 배포하는 「동네예보 격자 정보」 참고자료의 값이다.
//
// 격자 범위: nx 1~149, ny 1~253.

/** 지구 반경(km). 기상청 격자 정의에 쓰이는 값 — WGS84 장반경이 아니다. */
const RE = 6371.00877;
/** 격자 간격(km). */
const GRID = 5.0;
/** 표준 위도 1 (도). Lambert 투영의 첫 번째 진위도. */
const SLAT1 = 30.0;
/** 표준 위도 2 (도). Lambert 투영의 두 번째 진위도. */
const SLAT2 = 60.0;
/** 기준점 경도(도). */
const OLON = 126.0;
/** 기준점 위도(도). */
const OLAT = 38.0;
/** 기준점의 격자 X 좌표. */
const XO = 43;
/** 기준점의 격자 Y 좌표. */
const YO = 136;

const DEGRAD = Math.PI / 180.0;
const RADDEG = 180.0 / Math.PI;

// 투영 파라미터는 상수에서만 유도되므로 모듈 로드 시 한 번만 계산한다.
const re = RE / GRID;
const slat1 = SLAT1 * DEGRAD;
const slat2 = SLAT2 * DEGRAD;
const olon = OLON * DEGRAD;
const olat = OLAT * DEGRAD;

/** 원뿔 계수 n — 두 표준위도로부터 결정된다. */
const sn =
  Math.log(Math.cos(slat1) / Math.cos(slat2)) /
  Math.log(
    Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5),
  );

/** 축척 계수 F. */
const sf = (Math.pow(Math.tan(Math.PI * 0.25 + slat1 * 0.5), sn) * Math.cos(slat1)) / sn;

/** 기준 위도까지의 극거리 ro. */
const ro = (re * sf) / Math.pow(Math.tan(Math.PI * 0.25 + olat * 0.5), sn);

/**
 * WGS84 위경도를 기상청 단기예보 격자 좌표로 변환한다.
 *
 * @param lat 위도(도)
 * @param lon 경도(도)
 * @returns 격자 좌표 `{ nx, ny }` (1부터 시작하는 정수)
 */
export function toGrid(lat: number, lon: number): { nx: number; ny: number } {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error(`toGrid: 위경도가 유한한 수가 아니다 (lat=${lat}, lon=${lon})`);
  }

  const ra = (re * sf) / Math.pow(Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5), sn);

  // 경도차를 -180~180 으로 정규화해 날짜변경선 근처에서 튀지 않게 한다.
  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
}

/**
 * 기상청 단기예보 격자 좌표를 WGS84 위경도로 변환한다.
 * 격자는 5km 셀이므로 반환값은 셀 중심이 아니라 격자점 좌표다.
 *
 * @param nx 격자 X
 * @param ny 격자 Y
 * @returns `{ lat, lon }` (도)
 */
export function toLatLon(nx: number, ny: number): { lat: number; lon: number } {
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) {
    throw new Error(`toLatLon: 격자 좌표가 유한한 수가 아니다 (nx=${nx}, ny=${ny})`);
  }

  const xn = nx - XO;
  const yn = ro - ny + YO;
  const ra = Math.sqrt(xn * xn + yn * yn);
  // sn 이 음수인 투영에서도 부호가 맞도록 극거리에 sn 의 부호를 반영한다.
  const raSigned = sn < 0 ? -ra : ra;

  const alat = 2.0 * Math.atan(Math.pow((re * sf) / raSigned, 1.0 / sn)) - Math.PI * 0.5;

  let theta: number;
  if (Math.abs(xn) <= 0) {
    theta = 0.0;
  } else if (Math.abs(yn) <= 0) {
    theta = Math.PI * 0.5;
    if (xn < 0) theta = -theta;
  } else {
    theta = Math.atan2(xn, yn);
  }
  const alon = theta / sn + olon;

  return { lat: alat * RADDEG, lon: alon * RADDEG };
}
