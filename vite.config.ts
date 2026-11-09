import { defineConfig } from 'vitest/config';

// 개발: /api 요청은 계정 서버(server/)로 넘긴다.
// 테스트 서버(5318, VITE_TEST_SERVER=1)는 실제 게임(5317)과 계정 데이터가 섞이지 않도록 다른 API 서버(8788)를 쓴다.
const apiTarget = process.env.VITE_API_TARGET ?? (process.env.VITE_TEST_SERVER ? 'http://127.0.0.1:8788' : 'http://127.0.0.1:8787');

export default defineConfig({
  base: './',
  server: {
    proxy: { '/api': { target: apiTarget, changeOrigin: false } },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
