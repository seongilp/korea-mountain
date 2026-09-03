'use client';

import {
  DEFAULT_VISIBLE_CATEGORIES,
  POI_CATEGORIES,
  POI_CATEGORY_META,
  type PoiCategory,
} from '@/lib/poi-category';
import { cn } from '@/lib/utils';

/**
 * 지도 위 POI 카테고리 토글 칩.
 *
 * 기본으로는 산행 중 실제로 찾는 7개(화장실·주차장·쉼터·식수·조망·위험·대피소)만 보여주고,
 * '전체' 를 누르면 갈림길·이정표·기타까지 칩이 펼쳐진다. 상태는 부모가 갖는다 —
 * 지도(TrailMap)와 코스 카드가 같은 목록을 봐야 하기 때문이다.
 */
export function PoiFilter({
  visible,
  expanded,
  onToggle,
  onToggleExpanded,
  className,
}: {
  visible: readonly PoiCategory[];
  /** 숨김 카테고리 칩까지 펼쳤는지. */
  expanded: boolean;
  onToggle: (category: PoiCategory) => void;
  onToggleExpanded: () => void;
  className?: string;
}) {
  const shown = expanded ? POI_CATEGORIES : DEFAULT_VISIBLE_CATEGORIES;
  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)} role="group" aria-label="POI 표시">
      {shown.map((category) => {
        const meta = POI_CATEGORY_META[category];
        const on = visible.includes(category);
        return (
          <button
            key={category}
            type="button"
            onClick={() => onToggle(category)}
            aria-pressed={on}
            className={cn(
              'flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] leading-none transition-colors',
              on
                ? 'border-border bg-background/80 text-foreground'
                : 'border-transparent text-muted-foreground hover:bg-accent/60',
            )}
          >
            <span
              aria-hidden
              className={cn('size-2 rounded-full ring-1 ring-black/40', !on && 'opacity-30')}
              style={{ backgroundColor: meta.color }}
            />
            {meta.label}
          </button>
        );
      })}
      <button
        type="button"
        onClick={onToggleExpanded}
        aria-pressed={expanded}
        className="text-muted-foreground hover:bg-accent/60 rounded-full border border-transparent px-1.5 py-0.5 text-[11px] leading-none transition-colors"
      >
        {expanded ? '접기' : '전체'}
      </button>
    </div>
  );
}
