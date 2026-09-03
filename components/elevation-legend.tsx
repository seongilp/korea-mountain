import { ELEVATION_BINS, UNKNOWN_ELEVATION_COLOR, elevationColorFor } from '@/lib/elevation-color';
import { cn } from '@/lib/utils';

/** 목록·검색 결과 항목 앞에 붙는 고도 색 점. */
export function ElevationDot({
  elevationM,
  className,
}: {
  elevationM: number | null | undefined;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-2.5 shrink-0 rounded-full ring-1 ring-black/40', className)}
      style={{ backgroundColor: elevationColorFor(elevationM) }}
    />
  );
}

const LEGEND_ITEMS = [
  ...ELEVATION_BINS.map((bin) => ({ key: String(bin.fromM), label: bin.label, color: bin.color })),
  { key: 'unknown', label: '고도 미상', color: UNKNOWN_ELEVATION_COLOR },
];

/**
 * 지도 위 고도 구간 범례. 구간·색은 lib/elevation-color.ts 의 ELEVATION_BINS 를 그대로 쓴다.
 * 여백·배경은 부모가 정한다. `compact` 는 좁은 화면용 한 줄 가로 배치.
 */
export function ElevationLegend({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <ul className={cn('flex items-center gap-2', className)} aria-label="산 고도 범례">
        {LEGEND_ITEMS.map((item) => (
          <li key={item.key} className="flex items-center gap-1">
            <span
              className="size-2 rounded-full ring-1 ring-black/40"
              style={{ backgroundColor: item.color }}
            />
            <span className="tabular-nums">{item.label.replace('m', '')}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className={className}>
      <p className="text-muted-foreground mb-1.5 font-medium">산 고도 (코스 최고점)</p>
      <ul className="space-y-1">
        {LEGEND_ITEMS.map((item) => (
          <li key={item.key} className="flex items-center gap-2">
            <span
              className="size-2.5 rounded-full ring-1 ring-black/40"
              style={{ backgroundColor: item.color }}
            />
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
