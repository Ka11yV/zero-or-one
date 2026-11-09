// 계정 서버 API. 같은 주소의 /api (운영: Caddy가 서버로 넘김, 개발: Vite 프록시)
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api';

export interface User {
  id: string;
  username: string;
}

export interface RemoteSave {
  data: unknown;
  rev: number;
  updatedAt: string | null;
}

/** code = 서버의 error 값, 'network' = 서버에 닿지 못함(꺼짐·오프라인) */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body?: Record<string, unknown>,
  ) {
    super(code);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(BASE + path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  if (r.status === 204) return undefined as T;
  const json = (r.headers.get('content-type') ?? '').includes('application/json') ? ((await r.json().catch(() => null)) as Record<string, unknown> | null) : null;
  // JSON이 아닌 응답 = 우리 API 서버가 아님(꺼져 있거나 정적 호스팅만 있음)
  if (!json) throw new ApiError(r.status, 'network');
  if (!r.ok) throw new ApiError(r.status, typeof json.error === 'string' ? json.error : 'error', json);
  return json as T;
}

export const api = {
  me: () => call<{ user: User }>('GET', '/auth/me').then((r) => r.user),
  signup: (username: string, password: string) => call<{ user: User }>('POST', '/auth/signup', { username, password }).then((r) => r.user),
  login: (username: string, password: string) => call<{ user: User }>('POST', '/auth/login', { username, password }).then((r) => r.user),
  logout: () => call<void>('POST', '/auth/logout', {}),
  getSave: (game: string) => call<RemoteSave>('GET', `/saves/${game}`),
  putSave: (game: string, data: unknown, baseRev: number) => call<{ rev: number; updatedAt: string }>('PUT', `/saves/${game}`, { data, baseRev }),
};
