// API 통합 테스트: 실제 PostgreSQL(TEST_DATABASE_URL)에 붙어 돈다. 테이블을 매번 비우고 시작.
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { hashPassword, verifyPassword } from '../src/auth.js';
import { loadConfig } from '../src/config.js';
import { createDb, migrate, type Db } from '../src/db.js';

const url = process.env.TEST_DATABASE_URL ?? 'postgres://zoo:zoo-dev@127.0.0.1:5433/zoo_test';
const ORIGIN = 'https://zero.example';
let db: Db;
let app: FastifyInstance;

beforeAll(async () => {
  db = createDb(url);
  await db.query('DROP TABLE IF EXISTS saves, sessions, users, schema_migrations CASCADE');
  expect(await migrate(db)).toEqual([1]);
  expect(await migrate(db)).toEqual([]); // 두 번째는 아무것도 안 함
  const cfg = loadConfig({ DATABASE_URL: url, ALLOWED_ORIGIN: ORIGIN, AUTH_RATE_LIMIT: '1000' });
  app = await buildApp(cfg, db);
});
afterAll(async () => {
  await app.close();
  await db.end();
});
beforeEach(async () => {
  await db.query('TRUNCATE saves, sessions, users RESTART IDENTITY CASCADE');
});

type Res = Awaited<ReturnType<FastifyInstance['inject']>>;
const cookieOf = (r: Res) => {
  const c = r.cookies.find((x) => x.name === 'zoo_sid');
  return c ? `zoo_sid=${c.value}` : '';
};
const post = (path: string, body: unknown, cookie = '') =>
  app.inject({ method: 'POST', url: path, payload: body as object, headers: { origin: ORIGIN, cookie } });
const signup = async (username = 'alice', password = 'correct horse') => {
  const r = await post('/api/auth/signup', { username, password });
  return { r, cookie: cookieOf(r) };
};

describe('auth', () => {
  it('scrypt 해시 검증', async () => {
    const h = await hashPassword('비밀번호123');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('비밀번호123', h)).toBe(true);
    expect(await verifyPassword('비밀번호124', h)).toBe(false);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
  });

  it('가입 → 세션 쿠키 → me', async () => {
    const { r, cookie } = await signup('Alice');
    expect(r.statusCode).toBe(201);
    expect(r.json().user.username).toBe('alice'); // 소문자로 정규화
    const c = r.cookies.find((x) => x.name === 'zoo_sid')!;
    expect(c.httpOnly).toBe(true);
    expect(c.sameSite).toBe('Lax');
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.json().user.username).toBe('alice');
    // DB에는 토큰 원문이 없다
    const s = await db.query('SELECT token_hash FROM sessions');
    expect(Buffer.from(s.rows[0].token_hash).toString('base64url')).not.toBe(c.value);
  });

  it('잘못된 아이디·짧은 비밀번호·중복 아이디', async () => {
    expect((await post('/api/auth/signup', { username: 'ab', password: 'longenough' })).json().error).toBe('invalid_username');
    expect((await post('/api/auth/signup', { username: '한글이름', password: 'longenough' })).json().error).toBe('invalid_username');
    expect((await post('/api/auth/signup', { username: 'bob', password: 'short' })).json().error).toBe('invalid_password');
    await signup('bob');
    const dup = await post('/api/auth/signup', { username: 'BOB', password: 'longenough' });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toBe('username_taken');
  });

  it('로그인 성공·실패, 로그아웃하면 세션 삭제', async () => {
    await signup('carol', 'password-1');
    expect((await post('/api/auth/login', { username: 'carol', password: 'wrong-pass' })).statusCode).toBe(401);
    expect((await post('/api/auth/login', { username: 'nobody', password: 'password-1' })).statusCode).toBe(401);
    const ok = await post('/api/auth/login', { username: 'Carol', password: 'password-1' });
    expect(ok.statusCode).toBe(200);
    const cookie = cookieOf(ok);
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).statusCode).toBe(200);
    expect((await post('/api/auth/logout', {}, cookie)).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).statusCode).toBe(401);
  });

  it('다른 사이트에서 온 요청은 막는다 (Origin 검사)', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { username: 'eve', password: 'longenough' }, headers: { origin: 'https://evil.example' } });
    expect(r.statusCode).toBe(403);
  });

  it('만료된 세션은 무효', async () => {
    const { cookie } = await signup('dave');
    await db.query("UPDATE sessions SET expires_at = now() - interval '1 second'");
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).statusCode).toBe(401);
  });
});

describe('saves', () => {
  const put = (cookie: string, body: unknown, game = 'logic') =>
    app.inject({ method: 'PUT', url: `/api/saves/${game}`, payload: body as object, headers: { origin: ORIGIN, cookie } });
  const get = (cookie: string, game = 'logic') => app.inject({ method: 'GET', url: `/api/saves/${game}`, headers: { cookie } });

  it('로그인해야 한다', async () => {
    expect((await get('')).statusCode).toBe(401);
    expect((await put('', { data: {}, baseRev: 0 })).statusCode).toBe(401);
  });

  it('처음엔 비어 있고, 저장할 때마다 rev가 오른다', async () => {
    const { cookie } = await signup();
    expect((await get(cookie)).json()).toEqual({ data: null, rev: 0, updatedAt: null });
    const a = await put(cookie, { data: { progress: { version: 1 } }, baseRev: 0 });
    expect(a.json().rev).toBe(1);
    const b = await put(cookie, { data: { progress: { version: 1, n: 2 } }, baseRev: 1 });
    expect(b.json().rev).toBe(2);
    const g = (await get(cookie)).json();
    expect(g.rev).toBe(2);
    expect(g.data).toEqual({ progress: { version: 1, n: 2 } });
  });

  it('오래된 rev로 저장하면 409 + 서버 데이터', async () => {
    const { cookie } = await signup();
    await put(cookie, { data: { v: 'first' }, baseRev: 0 });
    await put(cookie, { data: { v: 'second' }, baseRev: 1 });
    const stale = await put(cookie, { data: { v: 'stale' }, baseRev: 1 });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ error: 'conflict', rev: 2, data: { v: 'second' } });
    // 처음 저장(baseRev 0)도 이미 있으면 충돌
    expect((await put(cookie, { data: { v: 'x' }, baseRev: 0 })).statusCode).toBe(409);
  });

  it('사용자마다 세이브가 분리된다', async () => {
    const a = await signup('alice');
    const b = await signup('bobby');
    await put(a.cookie, { data: { who: 'alice' }, baseRev: 0 });
    expect((await get(b.cookie)).json().data).toBeNull();
  });

  it('없는 게임·잘못된 본문', async () => {
    const { cookie } = await signup();
    expect((await get(cookie, 'chess')).statusCode).toBe(404);
    expect((await put(cookie, { data: 'nope', baseRev: 0 })).statusCode).toBe(400);
    expect((await put(cookie, { data: {}, baseRev: -1 })).statusCode).toBe(400);
  });
});
