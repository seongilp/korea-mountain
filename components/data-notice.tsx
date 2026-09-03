'use client';

import { useState } from 'react';
import { AlertTriangle, ExternalLink, Info } from 'lucide-react';

import {
  ARCHIVAL_SOURCES,
  ASOF_UNKNOWN,
  DATA_SOURCES,
  OFFICIAL_LINKS,
  type DataSource,
} from '@/lib/data-sources';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

/**
 * 안전 고지 + 데이터 출처 표기.
 *
 * 이 컴포넌트가 존재하는 이유:
 *  - 등산로 데이터는 전부 과거 기록인데 지도 위에 그려 놓으면 현재형처럼 읽힌다.
 *    특히 국립공원 탐방로의 '통제' 표시는 2017년 기준이라 지금과 반대일 수 있다.
 *  - 공공데이터포털 데이터는 출처 표시가 이용 조건이다.
 *
 * 문구 톤은 의도적으로 **담담하게** 잡았다. 경고를 과하게 쓰면 사용자가 매번 무시하게 되고,
 * 정작 통제 구간을 볼 때 읽어야 할 문장이 묻힌다. 그래서 상시 배너는 한 문장만 두고,
 * 나머지는 '자세히' 안으로 넣었다.
 */

interface DataNoticeProps {
  /**
   * 국립공원 탐방로 레이어(=통제 구간 표시)가 켜진 상태인지.
   * 켜졌을 때만 배너를 경고색으로 올린다. 항상 빨간 배너를 띄우면 경고가 배경이 된다.
   */
  parkLayerActive?: boolean;
  /**
   * 선택한 산에만 붙는 부가 안내 한 줄. 통제로 코스가 안 이어지는 산에서
   * "끊겼다"는 오해를 막는다. 없으면 이 줄은 렌더되지 않는다.
   */
  mountainNote?: string;
  className?: string;
  /** 바텀시트 높이만큼 밀어 올리는 등, 계산된 위치를 넘기기 위한 통로. */
  style?: React.CSSProperties;
}

export function DataNotice({
  parkLayerActive = false,
  mountainNote,
  className,
  style,
}: DataNoticeProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={cn(
        'bg-card/90 border-border flex max-w-[min(28rem,calc(100vw-2rem))] items-start gap-2 rounded-lg border px-3 py-2 text-xs backdrop-blur',
        // 통제 구간이 보이는 상황에서만 색으로 한 단계 올린다.
        parkLayerActive && 'border-amber-500/40 bg-amber-950/40',
        className,
      )}
      style={style}
      role="note"
    >
      {parkLayerActive ? (
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-400" aria-hidden />
      ) : (
        <Info className="text-muted-foreground mt-0.5 size-3.5 shrink-0" aria-hidden />
      )}

      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-muted-foreground leading-relaxed">
          {parkLayerActive ? (
            <>
              <span className="text-amber-200">통제 표시는 2017년 기준입니다.</span> 현재 통제 상황과
              다를 수 있으니 산행 전 국립공원공단에서 확인하세요.
            </>
          ) : (
            <>등산로는 과거 기록 기반이며 실시간 통제 정보가 아닙니다.</>
          )}{' '}
          <DataNoticeDialog open={open} onOpenChange={setOpen} />
        </p>

        {/* 선택한 산 한정 부가 안내. 통제로 코스가 안 이어지는 산에서만 뜬다. */}
        {mountainNote ? (
          <p className="text-muted-foreground/90 border-border/60 border-t pt-1 leading-relaxed">
            {mountainNote}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** 배너의 '자세히' 트리거 + 다이얼로그 본문. 배너 문장 흐름 안에 들어가도록 인라인 버튼이다. */
function DataNoticeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={<Button variant="link" size="xs" className="h-auto p-0 align-baseline text-xs" />}
      >
        자세히
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle>데이터 안내와 출처</DialogTitle>
          <DialogDescription>
            이 앱이 보여주는 등산로가 어디서 왔고 언제 기준인지 정리했습니다.
          </DialogDescription>
        </DialogHeader>

        <Separator />

        {/* ScrollArea 의 Viewport 가 스크롤을 맡으므로 루트에는 높이 제한만 준다.
            루트에 overflow-y-auto 를 같이 주면 스크롤 컨테이너가 둘이 되어 스크롤바가 어긋난다. */}
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-6 px-5 py-4">
            <DisclaimerSection />
            <SourceTable />
            <OfficialLinksSection />
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

/** 면책 문구. 법률 문서처럼 쓰지 않고, 사용자가 실제로 취해야 할 행동만 적는다. */
function DisclaimerSection() {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">알아두실 점</h3>
      <ul className="text-muted-foreground space-y-1.5 text-xs leading-relaxed">
        <li>
          · 표시되는 등산로는 <strong className="text-foreground">과거에 수집된 기록</strong>입니다.
          실시간 통제·폐쇄 정보를 반영하지 않습니다.
        </li>
        <li>
          · 국립공원 탐방로의 통제 여부는 {archivalAsOf('np-trails')} 기준 값입니다. 그 뒤로 열리거나
          닫힌 구간은 반영되어 있지 않습니다.
        </li>
        <li>
          · 봉우리·100대명산 코스는 GPS 트랙 기록이라{' '}
          <strong className="text-foreground">공식 탐방로가 아닌 길</strong>이 섞여 있을 수 있습니다.
          비법정 탐방로 출입은 자연공원법에 따라 제한됩니다.
        </li>
        <li>· 거리·소요시간·고도는 기록에서 계산한 값이라 실제와 차이가 있습니다.</li>
        <li>
          · 올린 GPX·KML 파일은 <strong className="text-foreground">브라우저에서만 처리</strong>되며
          서버로 전송되지 않습니다. 최근 트랙 1개만 이 브라우저에 남습니다.
        </li>
        <li>
          · 이 앱은 <strong className="text-foreground">참고용</strong>입니다. 산행 전에는 아래 공식
          창구에서 현재 통제 정보를 확인하세요.
        </li>
      </ul>
    </section>
  );
}

/** 데이터셋별 출처·기준일 표. DATA_SOURCES 를 그대로 렌더한다. */
function SourceTable() {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">데이터 출처</h3>
      <div className="border-border overflow-hidden rounded-lg border">
        {DATA_SOURCES.map((source, index) => (
          <SourceRow key={source.id} source={source} first={index === 0} />
        ))}
      </div>
      <p className="text-muted-foreground text-[11px] leading-relaxed">
        공공데이터포털 데이터는 출처 표시 조건으로 제공됩니다. 기준일이 &lsquo;확인 필요&rsquo;인
        항목은 원본에 기준일이 명시되어 있지 않아 임의로 적지 않았습니다.
      </p>
    </section>
  );
}

function SourceRow({ source, first }: { source: DataSource; first: boolean }) {
  return (
    <div className={cn('px-3 py-2.5', !first && 'border-border border-t')}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer"
          className="hover:text-primary inline-flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline"
        >
          {source.label}
          <ExternalLink className="size-3 opacity-60" aria-hidden />
        </a>
        {source.realtime ? (
          <Badge variant="secondary">실시간</Badge>
        ) : (
          <Badge variant="outline">{asOfLabel(source.asOf)}</Badge>
        )}
      </div>
      <p className="text-muted-foreground mt-1 text-[11px]">
        {source.provider}
        {source.datasetId ? ` · data.go.kr ${source.datasetId}` : ''}
        {source.license ? ` · ${source.license}` : ''}
      </p>
      {source.note ? (
        <p className="text-muted-foreground/80 mt-1 text-[11px] leading-relaxed">{source.note}</p>
      ) : null}
    </div>
  );
}

function OfficialLinksSection() {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">현재 통제 정보 확인처</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {OFFICIAL_LINKS.map((link) => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="border-border hover:bg-muted/50 flex items-start gap-2 rounded-lg border px-3 py-2 transition-colors"
          >
            <ExternalLink className="text-muted-foreground mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0">
              <span className="block text-xs font-medium">{link.label}</span>
              <span className="text-muted-foreground block text-[11px]">{link.description}</span>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

/**
 * 기준일 배지 문구.
 * `asOf` 에는 날짜가 아닌 값('확인 필요', '지속 갱신')도 들어오므로,
 * 숫자가 없는 값에 '기준' 을 붙이면 '확인 필요 기준' 처럼 어색해진다.
 */
function asOfLabel(asOf: string): string {
  if (asOf === ASOF_UNKNOWN) return '기준일 확인 필요';
  return /\d/.test(asOf) ? `${asOf} 기준` : asOf;
}

/**
 * 면책 문구 안에서 기준일을 하드코딩하지 않기 위한 조회 헬퍼.
 * data-sources.ts 에서 기준일을 고치면 문구도 같이 따라간다.
 */
function archivalAsOf(id: string): string {
  return ARCHIVAL_SOURCES.find((s) => s.id === id)?.asOf ?? '확인 필요';
}
