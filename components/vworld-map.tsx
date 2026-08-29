'use client';

import { useEffect, useRef, useState } from 'react';

import { boundsOf, toTrailLines, type TrailLine } from '@/lib/trail-geometry';
import { loadVworld, waitForGlobe, type VwMap, type VworldNamespace } from '@/lib/vworld';
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

/** 등산로 선 굵기(px). 위성영상 위라 얇으면 묻힌다. */
/*
 * 위성 영상 위에서는 선이 묻힌다. 영상이 초록·갈색이라 파스텔 난이도 색과 명도가 비슷하다.
 *
 * maplibre 에서 쓰던 '어두운 케이싱을 아래에 깔기' 는 여기서 안 통한다. Cesium 은
 * 지면고정 폴리라인의 그리기 순서를 제어할 수 없어서, 나중에 만든 케이싱이 색선을
 * 덮어버려 오히려 선이 사라진다(실제로 그렇게 됐다).
 * 그래서 색을 진하게 만들고 선을 굵히는 쪽으로 간다.
 */
const LINE_WIDTH = 16;
/** 코스를 하나 고르면 그 코스만 굵게, 나머지는 흐리게. */
const SELECTED_LINE_WIDTH = 26;
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
  apiKey: string;
  bundle: MountainBundle | null;
  /** 선택된 산의 좌표. 코스가 없을 때 카메라를 보낼 곳. */
  focus: { lon: number; lat: number } | null;
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
): string[] {
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
    geometry.setWidth(isSelected ? SELECTED_LINE_WIDTH : LINE_WIDTH);
    // 0 이어야 Cesium 의 지면고정(clampToGround) 경로를 타서 지형을 따라 휜다.
    // 0 이 아니면 그 값이 절대 고도가 되어 산속에 박히거나 공중에 뜬다.
    geometry.setDistanceFromTerrain(0);
    geometry.create();
    ids.push(geometry.getId());
  }

  return ids;
}

export function VworldMap({ apiKey, bundle, focus, active, selectedCourseId = null }: VworldMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vwRef = useRef<VworldNamespace | null>(null);
  const mapRef = useRef<VwMap | null>(null);
  const drawnRef = useRef<string[]>([]);
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

  /* 선택된 산의 등산로를 다시 그린다. */
  useEffect(() => {
    if (status !== 'ready') return;
    const vw = vwRef.current;
    const map = mapRef.current;
    if (!vw || !map) return;

    for (const id of drawnRef.current) map.removeObjectById(id);
    drawnRef.current = [];

    const lines = toTrailLines(bundle?.courses);
    if (lines.length > 0) drawnRef.current = drawTrails(vw, lines, selectedCourseId);

    const bounds = boundsOf(lines);
    if (bounds) {
      const [west, south, east, north] = bounds;
      const spanDeg = Math.max(east - west, north - south);
      /*
       * lookat.moveTo 의 z 는 화면 높이가 아니라 **카메라까지의 거리**다. 실측하면 이 각도에서
       * 보이는 지면 폭이 z 의 약 3배라, span 을 화면에 담으려면 z ≈ span/3 이어야 한다.
       * (span 그대로 넣었더니 북한산이 화면의 1/4 로 찍혔다.)
       */
      const altM = Math.min(40_000, Math.max(1_500, (spanDeg * METERS_PER_DEGREE) / 2.6));
      map.moveTo(
        new vw.CameraPosition(
          new vw.CoordZ((west + east) / 2, (south + north) / 2, altM),
          new vw.Direction(0, MOUNTAIN_TILT_DEG, 0),
        ),
      );
    } else if (focus) {
      map.moveTo(
        new vw.CameraPosition(
          new vw.CoordZ(focus.lon, focus.lat, 8_000),
          new vw.Direction(0, MOUNTAIN_TILT_DEG, 0),
        ),
      );
    } else {
      map.moveTo(
        new vw.CameraPosition(
          new vw.CoordZ(KOREA_VIEW.lon, KOREA_VIEW.lat, KOREA_VIEW.altM),
          new vw.Direction(0, KOREA_VIEW.tiltDeg, 0),
        ),
      );
    }
  }, [bundle, focus, status, selectedCourseId]);

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
