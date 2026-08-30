'use client';

import { useSyncExternalStore } from 'react';

/**
 * Tailwind 의 md 브레이크포인트(768px) 미만을 '좁은 화면'으로 본다.
 *
 * 393px 에서 산을 고르고 코스까지 고르면, 좌상단 요약 패널(256×326)과 하단 고도
 * 프로파일(전폭×180)과 안전 고지(전폭×57)가 겹겹이 쌓여 지도에 393×117 짜리 띠
 * 하나만 남았다. 실측한 값이다. 이 구간에서는 패널을 겹치지 말고 바텀시트로 묶는다.
 *
 * 768px 이상은 그대로 둔다. 고도 프로파일이 `md:` 에서 우측 544px 로 줄고 요약
 * 패널과 세로로도 안 겹쳐서, 지도가 실제로 좁아지지 않는다.
 */
const COMPACT_QUERY = '(max-width: 767.98px)';

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(COMPACT_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/**
 * 좁은 화면(<768px) 여부.
 *
 * CSS 로 숨기는(md:hidden) 대신 렌더 자체를 가르기 위해 필요하다. 시트와 데스크톱
 * 패널 양쪽에 고도 프로파일을 두고 한쪽만 CSS 로 숨기면 캔버스가 두 번 마운트되어
 * 같은 코스의 고도 프로파일을 두 벌 계산한다.
 *
 * effect + setState 대신 useSyncExternalStore 를 쓴다. 연쇄 렌더가 없고 서버
 * 스냅샷을 따로 줄 수 있어 하이드레이션 불일치도 안 난다.
 */
export function useIsCompact(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(COMPACT_QUERY).matches,
    // 서버에는 뷰포트가 없다. 데스크톱으로 그려 두고 하이드레이션 후 정정한다.
    () => false,
  );
}
