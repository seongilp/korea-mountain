'use client';

import { useCallback, useEffect, useState } from 'react';

import { MAX_FILE_BYTES, TrackParseError, parseTrackFile, type ParsedTrack } from '@/lib/gpx';
import { clearUserTrack, loadUserTrack, saveUserTrack } from '@/lib/user-track-storage';

/**
 * 사용자 트랙 상태. 파일 → 파싱 → 지도/카드, 그리고 localStorage 복원까지 한 곳에서.
 *
 * 파일은 `File.text()` 로 **브라우저 안에서만** 읽는다. fetch 도 FormData 도 없다 —
 * 개인 위치 기록을 서버로 보내지 않는다는 약속을 코드로 지키는 자리다.
 *
 * mountain-explorer 가 800줄에 닿아 있어서 상태를 여기로 뺐다. 오류는 explorer 의
 * 공용 배너로 흘려보내도록 콜백으로 받는다.
 */
export function useUserTrack(onError: (message: string) => void) {
  const [track, setTrack] = useState<ParsedTrack | null>(null);
  /** 파싱된 회차. 같은 트랙을 다시 올려도 fitBounds 가 다시 돌게 하는 신호. */
  const [revision, setRevision] = useState(0);

  // 재방문 복원. 서버 렌더에는 스토리지가 없으니 마운트 뒤에만 읽는다.
  useEffect(() => {
    const stored = loadUserTrack();
    if (!stored) return;
    // effect 안 동기 setState 는 연쇄 렌더 경고를 낸다. 마이크로태스크 뒤로 미룬다.
    void Promise.resolve().then(() => {
      setTrack(stored);
      setRevision((r) => r + 1);
    });
  }, []);

  const importFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_FILE_BYTES) {
        onError(`파일이 너무 큽니다. ${MAX_FILE_BYTES / 1024 / 1024}MB 이하만 올릴 수 있습니다.`);
        return;
      }
      try {
        const text = await file.text();
        const parsed = parseTrackFile(text, file.name);
        setTrack(parsed);
        setRevision((r) => r + 1);
        // 용량 초과 등으로 저장이 안 돼도 화면에는 이미 떠 있다. 조용히 넘긴다.
        saveUserTrack(parsed);
      } catch (cause) {
        onError(
          cause instanceof TrackParseError
            ? cause.message
            : '트랙 파일을 읽을 수 없습니다. 파일이 손상되지 않았는지 확인해주세요.',
        );
      }
    },
    [onError],
  );

  const clear = useCallback(() => {
    setTrack(null);
    clearUserTrack();
  }, []);

  return { track, revision, importFile, clear };
}
