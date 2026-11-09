// 환경 변수 → 설정. 운영(A1)에서는 deploy/.env가 docker compose를 통해 넘겨준다.
export interface Config {
  port: number;
  host: string;
  databaseUrl: string;
  /** 세션 쿠키 이름 (로컬 테스트 서버는 실제 게임과 겹치지 않게 다른 이름을 쓴다) */
  cookieName: string;
  /** HTTPS에서만 쿠키 전송 (운영 = true) */
  cookieSecure: boolean;
  /** 상태를 바꾸는 요청의 Origin 헤더가 이것과 같아야 한다 (CSRF 방어). 비우면 검사 안 함 */
  allowedOrigin: string | null;
  /** 리버스 프록시(Caddy) 뒤에서 실제 접속 IP를 쓰기 위함 */
  trustProxy: boolean;
  sessionDays: number;
  /** 로그인·가입 시도 제한 (IP당 1분) */
  authRateLimit: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL이 필요합니다');
  return {
    port: Number(env.PORT ?? 8787),
    host: env.HOST ?? '127.0.0.1',
    databaseUrl,
    cookieName: env.COOKIE_NAME ?? 'zoo_sid',
    cookieSecure: env.COOKIE_SECURE === '1',
    allowedOrigin: env.ALLOWED_ORIGIN || null,
    trustProxy: env.TRUST_PROXY === '1',
    sessionDays: Number(env.SESSION_DAYS ?? 30),
    authRateLimit: Number(env.AUTH_RATE_LIMIT ?? 10),
  };
}
