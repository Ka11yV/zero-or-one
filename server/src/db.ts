// PostgreSQL 연결과 마이그레이션. 마이그레이션은 순서대로 한 번씩만 실행된다(schema_migrations에 기록).
import pg from 'pg';

export type Db = pg.Pool;

export function createDb(url: string): Db {
  return new pg.Pool({ connectionString: url, max: 10 });
}

/** 추가만 한다. 이미 배포된 항목은 절대 고치지 말고 새 항목을 덧붙일 것 */
export const MIGRATIONS: { id: number; name: string; sql: string }[] = [
  {
    id: 1,
    name: 'accounts_and_saves',
    sql: `
      CREATE TABLE users (
        id            BIGSERIAL PRIMARY KEY,
        username      TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE sessions (
        token_hash BYTEA PRIMARY KEY,
        user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX sessions_user_id ON sessions(user_id);
      -- 게임별 세이브 한 벌 (game = 'logic' …). rev는 동시 저장 충돌 감지용
      CREATE TABLE saves (
        user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        game       TEXT NOT NULL,
        data       JSONB NOT NULL,
        rev        INTEGER NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, game)
      );
    `,
  },
];

export async function migrate(db: Db): Promise<number[]> {
  const client = await db.connect();
  try {
    // 여러 서버가 동시에 떠도 한 곳만 마이그레이션하도록 잠금
    await client.query('SELECT pg_advisory_lock(727001)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const done = new Set((await client.query<{ id: number }>('SELECT id FROM schema_migrations')).rows.map((r) => r.id));
    const applied: number[] = [];
    for (const m of MIGRATIONS) {
      if (done.has(m.id)) continue;
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query('INSERT INTO schema_migrations (id, name) VALUES ($1, $2)', [m.id, m.name]);
        await client.query('COMMIT');
        applied.push(m.id);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock(727001)').catch(() => {});
    client.release();
  }
}
