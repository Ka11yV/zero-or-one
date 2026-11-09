import type { Editor } from '../editor/editor';
import { t } from '../i18n';
import { h } from './dom';

export const toBinary = (v: number, width: number) => (v >>> 0).toString(2).padStart(width, '0');

/** 진리표 등에서 값 표시: 1비트는 그대로, 2진 지정 핀은 2진수, 나머지 다비트는 10진수 */
export function formatValue(v: number, width: number, binary = false): string {
  return binary && width > 1 ? toBinary(v, width) : String(v);
}

/** 자동 클럭 속도: 느린 것은 펄스가 화면에 보이게, 빠른 것은 한 번에 여러 펄스 */
const CLOCK_SPEEDS: { label: string; ms: number; burst: number }[] = [
  { label: '1.4 Hz', ms: 700, burst: 0 },
  { label: '5 Hz', ms: 200, burst: 0 },
  { label: '20 Hz', ms: 50, burst: 1 },
  { label: '100 Hz', ms: 50, burst: 5 },
  { label: '1 kHz', ms: 50, burst: 50 },
];
let clockSpeed = 0;

export interface InputsCard {
  el: HTMLElement;
  render(): void;
  sync(): void;
  /** 클럭 한 번 (Ctrl+R 등 외부에서도 호출) */
  pulse(): void;
  dispose(): void;
}

/**
 * 입력 조작 카드.
 * - 모든 입력: 비트마다 누르면 뒤집히는 스위치(왼쪽이 최상위 비트).
 * - 다비트 입력: 숫자 칸과 ±1 버튼도 둔다.
 * - 클럭 핀이 있으면: 한 번 펄스 / 자동 클럭 버튼.
 */
export function inputsCard(editor: Editor, clockPin: () => string | undefined = () => undefined): InputsCard {
  const el = h('section', { class: 'card inputs-card' });
  const fields = new Map<string, { input?: HTMLInputElement; bits: HTMLButtonElement[]; width: number }>();
  let autoTimer: ReturnType<typeof setInterval> | undefined;
  let autoBtn: HTMLButtonElement | null = null;

  const clockName = () => {
    const c = clockPin();
    return c && editor.doc.inputs.some((n) => n.name === c) ? c : undefined;
  };

  const pulse = () => {
    const c = clockName();
    if (c) editor.pulse(c);
  };

  const stopAuto = () => {
    clearInterval(autoTimer);
    autoTimer = undefined;
  };

  const updateAutoBtn = () => {
    if (autoBtn) {
      autoBtn.textContent = autoTimer ? `⏸ ${t('clock.autoStop')}` : `▶ ${t('clock.auto')}`;
      autoBtn.classList.toggle('active', !!autoTimer);
    }
  };

  const render = () => {
    el.textContent = '';
    fields.clear();
    autoBtn = null;
    const clk = clockName();
    // 클럭 핀은 위의 클럭 버튼으로 다루므로 목록에서 뺀다
    const list = editor.doc.inputs.filter((n) => n.name !== clk);
    if (!clk) stopAuto();
    el.hidden = list.length === 0 && !clk;
    if (el.hidden) return;
    el.append(h('h2', {}, t('panel.inputs')));

    if (clk) {
      const once = h('button', { type: 'button', class: 'btn', title: t('clock.onceHint') }, `⏱ ${t('clock.once')}`);
      once.onclick = pulse;
      autoBtn = h('button', { type: 'button', class: 'btn auto-clock' });
      const startAuto = () => {
        const sp = CLOCK_SPEEDS[clockSpeed]!;
        autoTimer = setInterval(() => {
          const c = clockName();
          if (!c) return;
          if (sp.burst) editor.fastPulses(c, sp.burst);
          else if (!editor.pulsing) pulse();
        }, sp.ms);
      };
      autoBtn.onclick = () => {
        if (autoTimer) stopAuto();
        else {
          startAuto();
          if (!CLOCK_SPEEDS[clockSpeed]!.burst) pulse();
        }
        updateAutoBtn();
      };
      const speedSel = h('select', { class: 'clock-speed', title: t('clock.speed') });
      CLOCK_SPEEDS.forEach((s, i) => {
        const o = h('option', { value: String(i) }, s.label);
        if (i === clockSpeed) o.selected = true;
        speedSel.append(o);
      });
      speedSel.onchange = () => {
        clockSpeed = Number(speedSel.value);
        if (autoTimer) {
          stopAuto();
          startAuto();
        }
      };
      updateAutoBtn();
      el.append(h('div', { class: 'clock-row' }, h('span', { class: 'input-name' }, clk), once, autoBtn, speedSel));
    }

    for (const n of list) {
      const max = 2 ** n.width - 1;
      const cur = () => editor.inputValues.get(n.name) ?? 0;
      const set = (v: number) => editor.setInputValue(n.name, Math.max(0, Math.min(max, Math.trunc(v) || 0)));
      // 비트 스위치: 왼쪽이 최상위 비트. 누르면 그 비트만 뒤집힌다
      const bits: HTMLButtonElement[] = [];
      for (let i = n.width - 1; i >= 0; i--) {
        const b = h('button', { type: 'button', class: 'bit-btn', title: n.width > 1 ? `${n.name}[${i}] (${2 ** i})` : n.name });
        b.onclick = () => set(cur() ^ (1 << i));
        bits.push(b);
      }
      const bitBox = h('div', { class: `bit-switches${n.width > 8 ? ' wide' : ''}` }, ...bits);
      if (n.width === 1) {
        el.append(h('div', { class: 'input-row single' }, h('span', { class: 'input-name' }, n.name), bitBox));
        fields.set(n.name, { bits, width: 1 });
        continue;
      }
      const input = h('input', { type: 'number', min: '0', max: String(max), step: '1', value: String(cur()) });
      input.oninput = () => set(Number(input.value));
      const dec = h('button', { type: 'button', class: 'btn mini', 'aria-label': '−1' }, '−');
      const inc = h('button', { type: 'button', class: 'btn mini', 'aria-label': '+1' }, '+');
      dec.onclick = () => set((cur() - 1 + max + 1) % (max + 1));
      inc.onclick = () => set((cur() + 1) % (max + 1));
      el.append(h('div', { class: 'input-row' }, h('span', { class: 'input-name' }, `${n.name}[${n.width}]`), dec, input, inc, bitBox));
      fields.set(n.name, { input, bits, width: n.width });
    }
    sync();
  };

  const sync = () => {
    for (const [name, f] of fields) {
      const v = editor.inputValues.get(name) ?? 0;
      if (f.input && document.activeElement !== f.input && f.input.value !== String(v)) f.input.value = String(v);
      f.bits.forEach((b, k) => {
        const on = (v >>> (f.width - 1 - k)) & 1;
        if (b.textContent !== String(on)) b.textContent = String(on);
        b.classList.toggle('on', on === 1);
      });
    }
  };

  return { el, render, sync, pulse, dispose: stopAuto };
}
