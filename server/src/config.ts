// 환경 변수 → 설정. 운영(A1)에서는 deploy/.env가 docker compose를 통해 넘겨준다.
export interface Config {
  port: number;
  host: string;
  databaseUrl: string;
  /** 사이트 주소 (예: https://zeroorone.example). OAuth 콜백 주소와 Origin 검사에 쓴다 */
  publicUrl: string;
  /** OAuth 진행 중 쿠키 서명 키 */
  cookieSecret: string;
  /** 세션 쿠키 이름 (로컬 테스트 서버는 실제 게임과 겹치지 않게 다른 이름을 쓴다) */
  cookieName: string;
  /** HTTPS에서만 쿠키 전송 (publicUrl이 https면 자동) */
  cookieSecure: boolean;
  /** 리버스 프록시(Caddy) 뒤에서 실제 접속 IP를 쓰기 위함 */
  trustProxy: boolean;
  sessionDays: number;
  /** 로그인 시작 요청 제한 (IP당 1분) */
  authRateLimit: number;
  google: { id: string; secret: string } | null;
  github: { id: string; secret: string } | null;
  /** 로컬 개발 전용 가짜 로그인 */
  devLogin: boolean;
}

function pair(id: string | undefined, secret: string | undefined): { id: string; secret: string } | null {
  return id && secret ? { id, secret } : null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL이 필요합니다');
  const publicUrl = (env.PUBLIC_URL ?? '').replace(/\/+$/, '');
  if (!/^https?:\/\/[^/]+$/.test(publicUrl)) throw new Error('PUBLIC_URL이 필요합니다 (예: https://zeroorone.example)');
  const cookieSecret = env.COOKIE_SECRET ?? '';
  if (cookieSecret.length < 32) throw new Error('COOKIE_SECRET은 32자 이상이어야 합니다 (openssl rand -hex 32)');
  const devLogin = env.DEV_LOGIN === '1';
  if (devLogin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(publicUrl)) {
    throw new Error('DEV_LOGIN은 로컬 개발에서만 켤 수 있습니다');
  }
  return {
    port: Number(env.PORT ?? 8787),
    host: env.HOST ?? '127.0.0.1',
    databaseUrl,
    publicUrl,
    cookieSecret,
    cookieName: env.COOKIE_NAME ?? 'zoo_sid',
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === '1' : publicUrl.startsWith('https://'),
    trustProxy: env.TRUST_PROXY === '1',
    sessionDays: Number(env.SESSION_DAYS ?? 30),
    authRateLimit: Number(env.AUTH_RATE_LIMIT ?? 20),
    google: pair(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET),
    github: pair(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET),
    devLogin,
  };
}
