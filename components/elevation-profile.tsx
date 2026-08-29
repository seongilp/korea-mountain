'use client';

import { useMemo, useState } from 'react';

import type { ElevationProfile, ProfilePoint } from '@/lib/elevation';
import { cn } from '@/lib/utils';

/**
 * 고도 프로파일 차트.
 *
 * 단일 계열이라 범례를 두지 않는다 — 제목이 무엇인지 말해준다.
 * 라이브러리 없이 인라인 SVG 로 그린다. 차트 하나 때문에 번들을 늘릴 이유가 없다.
 */

const WIDTH = 560;
const HEIGHT = 150;
const PADDING = { top: 12, right: 8, bottom: 22, left: 40 };

const PLOT_W = WIDTH - PADDING.left - PADDING.right;
const PLOT_H = HEIGHT - PADDING.top - PADDING.bottom;

interface ElevationProfileProps {
  profile: ElevationProfile;
  label: string;
  className?: string;
}

/** 눈금이 60/125/240 같은 값이 되지 않도록 1·2·5 배수로 올림한다. */
function niceStep(range: number, target: number): number {
  const rough = range / target;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

export function ElevationProfile({ profile, label, className }: ElevationProfileProps) {
  const [hover, setHover] = useState<ProfilePoint | null>(null);

  const scale = useMemo(() => {
    // 세로축은 0 부터가 아니라 실제 범위로 잡는다. 산 고도는 0 기준이면 기복이 안 보인다.
    const span = Math.max(profile.maxM - profile.minM, 50);
    const pad = span * 0.12;
    const low = Math.max(0, profile.minM - pad);
    const high = profile.maxM + pad;
    const totalKm = Math.max(profile.totalKm, 0.1);

    return {
      low,
      high,
      totalKm,
      x: (km: number) => PADDING.left + (km / totalKm) * PLOT_W,
      y: (m: number) => PADDING.top + PLOT_H - ((m - low) / (high - low)) * PLOT_H,
    };
  }, [profile]);

  const paths = useMemo(
    () =>
      profile.segments.map((segment) => {
        const line = segment
          .map((p, i) => `${i === 0 ? 'M' : 'L'}${scale.x(p.distanceKm).toFixed(1)},${scale.y(p.elevationM).toFixed(1)}`)
          .join(' ');
        const base = PADDING.top + PLOT_H;
        const area = `${line} L${scale.x(segment[segment.length - 1].distanceKm).toFixed(1)},${base} L${scale.x(segment[0].distanceKm).toFixed(1)},${base} Z`;
        return { line, area };
      }),
    [profile.segments, scale],
  );

  const yTicks = useMemo(() => {
    const step = niceStep(scale.high - scale.low, 3);
    const ticks: number[] = [];
    for (let v = Math.ceil(scale.low / step) * step; v <= scale.high; v += step) ticks.push(v);
    return ticks;
  }, [scale]);

  const xTicks = useMemo(() => {
    const step = niceStep(scale.totalKm, 4);
    const ticks: number[] = [];
    for (let v = 0; v <= scale.totalKm + 1e-9; v += step) ticks.push(v);
    return ticks;
  }, [scale]);

  const allPoints = useMemo(() => profile.segments.flat(), [profile.segments]);

  const handleMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const km = ((ratio * WIDTH - PADDING.left) / PLOT_W) * scale.totalKm;
    if (km < 0 || km > scale.totalKm) {
      setHover(null);
      return;
    }
    // 이진 탐색까지 갈 규모가 아니라(코스당 수백 점) 선형 최근접으로 충분하다.
    let nearest = allPoints[0];
    let best = Infinity;
    for (const point of allPoints) {
      const d = Math.abs(point.distanceKm - km);
      if (d < best) {
        best = d;
        nearest = point;
      }
    }
    setHover(nearest);
  };

  return (
    <figure className={cn('w-full', className)}>
      <figcaption className="text-muted-foreground mb-1 flex items-baseline justify-between text-xs">
        <span className="truncate">{label}</span>
        <span className="text-foreground shrink-0 font-medium">
          {hover
            ? `${hover.distanceKm.toFixed(1)}km · ${Math.round(hover.elevationM)}m`
            : `${profile.totalKm.toFixed(1)}km · ${Math.round(profile.minM)}~${Math.round(profile.maxM)}m`}
        </span>
      </figcaption>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`${label} 고도 프로파일. 거리 ${profile.totalKm.toFixed(1)}km, 고도 ${Math.round(profile.minM)}m에서 ${Math.round(profile.maxM)}m, 누적 상승 ${profile.gainM}m.`}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="elevation-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {/* 격자는 물러나 있어야 한다. 데이터가 주인공이다. */}
        {yTicks.map((value) => (
          <g key={value}>
            <line
              x1={PADDING.left}
              x2={PADDING.left + PLOT_W}
              y1={scale.y(value)}
              y2={scale.y(value)}
              stroke="currentColor"
              className="text-border"
              strokeWidth="1"
            />
            <text
              x={PADDING.left - 6}
              y={scale.y(value)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground text-[9px]"
            >
              {Math.round(value)}
            </text>
          </g>
        ))}

        {xTicks.map((value) => (
          <text
            key={value}
            x={scale.x(value)}
            y={HEIGHT - 6}
            textAnchor="middle"
            className="fill-muted-foreground text-[9px]"
          >
            {value % 1 === 0 ? value : value.toFixed(1)}
          </text>
        ))}

        {paths.map((path, index) => (
          <g key={index}>
            <path d={path.area} fill="url(#elevation-fill)" />
            <path d={path.line} fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinejoin="round" />
          </g>
        ))}

        {hover && (
          <g>
            <line
              x1={scale.x(hover.distanceKm)}
              x2={scale.x(hover.distanceKm)}
              y1={PADDING.top}
              y2={PADDING.top + PLOT_H}
              stroke="currentColor"
              className="text-muted-foreground"
              strokeWidth="1"
              strokeDasharray="3 2"
            />
            <circle
              cx={scale.x(hover.distanceKm)}
              cy={scale.y(hover.elevationM)}
              r="4"
              fill="#38bdf8"
              stroke="#0b0f0d"
              strokeWidth="1.5"
            />
          </g>
        )}
      </svg>

      <p className="text-muted-foreground mt-1 text-[11px]">
        누적 상승 <span className="text-foreground font-medium">{profile.gainM.toLocaleString()}m</span>
        {' · '}
        누적 하강 <span className="text-foreground font-medium">{profile.lossM.toLocaleString()}m</span>
        {profile.segments.length > 1 && (
          // 목록의 거리·상승은 원본 트랙 전체(GPS 점프 포함) 기준이고,
          // 여기 값은 끊긴 구간을 뺀 실제 경로 기준이라 조금 작게 나온다.
          // 같은 화면에 두 값이 보이므로 왜 다른지 밝혀야 한다.
          <span
            className="ml-1.5 text-amber-500/90"
            title="GPS 기록이 끊긴 구간은 거리와 상승 계산에서 제외했습니다. 목록의 값은 원본 트랙 전체 기준이라 조금 더 큽니다."
          >
            · 기록 {profile.segments.length}조각 — 끊긴 구간 제외
          </span>
        )}
      </p>
    </figure>
  );
}
