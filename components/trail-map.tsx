'use client';

import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef } from 'react';

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
const TERRAIN_SOURCE = 'terrain-dem';
const HILLSHADE_SOURCE = 'hillshade-dem';

/**
 * 키가 필요 없는 전지구 DEM. terrarium 인코딩(RGB 에 고도를 담는 방식)이라
 * maplibre 의 raster-dem 소스에 encoding: 'terrarium' 을 반드시 지정해야 한다.
 * terrain-rgb(Mapbox 방식)로 잘못 읽으면 지형이 엉뚱하게 솟는다.
 */
const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const TERRAIN_ATTRIBUTION =
  '<a href="https://registry.opendata.aws/terrain-tiles/">Terrain Tiles</a>';

/** 산이 실제 비율로는 밋밋해 보인다. 등산로 기복이 읽히도록 살짝 과장한다. */
const TERRAIN_EXAGGERATION = 1.4;

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
  threeD: boolean;
  /** 선택과 무관하게 화면 안에 깔아두는 등산로. */
  ambient: GeoJSON.FeatureCollection | null;
  /** 지도가 멈출 때 현재 보이는 영역을 알려준다. 뷰포트 기준 지연 로딩에 쓴다. */
  onViewportChange: (view: { bounds: [number, number, number, number]; zoom: number }) => void;
}

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export function TrailMap({
  mountains,
  bundle,
  selected,
  onSelect,
  weather,
  showWeather,
  npTrails,
  threeD,
  ambient,
  onViewportChange,
}: TrailMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedRef = useRef(false);
  const fittedRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  const onViewportRef = useRef(onViewportChange);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    onViewportRef.current = onViewportChange;
  }, [onViewportChange]);

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
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');

    map.on('load', () => {
      map.addSource(TERRAIN_SOURCE, {
        type: 'raster-dem',
        tiles: [TERRAIN_TILES],
        tileSize: 256,
        maxzoom: 13,
        encoding: 'terrarium',
        attribution: TERRAIN_ATTRIBUTION,
      });
      // maplibre 는 지형과 hillshade 가 같은 소스를 공유하면 렌더링 품질이 떨어진다고 경고한다.
      // 타일 URL 은 같아도 소스를 분리하면 각자의 타일 캐시를 쓴다.
      map.addSource(HILLSHADE_SOURCE, {
        type: 'raster-dem',
        tiles: [TERRAIN_TILES],
        tileSize: 256,
        maxzoom: 13,
        encoding: 'terrarium',
      });
      map.addLayer({
        id: 'hillshade',
        type: 'hillshade',
        source: HILLSHADE_SOURCE,
        layout: { visibility: 'none' },
        paint: { 'hillshade-exaggeration': 0.5, 'hillshade-shadow-color': '#000000' },
      });

      map.addSource(PEAK_SOURCE, { type: 'geojson', data: EMPTY, promoteId: 'name' });
      map.addSource(COURSE_SOURCE, { type: 'geojson', data: EMPTY });
      map.addSource(POI_SOURCE, { type: 'geojson', data: EMPTY });

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

      // 주변 등산로. 선택하지 않아도 화면에 깔린다. 선택한 코스와 구분되게 흐리고 얇다.
      map.addSource(AMBIENT_SOURCE, { type: 'geojson', data: EMPTY });
      map.addLayer({
        id: 'ambient-line',
        type: 'line',
        source: AMBIENT_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#94a3b8',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 13, 1.4, 16, 2.4],
          'line-opacity': 0.55,
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
          'line-color': [
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
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.5, 13, 3, 16, 5],
        },
      });

      map.addLayer({
        id: 'poi-dot',
        type: 'circle',
        source: POI_SOURCE,
        minzoom: 12,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 2, 16, 5],
          'circle-color': [
            'match',
            ['get', '종류'],
            '갈림길',
            '#38bdf8',
            '쉼터',
            '#a78bfa',
            '조망점',
            '#fbbf24',
            '화장실',
            '#94a3b8',
            '#64748b',
          ],
          'circle-stroke-width': 0.5,
          'circle-stroke-color': '#0b0f0d',
        },
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
          'circle-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            '#3182f6',
            '#e2e8f0',
          ],
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

    const notifyViewport = () => {
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
            courses: m.courses,
          },
        })),
      });
    };

    if (loadedRef.current) apply();
    else map.once('idle', apply);
  }, [mountains]);

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
      // fitBounds 는 pitch 를 0 으로 되돌린다. 3D 상태면 기울기를 되살린다.
      map.fitBounds(bounds, { padding: 60, duration: 600, pitch: map.getPitch() });
    };

    if (loadedRef.current) apply();
    else map.once('idle', apply);
  }, [bundle]);

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

  /* 3D 지형 */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      if (!map.getSource(TERRAIN_SOURCE)) return;

      if (threeD) {
        map.setTerrain({ source: TERRAIN_SOURCE, exaggeration: TERRAIN_EXAGGERATION });
        if (map.getLayer('hillshade')) map.setLayoutProperty('hillshade', 'visibility', 'visible');
        // 위에서 내려다보면 3D 인지 알 수 없다. 기울여야 기복이 보인다.
        map.easeTo({ pitch: 62, duration: 900 });
      } else {
        map.setTerrain(null);
        if (map.getLayer('hillshade')) map.setLayoutProperty('hillshade', 'visibility', 'none');
        map.easeTo({ pitch: 0, bearing: 0, duration: 700 });
      }
    };

    if (loadedRef.current) apply();
    else map.once('idle', apply);
  }, [threeD]);

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
