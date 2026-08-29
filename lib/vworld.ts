/**
 * 브이월드(V-World) 3D WebGL 지도 로더.
 *
 * 인증키는 `NEXT_PUBLIC_VWORLD_KEY` 로 클라이언트에 노출된다. 이 API 는 브라우저에서만 도는
 * 스크립트라 키를 숨길 방법이 없고, 브이월드는 애초에 **발급 시 등록한 도메인에서만 키가 동작**하도록
 * 서버가 Referer 를 검사해 보호한다. 즉 클라이언트 노출은 이 API 의 설계상 정상이다.
 * (검증: Referer 를 localhost / korea-mountain.vercel.app 으로 바꿔 호출하면 응답의
 *  `vworldIsValid` 가 true, 그 외에는 false 로 내려온다.)
 */

/** 브이월드 좌표 하나. z 는 실제로 무시된다 — LineStringZ 주석 참고. */
export interface VwCoordZ {
  x: number;
  y: number;
  z: number;
}

export interface VwCollection {
  add(item: unknown): void;
}

export interface VwGeometry {
  getId(): string;
  setFillColor(color: unknown): void;
  setOutLineColor(color: unknown): void;
  setOutLineWidth(width: number): void;
  setOutLineVisible(visible: boolean): void;
  setWidth(width: number): void;
  setDistanceFromTerrain(distance: number): void;
  create(): void;
}

export interface VwCameraPosition {
  location: VwCoordZ;
}

export interface VwMap {
  setMapId(id: string): void;
  start(): void;
  updateSize(): void;
  moveTo(position: VwCameraPosition): void;
  removeObjectById(id: string): void;
  setLogoVisible(visible: boolean): void;
  /** 카메라 이동은 map.moveTo 가 이 객체에 그대로 위임한다. */
  lookat: { moveTo(position: VwCameraPosition): void };
}

/** 실제로 쓰는 부분만 추린 전역 `vw` 네임스페이스. 공식 타입 정의가 없어 직접 선언한다. */
export interface VworldNamespace {
  Map: new (options: unknown) => VwMap;
  MapOptions: new (
    basemapType: string,
    layers: string,
    controlsDensity: string,
    interactionDensity: string,
    unused: boolean,
    homePosition: VwCameraPosition,
    initPosition: VwCameraPosition,
  ) => unknown;
  CameraPosition: new (location: VwCoordZ, direction: unknown) => VwCameraPosition;
  CoordZ: new (x: number, y: number, z: number) => VwCoordZ;
  Direction: new (heading: number, tilt: number, roll: number) => unknown;
  Color: new (r: number, g: number, b: number, a: number) => unknown;
  Collection: new () => VwCollection;
  BasemapType: { GRAPHIC: string };
  DensityType: { EMPTY: string; BASIC: string; FULL: string };
  geom: { LineStringZ: new (points: VwCollection) => VwGeometry };
}

const INIT_SCRIPT = 'https://map.vworld.kr/js/webglMapInit.js.do?version=3.0&apiKey=';

/** 브이월드 스크립트는 전역 싱글턴이라 한 번만 로드한다. */
let booting: Promise<VworldNamespace> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`브이월드 스크립트 로드 실패: ${src}`));
    document.head.appendChild(script);
  });
}

/**
 * webglMapInit.js.do 는 하위 스크립트 3개를 `document.write` 로 심는다.
 *
 * 그런데 `document.write` 는 파서가 끝난 뒤(= 동적으로 삽입한 스크립트 안)에서 호출하면
 * 브라우저가 조용히 무시한다. 그래서 스크립트 태그를 그냥 주입하면 `vw` 가 영원히 안 생긴다.
 * document.write 를 잠시 가로채 src 만 뽑아내고, 우리가 순서대로 로드한다.
 *
 * 가로챈 배열을 for-of 로 도는 것도 의도적이다 — 하위 스크립트가 또 document.write 를 하면
 * 배열에 추가되고, 살아있는 배열을 순회하므로 그것까지 이어서 로드된다.
 */
async function boot(apiKey: string): Promise<VworldNamespace> {
  const queued: string[] = [];
  const originalWrite = document.write.bind(document);

  document.write = ((markup: string) => {
    const match = /src=['"]([^'"]+)['"]/.exec(markup);
    if (match) queued.push(match[1]);
    else originalWrite(markup);
  }) as typeof document.write;

  try {
    await loadScript(`${INIT_SCRIPT}${encodeURIComponent(apiKey)}`);

    const globals = window as unknown as { vworldIsValid?: string; vworldErrMsg?: string };
    if (globals.vworldIsValid !== 'true') {
      // 키 자체가 틀렸거나, 이 도메인이 브이월드에 등록돼 있지 않은 경우다.
      throw new Error(globals.vworldErrMsg || '브이월드 인증키가 이 도메인에서 거부되었습니다.');
    }

    for (const src of queued) await loadScript(src);
  } finally {
    document.write = originalWrite;
  }

  const vw = (window as unknown as { vw?: VworldNamespace }).vw;
  if (!vw?.Map) throw new Error('브이월드 스크립트는 받았지만 vw 객체가 만들어지지 않았습니다.');
  return vw;
}

/**
 * `map.start()` 직후에 `moveTo` 를 부르면 카메라가 움직이지 않는다.
 * 내부적으로 ws3d.viewer 의 navigation 이 아직 지구본을 잡지 못한 상태라 flyTo 가 조용히 삼켜진다.
 * 첫 타일이 다 붙을 때까지 기다렸다가 카메라를 보내야 한다.
 *
 * `tilesLoaded` 는 타일을 요청하기 전에도 true 라서, 최소 대기 시간을 준 뒤에 본다.
 */
export function waitForGlobe(timeoutMs = 20_000): Promise<void> {
  const MIN_WAIT_MS = 800;
  const POLL_MS = 200;

  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const globe = (
        window as unknown as { ws3d?: { viewer?: { scene?: { globe?: { tilesLoaded?: boolean } } } } }
      ).ws3d?.viewer?.scene?.globe;

      // 타임아웃도 그냥 통과시킨다. 지도는 이미 떠 있으니 카메라만 조금 어긋날 뿐이다.
      if ((elapsed > MIN_WAIT_MS && globe?.tilesLoaded === true) || elapsed > timeoutMs) {
        window.clearInterval(timer);
        resolve();
      }
    }, POLL_MS);
  });
}

export function loadVworld(apiKey: string): Promise<VworldNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('브이월드는 브라우저에서만 로드할 수 있습니다.'));
  }
  if (!booting) {
    // 실패는 캐시하지 않는다. 일시적 네트워크 오류였다면 다시 켤 때 재시도할 수 있어야 한다.
    booting = boot(apiKey).catch((cause: unknown) => {
      booting = null;
      throw cause;
    });
  }
  return booting;
}
