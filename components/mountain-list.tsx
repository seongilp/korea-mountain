'use client';

import { Route, TrendingUp, X } from 'lucide-react';

import { ElevationDot } from '@/components/elevation-legend';
import { ScrollArea } from '@/components/ui/scroll-area';
import { mountainKey, peakLabel, type MountainSummary } from '@/lib/mountains';
import { cn } from '@/lib/utils';

/**
 * 왼쪽 산 목록. 데스크톱은 고정 사이드바, lg 미만은 지도 위로 떠오르는 시트.
 *
 * mountain-explorer 가 800줄에 닿아 분리했다. 상태는 전부 부모가 갖고, 여기는 그리기만 한다.
 */
export function MountainList({
  visible,
  total,
  hidden,
  selected,
  open,
  loadingHint,
  onSelect,
  onClose,
}: {
  /** 그릴 행. 부모가 MAX_LIST_ROWS 로 잘라 준다. */
  visible: MountainSummary[];
  /** 검색에 걸린 전체 수. */
  total: number;
  /** 잘려서 안 보이는 수. */
  hidden: number;
  selected: string | null;
  /** lg 미만에서 시트가 열려 있는지. */
  open: boolean;
  /** 결과가 비었을 때 '불러오는 중' 을 보여야 하는지(봉우리 인덱스 로딩 중). */
  loadingHint: boolean;
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  return (
    <nav
      className={cn(
        'border-border bg-background w-64 shrink-0 border-r',
        // lg 미만에서는 지도 위로 떠오르는 시트. 닫히면 화면 밖으로 밀어낸다.
        'absolute inset-y-0 left-0 z-40 transition-transform lg:static lg:z-auto lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      <div className="border-border flex items-center justify-between border-b px-4 py-2 lg:hidden">
        <span className="text-sm font-medium">{total.toLocaleString()}곳</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="목록 닫기"
          className="hover:bg-accent text-muted-foreground rounded-md p-1"
        >
          <X className="size-4" />
        </button>
      </div>
      <ScrollArea className="h-full">
        <ul className="divide-border/60 divide-y">
          {visible.map((mountain) => {
            const key = mountainKey(mountain);
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => onSelect(key)}
                  aria-current={selected === key}
                  className={cn(
                    'hover:bg-accent/60 flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                    selected === key && 'bg-accent',
                  )}
                >
                  <ElevationDot elevationM={mountain.peakM} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">
                      {mountain.name}
                      {mountain.region && (
                        // 동명 봉우리가 1,915개라 지역 없이는 목록에서 구분이 안 된다.
                        <span className="text-muted-foreground ml-1.5 text-[11px]">{mountain.region}</span>
                      )}
                    </span>
                    <span className="text-muted-foreground flex items-center gap-2 text-[11px]">
                      <span className="flex items-center gap-0.5">
                        <TrendingUp className="size-3" aria-hidden />
                        {peakLabel(mountain.peakM)}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <Route className="size-3" aria-hidden />
                        {mountain.courses}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {total === 0 && (
            <li className="text-muted-foreground px-4 py-6 text-center text-sm">
              {loadingHint ? '불러오는 중…' : '검색 결과가 없습니다.'}
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
  );
}
