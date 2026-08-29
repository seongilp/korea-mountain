'use client';

import {
  Box,
  Globe,
  List,
  Map as MapIcon,
  Mountain,
  Route,
  Search,
  Thermometer,
  TreePine,
  TrendingUp,
  X,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { DataNotice } from '@/components/data-notice';
import { ElevationProfile } from '@/components/elevation-profile';
import { ScrollArea } from '@/components/ui/scroll-area';
import { buildProfile } from '@/lib/elevation';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  courseBundleUrl,
  mountainKey,
  peakCourseUrl,
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

/**
 * 코스ID(`설악산_0000000005`)는 사람이 못 읽는다. 번들 안에서의 순번으로 바꿔 보여준다.
 * 원본에 코스 이름이 없어서(100대명산·봉우리 데이터 모두) 순번이 최선이다.
 */
function courseLabel(bundle: MountainBundle | null, courseId: string | null): string {
  if (!bundle || !courseId) return '코스';
  const index = bundle.courses.features.findIndex((f) => f.properties?.['코스ID'] === courseId);
  return index < 0 ? '코스' : `${index + 1}코스`;
}

/** 이 줌 아래에서는 주변 등산로를 깔지 않는다. 전국 뷰에서 6,748 코스는 의미도 없고 무겁다. */
const AMBIENT_MIN_ZOOM = 10.5;

/** 한 화면에서 동시에 불러오는 산의 최대 개수. 네트워크와 메모리를 묶어 둔다. */
const AMBIENT_MAX_MOUNTAINS = 40;

type Dataset = 'myeongsan' | 'peaks';

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
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [threeD, setThreeD] = useState(false);
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
  // 이미 받은 번들을 재사용한다. 지도를 움직일 때마다 다시 받으면 안 된다.
  const bundleCache = useRef(new Map<string, MountainBundle>());

  const [npStats, setNpStats] = useState<{
    courses: number;
    closed: number;
    parks: number;
  } | null>(null);

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
        const url =
          dataset === 'peaks' ? peakCourseUrl(target.name, target.file) : courseBundleUrl(target.name);
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`코스 조회 실패 (HTTP ${response.status})`);
        const body = (await response.json()) as MountainBundle;
        if (!controller.signal.aborted) setBundle(body);
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
        return;
      }

      const [west, south, east, north] = view.bounds;
      const inView = source
        .filter((m) => m.lon >= west && m.lon <= east && m.lat >= south && m.lat <= north)
        .slice(0, AMBIENT_MAX_MOUNTAINS);

      if (inView.length === 0) {
        setAmbient(null);
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
            cache.set(key, (await response.json()) as MountainBundle);
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
    setSelectedCourseId(null);
    bundleCache.current.clear();
  }, []);

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

  // 브이월드 지도와 maplibre 지도는 배타적이다. 둘을 겹쳐 놓으면 어느 쪽을 보는지 알 수 없다.
  const handleVworld = useCallback(() => {
    setVworld((value) => {
      const next = !value;
      if (next) {
        setVworldMounted(true);
        setThreeD(false);
      }
      return next;
    });
  }, []);

  const handleThreeD = useCallback(() => {
    setThreeD((value) => {
      if (!value) setVworld(false);
      return !value;
    });
  }, []);

  // 객체 리터럴을 그대로 넘기면 매 렌더마다 새 참조가 되어 카메라가 계속 다시 움직인다.
  const vworldFocus = useMemo(
    () => (current ? { lon: current.lon, lat: current.lat } : null),
    [current],
  );

  return (
    <div className="flex h-dvh flex-col">
      <header className="border-border flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3">
        <Mountain className="text-primary size-5" aria-hidden />
        <h1 className="text-base font-bold">산행</h1>
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
          {/* 경계 오버레이는 위성 영상 위에서만 의미가 있어 VW 모드에서만 보인다. */}
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
            variant={threeD ? 'default' : 'outline'}
            size="sm"
            onClick={handleThreeD}
            title="지형을 3D 로 보고 드래그로 회전합니다"
          >
            <Box className="size-4" />
            3D
          </Button>
          <Button
            variant={vworld ? 'default' : 'outline'}
            size="sm"
            onClick={handleVworld}
            disabled={!VWORLD_KEY}
            title={
              VWORLD_KEY
                ? '국토교통부 브이월드 위성 3D 지도로 봅니다'
                : 'NEXT_PUBLIC_VWORLD_KEY 가 설정돼 있지 않습니다'
            }
          >
            <Globe className="size-4" />
            VW
          </Button>
          <Button
            variant={showParks ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowParks((value) => !value)}
          >
            <TreePine className="size-4" />
            국립공원
          </Button>
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

        <nav
          className={cn(
            'border-border bg-background w-64 shrink-0 border-r',
            // lg 미만에서는 지도 위로 떠오르는 시트. 닫히면 화면 밖으로 밀어낸다.
            'absolute inset-y-0 left-0 z-40 transition-transform lg:static lg:z-auto lg:translate-x-0',
            listOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="border-border flex items-center justify-between border-b px-4 py-2 lg:hidden">
            <span className="text-sm font-medium">{filtered.length.toLocaleString()}곳</span>
            <button
              type="button"
              onClick={() => setListOpen(false)}
              aria-label="목록 닫기"
              className="hover:bg-accent text-muted-foreground rounded-md p-1"
            >
              <X className="size-4" />
            </button>
          </div>
          <ScrollArea className="h-full">
            <ul className="divide-border/60 divide-y">
              {visible.map((mountain) => (
                <li key={mountainKey(mountain)}>
                  <button
                    type="button"
                    onClick={() => handleSelect(mountainKey(mountain))}
                    aria-current={selected === mountainKey(mountain)}
                    className={cn(
                      'hover:bg-accent/60 flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                      selected === mountainKey(mountain) && 'bg-accent',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">
                        {mountain.name}
                        {mountain.region && (
                          // 동명 봉우리가 1,915개라 지역 없이는 목록에서 구분이 안 된다.
                          <span className="text-muted-foreground ml-1.5 text-[11px]">
                            {mountain.region}
                          </span>
                        )}
                      </span>
                      <span className="text-muted-foreground flex items-center gap-2 text-[11px]">
                        <span className="flex items-center gap-0.5">
                          <TrendingUp className="size-3" aria-hidden />
                          {mountain.peakM === null ? '—' : `${mountain.peakM}m`}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Route className="size-3" aria-hidden />
                          {mountain.courses}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="text-muted-foreground px-4 py-6 text-center text-sm">
                  {dataset === 'peaks' && !peaks ? '불러오는 중…' : '검색 결과가 없습니다.'}
                </li>
              )}
              {hidden > 0 && (
                <li className="text-muted-foreground px-4 py-3 text-center text-xs">
                  외 {hidden.toLocaleString()}곳 — 검색으로 좁혀보세요
                </li>
              )}
            </ul>
          </ScrollArea>
        </nav>

        <main className="relative min-w-0 flex-1">
          {/* 안전 고지. 국립공원 레이어를 켰을 때만 강조된다 — 2017년 기준 통제 표시를
              현재 상황으로 오독하는 순간이 실제로 위험하기 때문이다. */}
          <DataNotice
            parkLayerActive={showParks}
            className="absolute inset-x-4 bottom-4 z-20 mx-auto max-w-2xl md:inset-x-auto md:left-1/2 md:w-[36rem] md:-translate-x-1/2"
          />

          {/* 두 지도를 겹쳐 두고 표시만 바꾼다. maplibre 를 언마운트하면 뷰포트와 타일 캐시를 잃는다. */}
          <div className={cn('size-full', vworld && 'hidden')}>
            <TrailMap
              mountains={source}
              bundle={bundle}
              selected={selected}
              onSelect={handleSelect}
              weather={weather}
              showWeather={showWeather}
              npTrails={showParks ? npTrails : null}
              threeD={threeD}
              ambient={ambient}
              onViewportChange={setView}
              selectedCourseId={selectedCourseId}
              onSelectCourse={setSelectedCourseId}
            />
          </div>

          {vworldMounted && (
            <div className={cn('absolute inset-0', !vworld && 'hidden')}>
              <VworldMap
                apiKey={VWORLD_KEY}
                bundle={bundle}
                focus={vworldFocus}
                active={vworld}
                selectedCourseId={selectedCourseId}
                showBoundary={vworldBoundary}
              />
            </div>
          )}

          {current && (
            <div className="bg-card/90 border-border absolute top-4 left-4 z-10 w-64 rounded-lg border p-3 backdrop-blur">
              <h2 className="text-sm font-bold">
                {current.name}
                {current.region && (
                  <span className="text-muted-foreground ml-2 text-xs font-normal">
                    {current.region}
                  </span>
                )}
              </h2>
              <dl className="text-muted-foreground mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                <dt>코스 최고점</dt>
                <dd className="text-foreground text-right">
                  {current.peakM === null ? '—' : `${current.peakM}m`}
                </dd>
                <dt>코스 수</dt>
                <dd className="text-foreground text-right">{current.courses}개</dd>
                <dt>총 연장</dt>
                <dd className="text-foreground text-right">{current.totalKm}km</dd>
                <dt>최장 코스</dt>
                <dd className="text-foreground text-right">{current.longestKm}km</dd>
              </dl>
              {loading && <Skeleton className="mt-3 h-4 w-full" />}
              {bundle && !loading && (
                <>
                  <p className="text-muted-foreground mt-3 text-xs">
                    코스 {bundle.courses.features.length}개 · POI {bundle.pois.features.length}개
                  </p>
                  {/* 지도에서 선을 정확히 누르기는 어렵다. 특히 모바일에서.
                      목록으로도 고를 수 있어야 실제로 쓸 수 있다. */}
                  <ul className="border-border/60 mt-2 max-h-40 space-y-0.5 overflow-y-auto border-t pt-2">
                    {bundle.courses.features.map((feature) => {
                      const id = feature.properties?.['코스ID'] as string | undefined;
                      if (!id) return null;
                      const km = feature.properties?.['거리_km'] as number | undefined;
                      const gain = feature.properties?.['누적상승_m'] as number | undefined;
                      return (
                        <li key={id}>
                          <button
                            type="button"
                            onClick={() => setSelectedCourseId(id === selectedCourseId ? null : id)}
                            aria-current={id === selectedCourseId}
                            className={cn(
                              'hover:bg-accent/60 flex w-full items-baseline gap-2 rounded px-1.5 py-1 text-left text-xs transition-colors',
                              id === selectedCourseId && 'bg-accent',
                            )}
                          >
                            <span className="min-w-0 flex-1 truncate">
                              {courseLabel(bundle, id)}
                            </span>
                            <span className="text-muted-foreground shrink-0 tabular-nums">
                              {km?.toFixed(1) ?? '—'}km
                            </span>
                            <span className="text-muted-foreground shrink-0 tabular-nums">
                              ↗{gain ?? '—'}m
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          )}

          {/* 개별 코스 상세. 산 요약 패널과 겹치지 않게 아래에 붙인다. */}
          {profile && selectedCourse && (
            <div className="bg-card/95 border-border absolute inset-x-4 bottom-20 z-20 rounded-lg border p-3 backdrop-blur md:inset-x-auto md:right-4 md:bottom-24 md:w-[34rem]">
              <div className="mb-1 flex items-start gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-bold">
                  {(selectedCourse.properties?.['그룹'] as string) ?? ''}{' '}
                  {courseLabel(bundle, selectedCourseId)}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedCourseId(null)}
                  aria-label="코스 닫기"
                  className="hover:bg-accent text-muted-foreground rounded-md p-0.5"
                >
                  <X className="size-4" />
                </button>
              </div>
              <ElevationProfile
                profile={profile}
                label={`${(selectedCourse.properties?.['거리_km'] as number)?.toFixed(1) ?? '—'}km 코스`}
              />
            </div>
          )}

          <div className="bg-card/85 border-border pointer-events-none absolute bottom-24 left-4 z-10 hidden rounded-lg border p-3 text-xs backdrop-blur sm:bottom-8 sm:block">
            <p className="text-muted-foreground mb-2 font-medium">코스 난이도 (누적 상승)</p>
            {showParks && npStats && (
              <div className="border-border/60 mb-2 border-b pb-2">
                <p className="text-muted-foreground mb-1.5 font-medium">
                  국립공원 {npStats.parks}곳 탐방로
                </p>
                <p className="flex items-center gap-2">
                  <span className="h-1 w-5 rounded-full" style={{ backgroundColor: '#22d3ee' }} />
                  탐방가능 {npStats.courses - npStats.closed}
                </p>
                <p className="mt-1 flex items-center gap-2">
                  <span
                    className="h-1 w-5 rounded-full"
                    style={{
                      backgroundImage:
                        'repeating-linear-gradient(90deg,#f87171 0 4px,transparent 4px 7px)',
                    }}
                  />
                  통제 {npStats.closed}
                </p>
              </div>
            )}
            <ul className="space-y-1.5">
              {[
                { label: '~300m', color: '#4ade80' },
                { label: '~700m', color: '#fbbf24' },
                { label: '~1200m', color: '#fb923c' },
                { label: '1200m+', color: '#f87171' },
              ].map((item) => (
                <li key={item.label} className="flex items-center gap-2">
                  <span className="h-1 w-5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </main>
      </div>
    </div>
  );
}
