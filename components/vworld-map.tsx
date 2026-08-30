'use client';

import { useEffect, useRef, useState } from 'react';

import { boundsOf, toTrailLines, type TrailLine } from '@/lib/trail-geometry';
import {
  addBoundaryOverlay,
  cameraHeightM,
  loadVworld,
  waitForGlobe,
  watchCameraHeight,
  removeBoundaryOverlay,
  type VwCameraPosition,
  type VwMap,
  type VworldNamespace,
} from '@/lib/vworld';
import type { MountainBundle } from '@/lib/mountains';

/**
 * `ws3d.initViewer('#' + mapId)` 가 id 로 컨테이너를 찾는다. 뷰어는 전역 싱글턴이라
 * 한 페이지에 하나뿐이므로 id 를 상수로 둔다.
 */
const CONTAINER_ID = 'vworld-map-canvas';

/** 산을 고르기 전 보여줄 전국 뷰. 남한 전체가 들어오는 높이. */
const KOREA_VIEW = { lon: 127.8, lat: 36.0, altM: 900_000, tiltDeg: -90 };

/** 산을 볼 때의 카메라 각도. 수직에 가까우면 3D 로 볼 이유가 없다. */
const MOUNTAIN_TILT_DEG = -55;

/** 위도 1도의 대략적 거리(m). 카메라 높이를 bbox 로부터 잡을 때만 쓰는 근사치. */
const METERS_PER_DEGREE = 111_000;

/**
 * MOUNTAIN_TILT_DEG 각도에서 화면 가로로 보이는 지면 폭 ÷ 카메라 z.
 *
 * 실측값이다. z=4,338 을 주고 Cesium 의 pickEllipsoid 로 화면 좌·우 끝을 찍었더니
 * 12.14km 가 나왔다(12,140/4,338 ≈ 2.8). 2D 뷰포트를 이어받을 때 이 값으로 나누면
 * 2D 가 보던 가로 폭이 3D 에서도 그대로 나온다.
 */
const VIEW_WIDTH_PER_ALT = 2.8;

/** 같은 방식으로 잰 세로 비율. 기울여 보므로 세로가 조금 더 좁다. */
const VIEW_HEIGHT_PER_ALT = 2.65;

/** 등산로 선 굵기(px). 위성영상 위라 얇으면 묻힌다. */
/*
 * 위성 영상 위에서는 선이 묻힌다. 영상이 초록·갈색이라 파스텔 난이도 색과 명도가 비슷하다.
 *
 * maplibre 에서 쓰던 '어두운 케이싱을 아래에 깔기' 는 여기서 안 통한다. Cesium 은
 * 지면고정 폴리라인의 그리기 순서를 제어할 수 없어서, 나중에 만든 케이싱이 색선을
 * 덮어버려 오히려 선이 사라진다(실제로 그렇게 됐다).
 * 그래서 색을 진하게 만들고 선을 굵히는 쪽으로 간다.
 */
/**
 * 카메라 고도별 선 굵기.
 *
 * 브이월드 선 굵기는 화면 픽셀 고정이라 줌과 무관하게 같은 두께로 그려진다.
 * 멀리서 잘 보이게 굵히면 가까이 왔을 때 능선을 통째로 덮어버린다.
 * 그래서 카메라 고도로 단계를 나눈다. 값은 실제 화면을 보고 정했다.
 */
const WIDTH_STEPS: { aboveM: number; width: number; selected: number }[] = [
  { aboveM: 20_000, width: 32, selected: 52 },
  { aboveM: 8_000, width: 20, selected: 34 },
  { aboveM: 3_000, width: 12, selected: 20 },
  { aboveM: 1_200, width: 7, selected: 12 },
  { aboveM: 0, width: 4, selected: 7 },
];

function widthsFor(heightM: number | null): { width: number; selected: number } {
  const step = WIDTH_STEPS.find((s) => (heightM ?? 30_000) >= s.aboveM);
  return step ?? WIDTH_STEPS[WIDTH_STEPS.length - 1];
}
const DIMMED_ALPHA = 120;

/**
 * 위성 배경용으로 색을 진하게 만든다.
 * 채도를 올리고 명도를 낮춰 초록 영상과 분리되게 한다. 색상(hue)은 그대로 둬야
 * 범례가 두 지도에서 같은 뜻을 유지한다.
 */
function deepen([r, g, b]: [number, number, number]): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const mid = (max + min) / 2;
  const SATURATION = 1.45;
  const DARKEN = 0.82;
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return [
    clamp((mid + (r - mid) * SATURATION) * DARKEN),
    clamp((mid + (g - mid) * SATURATION) * DARKEN),
    clamp((mid + (b - mid) * SATURATION) * DARKEN),
  ];
}

interface VworldMapProps {
  /** 선택된 코스ID. 그 코스만 굵게, 나머지는 흐리게 그린다. */
  selectedCourseId?: string | null;
  /** 행정경계·지명 오버레이 표시 여부. */
  showBoundary?: boolean;
  apiKey: string;
  bundle: MountainBundle | null;
  /** 선택된 산의 좌표. 코스가 없을 때 카메라를 보낼 곳. */
  focus: { lon: number; lat: number } | null;
  /**
   * 2D 지도가 지금 보고 있는 영역. 3D 를 켜는 순간 이 화면을 그대로 이어받는다.
   * 없으면 선택한 산 전체 범위로 맞춘다.
   */
  viewport?: { bounds: [number, number, number, number]; zoom: number } | null;
  /** 화면에 보이는지 여부. 숨겼다 다시 보일 때 캔버스 크기를 다시 잡아야 한다. */
  active: boolean;
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/** 선 목록을 브이월드에 그리고, 나중에 지울 수 있도록 생성된 객체 id 를 돌려준다. */
function drawTrails(
  vw: VworldNamespace,
  lines: TrailLine[],
  selectedCourseId: string | null,
  heightM: number | null,
): string[] {
  const { width, selected } = widthsFor(heightM);
  const ids: string[] = [];

  for (const line of lines) {
    const isSelected = selectedCourseId !== null && line.courseId === selectedCourseId;
    const isDimmed = selectedCourseId !== null && !isSelected;
    const points = new vw.Collection();
    // z 는 넘겨도 무시된다. LineStringZ.makeLineString 이 모든 점의 높이를
    // distanceFromTerrain 하나로 덮어쓰기 때문이다. 그래서 GPX 고도는 버리고
    // distanceFromTerrain(0) 으로 지면에 붙인다 — 등산로는 어차피 땅 위에 있다.
    for (const [lon, lat] of line.points) points.add(new vw.CoordZ(lon, lat, 0));

    const geometry = new vw.geom.LineStringZ(points);
    const [r, g, b] = deepen(hexToRgb(line.color));
    const alpha = isDimmed ? DIMMED_ALPHA : 255;
    geometry.setFillColor(new vw.Color(r, g, b, alpha));
    /*
     * 테두리는 설정하지 않는다. Cesium 은 지면고정 선의 테두리를 지원하지 않아
     * "outlines are unsupported on terrain" 경고를 한 번 남기고 스스로 꺼 버린다.
     *
     * 브이월드 API 로는 이걸 끌 방법이 없다: create() 가 보는 값은 setOutLineVisible 이 세팅하는
     * 플래그가 아니라 `outlineColor != ""` 인데, setOutLineColor 는 vw.Color 가 아닌 값을 거부한다.
     * 즉 경고는 무해하고 피할 수도 없다.
     */
    geometry.setWidth(isSelected ? selected : width);
    // 0 이어야 Cesium 의 지면고정(clampToGround) 경로를 타서 지형을 따라 휜다.
    // 0 이 아니면 그 값이 절대 고도가 되어 산속에 박히거나 공중에 뜬다.
    geometry.setDistanceFromTerrain(0);
    geometry.create();
    ids.push(geometry.getId());
  }

  return ids;
}

export function VworldMap({
  apiKey,
  bundle,
  focus,
  active,
  selectedCourseId = null,
  showBoundary = false,
  viewport = null,
}: VworldMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vwRef = useRef<VworldNamespace | null>(null);
  const mapRef = useRef<VwMap | null>(null);
  const drawnRef = useRef<string[]>([]);
  // 카메라 감시 콜백이 최신 값을 보도록 ref 로 들고 있는다. 감시는 한 번만 등록한다.
  const linesRef = useRef<TrailLine[]>([]);
  const selectedCourseRef = useRef<string | null>(null);
  const drawnWidthRef = useRef<number | null>(null);
  /** ready 직후 첫 카메라 이동이 삼켜지는 경우가 있어 한 번만 재시도한다. */
  const firstMoveDoneRef = useRef(false);
  /*
   * 위 재시도가 1.2초 뒤에 같은 좌표를 다시 쏘기 때문에, 그 사이에 더 최신 이동이
   * 있었다면 옛 좌표로 되돌려 버린다. 이동마다 번호를 매겨 최신 것일 때만 재발행한다.
   */
  const moveSeqRef = useRef(0);
  /** 마지막으로 카메라를 보낸 대상(산·코스). 대상이 바뀌었을 때만 다시 이동한다. */
  const movedTargetRef = useRef<string | null>(null);
  /** 직전 렌더의 active. false→true 인 순간이 '2D→3D 전환' 이다. */
  const wasActiveRef = useRef(false);
  const boundaryRef = useRef<unknown>(null);
  /*
   * 2D 뷰포트는 사용자가 지도를 움직일 때마다 바뀐다. 그때마다 3D 카메라를 옮기면
   * 숨어 있는 지도가 계속 흔들린다. 최신 값만 들고 있다가 3D 를 켜는 순간에만 읽는다.
   */
  const viewportRef = useRef(viewport);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState<string | null>(null);

  /* 스크립트 로드 + 뷰어 기동. 딱 한 번만 한다. */
  useEffect(() => {
    let cancelled = false;

    // effect 본문에서 동기 setState 를 하면 연쇄 렌더가 난다. 전부 async 경계 뒤로 미룬다.
    const start = async () => {
      try {
        const vw = await loadVworld(apiKey);
        if (cancelled || mapRef.current || !containerRef.current) return;

        const home = new vw.CameraPosition(
          new vw.CoordZ(KOREA_VIEW.lon, KOREA_VIEW.lat, KOREA_VIEW.altM),
          new vw.Direction(0, KOREA_VIEW.tiltDeg, 0),
        );
        const options = new vw.MapOptions(
          vw.BasemapType.GRAPHIC,
          '',
          vw.DensityType.BASIC,
          vw.DensityType.BASIC,
          false,
          home,
          home,
        );

        const map = new vw.Map(options);
        map.setMapId(CONTAINER_ID);
        map.start();

        vwRef.current = vw;
        mapRef.current = map;

        // 지구본이 붙기 전에 'ready' 로 넘기면, 뒤따르는 카메라 이동이 통째로 무시된다.
        await waitForGlobe();
        if (cancelled) return;
        setStatus('ready');
      } catch (cause) {
        if (cancelled) return;
        setStatus('error');
        setMessage(cause instanceof Error ? cause.message : '브이월드 3D 지도를 열지 못했습니다.');
      }
    };

    void start();
    return () => {
      cancelled = true;
    };
    // 브이월드 뷰어(ws3d.viewer)는 전역 싱글턴이고 destroy 후 재생성이 되지 않는다
    // (재기동하면 내부에서 scene 을 못 찾고 터진다). 그래서 정리 함수에서 뷰어를 없애지 않고,
    // 부모가 이 컴포넌트를 언마운트하지 않은 채 CSS 로만 숨긴다.
  }, [apiKey]);

  /*
   * 카메라 고도가 바뀌면 굵기 단계를 다시 계산해 필요할 때만 선을 다시 그린다.
   * 브이월드에는 이미 그린 선의 굵기를 바꾸는 API 가 없어 지우고 다시 그리는 수밖에 없다.
   * 매 프레임 다시 그리면 무거우니 단계가 실제로 달라진 경우에만 움직인다.
   */
  useEffect(() => {
    if (status !== 'ready') return;

    return watchCameraHeight((heightM) => {
      const next = widthsFor(heightM);
      if (next.width === drawnWidthRef.current) return;
      drawnWidthRef.current = next.width;

      const vw = vwRef.current;
      const map = mapRef.current;
      const lines = linesRef.current;
      if (!vw || !map || lines.length === 0) return;

      for (const id of drawnRef.current) map.removeObjectById(id);
      drawnRef.current = drawTrails(vw, lines, selectedCourseRef.current, heightM);
    });
  }, [status]);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  /*
   * 카메라가 향할 '대상' 의 식별자. 이 값이 바뀌었을 때만 카메라를 옮긴다.
   * 봉우리 이름은 유일하지 않아(동명 1,915개) 좌표까지 붙여야 실제로 구분된다.
   */
  const cameraTarget = `${bundle?.name ?? ''}|${focus ? `${focus.lon},${focus.lat}` : ''}|${selectedCourseId ?? ''}`;

  /* 행정경계 오버레이 */
  useEffect(() => {
    if (status !== 'ready') return;

    if (showBoundary && !boundaryRef.current) {
      boundaryRef.current = addBoundaryOverlay(apiKey);
    } else if (!showBoundary && boundaryRef.current) {
      removeBoundaryOverlay(boundaryRef.current);
      boundaryRef.current = null;
    }
  }, [showBoundary, status, apiKey]);

  /* 선택된 산의 등산로를 다시 그린다. */
  useEffect(() => {
    if (status !== 'ready') return;
    const vw = vwRef.current;
    const map = mapRef.current;
    if (!vw || !map) return;

    for (const id of drawnRef.current) map.removeObjectById(id);
    drawnRef.current = [];

    const lines = toTrailLines(bundle?.courses);
    linesRef.current = lines;
    selectedCourseRef.current = selectedCourseId;
    const heightM = cameraHeightM();
    drawnWidthRef.current = widthsFor(heightM).width;
    if (lines.length > 0) drawnRef.current = drawTrails(vw, lines, selectedCourseId, heightM);
  }, [bundle, focus, status, selectedCourseId]);

  /*
   * 카메라 이동. 위 그리기 effect 와 분리해 둔 이유가 있다.
   *
   * 예전에는 '2D 뷰포트 인계' 와 '선택 대상으로 이동' 이 별개의 effect 였고, status 가
   * 'ready' 로 바뀌는 첫 순간에만 둘 다 걸려서 나중에 선언된 대상 이동이 인계를 덮어썼다.
   * (첫 3D 전환에서만 줌아웃되고 두 번째부터는 멀쩡했던 이유가 이것이다.)
   * 그래서 카메라를 건드리는 곳을 여기 하나로 합치고, 두 경우를 명시적으로 가른다.
   *
   *   1. 2D→3D 전환(active false→true): 사용자가 보던 화면을 그대로 이어받는다.
   *   2. 3D 인 채로 산·코스가 바뀜: 그 대상으로 이동한다.
   *
   * 대상 변경 여부는 movedTargetRef 로 판정한다. 전환 순간에는 대상도 함께 '바뀐 것처럼'
   * 보이지만(숨어 있는 동안 고른 산이므로), 그건 2D 가 이미 보여주던 산이라 인계가 옳다.
   */
  useEffect(() => {
    if (status !== 'ready') return;

    const justActivated = active && !wasActiveRef.current;
    wasActiveRef.current = active;
    // 숨어 있는 동안에는 카메라를 옮기지 않는다. 대상 기록도 남기지 않아야
    // 다시 보일 때 (뷰포트가 없으면) 그 대상으로 갈 수 있다.
    if (!active) return;

    const vw = vwRef.current;
    const map = mapRef.current;
    if (!vw || !map) return;

    /*
     * ready 직후의 첫 moveTo 가 무시되는 일이 있다. waitForGlobe 가 tilesLoaded 를 보고
     * 통과시키는데, 그 시점에도 카메라 컨트롤러가 아직 flyTo 를 받지 못하는 순간이 있다.
     * (지리산을 고르고 VW 를 켜면 전국 뷰 900km 에 그대로 머물렀다.)
     * 두 번째 이동부터는 정상이므로, 첫 이동만 한 박자 뒤에 한 번 더 보낸다.
     * 단, 그 사이 더 최신 이동이 있었으면 옛 좌표로 되돌리지 않는다.
     */
    const move = (position: VwCameraPosition) => {
      const seq = ++moveSeqRef.current;
      map.moveTo(position);
      if (firstMoveDoneRef.current) return;
      firstMoveDoneRef.current = true;
      window.setTimeout(() => {
        if (mapRef.current === map && moveSeqRef.current === seq) map.moveTo(position);
      }, 1_200);
    };

    // 1. 2D→3D 전환: 2D 가 보던 영역을 그대로 이어받는다. 산을 고르지 않았어도 마찬가지다.
    const view = viewportRef.current;
    if (justActivated && view) {
      movedTargetRef.current = cameraTarget;
      const [west, south, east, north] = view.bounds;
      /*
       * 경도 1도의 거리는 위도에 따라 줄어든다. 도(degree) 로만 비교하면 남한 위도에서
       * 가로 폭을 1.26배쯤 과대평가해 그만큼 줌아웃된다. 미터로 환산해서 비교한다.
       */
      const midLatRad = (((south + north) / 2) * Math.PI) / 180;
      const widthM = (east - west) * METERS_PER_DEGREE * Math.cos(midLatRad);
      const heightM = (north - south) * METERS_PER_DEGREE;
      /*
       * 하한 800m 은 그대로 둔다. 400m 까지 내려 보니 설악산처럼 지형이 높은 곳에서
       * 화면이 통째로 비었다(위성 영상 없이 초록 단색). 그래서 축척 50m 이하로
       * 확대한 2D 는 3D 에서 약 2.2km 폭까지만 따라간다 — 브이월드 쪽 한계다.
       */
      const altM = Math.min(
        400_000,
        Math.max(800, widthM / VIEW_WIDTH_PER_ALT, heightM / VIEW_HEIGHT_PER_ALT),
      );
      move(
        new vw.CameraPosition(
          new vw.CoordZ((west + east) / 2, (south + north) / 2, altM),
          new vw.Direction(0, MOUNTAIN_TILT_DEG, 0),
        ),
      );
      return;
    }

    // 2. 대상이 그대로면 카메라도 그대로 둔다. 사용자가 3D 에서 돌려본 각도를 뺏지 않는다.
    if (movedTargetRef.current === cameraTarget) return;
    movedTargetRef.current = cameraTarget;

    const bounds = boundsOf(linesRef.current);
    if (bounds) {
      const [west, south, east, north] = bounds;
      const spanDeg = Math.max(east - west, north - south);
      /*
       * lookat.moveTo 의 z 는 화면 높이가 아니라 **카메라까지의 거리**다. 실측하면 이 각도에서
       * 보이는 지면 폭이 z 의 약 3배라, span 을 화면에 담으려면 z ≈ span/3 이어야 한다.
       * (span 그대로 넣었더니 북한산이 화면의 1/4 로 찍혔다.)
       */
      const altM = Math.min(40_000, Math.max(1_500, (spanDeg * METERS_PER_DEGREE) / 2.6));
      move(
        new vw.CameraPosition(
          new vw.CoordZ((west + east) / 2, (south + north) / 2, altM),
          new vw.Direction(0, MOUNTAIN_TILT_DEG, 0),
        ),
      );
    } else if (focus) {
      move(
        new vw.CameraPosition(
          new vw.CoordZ(focus.lon, focus.lat, 8_000),
          new vw.Direction(0, MOUNTAIN_TILT_DEG, 0),
        ),
      );
    } else {
      move(
        new vw.CameraPosition(
          new vw.CoordZ(KOREA_VIEW.lon, KOREA_VIEW.lat, KOREA_VIEW.altM),
          new vw.Direction(0, KOREA_VIEW.tiltDeg, 0),
        ),
      );
    }
  }, [active, status, cameraTarget, focus]);

  /* 숨어 있는 동안 컨테이너 크기가 0 이었으므로, 다시 보일 때 캔버스를 재계산한다. */
  useEffect(() => {
    if (!active || status !== 'ready') return;
    const map = mapRef.current;
    if (!map) return;
    // 부모가 hidden 을 떼는 렌더가 커밋된 뒤에 실제 크기가 잡힌다. 한 프레임 뒤에 재요.
    const frame = requestAnimationFrame(() => map.updateSize());
    return () => cancelAnimationFrame(frame);
  }, [active, status]);

  return (
    <div className="relative size-full">
      <div id={CONTAINER_ID} ref={containerRef} className="size-full" />

      {status !== 'ready' && (
        <div className="bg-background/80 absolute inset-0 z-10 flex items-center justify-center p-6 text-center backdrop-blur">
          {status === 'loading' ? (
            <p className="text-muted-foreground text-sm">브이월드 3D 지도를 불러오는 중…</p>
          ) : (
            <div className="max-w-sm space-y-2">
              <p className="text-sm font-medium">브이월드 3D 지도를 열지 못했습니다.</p>
              <p className="text-muted-foreground text-xs">{message}</p>
              <p className="text-muted-foreground text-xs">
                브이월드 인증키는 발급 시 등록한 도메인에서만 동작합니다. 이 주소가 등록돼 있는지
                확인해 주세요.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
