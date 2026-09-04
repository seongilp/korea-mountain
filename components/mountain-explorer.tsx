'use client';

import { Box, List, Map as MapIcon, Mountain, Search, Thermometer, TreePine } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { BottomSheet, type SheetSnap } from '@/components/bottom-sheet';
import { CourseDetail, MountainStats } from '@/components/mountain-detail';
import { Button } from '@/components/ui/button';
import { DataNotice } from '@/components/data-notice';
import { ElevationLegend } from '@/components/elevation-legend';
import { MapLegend, type NpStats } from '@/components/map-legend';
import { MountainList } from '@/components/mountain-list';
import { PoiFilter } from '@/components/poi-filter';
import { TrackUploadButton } from '@/components/track-upload-button';
import { UserTrackCard } from '@/components/user-track-card';
import { mountainNote } from '@/lib/mountain-notes';
import { buildProfile } from '@/lib/elevation';
import {
  DEFAULT_VISIBLE_CATEGORIES,
  POI_CATEGORY_META,
  POI_MIN_ZOOM,
  withPoiCategories,
  type PoiCategory,
} from '@/lib/poi-category';
import { cn } from '@/lib/utils';
import { useIsCompact } from '@/lib/use-media-query';
import { useUserTrack } from '@/lib/use-user-track';
import {
  courseBundleUrl,
  mountainKey,
  peakCourseUrl,
  peakLabel,
  type MountainBundle,
  type MountainSummary,
} from '@/lib/mountains';
import type { WeatherStation } from '@/components/trail-map';

const TrailMap = dynamic(() => import('@/components/trail-map').then((m) => m.TrailMap), {
  ssr: false,
  loading: () => <div className="bg-muted/20 size-full animate-pulse" />,
});

// 브이월드는 전역 스크립트를 document 에 심으므로 SSR 을 타면 안 된다.
const VworldMap = dynamic(() => import('@/components/vworld-map').then((m) => m.VworldMap), {
  ssr: false,
  loading: () => <div className="bg-muted/20 size-full animate-pulse" />,
});

/**
 * 브이월드 인증키. 클라이언트 스크립트라 노출될 수밖에 없고, 브이월드는 키를 발급 도메인에
 * 묶어 서버에서 Referer 로 검사하는 방식으로 보호한다 — 즉 노출이 이 API 의 설계상 정상이다.
 * 키가 없으면 VW 버튼을 잠그고, 나머지 기능은 그대로 돌아가게 둔다.
 */
const VWORLD_KEY = process.env.NEXT_PUBLIC_VWORLD_KEY ?? '';

/** 사이드바에 한 번에 그리는 최대 개수. 봉우리 데이터는 4,000개가 넘어 전부 그리면 DOM 이 죽는다. */
const MAX_LIST_ROWS = 200;

/** 이 줌 아래에서는 주변 등산로를 깔지 않는다. 전국 뷰에서 6,748 코스는 의미도 없고 무겁다. */
const AMBIENT_MIN_ZOOM = 10.5;

/** 한 화면에서 동시에 불러오는 산의 최대 개수. 네트워크와 메모리를 묶어 둔다. */
const AMBIENT_MAX_MOUNTAINS = 40;

type Dataset = 'myeongsan' | 'peaks';

/** 화면 안 한 산의 POI. key 는 mountainKey 와 같아 선택 산을 골라낼 때 쓴다. */
interface AmbientPoiPart {
  key: string;
  features: GeoJSON.Feature[];
}

export function MountainExplorer({ mountains }: { mountains: MountainSummary[] }) {
  const [dataset, setDataset] = useState<Dataset>('myeongsan');
  const [peaks, setPeaks] = useState<MountainSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [bundle, setBundle] = useState<MountainBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWeather, setShowWeather] = useState(false);
  const [weather, setWeather] = useState<WeatherStation[]>([]);
  const [observedAt, setObservedAt] = useState<string | null>(null);
  // 모바일에서는 사이드바가 지도를 덮는 시트로 뜬다. lg 이상에서는 이 상태를 쓰지 않는다.
  const [listOpen, setListOpen] = useState(false);
  /*
   * 좁은 화면에서는 산 요약·코스 목록·고도 프로파일을 겹쳐 띄우지 않고 바텀시트 하나로 묶는다.
   * 겹쳐 띄우면 393px 에서 지도에 세로 117px 짜리 띠만 남는다(실측).
   */
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('peek');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  // 지도에 그릴 POI 카테고리. 기본 7개만 켜고, '전체' 를 펼치면 나머지 칩이 드러난다.
  const [poiVisible, setPoiVisible] = useState<readonly PoiCategory[]>(DEFAULT_VISIBLE_CATEGORIES);
  const [poiExpanded, setPoiExpanded] = useState(false);
  // 위성 영상만으로는 어느 시군구인지 분간이 안 된다. VW 모드에서만 의미가 있다.
  const [vworldBoundary, setVworldBoundary] = useState(true);
  const [vworld, setVworld] = useState(false);
  /**
   * 브이월드 뷰어(ws3d.viewer)는 전역 싱글턴이고 destroy 후 재생성이 안 된다. 한 번 켠 뒤에는
   * 언마운트하지 않고 CSS 로만 숨긴다. 처음 켜기 전에는 마운트하지 않으므로 Cesium 번들도
   * 그때까지 받지 않는다.
   */
  const [vworldMounted, setVworldMounted] = useState(false);
  const [showParks, setShowParks] = useState(false);
  const [npTrails, setNpTrails] = useState<GeoJSON.FeatureCollection | null>(null);
  const [view, setView] = useState<{
    bounds: [number, number, number, number];
    zoom: number;
  } | null>(null);
  const [ambient, setAmbient] = useState<GeoJSON.FeatureCollection | null>(null);
  /*
   * 화면 안 산들의 POI 를 산별로 들고 있는다. 코스와 한 컬렉션으로 묶지 않는 이유는
   * 산을 고를 때 그 산 것만 빼야 하는데, 그때마다 코스 컬렉션까지 새로 만들면 maplibre 가
   * 수천 코스를 다시 파싱하기 때문이다.
   */
  const [ambientPoiParts, setAmbientPoiParts] = useState<AmbientPoiPart[]>([]);
  // 이미 받은 번들을 재사용한다. 지도를 움직일 때마다 다시 받으면 안 된다.
  // 캐시에 넣는 시점에 카테고리를 붙여 두므로 이후에는 재계산하지 않는다.
  const bundleCache = useRef(new Map<string, MountainBundle>());

  const [npStats, setNpStats] = useState<NpStats | null>(null);

  /*
   * 사용자 GPX/KML 트랙. 산 선택과 독립이라 둘 다 있으면 둘 다 보인다.
   * 파일은 브라우저 안에서만 읽는다 — 훅 안에 fetch 가 없다는 게 그 약속이다.
   */
  const { track: userTrack, revision: userTrackRevision, importFile, clear: clearTrack } =
    useUserTrack(setError);
  const [dragging, setDragging] = useState(false);
  // 좁은 화면에서 트랙만 있을 때 시트를 끝까지 내리면 트랙을 지우지 않고 시트만 숨긴다.
  const [trackSheetHidden, setTrackSheetHidden] = useState(false);

  // 봉우리 인덱스는 탭을 켤 때 한 번만 받는다.
  useEffect(() => {
    if (dataset !== 'peaks' || peaks) return;
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch('/data/peaks.json');
        if (!response.ok) throw new Error('봉우리 목록 조회 실패');
        const body = (await response.json()) as MountainSummary[];
        if (!cancelled) setPeaks(body);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : '봉우리 목록 조회 실패');
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [dataset, peaks]);

  const source = useMemo(
    () => (dataset === 'peaks' ? (peaks ?? []) : mountains),
    [dataset, peaks, mountains],
  );

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return source;
    return source.filter((m) => m.name.includes(q));
  }, [source, query]);

  // 목록은 잘라서 그린다. 나머지는 검색으로 좁히게 안내한다.
  const visible = useMemo(() => filtered.slice(0, MAX_LIST_ROWS), [filtered]);
  const hidden = filtered.length - visible.length;

  useEffect(() => {
    const controller = new AbortController();

    // effect 본문에서 동기 setState 를 하면 연쇄 렌더가 난다. 전부 async 경계 뒤로 미룬다.
    const load = async () => {
      if (!selected) {
        setBundle(null);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const target = source.find((m) => mountainKey(m) === selected);
        if (!target) return;
        // 주변 레이어가 이미 받아 둔 산이면(카테고리도 붙어 있다) 다시 받지 않는다.
        const cached = bundleCache.current.get(selected);
        if (cached) {
          setBundle(cached);
          return;
        }
        // 새 산의 번들을 받는 동안 이전 산의 코스가 화면에 남아 있으면 지도가 옮겨가지
        // 않는다(trail-map 의 화면 이동 effect 가 bundle 변경에만 반응한다). fetch 가
        // 끝나기 전에 비워 두면 실패해도 이전 산 것이 계속 그려지는 일도 막힌다.
        setBundle(null);
        const url =
          dataset === 'peaks' ? peakCourseUrl(target.name, target.file) : courseBundleUrl(target.name);
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`코스 조회 실패 (HTTP ${response.status})`);
        const body = (await response.json()) as MountainBundle;
        if (!Array.isArray(body?.courses?.features) || !Array.isArray(body?.pois?.features)) {
          throw new Error('코스 데이터 형식이 맞지 않습니다');
        }
        // 정적 번들에는 카테고리가 없다. 받는 자리에서 붙인다(원본은 새 객체로 남긴다).
        if (!controller.signal.aborted) {
          setBundle({ ...body, pois: withPoiCategories(body.pois) });
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : '코스 조회 실패');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void load();
    return () => controller.abort();
  }, [selected, dataset, source]);

  // 산악기상은 토글을 켤 때 한 번만 불러온다. 450여 지점이라 기본 로드에 넣지 않는다.
  useEffect(() => {
    if (!showWeather || weather.length > 0) return;
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch('/api/mountain-weather');
        const body = await response.json();
        if (!response.ok) throw new Error(body.message ?? '산악기상 조회 실패');
        if (cancelled) return;
        setWeather(body.stations as WeatherStation[]);
        setObservedAt(body.observedAt as string);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : '산악기상 조회 실패');
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [showWeather, weather.length]);

  /**
   * 국립공원 탐방로. 21개 공원 파일(합계 3.2MB)을 토글 시 한 번만 받아 합친다.
   * 개별 공원 단위로 나눠 둔 덕에 나중에 공원별 필터를 붙이기 쉽다.
   */
  useEffect(() => {
    if (!showParks || npTrails) return;
    let cancelled = false;

    const load = async () => {
      try {
        const indexResponse = await fetch('/data/np-parks.json');
        if (!indexResponse.ok) throw new Error('국립공원 목록 조회 실패');
        const parks = (await indexResponse.json()) as { park: string }[];

        const bundles = await Promise.all(
          parks.map(async (park) => {
            const response = await fetch(`/data/np-trails/${encodeURIComponent(park.park)}.json`);
            if (!response.ok) throw new Error(`${park.park} 탐방로 조회 실패`);
            return (await response.json()) as GeoJSON.FeatureCollection;
          }),
        );
        if (cancelled) return;

        const features = bundles.flatMap((bundle) => bundle.features);
        setNpTrails({ type: 'FeatureCollection', features });
        setNpStats({
          courses: features.length,
          closed: features.filter((f) => f.properties?.closed).length,
          parks: parks.length,
        });
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : '탐방로 조회 실패');
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [showParks, npTrails]);

  /**
   * 화면 안 산들의 등산로를 미리 깔아둔다.
   *
   * 선택해야만 보이면 지도가 비어 보인다. 그렇다고 6,748 코스(19MB)를 통째로 줄 수는 없어서
   * 줌이 충분할 때 보이는 범위의 산만 골라 받는다.
   */
  useEffect(() => {
    let cancelled = false;

    // effect 본문에서 동기 setState 를 하면 연쇄 렌더가 난다. 전부 async 경계 뒤로 미룬다.
    const load = async () => {
      if (!view || view.zoom < AMBIENT_MIN_ZOOM) {
        setAmbient(null);
        setAmbientPoiParts([]);
        return;
      }

      const [west, south, east, north] = view.bounds;
      const inView = source
        .filter((m) => m.lon >= west && m.lon <= east && m.lat >= south && m.lat <= north)
        .slice(0, AMBIENT_MAX_MOUNTAINS);

      if (inView.length === 0) {
        setAmbient(null);
        setAmbientPoiParts([]);
        return;
      }

      const cache = bundleCache.current;

      await Promise.all(
        inView.map(async (mountain) => {
          const key = mountainKey(mountain);
          if (cache.has(key)) return;
          try {
            const url =
              dataset === 'peaks'
                ? peakCourseUrl(mountain.name, mountain.file)
                : courseBundleUrl(mountain.name);
            const response = await fetch(url);
            if (!response.ok) return;
            const body = (await response.json()) as MountainBundle;
            if (!Array.isArray(body?.courses?.features) || !Array.isArray(body?.pois?.features)) {
              return;
            }
            // 정적 번들에는 카테고리가 없다. 캐시에 넣기 전에 한 번만 붙인다.
            cache.set(key, { ...body, pois: withPoiCategories(body.pois) });
          } catch {
            // 개별 산 실패는 조용히 넘긴다. 배경 레이어라 하나 빠져도 화면이 성립한다.
          }
        }),
      );

      if (cancelled) return;
      const features = inView.flatMap(
        (mountain) => cache.get(mountainKey(mountain))?.courses.features ?? [],
      );
      setAmbient({ type: 'FeatureCollection', features });
      setAmbientPoiParts(
        inView.flatMap((mountain) => {
          const key = mountainKey(mountain);
          const pois = cache.get(key)?.pois.features;
          return pois && pois.length > 0 ? [{ key, features: pois }] : [];
        }),
      );
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [view, source, dataset]);

  const handleSelect = useCallback((name: string) => {
    setSelected((current) => (current === name ? null : name));
    setSelectedCourseId(null);
    // 모바일에서 목록을 고른 뒤 시트가 지도를 계속 가리면 고른 의미가 없다.
    setListOpen(false);
  }, []);

  const handleDataset = useCallback((next: Dataset) => {
    setDataset(next);
    setSelected(null);
    setQuery('');
    // 이전 데이터셋에서 난 오류 배너가 남아 새 탭에서도 실패한 것처럼 보이는 걸 막는다.
    setError(null);
    setAmbient(null);
    setAmbientPoiParts([]);
    setSelectedCourseId(null);
    bundleCache.current.clear();
  }, []);

  /*
   * 지도에 넘길 주변 POI. 선택한 산은 뺀다 — 그 산의 POI 는 선택 번들 쪽(코스 필터가 걸리는
   * 소스)에서 그리므로, 여기 남겨 두면 같은 점이 두 번 찍히고 코스 필터도 무력해진다.
   * 선택 산 밖의 다른 산 POI 는 그대로 남아 계속 보인다.
   */
  const ambientPois = useMemo<GeoJSON.FeatureCollection | null>(() => {
    const parts = ambientPoiParts.filter((part) => part.key !== selected);
    if (parts.length === 0) return null;
    return { type: 'FeatureCollection', features: parts.flatMap((part) => part.features) };
  }, [ambientPoiParts, selected]);

  const selectedCourse = useMemo(() => {
    if (!bundle || !selectedCourseId) return null;
    return (
      bundle.courses.features.find((f) => f.properties?.['코스ID'] === selectedCourseId) ?? null
    );
  }, [bundle, selectedCourseId]);

  const profile = useMemo(
    () => (selectedCourse ? buildProfile(selectedCourse.geometry) : null),
    [selectedCourse],
  );

  const current = useMemo(
    () => source.find((m) => mountainKey(m) === selected) ?? null,
    [source, selected],
  );

  const isCompact = useIsCompact();

  /*
   * 코스를 고르면 고도 프로파일이 시트 안에 들어가는데, peek(28%) 에서는 안 보인다.
   * 고르는 순간 한 번만 half 로 올린다. 그 뒤 사용자가 내리면 그대로 둔다.
   * effect 로 하면 연쇄 렌더가 나므로 선택 핸들러에서 처리한다.
   */
  const handleSelectCourse = useCallback((id: string | null) => {
    setSelectedCourseId(id);
    if (id) setSheetSnap((snap) => (snap === 'peek' ? 'half' : snap));
  }, []);

  const handleTogglePoi = useCallback((category: PoiCategory) => {
    setPoiVisible((current) =>
      current.includes(category) ? current.filter((c) => c !== category) : [...current, category],
    );
  }, []);

  // 접으면 칩이 사라진 카테고리가 지도에 남지 않게 기본 표시 밖의 것은 같이 끈다.
  const handleTogglePoiExpanded = useCallback(() => {
    setPoiExpanded((expanded) => {
      if (expanded) {
        setPoiVisible((current) => current.filter((c) => POI_CATEGORY_META[c].defaultVisible));
      }
      return !expanded;
    });
  }, []);

  // 3D(브이월드)와 2D(maplibre)는 배타적이다. 둘을 겹쳐 놓으면 어느 쪽을 보는지 알 수 없다.
  const handleVworld = useCallback(() => {
    setVworld((value) => {
      const next = !value;
      if (next) setVworldMounted(true);
      return next;
    });
  }, []);

  // 객체 리터럴을 그대로 넘기면 매 렌더마다 새 참조가 되어 카메라가 계속 다시 움직인다.
  const vworldFocus = useMemo(
    () => (current ? { lon: current.lon, lat: current.lat } : null),
    [current],
  );

  const handleTrackFile = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      setTrackSheetHidden(false);
      void importFile(file);
    },
    [importFile],
  );

  // 지도 위에 파일을 떨어뜨려도 받는다. 드래그 중에는 살짝 표시해 "여기 놓아도 된다" 를 알린다.
  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      handleTrackFile(event.dataTransfer.files?.[0]);
    },
    [handleTrackFile],
  );
  const handleDragOver = useCallback((event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    if (!dragging) setDragging(true);
  }, [dragging]);

  // 좁은 화면 시트는 산과 트랙 중 하나라도 있으면 뜬다. 트랙만 있고 사용자가 내렸으면 숨긴다.
  const sheetVisible = isCompact && (current !== null || (userTrack !== null && !trackSheetHidden));

  return (
    <div className="flex h-dvh flex-col">
      <header className="border-border flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3">
        <Mountain className="text-primary size-5" aria-hidden />
        <h1 className="text-base font-bold">산행나우</h1>
        <div className="border-border flex overflow-hidden rounded-md border text-xs">
          {(
            [
              ['myeongsan', '100대명산'],
              ['peaks', '전국 봉우리'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => handleDataset(key)}
              aria-pressed={dataset === key}
              className={cn(
                'px-2.5 py-1.5 transition-colors',
                dataset === key ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-muted-foreground hidden text-xs sm:inline">
          {filtered.length.toLocaleString()}곳
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="lg:hidden"
            onClick={() => setListOpen(true)}
            aria-label="산 목록 열기"
          >
            <List className="size-4" />
          </Button>
          {showWeather && observedAt && (
            <span className="text-muted-foreground hidden text-xs md:inline">
              {observedAt.slice(5, 16)} 관측 · {weather.length}지점
            </span>
          )}
          {/* 경계 오버레이는 위성 영상 위에서만 의미가 있어 3D 모드에서만 보인다. */}
          {vworld && (
            <Button
              variant={vworldBoundary ? 'default' : 'outline'}
              size="sm"
              onClick={() => setVworldBoundary((value) => !value)}
              title="행정경계와 지명을 위성 영상 위에 겹칩니다"
            >
              <MapIcon className="size-4" />
              경계
            </Button>
          )}
          <Button
            variant={vworld ? 'default' : 'outline'}
            size="sm"
            onClick={handleVworld}
            disabled={!VWORLD_KEY}
            title={
              VWORLD_KEY
                ? '위성 영상 3D 지형으로 봅니다 (국토교통부 브이월드)'
                : 'NEXT_PUBLIC_VWORLD_KEY 가 설정돼 있지 않습니다'
            }
          >
            <Box className="size-4" />
            3D
          </Button>
          <Button
            variant={showParks ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowParks((value) => !value)}
          >
            <TreePine className="size-4" />
            국립공원
          </Button>
          <TrackUploadButton active={userTrack !== null} onFile={handleTrackFile} />
          <Button
            variant={showWeather ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowWeather((value) => !value)}
          >
            <Thermometer className="size-4" />
            산악기상
          </Button>
        </div>
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="산 이름 검색"
            aria-label="산 이름 검색"
            className="border-border bg-background focus:ring-ring w-32 rounded-md border py-1.5 pr-3 pl-8 text-sm focus:ring-2 focus:outline-none sm:w-56"
          />
        </div>
      </header>

      {error && (
        <p className="border-destructive/40 bg-destructive/10 shrink-0 border-b px-4 py-2 text-xs">
          {error}
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        {/* 모바일에서 시트를 닫기 위한 배경. lg 이상에서는 렌더하지 않는다. */}
        {listOpen && (
          <button
            type="button"
            aria-label="목록 닫기"
            onClick={() => setListOpen(false)}
            className="bg-background/60 absolute inset-0 z-30 backdrop-blur-sm lg:hidden"
          />
        )}

        <MountainList
          visible={visible}
          total={filtered.length}
          hidden={hidden}
          selected={selected}
          open={listOpen}
          loadingHint={dataset === 'peaks' && !peaks}
          onSelect={handleSelect}
          onClose={() => setListOpen(false)}
        />

        <main
          className={cn('relative min-w-0 flex-1', dragging && 'ring-primary/60 ring-2 ring-inset')}
          onDragOver={handleDragOver}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          {/* 안전 고지. 국립공원 레이어를 켰을 때만 강조된다 — 2017년 기준 통제 표시를
              현재 상황으로 오독하는 순간이 실제로 위험하기 때문이다. */}
          {/*
            바텀시트가 열리면 그 높이만큼 밀어 올린다. BottomSheet 가 자기 실제 높이를
            부모(main)의 --sheet-h 로 흘려보내므로 드래그 중에도 따라온다.
          */}
          <DataNotice
            parkLayerActive={showParks}
            mountainNote={mountainNote(current?.name, dataset === 'myeongsan')}
            style={{ bottom: 'calc(var(--sheet-h, 0px) + 1rem)' }}
            className="absolute inset-x-4 z-20 mx-auto max-w-2xl md:inset-x-auto md:left-1/2 md:w-[36rem] md:-translate-x-1/2"
          />

          {/* 두 지도를 겹쳐 두고 표시만 바꾼다. maplibre 를 언마운트하면 뷰포트와 타일 캐시를 잃는다. */}
          <div className={cn('size-full', vworld && 'hidden')}>
            <TrailMap
              mountains={source}
              bundle={bundle}
              selected={selected}
              focus={vworldFocus}
              onSelect={handleSelect}
              weather={weather}
              showWeather={showWeather}
              npTrails={showParks ? npTrails : null}
              ambient={ambient}
              ambientPois={ambientPois}
              onViewportChange={setView}
              compact={isCompact}
              selectedCourseId={selectedCourseId}
              onSelectCourse={handleSelectCourse}
              visiblePoiCategories={poiVisible}
              userTrack={userTrack}
              userTrackRevision={userTrackRevision}
            />
          </div>

          {/* POI 는 줌 12 부터 그려진다. 산을 골랐거나 화면 안 산의 POI 가 보일 때만 칩을 띄운다. */}
          {(bundle || (ambientPois && view && view.zoom >= POI_MIN_ZOOM)) && !vworld && (
            <div
              className={cn(
                'bg-card/85 border-border absolute z-10 rounded-md border px-2 py-1.5 backdrop-blur',
                // 좁은 화면은 고도 범례 바로 아래, 데스크톱은 산 패널 오른쪽 옆.
                isCompact ? 'top-12 right-14 left-3' : 'top-4 left-72 max-w-md',
              )}
            >
              <PoiFilter
                visible={poiVisible}
                expanded={poiExpanded}
                onToggle={handleTogglePoi}
                onToggleExpanded={handleTogglePoiExpanded}
              />
            </div>
          )}

          {vworldMounted && (
            <div className={cn('absolute inset-0', !vworld && 'hidden')}>
              <VworldMap
                apiKey={VWORLD_KEY}
                bundle={bundle}
                focus={vworldFocus}
                active={vworld}
                selectedCourseId={selectedCourseId}
                showBoundary={vworldBoundary}
                viewport={view}
              />
            </div>
          )}

          {/* 데스크톱: 지도 위에 겹치는 패널. 지도가 넓어 겹쳐도 가려지는 면적이 작다. */}
          {current && !isCompact && (
            <div className="bg-card/90 border-border absolute top-4 left-4 z-10 w-64 rounded-lg border p-3 backdrop-blur">
              <h2 className="mb-2 text-sm font-bold">
                {current.name}
                {current.region && (
                  <span className="text-muted-foreground ml-2 text-xs font-normal">
                    {current.region}
                  </span>
                )}
              </h2>
              <MountainStats
                mountain={current}
                bundle={bundle}
                loading={loading}
                selectedCourseId={selectedCourseId}
                onSelectCourse={handleSelectCourse}
              />
            </div>
          )}

          {/* 데스크톱: 개별 코스 상세. 산 요약 패널과 겹치지 않게 아래에 붙인다. */}
          {profile && selectedCourse && !isCompact && (
            <div className="bg-card/95 border-border absolute right-4 bottom-24 z-20 w-[34rem] rounded-lg border p-3 backdrop-blur">
              <CourseDetail
                bundle={bundle}
                course={selectedCourse}
                courseId={selectedCourseId}
                profile={profile}
                onClose={() => setSelectedCourseId(null)}
              />
            </div>
          )}

          {/* 데스크톱: 내 트랙 카드. 우상단(줌 컨트롤 왼쪽). 산 패널(좌상단)·코스 상세(우하단)와
              안 겹치게 남은 모서리를 쓴다. 고도 프로파일이 읽히려면 폭이 26rem 은 돼야 한다. */}
          {userTrack && !isCompact && (
            <div className="bg-card/90 border-border absolute top-4 right-14 z-10 w-[26rem] rounded-lg border p-3 backdrop-blur">
              <UserTrackCard track={userTrack} onClear={clearTrack} />
            </div>
          )}

          {/*
            좁은 화면: 겹치지 않고 바텀시트 하나로 묶는다. 손잡이를 끌거나 탭해서
            peek(28%)·half(56%)·full(94%) 로 높이를 바꾸고, peek 아래로 끌면 선택이 풀린다.
          */}
          {sheetVisible && (
            <BottomSheet
              snap={sheetSnap}
              onSnapChange={setSheetSnap}
              onDismiss={() => {
                // 시트를 끝까지 내리면 산 선택 자체를 푼다. 지도만 보고 싶다는 뜻이다.
                // 트랙만 있을 때는 트랙을 지우지 않고(파일을 다시 고르게 만들면 안 된다) 시트만 숨긴다.
                setSelectedCourseId(null);
                setSelected(null);
                setTrackSheetHidden(true);
              }}
              header={
                <div className="flex items-baseline gap-2 px-3 pb-2">
                  <h2 className="min-w-0 flex-1 truncate text-sm font-bold">
                    {/* 트랙만 있을 때 카드가 이름을 또 보여주므로 헤더는 구분 라벨만. */}
                    {current ? current.name : '내 트랙'}
                    {current?.region && (
                      <span className="text-muted-foreground ml-2 text-xs font-normal">
                        {current.region}
                      </span>
                    )}
                  </h2>
                  {current && (
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      {peakLabel(current.peakM)}
                    </span>
                  )}
                </div>
              }
            >
              <div className="space-y-3 px-3 pb-3">
                {userTrack && (
                  <UserTrackCard
                    track={userTrack}
                    onClear={clearTrack}
                    className={cn(current && 'border-border/60 border-b pb-3')}
                  />
                )}
                {profile && selectedCourse && (
                  <CourseDetail
                    bundle={bundle}
                    course={selectedCourse}
                    courseId={selectedCourseId}
                    profile={profile}
                    onClose={() => setSelectedCourseId(null)}
                  />
                )}
                {current && (
                  <MountainStats
                    mountain={current}
                    bundle={bundle}
                    loading={loading}
                    selectedCourseId={selectedCourseId}
                    onSelectCourse={handleSelectCourse}
                    // 시트가 스크롤을 가지므로 목록 자체는 자르지 않는다.
                    courseListClassName=""
                  />
                )}
              </div>
            </BottomSheet>
          )}

          {/* 좁은 화면: 하단은 안내 배너·바텀시트가 차지하므로 고도 범례만 왼쪽 위에 가로로 놓는다. */}
          <div className="bg-card/85 border-border pointer-events-none absolute top-3 left-3 z-10 rounded-md border px-2 py-1.5 text-[11px] backdrop-blur sm:hidden">
            <ElevationLegend compact />
          </div>

          <MapLegend showParks={showParks} npStats={npStats} hasUserTrack={userTrack !== null} />
        </main>
      </div>
    </div>
  );
}
