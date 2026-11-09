import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb, migrate } from './db.js';

const cfg = loadConfig();
const db = createDb(cfg.databaseUrl);

// DB가 막 뜬 직후일 수 있으니 몇 번 기다렸다 재시도
for (let i = 0; ; i++) {
  try {
    const applied = await migrate(db);
    if (applied.length) console.log(`migrations applied: ${applied.join(', ')}`);
    break;
  } catch (e) {
    if (i >= 15) throw e;
    console.log(`DB 대기 중… (${(e as Error).message})`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

const app = await buildApp(cfg, db, { logger: true });
await app.listen({ port: cfg.port, host: cfg.host });

const shutdown = async () => {
  await app.close();
  await db.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
