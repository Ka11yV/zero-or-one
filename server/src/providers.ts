// 소셜 로그인 제공자 (OAuth 2.0 Authorization Code + PKCE)
import { createHash, randomBytes } from 'node:crypto';
import type { Config } from './config.js';

export type ProviderId = 'google' | 'github' | 'dev';

export interface Profile {
  /** 제공자 안에서 바뀌지 않는 사용자 id */
  subject: string;
  name: string;
  avatarUrl: string | null;
  email: string | null;
}

export interface Provider {
  id: ProviderId;
  authorizeUrl(p: { redirectUri: string; state: string; challenge: string }): string;
  /** code → 토큰 → 프로필 */
  exchange(p: { code: string; redirectUri: string; verifier: string }, f: typeof fetch): Promise<Profile>;
}

export function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

async function json<T>(r: Response, what: string): Promise<T> {
  if (!r.ok) throw new Error(`${what} 실패 (${r.status})`);
  return (await r.json()) as T;
}

function google(clientId: string, clientSecret: string): Provider {
  return {
    id: 'google',
    authorizeUrl: ({ redirectUri, state, challenge }) =>
      'https://accounts.google.com/o/oauth2/v2/auth?' +
      new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid profile',
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      }).toString(),
    async exchange({ code, redirectUri, verifier }, f) {
      const tok = await json<{ access_token?: string }>(
        await f('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier }),
        }),
        'Google 토큰',
      );
      if (!tok.access_token) throw new Error('Google 토큰 없음');
      const u = await json<{ sub: string; name?: string; picture?: string; email?: string }>(
        await f('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${tok.access_token}` } }),
        'Google 프로필',
      );
      return { subject: u.sub, name: u.name || 'Player', avatarUrl: u.picture ?? null, email: u.email ?? null };
    },
  };
}

function github(clientId: string, clientSecret: string): Provider {
  return {
    id: 'github',
    authorizeUrl: ({ redirectUri, state, challenge }) =>
      'https://github.com/login/oauth/authorize?' +
      new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: 'read:user',
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        allow_signup: 'true',
      }).toString(),
    async exchange({ code, redirectUri, verifier }, f) {
      const tok = await json<{ access_token?: string; error?: string }>(
        await f('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code_verifier: verifier }),
        }),
        'GitHub 토큰',
      );
      if (!tok.access_token) throw new Error(`GitHub 토큰 없음 (${tok.error ?? '?'})`);
      const u = await json<{ id: number; login: string; name?: string | null; avatar_url?: string }>(
        await f('https://api.github.com/user', {
          headers: { authorization: `Bearer ${tok.access_token}`, accept: 'application/vnd.github+json', 'user-agent': 'zero-or-one' },
        }),
        'GitHub 프로필',
      );
      return { subject: String(u.id), name: u.name || u.login, avatarUrl: u.avatar_url ?? null, email: null };
    },
  };
}

/** 로컬 개발 전용: 외부 서비스 없이 바로 로그인 (DEV_LOGIN=1일 때만 켜짐, 운영에서는 절대 켜지 않는다) */
function dev(publicUrl: string): Provider {
  return {
    id: 'dev',
    authorizeUrl: ({ state }) => `${publicUrl}/api/auth/dev/callback?` + new URLSearchParams({ code: 'dev', state }).toString(),
    async exchange() {
      return { subject: 'dev-player', name: 'Dev Player', avatarUrl: null, email: null };
    },
  };
}

export function configuredProviders(cfg: Config): Map<ProviderId, Provider> {
  const m = new Map<ProviderId, Provider>();
  if (cfg.google) m.set('google', google(cfg.google.id, cfg.google.secret));
  if (cfg.github) m.set('github', github(cfg.github.id, cfg.github.secret));
  if (cfg.devLogin) m.set('dev', dev(cfg.publicUrl));
  return m;
}
