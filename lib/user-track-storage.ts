/**
 * 최근 사용자 트랙 1개를 localStorage 에 보관한다.
 *
 * 개인 위치 데이터라 서버가 아니라 **이 브라우저에만** 남긴다. 용량 초과·사생활 모드·
 * 스토리지 차단 등으로 실패해도 앱은 멀쩡해야 하므로, 모든 접근을 try/catch 로 감싸고
 * 실패는 조용히 넘긴다 — 저장은 편의일 뿐 기능이 아니다.
 */

import { MAX_POINTS, type ParsedTrack } from '@/lib/gpx';

export const USER_TRACK_STORAGE_KEY = 'hiking-now:user-track';

/** 저장 형식이 바뀌면 올려서 옛 값을 버린다. */
const VERSION = 1;

interface StoredTrack {
  v: number;
  track: ParsedTrack;
}

function isTrack(value: unknown): value is ParsedTrack {
  if (!value || typeof value !== 'object') return false;
  const t = value as Partial<ParsedTrack>;
  return (
    typeof t.name === 'string' &&
    typeof t.filename === 'string' &&
    Array.isArray(t.points) &&
    Array.isArray(t.segments) &&
    Array.isArray(t.waypoints) &&
    t.points.length >= 2 &&
    t.points.length <= MAX_POINTS &&
    !!t.stats &&
    typeof t.stats.distanceKm === 'number'
  );
}

/** 저장된 트랙. 없거나 깨졌거나 접근이 막혀 있으면 null. */
export function loadUserTrack(): ParsedTrack | null {
  try {
    const raw = window.localStorage.getItem(USER_TRACK_STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Partial<StoredTrack>;
    if (stored.v !== VERSION || !isTrack(stored.track)) return null;
    return stored.track;
  } catch {
    return null;
  }
}

/** 저장 성공 여부. 용량이 넘치면(QuotaExceededError) false — 호출자는 무시해도 된다. */
export function saveUserTrack(track: ParsedTrack): boolean {
  try {
    const stored: StoredTrack = { v: VERSION, track };
    window.localStorage.setItem(USER_TRACK_STORAGE_KEY, JSON.stringify(stored));
    return true;
  } catch {
    return false;
  }
}

export function clearUserTrack(): void {
  try {
    window.localStorage.removeItem(USER_TRACK_STORAGE_KEY);
  } catch {
    // 지울 수 없으면 다음 로드에서 그대로 복원될 뿐이다. 치명적이지 않다.
  }
}
