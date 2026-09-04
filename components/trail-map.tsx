'use client';

import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef } from 'react';

import { SNAP_RATIO } from '@/components/bottom-sheet';
import { elevationStepExpression } from '@/lib/elevation-color';
import {
  DEFAULT_VISIBLE_CATEGORIES,
  POI_CATEGORIES,
  POI_CATEGORY_META,
  POI_CATEGORY_PROPERTY,
  POI_MIN_ZOOM,
  type PoiCategory,
} from '@/lib/poi-category';
import { trackBounds, type ParsedTrack } from '@/lib/gpx';
import { UNKNOWN_DIFFICULTY_COLOR } from '@/lib/trail-geometry';
import { addUserTrackLayers, setUserTrackData } from '@/lib/user-track-layer';
import { mountainKey, type MountainBundle, type MountainSummary } from '@/lib/mountains';

import 'maplibre-gl/dist/maplibre-gl.css';

/**
 * 지형 음영이 들어간 무료 베이스맵. 등산 앱이라 기복이 보이는 스타일이 필요하다.
 * 키가 필요 없는 CARTO 다크 위에 지형 음영 레이어를 얹는다.
 */
const BASEMAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

/** 남한 전체를 감싸는 대략적 경계. */
const KOREA_BOUNDS: [[number, number], [number, number]] = [
  [125.9, 33.1],
  [129.7, 38.7],
];

const PEAK_SOURCE = 'peaks';
const COURSE_SOURCE = 'courses';
const POI_SOURCE = 'pois';
const WEATHER_SOURCE = 'weather';
const NP_SOURCE = 'np-trails';
const AMBIENT_SOURCE = 'ambient-courses';
const AMBIENT_POI_SOURCE = 'ambient-pois';

/*
 * POI 점은 두 레이어가 같은 모양이다. 선택 산(poi-dot)은 코스 필터가 걸리고 주변 산
 * (ambient-poi-dot)은 카테고리 필터만 걸린다는 차이뿐이라 paint 는 하나로 둔다.
 */
const POI_LAYERS = ['ambient-poi-dot', 'poi-dot'] as const;
const POI_DOT_PAINT: maplibregl.CircleLayerSpecification['paint'] = {
  'circle-radius': [
    'interpolate',
    ['linear'],
    ['zoom'],
    12,
    ['case', ['==', ['get', POI_CATEGORY_PROPERTY], 'danger'], 3.5, 2.5],
    16,
    ['case', ['==', ['get', POI_CATEGORY_PROPERTY], 'danger'], 8, 5.5],
  ],
  'circle-color': [
    'match',
    ['get', POI_CATEGORY_PROPERTY],
    ...POI_CATEGORIES.flatMap((c) => [c, POI_CATEGORY_META[c].color]),
    POI_CATEGORY_META.other.color,
  ] as unknown as maplibregl.ExpressionSpecification,
  'circle-stroke-width': 0.8,
  'circle-stroke-color': '#0b0f0d',
};

export interface WeatherStation {
  obsid: number;
  name: string;
  lon: number;
  lat: number;
  alt: number | null;
  tempC: number | null;
  humidity: number | null;
  windMs: number | null;
  windDir: string | null;
}

interface TrailMapProps {
  mountains: MountainSummary[];
  bundle: MountainBundle | null;
  selected: string | null;
  onSelect: (name: string) => void;
  weather: WeatherStation[];
  showWeather: boolean;
  npTrails: GeoJSON.FeatureCollection | null;
  /** 선택과 무관하게 화면 안에 깔아두는 등산로. */
  ambient: GeoJSON.FeatureCollection | null;
  /** 선택과 무관하게 화면 안에 깔아두는 POI. 선택한 산의 것은 이미 빠져 있다(중복 방지). */
  ambientPois: GeoJSON.FeatureCollection | null;
  /**
   * 선택한 산의 좌표. vworld-map 의 focus 와 같은 모양이다. 번들이 아직 도착하지 않아도
   * 즉시 화면을 옮기는 용도라 코스 geometry 와 분리해 둔다. 선택을 해제하면 null 이 되고
   * 그때는 화면을 건드리지 않는다(현재 보던 곳을 유지).
   */
  focus: { lon: number; lat: number } | null;
  /** 선택된 개별 코스의 코스ID. 없으면 null. */
  selectedCourseId: string | null;
  onSelectCourse: (courseId: string | null) => void;
  /** 지도에 그릴 POI 카테고리. 비어 있으면 POI 를 전부 숨긴다. */
  visiblePoiCategories: readonly PoiCategory[];
  /** 사용자가 올린 GPX/KML 트랙. 산 선택과 무관하게 따로 그린다. */
  userTrack?: ParsedTrack | null;
  /** 트랙을 (다시) 올릴 때마다 증가. 같은 트랙을 다시 올려도 화면 맞춤이 한 번 더 돈다. */
  userTrackRevision?: number;
  /** 지도가 멈출 때 현재 보이는 영역을 알려준다. 뷰포트 기준 지연 로딩에 쓴다. */
  onViewportChange: (view: { bounds: [number, number, number, number]; zoom: number }) => void;
  /**
   * 좁은 화면 여부. 하단을 바텀시트가 덮으므로 코스를 화면에 맞출 때 그만큼 비워 둔다.
   * 이게 없으면 산을 고르는 순간 코스가 시트 뒤로 들어가 아무것도 안 보인다.
   */
  compact?: boolean;
}

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/** mountain-explorer 의 데스크톱 '내 트랙' 카드 폭(w-[26rem]). 화면 맞춤 여백 계산용. */
const USER_TRACK_CARD_PX = 26 * 16;

/** 팝업은 setHTML 로 그리므로 데이터에서 온 문자열은 이스케이프한다. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function TrailMap({
  mountains,
  bundle,
  selected,
  focus,
  onSelect,
  weather,
  showWeather,
  npTrails,
  ambient,
  ambientPois,
  compact = false,
  onViewportChange,
  selectedCourseId,
  onSelectCourse,
  visiblePoiCategories,
  userTrack = null,
  userTrackRevision = 0,
}: TrailMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedRef = useRef(false);
  const fittedRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  const onViewportRef = useRef(onViewportChange);
  const onSelectCourseRef = useRef(onSelectCourse);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    onViewportRef.current = onViewportChange;
  }, [onViewportChange]);

  useEffect(() => {
    onSelectCourseRef.current = onSelectCourse;
  }, [onSelectCourse]);

  /* 지도 생성 */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      bounds: KOREA_BOUNDS,
      fitBoundsOptions: { padding: 32 },
      minZoom: 5,
      maxZoom: 17,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');

    map.on('load', () => {
      map.addSource(PEAK_SOURCE, { type: 'geojson', data: EMPTY, promoteId: 'key' });
      // 코스 단위 선택 표시를 하려면 안정적인 feature id 가 필요하다.
      map.addSource(COURSE_SOURCE, { type: 'geojson', data: EMPTY, promoteId: '코스ID' });
      map.addSource(POI_SOURCE, { type: 'geojson', data: EMPTY });
      map.addSource(AMBIENT_POI_SOURCE, { type: 'geojson', data: EMPTY });

      // 국립공원 탐방로. 통제 구간은 붉은 파선으로 구분한다.
      map.addSource(NP_SOURCE, { type: 'geojson', data: EMPTY });
      map.addLayer({
        id: 'np-open',
        type: 'line',
        source: NP_SOURCE,
        filter: ['!', ['get', 'closed']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#22d3ee',
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.8, 12, 2, 16, 3.5],
          'line-opacity': 0.75,
        },
      });
      map.addLayer({
        id: 'np-closed',
        type: 'line',
        source: NP_SOURCE,
        filter: ['get', 'closed'],
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: {
          'line-color': '#f87171',
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.2, 12, 2.5, 16, 4],
          'line-dasharray': [2, 1.6],
          'line-opacity': 0.95,
        },
      });

      // 주변 등산로. 선택하지 않아도 화면에 깔린다. 선택한 코스와 구분되게 얇다.
      // 멀리서는 슬레이트로 흐리게, 줌 13 부터는 주황 파선으로 바뀐다 — 슬레이트 그대로 두면
      // 베이스맵 도로(같은 회색)와 구분이 안 돼서 가까이 가도 "등산로가 없어 보인다"(실기기 확인).
      map.addSource(AMBIENT_SOURCE, { type: 'geojson', data: EMPTY });
      map.addLayer({
        id: 'ambient-line',
        type: 'line',
        source: AMBIENT_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['interpolate', ['linear'], ['zoom'], 12, '#94a3b8', 13.5, '#fb923c'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 13, 1.6, 16, 3],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.55, 13.5, 0.9],
          'line-dasharray': [2, 1.5],
        },
      });

      // 등산로 선. 아래에 어두운 외곽선을 깔아 어떤 배경에서도 읽히게 한다.
      map.addLayer({
        id: 'course-casing',
        type: 'line',
        source: COURSE_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#0b0f0d', 'line-width': 6, 'line-opacity': 0.85 },
      });
      map.addLayer({
        id: 'course-line',
        type: 'line',
        source: COURSE_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          // 누적상승으로 코스 난이도를 색으로 암시한다.
          // 단, 고도 기록이 없는 코스는 팔레트 밖 회색으로 뺀다. 누적상승 0 을 그대로
          // 흘리면 '가장 쉬움' 초록이 되어 28.7km 코스를 쉬운 길로 오독하게 만든다.
          'line-color': [
            'case',
            [
              'all',
              ['==', ['coalesce', ['get', '최고고도_m'], 0], 0],
              ['==', ['coalesce', ['get', '최저고도_m'], 0], 0],
            ],
            UNKNOWN_DIFFICULTY_COLOR,
            [
              'interpolate',
              ['linear'],
              ['coalesce', ['get', '누적상승_m'], 0],
              0,
              '#4ade80',
              300,
              '#fbbf24',
              700,
              '#fb923c',
              1200,
              '#f87171',
            ],
          ],
          // maplibre 는 한 표현식에 줌 기반 interpolate 를 두 번 못 쓴다.
          // (layers.course-line.paint.line-width: Only one zoom-based ... may be used)
          // 그래서 interpolate 를 바깥에 두고 각 스톱 안에서 선택 여부로 분기한다.
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            9,
            ['case', ['boolean', ['feature-state', 'courseSelected'], false], 3.5, 1.5],
            13,
            ['case', ['boolean', ['feature-state', 'courseSelected'], false], 6, 3],
            16,
            ['case', ['boolean', ['feature-state', 'courseSelected'], false], 9, 5],
          ],
          // 코스를 하나 고르면 나머지는 물러난다.
          'line-opacity': [
            'case',
            ['boolean', ['feature-state', 'courseDimmed'], false],
            0.28,
            1,
          ],
        },
      });

      // 사용자 트랙. 코스 위, POI·봉우리 아래 — 점은 계속 눌러야 하니 선이 덮으면 안 된다.
      addUserTrackLayers(map);

      // 코스 POI. 색은 lib/poi-category.ts 의 카테고리 표를 그대로 쓴다.
      // 원본 `종류` 는 POI 마다 유일한 코드라 여기서는 안 본다. 위험 지점은 한 단계 크게 그린다.
      // 주변 산 POI 를 먼저 깔고 선택 산 POI 를 위에 올린다. 화면에 여러 산이면 수천 개라
      // 줌 12 아래에서는 아예 안 그린다.
      // 필터 effect 가 붙기 전 한 프레임이라도 전부 그리지 않게 기본값을 미리 건다.
      const defaultPoiFilter: maplibregl.FilterSpecification = [
        'in',
        ['get', POI_CATEGORY_PROPERTY],
        ['literal', [...DEFAULT_VISIBLE_CATEGORIES]],
      ];
      map.addLayer({
        id: 'ambient-poi-dot',
        type: 'circle',
        source: AMBIENT_POI_SOURCE,
        minzoom: POI_MIN_ZOOM,
        filter: defaultPoiFilter,
        paint: POI_DOT_PAINT,
      });
      map.addLayer({
        id: 'poi-dot',
        type: 'circle',
        source: POI_SOURCE,
        minzoom: POI_MIN_ZOOM,
        filter: defaultPoiFilter,
        paint: POI_DOT_PAINT,
      });

      map.addSource(WEATHER_SOURCE, { type: 'geojson', data: EMPTY });
      map.addLayer({
        id: 'weather-dot',
        type: 'circle',
        source: WEATHER_SOURCE,
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 4, 10, 8, 14, 14],
          // 기온 색상. 산악 실측이라 저지대보다 훨씬 낮은 값이 나온다.
          'circle-color': [
            'interpolate',
            ['linear'],
            ['coalesce', ['get', 'tempC'], 15],
            -10, '#6366f1',
            0, '#38bdf8',
            10, '#4ade80',
            20, '#fbbf24',
            28, '#fb923c',
            35, '#f87171',
          ],
          'circle-opacity': 0.9,
          'circle-stroke-width': 0.8,
          'circle-stroke-color': '#0b0f0d',
        },
      });
      map.addLayer({
        id: 'weather-temp',
        type: 'symbol',
        source: WEATHER_SOURCE,
        layout: {
          visibility: 'none',
          'text-field': ['concat', ['to-string', ['get', 'tempC']], '°'],
          'text-font': ['Open Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 6, 8, 12, 11],
        },
        paint: { 'text-color': '#0b0f0d', 'text-halo-color': '#ffffff', 'text-halo-width': 0.6 },
        minzoom: 8,
      });

      // 산 정상 마커. 고도에 따라 크기를 달리해 큰 산이 먼저 눈에 들어오게 한다.
      map.addLayer({
        id: 'peak-dot',
        type: 'circle',
        source: PEAK_SOURCE,
        paint: {
          // 고도가 없는 봉우리(peakM null)는 최소 크기로 그린다.
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['coalesce', ['get', 'peakM'], 200],
            200,
            3,
            1000,
            6,
            1950,
            9,
          ],
          // 고도 구간별 색(lib/elevation-color.ts). 선택된 산만 토스 블루로 덮는다.
          'circle-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            '#3182f6',
            elevationStepExpression('elevation'),
          ] as unknown as maplibregl.ExpressionSpecification,
          'circle-stroke-width': 1.2,
          'circle-stroke-color': '#0b0f0d',
        },
      });
      map.addLayer({
        id: 'peak-label',
        type: 'symbol',
        source: PEAK_SOURCE,
        minzoom: 9,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Regular', 'NanumBarunGothic Regular'],
          'text-size': 11,
          'text-offset': [0, 1.1],
          'text-anchor': 'top',
          // 라벨이 겹치면 높은 봉우리가 살아남게 한다. sort-key 는 작을수록 우선.
          'symbol-sort-key': ['-', 0, ['coalesce', ['get', 'peakM'], 0]],
        },
        paint: {
          'text-color': '#e5e7eb',
          'text-halo-color': '#09090b',
          'text-halo-width': 1.4,
        },
      });

      loadedRef.current = true;
    });

    map.on('mouseenter', 'peak-dot', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'peak-dot', () => {
      map.getCanvas().style.cursor = '';
    });
    map.on('click', 'peak-dot', (event) => {
      const key = event.features?.[0]?.properties?.key as string | undefined;
      if (key) onSelectRef.current(key);
    });

    map.on('mouseenter', 'course-line', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'course-line', () => {
      map.getCanvas().style.cursor = '';
    });
    map.on('click', 'course-line', (event) => {
      const id = event.features?.[0]?.properties?.['코스ID'] as string | undefined;
      if (id) onSelectCourseRef.current(id);
    });

    // POI 는 탭으로 연다. 모바일에는 hover 가 없고, 점이 작아 hover 팝업은 자꾸 깜빡인다.
    // 선택 산이든 주변 산이든 POI 팝업은 같다.
    const poiPopup = new maplibregl.Popup({ closeButton: true, offset: 8, maxWidth: '240px' });
    for (const layer of POI_LAYERS) {
      map.on('mouseenter', layer, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', layer, () => {
        map.getCanvas().style.cursor = '';
      });
    }
    const openPoiPopup = (event: maplibregl.MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const p = feature?.properties as Record<string, unknown> | undefined;
      if (!p || feature?.geometry.type !== 'Point') return;
      const category = (p[POI_CATEGORY_PROPERTY] as PoiCategory | undefined) ?? 'other';
      const meta = POI_CATEGORY_META[category] ?? POI_CATEGORY_META.other;
      poiPopup
        // 클릭 지점이 아니라 점의 실제 좌표에 붙여야 확대해도 안 흔들린다.
        .setLngLat(feature.geometry.coordinates as [number, number])
        .setHTML(
          `<div style="color:#111;font-size:12px">` +
            `<b>${escapeHtml(String(p['이름'] ?? ''))}</b><br/>` +
            `<span style="display:inline-block;width:8px;height:8px;border-radius:9999px;` +
            `background:${meta.color};border:1px solid #333;margin-right:4px"></span>` +
            `<span style="color:#555">${meta.label}</span></div>`,
        )
        .addTo(map);
    };
    for (const layer of POI_LAYERS) map.on('click', layer, openPoiPopup);

    const notifyViewport = () => {
      /*
       * 3D 로 전환하면 이 지도는 CSS 로 숨겨져 컨테이너가 0x0 이 되고, 그때 maplibre 가
       * resize→moveend 를 한 번 더 쏜다. 그 bounds 는 실제로 보이던 영역이 아니라
       * 찌그러진 값이라, 3D 가 뷰포트를 이어받을 때 엉뚱한 고도로 간다.
       * 화면에서 사라진 순간의 값은 버리고, 마지막으로 보이던 값을 그대로 남긴다.
       */
      const canvas = map.getCanvas();
      if (canvas.clientWidth === 0 || canvas.clientHeight === 0) return;

      const b = map.getBounds();
      onViewportRef.current({
        bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
        zoom: map.getZoom(),
      });
    };
    map.on('moveend', notifyViewport);
    map.once('idle', notifyViewport);

    const trailPopup = new maplibregl.Popup({ closeButton: false, offset: 8 });
    for (const layer of ['np-open', 'np-closed']) {
      map.on('mouseenter', layer, (event) => {
        const p = event.features?.[0]?.properties as Record<string, unknown> | undefined;
        if (!p) return;
        map.getCanvas().style.cursor = 'pointer';
        const km = p.distM ? `${(Number(p.distM) / 1000).toFixed(1)}km` : '—';
        const up = p.upMin ? `${p.upMin}분` : '—';
        const closed = p.closed
          ? `<br/><b style="color:#b91c1c">${p.closedNote ?? '통제구간'}</b>`
          : '';
        trailPopup
          .setLngLat(event.lngLat)
          .setHTML(
            `<div style="color:#111;font-size:12px;max-width:230px">` +
              `<span style="color:#0891b2">${p.park ?? ''}</span> <b>${p.name ?? ''}</b><br/>` +
              `<span style="color:#555">${p.section ?? ''}</span><br/>` +
              `거리 ${km} · 오름 ${up}${closed}</div>`,
          )
          .addTo(map);
      });
      map.on('mouseleave', layer, () => {
        map.getCanvas().style.cursor = '';
        trailPopup.remove();
      });
    }

    const weatherPopup = new maplibregl.Popup({ closeButton: false, offset: 10 });
    map.on('mouseenter', 'weather-dot', (event) => {
      const p = event.features?.[0]?.properties as Record<string, unknown> | undefined;
      if (!p) return;
      map.getCanvas().style.cursor = 'pointer';
      const alt = p.alt === null || p.alt === undefined ? '' : ` · ${p.alt}m`;
      weatherPopup
        .setLngLat(event.lngLat)
        .setHTML(
          `<div style="color:#111;font-size:12px"><b>${p.name ?? ''}</b>${alt}<br/>` +
            `기온 ${p.tempC ?? '—'}℃ · 습도 ${p.humidity ?? '—'}%<br/>` +
            `바람 ${p.windDir ?? ''} ${p.windMs ?? '—'}m/s</div>`,
        )
        .addTo(map);
    });
    map.on('mouseleave', 'weather-dot', () => {
      map.getCanvas().style.cursor = '';
      weatherPopup.remove();
    });

    // 컨테이너가 0x0 일 때 생성되면 생성자 bounds 가 엉뚱한 줌으로 굳는다.
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box || box.width < 1 || box.height < 1 || fittedRef.current) return;
      fittedRef.current = true;
      map.resize();
      map.fitBounds(KOREA_BOUNDS, { padding: 32, duration: 0 });
    });
    observer.observe(containerRef.current);

    return () => {
      trailPopup.remove();
      weatherPopup.remove();
      poiPopup.remove();
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
      fittedRef.current = false;
    };
  }, []);

  /* 산 목록 → 정상 마커 */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mountains.length === 0) return;

    const apply = () => {
      const source = map.getSource(PEAK_SOURCE) as maplibregl.GeoJSONSource | undefined;
      source?.setData({
        type: 'FeatureCollection',
        // feature id 는 이름이 아니라 고유 키다. 동명 봉우리가 1,915개라
        // 이름을 id 로 쓰면 setFeatureState 가 엉뚱한 봉우리를 강조한다.
        features: mountains.map((m) => ({
          type: 'Feature',
          id: mountainKey(m),
          geometry: { type: 'Point', coordinates: [m.lon, m.lat] },
          properties: {
            key: mountainKey(m),
            name: m.name,
            peakM: m.peakM,
            // circle-color step 표현식이 읽는 속성. peakM 과 같은 값(코스 최고점).
            elevation: m.peakM,
            courses: m.courses,
          },
        })),
      });
    };

    if (loadedRef.current) apply();
    else map.once('idle', apply);
  }, [mountains]);

  /*
   * 선택 즉시 화면 이동. 번들 fetch 가 끝나기 전에도 산 위치는 이미 알고 있으므로
   * 그 좌표로 먼저 날아간다 — 큰 번들(금정산 1.2MB 등)을 받는 수 초 동안 이전 산에
   * 머무는 문제(사용자 보고)가 이걸로 없어진다. 아래 "선택된 산의 코스/화면 이동" effect
   * 보다 반드시 먼저 선언해야 한다: 캐시 히트라 focus 와 bundle 이 같은 렌더에서 함께
   * 바뀌면, 나중에 선언된 effect 가 나중에 실행돼 이 flyTo 를 fitBounds 로 덮어써서
   * 화면이 한 번만 움직인다(더 정확한 fitBounds 가 이겨야 한다).
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;

    const apply = () => {
      const bottom = compact
        ? Math.round(map.getContainer().clientHeight * SNAP_RATIO.peek) + 60
        : 60;
      map.flyTo({
        center: [focus.lon, focus.lat],
        // 이미 그 산보다 가까이 줌인해 있었다면 굳이 빼지 않는다.
        zoom: Math.max(map.getZoom(), 12),
        duration: 600,
        padding: { top: 60, left: 60, right: 60, bottom },
      });
    };

    if (loadedRef.current) apply();
    else map.once('idle', apply);
  }, [focus, compact]);

  /* 선택된 산의 코스/POI + 화면 이동 */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const courseSource = map.getSource(COURSE_SOURCE) as maplibregl.GeoJSONSource | undefined;
      const poiSource = map.getSource(POI_SOURCE) as maplibregl.GeoJSONSource | undefined;
      courseSource?.setData(bundle?.courses ?? EMPTY);
      poiSource?.setData(bundle?.pois ?? EMPTY);

      if (!bundle || bundle.courses.features.length === 0) return;

      const bounds = new maplibregl.LngLatBounds();
      for (const feature of bundle.courses.features) {
        const geometry = feature.geometry;
        // GPS 점프를 끊은 코스는 MultiLineString 이다. 둘 다 처리해야
        // 끊긴 코스가 화면 맞춤에서 통째로 빠지지 않는다.
        const lines =
          geometry.type === 'LineString'
            ? [geometry.coordinates]
            : geometry.type === 'MultiLineString'
              ? geometry.coordinates
              : [];
        for (const line of lines) {
          for (const point of line) {
            bounds.extend(point as [number, number]);
          }
        }
      }
      if (bounds.isEmpty()) return;
      /*
       * 시트는 peek(28%) 로 열린다. 그 높이만큼 아래 여백을 주면 코스가 시트 위쪽,
       * 즉 실제로 보이는 영역 한가운데에 놓인다.
       */
      const bottom = compact
        ? Math.round(map.getContainer().clientHeight * SNAP_RATIO.peek) + 60
        : 60;
      map.fitBounds(bounds, { padding: { top: 60, left: 60, right: 60, bottom }, duration: 600 });
    };

    if (loadedRef.current) apply();
    else map.once('idle', apply);
  }, [bundle, compact]);

  /* 사용자 트랙 + 화면 이동. 선택 산 코스와 같은 padding 규칙을 쓴다. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      setUserTrackData(map, userTrack);
      if (!userTrack) return;
      const [west, south, east, north] = trackBounds(userTrack);
      const bottom = compact
        ? Math.round(map.getContainer().clientHeight * SNAP_RATIO.peek) + 60
        : 60;
      // 데스크톱은 우상단 '내 트랙' 카드(26rem)가 지도를 덮는다. 그만큼 오른쪽을 비워야 끝점이 안 가려진다.
      const right = compact ? 60 : USER_TRACK_CARD_PX + 60;
      map.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        { padding: { top: 60, left: 60, right, bottom }, duration: 600, maxZoom: 15 },
      );
    };

    if (loadedRef.current) apply();
    else map.once('idle', apply);
    // revision 은 같은 트랙을 다시 올렸을 때 화면 맞춤을 다시 돌리기 위한 신호다.
  }, [userTrack, userTrackRevision, compact]);

  /* 주변 등산로 */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const source = map.getSource(AMBIENT_SOURCE) as maplibregl.GeoJSONSource | undefined;
      source?.setData(ambient ?? EMPTY);
    };
    if (loadedRef.current) apply();
    else map.once('idle', apply);
  }, [ambient]);

  /* 주변 POI. 코스와 effect 를 나눠 두어야 산을 고를 때 코스 컬렉션까지 다시 올리지 않는다. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const source = map.getSource(AMBIENT_POI_SOURCE) as maplibregl.GeoJSONSource | undefined;
      source?.setData(ambientPois ?? EMPTY);
    };
    if (loadedRef.current) apply();
    else map.once('idle', apply);
  }, [ambientPois]);

  /* 개별 코스 선택 강조 */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      if (!map.getSource(COURSE_SOURCE)) return;
      map.removeFeatureState({ source: COURSE_SOURCE });
      if (!selectedCourseId || !bundle) return;
      for (const feature of bundle.courses.features) {
        const id = feature.properties?.['코스ID'] as string | undefined;
        if (!id) continue;
        map.setFeatureState(
          { source: COURSE_SOURCE, id },
          { courseSelected: id === selectedCourseId, courseDimmed: id !== selectedCourseId },
        );
      }
    };

    if (loadedRef.current) apply();
    else map.once('idle', apply);
  }, [selectedCourseId, bundle]);

  /*
   * POI 카테고리 필터. 코스를 하나 고르면 그 코스의 POI 만 남긴다 — 북한산은 1,768개다.
   * 코스 필터는 선택 산(poi-dot)에만 건다. 주변 산 POI 는 고른 코스와 무관하니 카테고리만 본다.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!map.getLayer('poi-dot') || !map.getLayer('ambient-poi-dot')) return;
      const byCategory: maplibregl.FilterSpecification = [
        'in',
        ['get', POI_CATEGORY_PROPERTY],
        ['literal', [...visiblePoiCategories]],
      ];
      map.setFilter('ambient-poi-dot', byCategory);
      map.setFilter(
        'poi-dot',
        selectedCourseId
          ? ['all', byCategory, ['==', ['get', '코스ID'], selectedCourseId]]
          : byCategory,
      );
    };
    if (loadedRef.current) apply();
    else map.once('idle', apply);
  }, [visiblePoiCategories, selectedCourseId]);

  /* 국립공원 탐방로 레이어 */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const source = map.getSource(NP_SOURCE) as maplibregl.GeoJSONSource | undefined;
      source?.setData(npTrails ?? EMPTY);
    };
    if (loadedRef.current) apply();
    else map.once('idle', apply);
  }, [npTrails]);

  /* 산악기상 레이어 */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const source = map.getSource(WEATHER_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (!source) return;
      source.setData({
        type: 'FeatureCollection',
        features: weather.map((station) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [station.lon, station.lat] },
          properties: {
            name: station.name,
            alt: station.alt,
            tempC: station.tempC,
            humidity: station.humidity,
            windMs: station.windMs,
            windDir: station.windDir,
          },
        })),
      });
      const visibility = showWeather ? 'visible' : 'none';
      for (const id of ['weather-dot', 'weather-temp']) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility);
      }
    };

    if (loadedRef.current) apply();
    else map.once('idle', apply);
  }, [weather, showWeather]);

  /* 선택 강조 */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      for (const m of mountains) {
        const key = mountainKey(m);
        map.setFeatureState({ source: PEAK_SOURCE, id: key }, { selected: key === selected });
      }
    };
    if (loadedRef.current) apply();
    else map.once('idle', apply);
  }, [selected, mountains]);

  // maplibre-gl.css 가 .maplibregl-map 에 position:relative 를 걸어
  // Tailwind 의 absolute inset-0 을 덮어쓴다. 크기는 유틸리티로 직접 준다.
  return <div ref={containerRef} className="size-full" />;
}
