'use client';

import { X } from 'lucide-react';

import { ElevationProfile } from '@/components/elevation-profile';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { ElevationProfile as ElevationProfileData } from '@/lib/elevation';
import type { MountainBundle, MountainSummary } from '@/lib/mountains';

/**
 * 코스ID(`설악산_0000000005`)는 사람이 못 읽는다. 번들 안에서의 순번으로 바꿔 보여준다.
 * 원본에 코스 이름이 없어서(100대명산·봉우리 데이터 모두) 순번이 최선이다.
 */
export function courseLabel(bundle: MountainBundle | null, courseId: string | null): string {
  if (!bundle || !courseId) return '코스';
  const index = bundle.courses.features.findIndex((f) => f.properties?.['코스ID'] === courseId);
  return index < 0 ? '코스' : `${index + 1}코스`;
}

/**
 * 산 요약 통계와 코스 목록.
 *
 * 데스크톱에서는 지도 좌상단 패널, 좁은 화면에서는 바텀시트 안에 들어간다.
 * 두 곳에 같은 JSX 를 복사해 두고 한쪽만 CSS 로 숨기면 양쪽이 다 마운트돼
 * 같은 일을 두 번 하므로, 실체는 여기 하나만 둔다.
 */
export function MountainStats({
  mountain,
  bundle,
  loading,
  selectedCourseId,
  onSelectCourse,
  /** 코스 목록 높이 제한. 시트 안에서는 시트가 스크롤을 갖는다. */
  courseListClassName = 'max-h-40 overflow-y-auto',
}: {
  mountain: MountainSummary;
  bundle: MountainBundle | null;
  loading: boolean;
  selectedCourseId: string | null;
  onSelectCourse: (id: string | null) => void;
  courseListClassName?: string;
}) {
  return (
    <>
      <dl className="text-muted-foreground grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
        <dt>코스 최고점</dt>
        <dd className="text-foreground text-right">
          {mountain.peakM === null ? '—' : `${mountain.peakM}m`}
        </dd>
        <dt>코스 수</dt>
        <dd className="text-foreground text-right">{mountain.courses}개</dd>
        <dt>총 연장</dt>
        <dd className="text-foreground text-right">{mountain.totalKm}km</dd>
        <dt>최장 코스</dt>
        <dd className="text-foreground text-right">{mountain.longestKm}km</dd>
      </dl>
      {loading && <Skeleton className="mt-3 h-4 w-full" />}
      {bundle && !loading && (
        <>
          <p className="text-muted-foreground mt-3 text-xs">
            코스 {bundle.courses.features.length}개 · POI {bundle.pois.features.length}개
          </p>
          {/* 지도에서 선을 정확히 누르기는 어렵다. 특히 모바일에서.
              목록으로도 고를 수 있어야 실제로 쓸 수 있다. */}
          <ul className={cn('border-border/60 mt-2 space-y-0.5 border-t pt-2', courseListClassName)}>
            {bundle.courses.features.map((feature) => {
              const id = feature.properties?.['코스ID'] as string | undefined;
              if (!id) return null;
              const km = feature.properties?.['거리_km'] as number | undefined;
              const gain = feature.properties?.['누적상승_m'] as number | undefined;
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => onSelectCourse(id === selectedCourseId ? null : id)}
                    aria-current={id === selectedCourseId}
                    className={cn(
                      'hover:bg-accent/60 flex w-full items-baseline gap-2 rounded px-1.5 py-1 text-left text-xs transition-colors',
                      id === selectedCourseId && 'bg-accent',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{courseLabel(bundle, id)}</span>
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
    </>
  );
}

/** 선택된 한 코스의 제목과 고도 프로파일. */
export function CourseDetail({
  bundle,
  course,
  courseId,
  profile,
  onClose,
}: {
  bundle: MountainBundle | null;
  course: GeoJSON.Feature;
  courseId: string | null;
  profile: ElevationProfileData;
  onClose: () => void;
}) {
  return (
    <>
      <div className="mb-1 flex items-start gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-bold">
          {(course.properties?.['그룹'] as string) ?? ''} {courseLabel(bundle, courseId)}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="코스 닫기"
          className="hover:bg-accent text-muted-foreground rounded-md p-0.5"
        >
          <X className="size-4" />
        </button>
      </div>
      <ElevationProfile
        profile={profile}
        label={`${(course.properties?.['거리_km'] as number)?.toFixed(1) ?? '—'}km 코스`}
      />
    </>
  );
}
