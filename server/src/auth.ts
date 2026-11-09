// 비밀번호 해시(scrypt, 외부 네이티브 모듈 없이 Node 내장)와 세션 토큰
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

const N = 1 << 15;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 128 * N * R * 2;

function scrypt(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password.normalize('NFKC'), salt, KEYLEN, { N: n, r, p, maxmem: MAXMEM }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** 저장 형식: scrypt$N$r$p$salt(base64)$hash(base64) — 나중에 강도를 올려도 예전 해시를 검증할 수 있다 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, N, R, P);
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** 없는 아이디로 로그인할 때도 시간이 비슷하게 걸리도록 쓰는 가짜 해시 */
let dummy: Promise<string> | null = null;
export function dummyHash(): Promise<string> {
  return (dummy ??= hashPassword('not-a-real-password'));
}

export function newSessionToken(): { token: string; hash: Buffer } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

/** DB에는 토큰 원문이 아니라 해시만 저장 (DB가 유출돼도 세션을 가로챌 수 없게) */
export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

export function normalizeUsername(s: string): string {
  return s.trim().toLowerCase();
}
