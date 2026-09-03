/**
 * 사용자 트랙(GPX/KML) 의 maplibre 소스·레이어.
 *
 * trail-map.tsx 가 이미 700줄을 넘어 여기로 뺐다. maplibre 인스턴스를 받아 소스를
 * 만들고(`addUserTrackLayers`), 트랙이 바뀌면 데이터를 갈아 끼운다(`setUserTrackData`).
 * React 상태는 모른다 — trail-map 의 effect 가 호출만 한다.
 */

import type maplibregl from 'maplibre-gl';

import { toCourseFeature, toWaypointCollection, type ParsedTrack } from '@/lib/gpx';

export const USER_TRACK_SOURCE = 'user-track';
export const USER_TRACK_POINT_SOURCE = 'user-track-points';
export const USER_TRACK_WAYPOINT_SOURCE = 'user-track-waypoints';

/**
 * 트랙 선 색. 기존 팔레트와 안 겹치는 보라를 골랐다:
 * 난이도(초록·노랑·주황·빨강), 주변 코스(슬레이트→주황 파선), 국립공원 탐방로(시안 #22d3ee),
 * 선택 봉우리(토스 블루). 민트 #2dd4bf 는 시안과 한 화면에서 구분이 안 됐다.
 */
export const USER_TRACK_COLOR = '#a78bfa';
export const USER_TRACK_START_COLOR = '#4ade80';
export const USER_TRACK_END_COLOR = '#f87171';

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/** 소스와 레이어를 만든다. `map.on('load')` 안에서 코스 레이어 다음에 부른다 — 위에 올라와야 보인다. */
export function addUserTrackLayers(map: maplibregl.Map): void {
  map.addSource(USER_TRACK_SOURCE, { type: 'geojson', data: EMPTY });
  map.addSource(USER_TRACK_POINT_SOURCE, { type: 'geojson', data: EMPTY });
  map.addSource(USER_TRACK_WAYPOINT_SOURCE, { type: 'geojson', data: EMPTY });

  // 어두운 케이싱을 깔아야 베이스맵 도로·다른 코스 위에서도 선이 읽힌다.
  map.addLayer({
    id: 'user-track-casing',
    type: 'line',
    source: USER_TRACK_SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#0b0f0d',
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, 5, 13, 7, 16, 10],
      'line-opacity': 0.85,
    },
  });
  map.addLayer({
    id: 'user-track-line',
    type: 'line',
    source: USER_TRACK_SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': USER_TRACK_COLOR,
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2.5, 13, 4, 16, 6],
    },
  });

  // 시작(초록)·끝(빨강). 어느 방향으로 걸었는지는 선만 보면 모른다.
  map.addLayer({
    id: 'user-track-endpoint',
    type: 'circle',
    source: USER_TRACK_POINT_SOURCE,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 4, 14, 7],
      'circle-color': [
        'match',
        ['get', 'kind'],
        'start',
        USER_TRACK_START_COLOR,
        USER_TRACK_END_COLOR,
      ],
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#ffffff',
    },
  });

  // 웨이포인트는 작은 점 + 이름. 트랙 색과 같은 계열이라 "내 것" 으로 읽힌다.
  map.addLayer({
    id: 'user-track-waypoint',
    type: 'circle',
    source: USER_TRACK_WAYPOINT_SOURCE,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 2.5, 14, 4.5],
      'circle-color': '#ffffff',
      'circle-stroke-width': 1.5,
      'circle-stroke-color': USER_TRACK_COLOR,
    },
  });
  map.addLayer({
    id: 'user-track-waypoint-label',
    type: 'symbol',
    source: USER_TRACK_WAYPOINT_SOURCE,
    minzoom: 11,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Open Sans Regular', 'NanumBarunGothic Regular'],
      'text-size': 11,
      'text-offset': [0, 0.9],
      'text-anchor': 'top',
      'text-optional': true,
    },
    paint: {
      'text-color': '#ede9fe',
      'text-halo-color': '#09090b',
      'text-halo-width': 1.4,
    },
  });
}

/** 트랙(또는 null)을 소스에 반영한다. 레이어가 아직 없으면 아무것도 안 한다. */
export function setUserTrackData(map: maplibregl.Map, track: ParsedTrack | null): void {
  const line = map.getSource(USER_TRACK_SOURCE) as maplibregl.GeoJSONSource | undefined;
  const points = map.getSource(USER_TRACK_POINT_SOURCE) as maplibregl.GeoJSONSource | undefined;
  const waypoints = map.getSource(USER_TRACK_WAYPOINT_SOURCE) as
    | maplibregl.GeoJSONSource
    | undefined;
  if (!line || !points || !waypoints) return;

  if (!track) {
    line.setData(EMPTY);
    points.setData(EMPTY);
    waypoints.setData(EMPTY);
    return;
  }

  line.setData({ type: 'FeatureCollection', features: [toCourseFeature(track)] });
  points.setData({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: track.stats.start },
        properties: { kind: 'start' },
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: track.stats.end },
        properties: { kind: 'end' },
      },
    ],
  });
  waypoints.setData(toWaypointCollection(track));
}
