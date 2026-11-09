// 입출력 장치: 7세그먼트 표시기와 키패드
import type { Editor } from '../editor/editor';
import { t } from '../i18n';
import { h } from './dom';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 막대 a~g의 다각형 좌표 (가로 40 × 세로 70) */
const SEGMENTS: string[] = [
  '8,4 32,4 28,9 12,9', // a
  '33,5 33,33 29,30 29,10', // b
  '33,37 33,65 29,60 29,40', // c
  '8,66 32,66 28,61 12,61', // d
  '7,37 11,40 11,60 7,65', // e
  '7,5 11,10 11,30 7,33', // f
  '9,35 13,32 27,32 31,35 27,38 13,38', // g
];

/** 7세그먼트 한 자리. update(비트 0 = a … 비트 6 = g) */
export function seg7Digit(): { el: SVGSVGElement; update(bits: number | undefined): void } {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 40 70');
  svg.setAttribute('class', 'seg7');
  const polys = SEGMENTS.map((pts, i) => {
    const p = document.createElementNS(SVG_NS, 'polygon');
    p.setAttribute('points', pts);
    p.setAttribute('data-seg', 'abcdefg'[i]!);
    svg.append(p);
    return p;
  });
  let last = -2;
  return {
    el: svg,
    update(bits) {
      const v = bits === undefined ? -1 : bits;
      if (v === last) return;
      last = v;
      polys.forEach((p, i) => p.classList.toggle('on', v >= 0 && ((v >> i) & 1) === 1));
    },
  };
}

/** 10진수 숫자 → 7세그먼트 비트 (표시용) */
const DIGIT_BITS = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];

/** 정수를 n자리 7세그먼트에 10진수로 보여주는 표시기 (CPU 출력 등) */
export function decimalDisplay(digits = 3): { el: HTMLElement; update(v: number | undefined): void } {
  const ds = Array.from({ length: digits }, () => seg7Digit());
  const el = h('div', { class: 'seg7-row' }, ...ds.map((d) => d.el));
  return {
    el,
    update(v) {
      ds.forEach((d, i) => {
        if (v === undefined) return d.update(undefined);
        const place = 10 ** (digits - 1 - i);
        // 앞자리 0은 끄되, 일의 자리는 항상 표시
        d.update(v >= place || i === digits - 1 ? DIGIT_BITS[Math.floor(v / place) % 10] : 0);
      });
    },
  };
}

/** 회로의 출력 핀(폭 7)을 7세그먼트로 보여주는 카드 */
export function seg7Card(editor: Editor, pins: () => string[]): { el: HTMLElement; render(): void; sync(): void } {
  const el = h('section', { class: 'card device' });
  let digits: { name: string; d: ReturnType<typeof seg7Digit> }[] = [];
  const render = () => {
    el.textContent = '';
    const names = pins().filter((n) => editor.doc.outputs.some((o) => o.name === n && o.width === 7));
    digits = names.map((name) => ({ name, d: seg7Digit() }));
    el.hidden = !digits.length;
    if (!digits.length) return;
    el.append(
      h('h2', {}, t('device.display')),
      h('div', { class: 'seg7-row' }, ...digits.map(({ name, d }) => h('figure', {}, d.el, h('figcaption', {}, name)))),
    );
    sync();
  };
  const sync = () => {
    for (const { name, d } of digits) d.update(editor.pinValue(`self.${name}`));
  };
  return { el, render, sync };
}

export const KEYPAD_KEYS: { label: string; code: number }[] = [
  { label: '7', code: 7 }, { label: '8', code: 8 }, { label: '9', code: 9 }, { label: '+', code: 10 },
  { label: '4', code: 4 }, { label: '5', code: 5 }, { label: '6', code: 6 }, { label: '−', code: 11 },
  { label: '1', code: 1 }, { label: '2', code: 2 }, { label: '3', code: 3 }, { label: '=', code: 12 },
  { label: '0', code: 0 },
];

/** 키패드 카드: 누르면 키 값을 입력 핀에 넣고 클럭을 한 번 */
export function keypadCard(editor: Editor, pin: string, clock: string): { el: HTMLElement; render(): void } {
  const el = h('section', { class: 'card device' });
  const render = () => {
    el.textContent = '';
    const grid = h('div', { class: 'keypad' });
    for (const k of KEYPAD_KEYS) {
      const b = h('button', { type: 'button', class: `btn key ${k.code >= 10 ? 'op' : ''}`, title: `${pin} = ${k.code}` }, k.label);
      b.onclick = () => {
        if (editor.pulsing) return;
        editor.setInputValue(pin, k.code);
        editor.pulse(clock);
      };
      grid.append(b);
    }
    el.append(h('h2', {}, t('device.keypad')), h('p', { class: 'muted small' }, t('device.keypadHint', { pin, clk: clock })), grid);
  };
  return { el, render };
}

// ---------- 픽셀 화면 (메모리 0xE0~0xFF = 16×16) ----------

export const SCREEN_BASE = 0xe0;

/** 화면 메모리 → 켜진 픽셀 (순수 함수): y줄 = [base + 2y](왼쪽 8칸, 최상위 비트가 맨 왼쪽), [base + 2y + 1](오른쪽 8칸) */
export function screenPixels(mem: ArrayLike<number>, base = SCREEN_BASE): boolean[][] {
  return Array.from({ length: 16 }, (_, y) =>
    Array.from({ length: 16 }, (_, x) => {
      const byte = mem[base + 2 * y + (x >> 3)] ?? 0;
      return ((byte >> (7 - (x & 7))) & 1) === 1;
    }),
  );
}

/** 16×16 흑백 화면 */
export function pixelScreen(): { el: HTMLElement; update(mem: ArrayLike<number> | undefined): boolean } {
  const canvas = h('canvas', { class: 'pixel-screen', width: '160', height: '160' });
  const g = canvas.getContext('2d');
  let lastKey = '';
  return {
    el: canvas,
    /** 하나라도 켜져 있으면 true */
    update(mem) {
      const px = mem && mem.length >= 256 ? screenPixels(mem) : null;
      const key = px ? px.map((r) => r.map((b) => (b ? 1 : 0)).join('')).join('') : '';
      if (key === lastKey || !g) return key.includes('1');
      lastKey = key;
      g.fillStyle = '#05140b';
      g.fillRect(0, 0, 160, 160);
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const on = px?.[y]?.[x];
          g.fillStyle = on ? '#5dff9d' : '#0d2416';
          g.fillRect(x * 10 + 1, y * 10 + 1, 8, 8);
        }
      return key.includes('1');
    },
  };
}

/** 회로 안의 RAM256(=256바이트 메모리)마다 화면을 하나씩 보여주는 카드 */
export function screenCard(editor: Editor, onLit?: () => void): { el: HTMLElement; render(): void; sync(): void } {
  const el = h('section', { class: 'card device' });
  let screens: { index: number; scr: ReturnType<typeof pixelScreen> }[] = [];
  const render = () => {
    el.textContent = '';
    const nl = editor.netlist;
    const sim = editor.sim;
    const blocks = nl && sim ? nl.blocks.map((b, i) => ({ b, i })).filter(({ i }) => (sim.blockStates[i]?.mem?.length ?? 0) >= 256) : [];
    screens = blocks.slice(0, 4).map(({ i }) => ({ index: i, scr: pixelScreen() }));
    el.hidden = !screens.length;
    if (!screens.length) return;
    el.append(
      h('h2', {}, t('device.screen')),
      h('p', { class: 'muted small' }, t('device.screenHint')),
      h('div', { class: 'screen-row' }, ...screens.map(({ index, scr }) => h('figure', {}, scr.el, h('figcaption', {}, nl!.blocks[index]!.path)))),
    );
    sync();
  };
  const sync = () => {
    for (const { index, scr } of screens) if (scr.update(editor.sim?.blockStates[index]?.mem)) onLit?.();
  };
  return { el, render, sync };
}
