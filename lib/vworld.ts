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

/** 브이월드가 http 로 심는 리소스를 https 로 올린다. https 배포에서 mixed content 로 차단되기 때문. */
function forceHttps(url: string): string {
  return url.replace(/^http:\/\//i, 'https://');
}

/**
 * 브이월드 스타일시트를 `vworld` 레이어로 편입시켜 불러온다.
 *
 * 그냥 <link> 로 넣으면 안 된다. api.v30.css 에 `* { padding:0; margin:0; border:0 }`
 * 전역 리셋이 있는데, Tailwind v4 는 유틸리티를 @layer 에 넣기 때문에
 * **레이어 없는 그 규칙이 특이도와 무관하게 모든 Tailwind 유틸리티를 이긴다.**
 * 브이월드를 한 번 켜면 앱 전체의 여백과 테두리가 사라진다.
 *
 * `@import url(...) layer(vworld)` 를 쓰면 레이어에 가두면서도 원격 CSS 의
 * 기준 URL 이 유지돼 내부 url() 상대경로가 깨지지 않는다. (내용을 받아 인라인하면 깨진다.)
 * 레이어 순서는 app/globals.css 최상단에서 선언한다.
 */
/**
 * 브이월드가 head 에 심는 <link rel=stylesheet> 를 감시해 레이어 버전으로 바꿔친다.
 *
 * 그쪽 CSS 는 document.write 가 아니라 WSViewerStartup.js 가 createElement('link') 로
 * 동적 삽입한다. 주입 방식을 추측해 가로채는 대신 head 를 관찰해서 확실히 잡는다.
 * 관찰은 부팅 동안만 돌리고 끝나면 끊는다.
 */
function watchStylesheets(): () => void {
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLLinkElement)) continue;
        if (node.rel !== 'stylesheet') continue;
        if (!/(^|\.)vworld\.kr$/i.test(new URL(node.href, location.href).hostname)) continue;
        const href = node.href;
        node.remove();
        adoptStylesheet(href);
      }
    }
  });
  observer.observe(document.head, { childList: true, subtree: true });
  return () => observer.disconnect();
}

function adoptStylesheet(href: string): void {
  const url = forceHttps(href);
  if (document.querySelector(`style[data-vworld-css="${CSS.escape(url)}"]`)) return;

  const style = document.createElement('style');
  style.dataset.vworldCss = url;
  style.textContent = `@import url("${url}") layer(vworld);`;
  document.head.appendChild(style);
}

async function boot(apiKey: string): Promise<VworldNamespace> {
  const queued: string[] = [];
  const stopWatching = watchStylesheets();
  const originalWrite = document.write.bind(document);

  document.write = ((markup: string) => {
    const script = /src=['"]([^'"]+)['"]/.exec(markup);
    if (script) {
      queued.push(script[1]);
      return;
    }
    // 브이월드는 <link rel=stylesheet> 도 document.write 로 심는다. 그대로 두면 안 된다.
    const sheet = /<link[^>]+href=['"]([^'"]+)['"]/i.exec(markup);
    if (sheet) {
      adoptStylesheet(sheet[1]);
      return;
    }
    originalWrite(markup);
  }) as typeof document.write;

  try {
    await loadScript(`${INIT_SCRIPT}${encodeURIComponent(apiKey)}`);

    const globals = window as unknown as { vworldIsValid?: string; vworldErrMsg?: string };
    if (globals.vworldIsValid !== 'true') {
      // 키 자체가 틀렸거나, 이 도메인이 브이월드에 등록돼 있지 않은 경우다.
      throw new Error(globals.vworldErrMsg || '브이월드 인증키가 이 도메인에서 거부되었습니다.');
    }

    for (const src of queued) await loadScript(forceHttps(src));
  } finally {
    document.write = originalWrite;
    // 스크립트가 다 붙은 뒤에도 늦게 심는 CSS 가 있을 수 있어 여유를 둔다.
    setTimeout(stopWatching, 5_000);
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

/* ------------------------------------------------------------------ */
/* 카메라 고도 관찰                                                     */
/* ------------------------------------------------------------------ */

interface CesiumCamera {
  positionCartographic?: { height?: number };
  moveEnd?: {
    addEventListener(cb: () => void): () => void;
    removeEventListener(cb: () => void): void;
  };
}

function cesiumCamera(): CesiumCamera | null {
  const viewer = (window as unknown as { ws3d?: { viewer?: { camera?: CesiumCamera } } }).ws3d
    ?.viewer;
  return viewer?.camera ?? null;
}

/** 현재 카메라의 지면 위 고도(m). 알 수 없으면 null. */
export function cameraHeightM(): number | null {
  const height = cesiumCamera()?.positionCartographic?.height;
  return typeof height === 'number' && Number.isFinite(height) ? height : null;
}

/**
 * 카메라 이동이 끝날 때마다 고도를 알려준다. 해제 함수를 돌려준다.
 *
 * 브이월드는 자체 카메라 API 를 노출하지 않아 내부 Cesium 뷰어를 직접 본다.
 * 내부 구조에 기대는 것이라 없으면 조용히 아무것도 하지 않는다 —
 * 선 굵기 조절은 있으면 좋은 기능이지 없으면 지도가 안 뜨는 종류가 아니다.
 */
export function watchCameraHeight(onChange: (heightM: number) => void): () => void {
  const camera = cesiumCamera();
  const moveEnd = camera?.moveEnd;
  if (!camera || !moveEnd) return () => {};

  const handler = () => {
    const height = camera.positionCartographic?.height;
    if (typeof height === 'number' && Number.isFinite(height)) onChange(height);
  };

  moveEnd.addEventListener(handler);
  return () => moveEnd.removeEventListener(handler);
}
