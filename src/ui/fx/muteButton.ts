import { t } from '../../i18n';
import { h } from '../dom';
import { isMuted, onMuteChange, setMuted } from './sound';

/** 🔊/🔇 효과음 켜고 끄기 버튼 (설정은 기억된다) */
export function muteButton(): HTMLButtonElement {
  const b = h('button', { type: 'button', class: 'btn ghost mute-btn' });
  const render = () => {
    b.textContent = isMuted() ? '🔇' : '🔊';
    b.title = isMuted() ? t('fx.unmute') : t('fx.mute');
    b.setAttribute('aria-label', b.title);
  };
  b.onclick = () => setMuted(!isMuted());
  const off = onMuteChange(render);
  // 버튼이 화면에서 사라지면 구독도 끊는다
  const obs = new MutationObserver(() => {
    if (!b.isConnected) {
      off();
      obs.disconnect();
    }
  });
  queueMicrotask(() => obs.observe(document.body, { childList: true, subtree: true }));
  render();
  return b;
}
