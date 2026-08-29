/**
 * data.go.kr 공공데이터 OpenAPI 클라이언트. 서버 전용.
 *
 * 이 포털의 함정 세 가지를 여기서 흡수한다. 전부 실측으로 확인한 것들이다.
 *
 * 1. serviceKey 이중 인코딩
 *    발급키(Encoding 형태)에는 이미 %2F, %2B, %3D 가 들어 있다. URLSearchParams 나
 *    curl --data-urlencode 로 다시 인코딩하면 % 가 %25 로 바뀌어
 *    SERVICE_KEY_IS_NOT_REGISTERED_ERROR 가 난다. 그래서 쿼리스트링을 직접 조립한다.
 *
 * 2. API 마다 관례가 다르다
 *    서비스키 파라미터명, JSON 요청 파라미터명, 성공 resultCode 가 제각각이다.
 *    lib/api-registry.ts 의 서술자에 담아 두고 여기서 그대로 따른다.
 *
 * 3. 실패해도 HTTP 200 이 온다
 *    JSON 을 요청해도 인증 오류는 XML 로 떨어진다. 두 형태 모두 검사해야 한다.
 */

import type { ApiDescriptor } from './api-registry';

const DEFAULT_TIMEOUT_MS = 15_000;

export class DataGoFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = 'DataGoFailure';
  }
}

export function getServiceKey(): string {
  const key = process.env.DATA_GO_KR_KEY?.trim();
  if (!key) {
    throw new DataGoFailure('NO_KEY', 'DATA_GO_KR_KEY 가 설정되지 않았습니다.', 500);
  }
  return key;
}

export function hasServiceKey(): boolean {
  return Boolean(process.env.DATA_GO_KR_KEY?.trim());
}

/** Encoding 키(% 포함)는 그대로, Decoding 키는 한 번 인코딩해서 붙인다. */
function encodeServiceKey(key: string): string {
  return key.includes('%') ? key : encodeURIComponent(key);
}

export type QueryParams = Record<string, string | number | undefined>;

function buildUrl(api: ApiDescriptor, params: QueryParams): string {
  const parts = [`${api.serviceKeyParam}=${encodeServiceKey(getServiceKey())}`];

  if (api.jsonParam) {
    parts.push(`${api.jsonParam}=${encodeURIComponent(api.jsonValue)}`);
  }

  for (const [name, value] of Object.entries(params)) {
    if (value === undefined) continue;
    parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
  }

  return `${api.endpoint}?${parts.join('&')}`;
}

interface ResultHeader {
  code: string;
  message: string;
}

/** JSON/XML 양쪽에서 표준 응답 헤더를 뽑는다. */
function readHeader(text: string): ResultHeader | null {
  const trimmed = text.trimStart();

  if (trimmed.startsWith('<')) {
    const errMsg = /<errMsg>([^<]*)<\/errMsg>/.exec(text)?.[1];
    const authMsg = /<returnAuthMsg>([^<]*)<\/returnAuthMsg>/.exec(text)?.[1];
    if (errMsg || authMsg) return { code: authMsg ?? errMsg ?? 'UNKNOWN', message: errMsg ?? '' };

    const code = /<resultCode>([^<]*)<\/resultCode>/.exec(text)?.[1];
    const message = /<resultMsg>([^<]*)<\/resultMsg>/.exec(text)?.[1] ?? '';
    if (code !== undefined) return { code: code.trim(), message };
    return null;
  }

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;

    const wrapper = parsed.OpenAPI_ServiceResponse as Record<string, unknown> | undefined;
    const cmm = wrapper?.cmmMsgHeader as Record<string, string> | undefined;
    if (cmm?.errMsg) return { code: cmm.errMsg, message: cmm.returnAuthMsg ?? '' };

    const body = parsed.response as Record<string, unknown> | undefined;
    const head = body?.header as Record<string, string> | undefined;
    if (head?.resultCode !== undefined) {
      return { code: String(head.resultCode).trim(), message: head.resultMsg ?? '' };
    }
  } catch {
    // JSON 파싱 실패는 아래에서 NON_JSON 으로 처리한다.
  }
  return null;
}

export interface CallOptions {
  /** 초 단위 캐시 수명. */
  revalidate: number;
  signal?: AbortSignal;
}

export async function callDataGo<T>(
  api: ApiDescriptor,
  params: QueryParams,
  { revalidate, signal }: CallOptions,
): Promise<T> {
  const url = buildUrl(api, params);

  const response = await fetch(url, {
    signal: signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    next: { revalidate },
    headers: { Accept: api.jsonParam ? 'application/json' : 'application/xml' },
  });

  const text = await response.text();
  const header = readHeader(text);

  if (header && !api.okCodes.includes(header.code)) {
    throw new DataGoFailure(header.code, `${api.label}: ${header.code} ${header.message}`);
  }
  if (!response.ok) {
    throw new DataGoFailure(`HTTP_${response.status}`, `${api.label}: HTTP ${response.status}`);
  }
  if (!api.jsonParam) {
    throw new DataGoFailure('XML_ONLY', `${api.label}: XML 전용 API 라 별도 파서가 필요합니다.`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new DataGoFailure('NON_JSON', `${api.label}: JSON 이 아닌 응답 (${text.slice(0, 160)})`);
  }
}

/**
 * data.go.kr 표준 목록 응답에서 item 배열을 꺼낸다.
 * 결과가 1건이면 배열이 아니라 객체로 오는 고전적 함정이 있어 항상 배열로 정규화한다.
 */
export function extractItems<T>(payload: unknown): { items: T[]; totalCount: number } {
  const response = (payload as Record<string, unknown>)?.response as Record<string, unknown> | undefined;
  const body = response?.body as Record<string, unknown> | undefined;
  if (!body) return { items: [], totalCount: 0 };

  const rawItems = body.items;
  const container = (rawItems as Record<string, unknown>)?.item ?? rawItems;

  const items = Array.isArray(container) ? (container as T[]) : container ? [container as T] : [];
  const totalCount = Number(body.totalCount) || items.length;

  return { items, totalCount };
}
