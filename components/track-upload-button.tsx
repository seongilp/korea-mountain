'use client';

import { Upload } from 'lucide-react';
import { useRef } from 'react';

import { Button } from '@/components/ui/button';

/**
 * 헤더의 "GPX" 버튼 + 숨긴 파일 입력.
 *
 * 파일은 여기서 File 객체로만 넘기고 읽지 않는다. 읽기·파싱은 `useUserTrack` 이 브라우저
 * 안에서 하며, 서버로는 아무것도 가지 않는다.
 */
export function TrackUploadButton({
  active,
  onFile,
}: {
  /** 트랙이 올라와 있으면 눌린 상태로 보여 "지금 뭔가 그려져 있다" 를 알린다. */
  active: boolean;
  onFile: (file: File | undefined) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <Button
        variant={active ? 'default' : 'outline'}
        size="sm"
        onClick={() => inputRef.current?.click()}
        title="GPX·KML 트랙을 지도에 올립니다. 파일은 브라우저에서만 처리되고 서버로 보내지 않습니다."
      >
        <Upload className="size-4" />
        GPX
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".gpx,.kml,application/gpx+xml,application/vnd.google-earth.kml+xml"
        className="hidden"
        aria-label="GPX 또는 KML 파일 선택"
        onChange={(event) => {
          onFile(event.target.files?.[0]);
          // 같은 파일을 다시 고를 수 있게 값을 비운다. 안 비우면 change 가 안 난다.
          event.target.value = '';
        }}
      />
    </>
  );
}
