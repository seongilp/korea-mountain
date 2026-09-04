import type { StyleSpecification } from 'maplibre-gl';

/**
 * 2D 지도 베이스맵 스타일.
 *
 * CARTO dark-matter(OSM 기반)는 무료·무인증이라 기본값이었지만, 한글 지명이 거의 없다
 * (도로명 정도만 나오고 산·동네 이름은 비어 있다). 브이월드는 3D 모드에서 이미 쓰고 있는
 * 키(NEXT_PUBLIC_VWORLD_KEY)를 그대로 재사용해 WMTS 래스터 타일로 한글 라벨을 채운다.
 *
 * 타일 좌표는 `{z}/{y}/{x}` 순서다 — lib/vworld.ts 의 addBoundaryOverlay 와 동일하게
 * 흔한 `{z}/{x}/{y}` 로 넣으면 예외 XML 이 온다(실측 확인).
 *
 * midnight 스타일은 브이월드 자체가 다크 테마라 이 앱의 다크 UI 와 어울린다.
 * 최대 줌은 18 — Hybrid 오버레이(lib/vworld.ts)와 같은 근거로 19 이상은 빈 타일/404 다.
 */
const VWORLD_MIDNIGHT_MAX_ZOOM = 18;

function vworldStyle(apiKey: string): StyleSpecification {
  return {
    version: 8,
    sources: {
      vworld: {
        type: 'raster',
        tiles: [`https://api.vworld.kr/req/wmts/1.0.0/${apiKey}/midnight/{z}/{y}/{x}.png`],
        tileSize: 256,
        minzoom: 6,
        maxzoom: VWORLD_MIDNIGHT_MAX_ZOOM,
        attribution: '© 국토교통부 브이월드',
      },
    },
    layers: [
      {
        id: 'vworld',
        type: 'raster',
        source: 'vworld',
        paint: {
          // 래스터가 이미 어두운 데다 코스 색(빨강·노랑·주황)과 대비를 더 주기 위해
          // 살짝 낮춘다 — 너무 낮추면 지명 자체가 안 읽힌다.
          'raster-opacity': 0.92,
          'raster-brightness-max': 0.85,
        },
      },
    ],
  };
}

/** 무인증 CARTO dark-matter. 브이월드 키가 없을 때만 쓰는 폴백. */
const CARTO_FALLBACK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

/**
 * 2D 베이스맵 스타일을 고른다.
 *
 * 브이월드 키가 없으면(빈 문자열) CARTO 무료 스타일로 폴백한다 — 키가 없어도 지도 자체는
 * 떠야 한다는 원칙(README: "인증키 없이도 지도와 등산로는 그대로 뜬다")을 유지하기 위해서다.
 * 한글 지명은 이 경우에만 빈약해진다.
 */
export function resolveBasemapStyle(vworldApiKey: string): StyleSpecification | string {
  if (!vworldApiKey) return CARTO_FALLBACK_STYLE;
  return vworldStyle(vworldApiKey);
}
