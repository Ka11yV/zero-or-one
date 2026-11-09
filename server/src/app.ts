// API 라우트. 모든 경로는 /api 아래. 게임 정적 파일은 Caddy가 직접 서비스한다.
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { dummyHash, hashPassword, hashToken, newSessionToken, normalizeUsername, PASSWORD_MAX, PASSWORD_MIN, USERNAME_RE, verifyPassword } from './auth.js';
import type { Config } from './config.js';
import type { Db } from './db.js';

/** 세이브를 받는 게임 목록 (새 게임을 만들면 여기에 추가) */
export const GAMES = new Set(['logic']);
const SAVE_LIMIT = 4 * 1024 * 1024;

export interface User {
  id: string;
  username: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
  }
}

const credBody = {
  type: 'object',
  required: ['username', 'password'],
  additionalProperties: false,
  properties: {
    username: { type: 'string', maxLength: 64 },
    password: { type: 'string', maxLength: PASSWORD_MAX },
  },
} as const;

export async function buildApp(cfg: Config, db: Db, opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: cfg.trustProxy, bodyLimit: SAVE_LIMIT });
  await app.register(cookie);
  await app.register(rateLimit, { global: false });

  const cookieOpts = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: cfg.cookieSecure,
    maxAge: cfg.sessionDays * 86400,
  };

  // CSRF: 상태를 바꾸는 요청은 우리 사이트에서 온 것만 (SameSite=Lax 쿠키 + Origin 검사 + JSON 본문만 허용)
  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
    if (cfg.allowedOrigin && req.headers.origin !== cfg.allowedOrigin) return reply.code(403).send({ error: 'bad_origin' });
  });

  app.decorateRequest('user', null);
  app.addHook('preHandler', async (req) => {
    const token = req.cookies[cfg.cookieName];
    if (!token) return;
    const r = await db.query<{ id: string; username: string }>(
      `SELECT u.id::text AS id, u.username FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [hashToken(token)],
    );
    req.user = r.rows[0] ?? null;
  });

  const requireUser = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
  };

  const startSession = async (reply: FastifyReply, userId: string) => {
    const { token, hash } = newSessionToken();
    await db.query(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`, [
      hash,
      userId,
      cfg.sessionDays,
    ]);
    // 만료된 세션 정리 (가끔)
    if (Math.random() < 0.05) await db.query('DELETE FROM sessions WHERE expires_at < now()');
    reply.setCookie(cfg.cookieName, token, cookieOpts);
  };

  const authLimit = { rateLimit: { max: cfg.authRateLimit, timeWindow: '1 minute' } };

  app.get('/api/health', async () => ({ ok: true }));

  app.post<{ Body: { username: string; password: string } }>(
    '/api/auth/signup',
    { schema: { body: credBody }, config: authLimit },
    async (req, reply) => {
      const username = normalizeUsername(req.body.username);
      const { password } = req.body;
      if (!USERNAME_RE.test(username)) return reply.code(400).send({ error: 'invalid_username' });
      if (password.length < PASSWORD_MIN) return reply.code(400).send({ error: 'invalid_password' });
      const hash = await hashPassword(password);
      const r = await db.query<{ id: string }>(
        'INSERT INTO users (username, password_hash) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING RETURNING id::text AS id',
        [username, hash],
      );
      const row = r.rows[0];
      if (!row) return reply.code(409).send({ error: 'username_taken' });
      await startSession(reply, row.id);
      return reply.code(201).send({ user: { id: row.id, username } });
    },
  );

  app.post<{ Body: { username: string; password: string } }>(
    '/api/auth/login',
    { schema: { body: credBody }, config: authLimit },
    async (req, reply) => {
      const username = normalizeUsername(req.body.username);
      const r = await db.query<{ id: string; password_hash: string }>('SELECT id::text AS id, password_hash FROM users WHERE username = $1', [
        username,
      ]);
      const row = r.rows[0];
      const ok = await verifyPassword(req.body.password, row?.password_hash ?? (await dummyHash()));
      if (!row || !ok) return reply.code(401).send({ error: 'invalid_credentials' });
      await startSession(reply, row.id);
      return { user: { id: row.id, username } };
    },
  );

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[cfg.cookieName];
    if (token) await db.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
    reply.clearCookie(cfg.cookieName, { path: '/' });
    return reply.code(204).send();
  });

  app.get('/api/auth/me', { preHandler: requireUser }, async (req) => ({ user: req.user }));

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
