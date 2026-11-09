import './ui/styles.css';
import { startApp } from './ui/app';

const root = document.querySelector<HTMLDivElement>('#app');
if (root) startApp(root);

// 개발용 테스트 서버(VITE_TEST_SERVER=1)에서는 실제 게임과 헷갈리지 않도록 경고 띠를 띄운다
if (import.meta.env.VITE_TEST_SERVER) {
  const bar = document.createElement('div');
  bar.className = 'test-server-banner';
  bar.textContent = '⚠ 테스트 서버 (개발 확인용 · 진행 기록이 실제 게임과 별개) — 실제 게임: http://localhost:5317';
  document.body.prepend(bar);
  // 확인용: __devUnlockAll('8-6') → 8-6 직전까지 참조 정답으로 클리어 (이 서버의 저장소만 바뀜)
  //         __devCelebrate('3-4', { stars: 3 }) → 클리어 연출만 재생
  void import('./dev/unlockAll').then((m) => Object.assign(window, { __devUnlockAll: m.devUnlockAll, __devCelebrate: m.devCelebrate }));
}
