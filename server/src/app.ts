// API 라우트. 모든 경로는 /api 아래. 게임 정적 파일은 Caddy가 직접 서비스한다.
// 로그인은 소셜 로그인(Google, GitHub)만: /api/auth/:provider/start → 제공자 → /api/auth/:provider/callback → 사이트로 돌아감
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { hashToken, newSessionToken, safeReturn } from './auth.js';
import type { Config } from './config.js';
import type { Db } from './db.js';
import { configuredProviders, pkce, type Profile, type ProviderId } from './providers.js';

/** 세이브를 받는 게임 목록 (새 게임을 만들면 여기에 추가) */
export const GAMES = new Set(['logic']);
const SAVE_LIMIT = 4 * 1024 * 1024;
const OAUTH_COOKIE = 'zoo_oauth';

export interface User {
  id: string;
  name: string;
  avatarUrl: string | null;
  providers: string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
  }
}

interface OAuthState {
  p: ProviderId;
  state: string;
  verifier: string;
  ret: string;
}

export interface AppOptions {
  logger?: boolean;
  /** 테스트에서 제공자 응답을 흉내 내기 위함 */
  fetch?: typeof fetch;
}

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function buildApp(cfg: Config, db: Db, opts: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: cfg.trustProxy, bodyLimit: SAVE_LIMIT });
  const doFetch = opts.fetch ?? fetch;
  const providers = configuredProviders(cfg);
  await app.register(cookie, { secret: cfg.cookieSecret });
  await app.register(rateLimit, { global: false });

  const sessionCookie = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: cfg.cookieSecure,
    maxAge: cfg.sessionDays * 86400,
  };

  // CSRF: 상태를 바꾸는 요청은 우리 사이트에서 온 것만 (SameSite=Lax 쿠키 + Origin 검사 + JSON 본문만 허용)
  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
    if (req.headers.origin !== cfg.publicUrl) return reply.code(403).send({ error: 'bad_origin' });
  });

  app.decorateRequest('user', null);
  app.addHook('preHandler', async (req) => {
    const token = req.cookies[cfg.cookieName];
    if (!token) return;
    const r = await db.query<{ id: string; name: string; avatar_url: string | null; providers: string[] }>(
      `SELECT u.id::text AS id, u.display_name AS name, u.avatar_url,
              ARRAY(SELECT provider FROM identities i WHERE i.user_id = u.id ORDER BY provider) AS providers
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [hashToken(token)],
    );
    const row = r.rows[0];
    req.user = row ? { id: row.id, name: row.name, avatarUrl: row.avatar_url, providers: row.providers } : null;
  });

  const requireUser = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
  };

  const startSession = async (reply: FastifyReply, userId: string) => {
    const { token, hash } = newSessionToken();
    await db.query(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`, [hash, userId, cfg.sessionDays]);
    // 만료된 세션 정리 (가끔)
    if (Math.random() < 0.05) await db.query('DELETE FROM sessions WHERE expires_at < now()');
    reply.setCookie(cfg.cookieName, token, sessionCookie);
  };

  /** 제공자 계정 → 우리 사용자 (처음이면 만든다). 이름·사진은 로그인할 때마다 최신으로 */
  const upsertUser = async (provider: ProviderId, p: Profile): Promise<string> => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query<{ user_id: string }>(
        `UPDATE identities SET last_login = now(), email = COALESCE($3, email) WHERE provider = $1 AND subject = $2 RETURNING user_id::text`,
        [provider, p.subject, p.email],
      );
      let userId = found.rows[0]?.user_id;
      if (userId) {
        await client.query('UPDATE users SET display_name = $2, avatar_url = $3 WHERE id = $1', [userId, p.name.slice(0, 80), p.avatarUrl]);
      } else {
        const u = await client.query<{ id: string }>('INSERT INTO users (display_name, avatar_url) VALUES ($1, $2) RETURNING id::text', [p.name.slice(0, 80), p.avatarUrl]);
        userId = u.rows[0]!.id;
        await client.query('INSERT INTO identities (provider, subject, user_id, email) VALUES ($1, $2, $3, $4)', [provider, p.subject, userId, p.email]);
      }
      await client.query('COMMIT');
      return userId;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  };

  const redirectUri = (p: ProviderId) => `${cfg.publicUrl}/api/auth/${p}/callback`;
  /** 사이트로 돌아가기: ?auth=ok|error 를 붙여 게임이 결과를 알린다 */
  const backTo = (reply: FastifyReply, ret: string, result: string) => {
    const [path, hash = ''] = ret.split('#');
    const sep = path!.includes('?') ? '&' : '?';
    return reply.redirect(`${cfg.publicUrl}${path}${sep}auth=${result}${hash ? `#${hash}` : ''}`, 302);
  };

  app.get('/api/health', async () => ({ ok: true }));

  /** 켜져 있는 로그인 방법 (게임이 버튼을 그릴 때) */
  app.get('/api/auth/providers', async () => ({ providers: [...providers.keys()] }));

  const providerParams = { type: 'object', required: ['provider'], properties: { provider: { type: 'string', maxLength: 16 } } } as const;

  app.get<{ Params: { provider: string }; Querystring: { return?: string } }>(
    '/api/auth/:provider/start',
    { schema: { params: providerParams }, config: { rateLimit: { max: cfg.authRateLimit, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const provider = providers.get(req.params.provider as ProviderId);
      if (!provider) return reply.code(404).send({ error: 'unknown_provider' });
      const state = randomBytes(16).toString('base64url');
      const { verifier, challenge } = pkce();
      const s: OAuthState = { p: provider.id, state, verifier, ret: safeReturn(req.query.return) };
      reply.setCookie(OAUTH_COOKIE, JSON.stringify(s), {
        path: '/api/auth',
        httpOnly: true,
        sameSite: 'lax',
        secure: cfg.cookieSecure,
        signed: true,
        maxAge: 600,
      });
      return reply.redirect(provider.authorizeUrl({ redirectUri: redirectUri(provider.id), state, challenge }), 302);
    },
  );

  app.get<{ Params: { provider: string }; Querystring: { code?: string; state?: string; error?: string } }>(
    '/api/auth/:provider/callback',
    { schema: { params: providerParams } },
    async (req, reply) => {
      const provider = providers.get(req.params.provider as ProviderId);
      if (!provider) return reply.code(404).send({ error: 'unknown_provider' });
      const raw = req.cookies[OAUTH_COOKIE];
      reply.clearCookie(OAUTH_COOKIE, { path: '/api/auth' });
      const un = raw ? req.unsignCookie(raw) : null;
      let s: OAuthState | null = null;
      try {
        s = un?.valid && un.value ? (JSON.parse(un.value) as OAuthState) : null;
      } catch {
        s = null;
      }
      const ret = s?.ret ?? '/';
      // 사용자가 제공자 화면에서 취소
      if (req.query.error) return backTo(reply, ret, 'cancelled');
      if (!s || s.p !== provider.id || !req.query.state || !sameString(s.state, req.query.state) || !req.query.code) return backTo(reply, ret, 'error');
      try {
        const profile = await provider.exchange({ code: req.query.code, redirectUri: redirectUri(provider.id), verifier: s.verifier }, doFetch);
        const userId = await upsertUser(provider.id, profile);
        await startSession(reply, userId);
        return backTo(reply, ret, 'ok');
      } catch (e) {
        req.log.warn({ err: e }, 'oauth callback failed');
        return backTo(reply, ret, 'error');
      }
    },
  );

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[cfg.cookieName];
    if (token) await db.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
    reply.clearCookie(cfg.cookieName, { path: '/' });
    return reply.code(204).send();
  });

  app.get('/api/auth/me', { preHandler: requireUser }, async (req) => ({ user: req.user }));

  /** 계정 삭제: 사용자·로그인 연결·세션·세이브 모두 삭제 (되돌릴 수 없음) */
  app.delete('/api/auth/me', { preHandler: requireUser }, async (req, reply) => {
    await db.query('DELETE FROM users WHERE id = $1', [req.user!.id]);
    reply.clearCookie(cfg.cookieName, { path: '/' });
    return reply.code(204).send();
  });

  const gameParams = {
    type: 'object',
    required: ['game'],
    properties: { game: { type: 'string', maxLength: 32 } },
  } as const;

  app.get<{ Params: { game: string } }>('/api/saves/:game', { schema: { params: gameParams }, preHandler: requireUser }, async (req, reply) => {
    if (!GAMES.has(req.params.game)) return reply.code(404).send({ error: 'unknown_game' });
    const r = await db.query<{ data: unknown; rev: number; updated_at: Date }>('SELECT data, rev, updated_at FROM saves WHERE user_id = $1 AND game = $2', [
      req.user!.id,
      req.params.game,
    ]);
    const row = r.rows[0];
    return row ? { data: row.data, rev: row.rev, updatedAt: row.updated_at.toISOString() } : { data: null, rev: 0, updatedAt: null };
  });

  /** 저장: baseRev가 서버의 현재 rev와 같을 때만 성공. 다르면 409와 서버 데이터를 돌려줘 클라이언트가 합친 뒤 다시 저장한다 */
  app.put<{ Params: { game: string }; Body: { data: Record<string, unknown>; baseRev: number } }>(
    '/api/saves/:game',
    {
      schema: {
        params: gameParams,
        body: {
          type: 'object',
          required: ['data', 'baseRev'],
          additionalProperties: false,
          properties: { data: { type: 'object' }, baseRev: { type: 'integer', minimum: 0 } },
        },
      },
      preHandler: requireUser,
    },
    async (req, reply) => {
      const { game } = req.params;
      if (!GAMES.has(game)) return reply.code(404).send({ error: 'unknown_game' });
      const { data, baseRev } = req.body;
      const userId = req.user!.id;
      const r =
        baseRev === 0
          ? await db.query<{ rev: number; updated_at: Date }>(
              `INSERT INTO saves (user_id, game, data, rev) VALUES ($1, $2, $3, 1)
               ON CONFLICT (user_id, game) DO NOTHING RETURNING rev, updated_at`,
              [userId, game, data],
            )
          : await db.query<{ rev: number; updated_at: Date }>(
              `UPDATE saves SET data = $3, rev = rev + 1, updated_at = now()
               WHERE user_id = $1 AND game = $2 AND rev = $4 RETURNING rev, updated_at`,
              [userId, game, data, baseRev],
            );
      const row = r.rows[0];
      if (row) return { rev: row.rev, updatedAt: row.updated_at.toISOString() };
      const cur = await db.query<{ data: unknown; rev: number; updated_at: Date }>('SELECT data, rev, updated_at FROM saves WHERE user_id = $1 AND game = $2', [
        userId,
        game,
      ]);
      const c = cur.rows[0];
      return reply.code(409).send({ error: 'conflict', data: c?.data ?? null, rev: c?.rev ?? 0, updatedAt: c?.updated_at.toISOString() ?? null });
    },
  );

  return app;
}
