// API 통합 테스트: 실제 PostgreSQL(TEST_DATABASE_URL)에 붙어 돈다. 소셜 로그인 제공자는 가짜 fetch로 흉내.
import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { safeReturn } from '../src/auth.js';
import { loadConfig } from '../src/config.js';
import { createDb, migrate, type Db } from '../src/db.js';

const url = process.env.TEST_DATABASE_URL ?? 'postgres://zoo:zoo-dev@127.0.0.1:5433/zoo_test';
const SITE = 'https://zero.example';
const BASE_ENV = {
  DATABASE_URL: url,
  PUBLIC_URL: SITE,
  COOKIE_SECRET: 'x'.repeat(40),
  AUTH_RATE_LIMIT: '1000',
  GOOGLE_CLIENT_ID: 'g-id',
  GOOGLE_CLIENT_SECRET: 'g-secret',
  GITHUB_CLIENT_ID: 'h-id',
  GITHUB_CLIENT_SECRET: 'h-secret',
};
let db: Db;
let app: FastifyInstance;

/** 가짜 제공자: code → 사람. 마지막으로 받은 토큰 요청을 기록 */
const people: Record<string, { sub: string; name: string; picture?: string }> = {};
const calls: { url: string; body: string }[] = [];
const fakeFetch: typeof fetch = async (input, init) => {
  const u = String(input);
  const body = init?.body ? String(init.body) : '';
  calls.push({ url: u, body });
  const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
  if (u === 'https://oauth2.googleapis.com/token' || u === 'https://github.com/login/oauth/access_token') {
    const code = new URLSearchParams(body).get('code')!;
    return people[code] ? json({ access_token: `tok-${code}` }) : json({ error: 'bad_verification_code' }, u.includes('google') ? 400 : 200);
  }
  const auth = (init?.headers as Record<string, string>)?.authorization ?? '';
  const p = people[auth.replace('Bearer tok-', '')];
  if (u === 'https://openidconnect.googleapis.com/v1/userinfo') return json({ sub: p!.sub, name: p!.name, picture: p!.picture });
  if (u === 'https://api.github.com/user') return json({ id: Number(p!.sub), login: p!.name, name: null, avatar_url: p!.picture });
  return json({}, 404);
};

beforeAll(async () => {
  db = createDb(url);
  await db.query('DROP TABLE IF EXISTS saves, sessions, identities, users, schema_migrations CASCADE');
  expect(await migrate(db)).toEqual([1]);
  expect(await migrate(db)).toEqual([]); // 두 번째는 아무것도 안 함
  app = await buildApp(loadConfig(BASE_ENV), db, { fetch: fakeFetch });
});
afterAll(async () => {
  await app.close();
  await db.end();
});
beforeEach(async () => {
  await db.query('TRUNCATE saves, sessions, identities, users RESTART IDENTITY CASCADE');
  calls.length = 0;
});

type Res = Awaited<ReturnType<FastifyInstance['inject']>>;
const cookieVal = (r: Res, name: string) => r.cookies.find((x) => x.name === name)?.value;

/** start → (제공자) → callback 전체 흐름. code는 가짜 제공자가 아는 사람 */
async function login(provider: 'google' | 'github', code: string, ret = '/') {
  const start = await app.inject({ method: 'GET', url: `/api/auth/${provider}/start?return=${encodeURIComponent(ret)}` });
  expect(start.statusCode).toBe(302);
  const auth = new URL(start.headers.location as string);
  const state = auth.searchParams.get('state')!;
  const oauth = cookieVal(start, 'zoo_oauth')!;
  const cb = await app.inject({
    method: 'GET',
    url: `/api/auth/${provider}/callback?code=${code}&state=${state}`,
    headers: { cookie: `zoo_oauth=${oauth}` },
  });
  const sid = cookieVal(cb, 'zoo_sid');
  return { start, auth, cb, cookie: sid ? `zoo_sid=${sid}` : '' };
}

describe('config', () => {
  it('필수 값·개발 로그인 제한', () => {
    expect(() => loadConfig({ ...BASE_ENV, PUBLIC_URL: '' })).toThrow(/PUBLIC_URL/);
    expect(() => loadConfig({ ...BASE_ENV, COOKIE_SECRET: 'short' })).toThrow(/COOKIE_SECRET/);
    expect(() => loadConfig({ ...BASE_ENV, DEV_LOGIN: '1' })).toThrow(/DEV_LOGIN/);
    expect(loadConfig({ ...BASE_ENV, PUBLIC_URL: 'http://localhost:5318', DEV_LOGIN: '1' }).devLogin).toBe(true);
    expect(loadConfig(BASE_ENV).cookieSecure).toBe(true); // https면 Secure 쿠키
  });
  it('돌아갈 주소는 같은 사이트 경로만', () => {
    expect(safeReturn('/#/level/1-1')).toBe('/#/level/1-1');
    expect(safeReturn('//evil.example')).toBe('/');
    expect(safeReturn('https://evil.example')).toBe('/');
    expect(safeReturn('/\\evil')).toBe('/');
    expect(safeReturn(undefined)).toBe('/');
  });
});

describe('social login', () => {
  it('켜진 제공자 목록', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/auth/providers' })).json()).toEqual({ providers: ['google', 'github'] });
    expect((await app.inject({ method: 'GET', url: '/api/auth/dev/start' })).statusCode).toBe(404);
  });

  it('Google: PKCE·state로 시작해서 로그인 → 사용자 생성 → 원래 화면으로', async () => {
    people.g1 = { sub: 'google-sub-1', name: '앨리스', picture: 'https://pic/a.png' };
    const { auth, cb, cookie } = await login('google', 'g1', '/#/level/1-1');
    expect(auth.origin + auth.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(auth.searchParams.get('redirect_uri')).toBe(`${SITE}/api/auth/google/callback`);
    expect(auth.searchParams.get('code_challenge_method')).toBe('S256');
    expect(cb.statusCode).toBe(302);
    expect(cb.headers.location).toBe(`${SITE}/?auth=ok#/level/1-1`);
    // 토큰 요청의 code_verifier가 시작할 때의 challenge와 맞는다
    const verifier = new URLSearchParams(calls.find((c) => c.url.includes('oauth2.googleapis.com'))!.body).get('code_verifier')!;
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(auth.searchParams.get('code_challenge'));
    const sid = cb.cookies.find((c) => c.name === 'zoo_sid')!;
    expect(sid.httpOnly).toBe(true);
    expect(sid.secure).toBe(true);
    expect(sid.sameSite).toBe('Lax');
    const me = (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).json();
    expect(me.user).toEqual({ id: '1', name: '앨리스', avatarUrl: 'https://pic/a.png', providers: ['google'] });
  });

  it('같은 계정으로 다시 로그인하면 같은 사용자 (이름은 최신으로)', async () => {
    people.g1 = { sub: 'google-sub-1', name: '앨리스' };
    await login('google', 'g1');
    people.g1.name = '앨리스2';
    const { cookie } = await login('google', 'g1');
    const me = (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).json();
    expect(me.user.id).toBe('1');
    expect(me.user.name).toBe('앨리스2');
    expect((await db.query('SELECT count(*)::int AS n FROM users')).rows[0].n).toBe(1);
  });

  it('GitHub 로그인 (이름이 없으면 로그인 아이디)', async () => {
    people.h1 = { sub: '4242', name: 'octocat' };
    const { auth, cb, cookie } = await login('github', 'h1');
    expect(auth.origin + auth.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(cb.headers.location).toBe(`${SITE}/?auth=ok`);
    const me = (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).json();
    expect(me.user).toMatchObject({ name: 'octocat', providers: ['github'] });
  });

  it('state가 다르거나 쿠키가 없거나 위조되면 실패', async () => {
    people.g1 = { sub: 's', name: 'n' };
    const start = await app.inject({ method: 'GET', url: '/api/auth/google/start' });
    const oauth = cookieVal(start, 'zoo_oauth')!;
    const bad = await app.inject({ method: 'GET', url: '/api/auth/google/callback?code=g1&state=wrong', headers: { cookie: `zoo_oauth=${oauth}` } });
    expect(bad.headers.location).toBe(`${SITE}/?auth=error`);
    const state = new URL(start.headers.location as string).searchParams.get('state');
    const noCookie = await app.inject({ method: 'GET', url: `/api/auth/google/callback?code=g1&state=${state}` });
    expect(noCookie.headers.location).toBe(`${SITE}/?auth=error`);
    const forged = encodeURIComponent(JSON.stringify({ p: 'google', state: 'abc', verifier: 'v', ret: '/' }));
    const f = await app.inject({ method: 'GET', url: '/api/auth/google/callback?code=g1&state=abc', headers: { cookie: `zoo_oauth=${forged}` } });
    expect(f.headers.location).toBe(`${SITE}/?auth=error`);
    // 다른 제공자의 시작 쿠키로 콜백
    const gh = await app.inject({ method: 'GET', url: `/api/auth/github/callback?code=g1&state=${state}`, headers: { cookie: `zoo_oauth=${oauth}` } });
    expect(gh.headers.location).toBe(`${SITE}/?auth=error`);
    expect((await db.query('SELECT count(*)::int AS n FROM users')).rows[0].n).toBe(0);
  });

  it('제공자 화면에서 취소 / 토큰 교환 실패', async () => {
    const start = await app.inject({ method: 'GET', url: '/api/auth/google/start' });
    const oauth = cookieVal(start, 'zoo_oauth')!;
    const c = await app.inject({ method: 'GET', url: '/api/auth/google/callback?error=access_denied', headers: { cookie: `zoo_oauth=${oauth}` } });
    expect(c.headers.location).toBe(`${SITE}/?auth=cancelled`);
    const { cb } = await login('google', 'nobody');
    expect(cb.headers.location).toBe(`${SITE}/?auth=error`);
  });

  it('로그아웃하면 세션 삭제, 다른 사이트에서 온 POST는 막는다', async () => {
    people.g1 = { sub: 'x', name: 'x' };
    const { cookie } = await login('google', 'g1');
    expect((await app.inject({ method: 'POST', url: '/api/auth/logout', payload: {}, headers: { cookie, origin: 'https://evil.example' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/auth/logout', payload: {}, headers: { cookie, origin: SITE } })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).statusCode).toBe(401);
  });

  it('만료된 세션은 무효', async () => {
    people.g1 = { sub: 'y', name: 'y' };
    const { cookie } = await login('google', 'g1');
    await db.query("UPDATE sessions SET expires_at = now() - interval '1 second'");
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).statusCode).toBe(401);
  });

  it('계정 삭제: 사용자·연결·세션·세이브 모두 삭제', async () => {
    people.g1 = { sub: 'z', name: 'z' };
    const { cookie } = await login('google', 'g1');
    await app.inject({ method: 'PUT', url: '/api/saves/logic', payload: { data: { a: 1 }, baseRev: 0 }, headers: { cookie, origin: SITE } });
    expect((await app.inject({ method: 'DELETE', url: '/api/auth/me', headers: { cookie, origin: SITE } })).statusCode).toBe(204);
    for (const t of ['users', 'identities', 'sessions', 'saves']) expect((await db.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n).toBe(0);
  });

  it('개발 로그인은 DEV_LOGIN=1 + localhost일 때만', async () => {
    const devApp = await buildApp(loadConfig({ ...BASE_ENV, PUBLIC_URL: 'http://localhost:5318', DEV_LOGIN: '1', GOOGLE_CLIENT_ID: '', GITHUB_CLIENT_ID: '' }), db);
    expect((await devApp.inject({ method: 'GET', url: '/api/auth/providers' })).json()).toEqual({ providers: ['dev'] });
    const start = await devApp.inject({ method: 'GET', url: '/api/auth/dev/start' });
    const loc = new URL(start.headers.location as string);
    expect(loc.origin).toBe('http://localhost:5318');
    const cb = await devApp.inject({ method: 'GET', url: loc.pathname + loc.search, headers: { cookie: `zoo_oauth=${cookieVal(start, 'zoo_oauth')}` } });
    expect(cb.headers.location).toBe('http://localhost:5318/?auth=ok');
    expect(cb.cookies.find((c) => c.name === 'zoo_sid')!.secure).toBeFalsy();
    await devApp.close();
  });
});

describe('saves', () => {
  let n = 0;
  const user = async () => {
    const code = `p${++n}`;
    people[code] = { sub: `sub-${code}`, name: code };
    return (await login('google', code)).cookie;
  };
  const put = (cookie: string, body: unknown, game = 'logic') =>
    app.inject({ method: 'PUT', url: `/api/saves/${game}`, payload: body as object, headers: { origin: SITE, cookie } });
  const get = (cookie: string, game = 'logic') => app.inject({ method: 'GET', url: `/api/saves/${game}`, headers: { cookie } });

  it('로그인해야 한다', async () => {
    expect((await get('')).statusCode).toBe(401);
    expect((await put('', { data: {}, baseRev: 0 })).statusCode).toBe(401);
  });

  it('처음엔 비어 있고, 저장할 때마다 rev가 오른다', async () => {
    const cookie = await user();
    expect((await get(cookie)).json()).toEqual({ data: null, rev: 0, updatedAt: null });
    expect((await put(cookie, { data: { progress: { version: 1 } }, baseRev: 0 })).json().rev).toBe(1);
    expect((await put(cookie, { data: { progress: { version: 1, n: 2 } }, baseRev: 1 })).json().rev).toBe(2);
    const g = (await get(cookie)).json();
    expect(g.rev).toBe(2);
    expect(g.data).toEqual({ progress: { version: 1, n: 2 } });
  });

  it('오래된 rev로 저장하면 409 + 서버 데이터', async () => {
    const cookie = await user();
    await put(cookie, { data: { v: 'first' }, baseRev: 0 });
    await put(cookie, { data: { v: 'second' }, baseRev: 1 });
    const stale = await put(cookie, { data: { v: 'stale' }, baseRev: 1 });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ error: 'conflict', rev: 2, data: { v: 'second' } });
    expect((await put(cookie, { data: { v: 'x' }, baseRev: 0 })).statusCode).toBe(409);
  });

  it('사용자마다 세이브가 분리된다', async () => {
    const a = await user();
    const b = await user();
    await put(a, { data: { who: 'a' }, baseRev: 0 });
    expect((await get(b)).json().data).toBeNull();
  });

  it('없는 게임·잘못된 본문', async () => {
    const cookie = await user();
    expect((await get(cookie, 'chess')).statusCode).toBe(404);
    expect((await put(cookie, { data: 'nope', baseRev: 0 })).statusCode).toBe(400);
    expect((await put(cookie, { data: {}, baseRev: -1 })).statusCode).toBe(400);
  });
});
