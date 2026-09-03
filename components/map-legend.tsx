'use client';

import { ElevationLegend } from '@/components/elevation-legend';
import { UNKNOWN_DIFFICULTY_COLOR } from '@/lib/trail-geometry';
import {
  USER_TRACK_COLOR,
  USER_TRACK_END_COLOR,
  USER_TRACK_START_COLOR,
} from '@/lib/user-track-layer';

/** 국립공원 레이어를 켰을 때 범례에 적는 집계. */
export interface NpStats {
  courses: number;
  closed: number;
  parks: number;
}

/** trail-map.tsx 의 line-color interpolate 스톱과 같은 순서·색. */
const DIFFICULTY_ROWS = [
  { label: '~300m', color: '#4ade80' },
  { label: '~700m', color: '#fbbf24' },
  { label: '~1200m', color: '#fb923c' },
  { label: '1200m+', color: '#f87171' },
  // 고도 기록이 없는 코스. 회색이 뜻 없는 색으로 보이지 않게 범례에 남긴다.
  { label: '고도 미상', color: UNKNOWN_DIFFICULTY_COLOR },
] as const;

/**
 * 데스크톱 좌하단 범례. 봉우리 고도색 · 코스 난이도 · (켜져 있으면) 국립공원 · 내 트랙.
 *
 * mountain-explorer 가 800줄에 닿아 분리했다. 지도 위 색이 무슨 뜻인지 말해 주는
 * 자리라, 지도 레이어의 색 상수를 그대로 참조해 둘이 어긋나지 않게 한다.
 */
export function MapLegend({
  showParks,
  npStats,
  hasUserTrack,
}: {
  showParks: boolean;
  npStats: NpStats | null;
  hasUserTrack: boolean;
}) {
  return (
    <div className="bg-card/85 border-border pointer-events-none absolute bottom-24 left-4 z-10 hidden rounded-lg border p-3 text-xs backdrop-blur sm:bottom-8 sm:block">
      <ElevationLegend className="border-border/60 mb-2 border-b pb-2" />
      <p className="text-muted-foreground mb-2 font-medium">코스 난이도 (누적 상승)</p>
      {showParks && npStats && (
        <div className="border-border/60 mb-2 border-b pb-2">
          <p className="text-muted-foreground mb-1.5 font-medium">국립공원 {npStats.parks}곳 탐방로</p>
          <p className="flex items-center gap-2">
            <span className="h-1 w-5 rounded-full" style={{ backgroundColor: '#22d3ee' }} />
            탐방가능 {npStats.courses - npStats.closed}
          </p>
          <p className="mt-1 flex items-center gap-2">
            <span
              className="h-1 w-5 rounded-full"
              style={{
                backgroundImage: 'repeating-linear-gradient(90deg,#f87171 0 4px,transparent 4px 7px)',
              }}
            />
            통제 {npStats.closed}
          </p>
        </div>
      )}
      <ul className="space-y-1.5">
        {DIFFICULTY_ROWS.map((item) => (
          <li key={item.label} className="flex items-center gap-2">
            <span className="h-1 w-5 rounded-full" style={{ backgroundColor: item.color }} />
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
      {hasUserTrack && (
        <div className="border-border/60 mt-2 border-t pt-2">
          <p className="flex items-center gap-2">
            <span className="h-1 w-5 rounded-full" style={{ backgroundColor: USER_TRACK_COLOR }} />
            내 트랙
            <span
              className="ml-auto size-2 rounded-full"
              style={{ backgroundColor: USER_TRACK_START_COLOR }}
              title="시작"
            />
            <span className="size-2 rounded-full" style={{ backgroundColor: USER_TRACK_END_COLOR }} title="끝" />
          </p>
        </div>
      )}
    </div>
  );
}
