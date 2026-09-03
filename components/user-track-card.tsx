'use client';

import { Route, Trash2 } from 'lucide-react';
import { useMemo } from 'react';

import { ElevationProfile } from '@/components/elevation-profile';
import { Button } from '@/components/ui/button';
import { buildProfile } from '@/lib/elevation';
import { formatDuration, toCourseFeature, type ParsedTrack } from '@/lib/gpx';
import { USER_TRACK_COLOR } from '@/lib/user-track-layer';
import { cn } from '@/lib/utils';

/**
 * "내 트랙" 카드. 파일명·거리·상승/하강·최고고도·소요시간과 고도 프로파일.
 *
 * 산 선택과 독립이다 — 데스크톱에서는 별도 패널, 좁은 화면에서는 바텀시트 안 한 블록으로
 * 들어가며 둘 다 이 컴포넌트 하나를 쓴다. 고도 프로파일은 트랙을 코스 feature 로
 * 바꿔(`toCourseFeature`) 기존 `buildProfile` 에 그대로 넣는다.
 */
export function UserTrackCard({
  track,
  onClear,
  className,
}: {
  track: ParsedTrack;
  onClear: () => void;
  className?: string;
}) {
  const profile = useMemo(() => buildProfile(toCourseFeature(track).geometry), [track]);
  const { stats } = track;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-start gap-2">
        <span
          className="mt-1 h-1 w-5 shrink-0 rounded-full"
          style={{ backgroundColor: USER_TRACK_COLOR }}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">{track.name}</span>
          <span className="text-muted-foreground block truncate text-[11px]">
            <Route className="mr-1 inline size-3 align-[-2px]" aria-hidden />
            {track.filename}
            {track.sampled && ' · 점이 많아 간추림'}
          </span>
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onClear}
          aria-label="내 트랙 지우기"
          title="지도와 이 브라우저 저장소에서 트랙을 지웁니다"
        >
          <Trash2 />
        </Button>
      </div>

      <dl className="text-muted-foreground grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
        <dt>거리</dt>
        <dd className="text-foreground text-right tabular-nums">{stats.distanceKm.toFixed(1)}km</dd>
        <dt>상승 / 하강</dt>
        <dd className="text-foreground text-right tabular-nums">
          {stats.gainM === null || stats.lossM === null
            ? '—'
            : `↗${stats.gainM.toLocaleString()}m · ↘${stats.lossM.toLocaleString()}m`}
        </dd>
        <dt>최고 고도</dt>
        <dd className="text-foreground text-right tabular-nums">
          {stats.maxM === null ? '—' : `${stats.maxM.toLocaleString()}m`}
        </dd>
        <dt>소요 시간</dt>
        <dd className="text-foreground text-right tabular-nums">
          {stats.durationSec === null ? '—' : formatDuration(stats.durationSec)}
        </dd>
      </dl>

      {profile ? (
        <ElevationProfile profile={profile} label={`${stats.distanceKm.toFixed(1)}km 내 트랙`} />
      ) : (
        // 고도가 없는 트랙(계획 경로, 일부 앱 내보내기)은 프로파일을 못 그린다. 왜 없는지 밝힌다.
        <p className="text-muted-foreground text-[11px]">고도 기록이 없어 프로파일을 그릴 수 없습니다.</p>
      )}
    </div>
  );
}
