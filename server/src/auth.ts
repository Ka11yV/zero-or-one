// 세션 토큰: 브라우저에는 무작위 토큰, DB에는 그 해시만 저장
import { createHash, randomBytes } from 'node:crypto';

export function newSessionToken(): { token: string; hash: Buffer } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

/** DB에는 토큰 원문이 아니라 해시만 저장 (DB가 유출돼도 세션을 가로챌 수 없게) */
export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

/** 로그인 뒤 돌아갈 주소: 같은 사이트 안의 경로만 허용 (열린 리디렉션 방지) */
export function safeReturn(v: unknown): string {
  return typeof v === 'string' && /^\/(?![/\\])[^\s]*$/.test(v) && v.length < 300 ? v : '/';
}
