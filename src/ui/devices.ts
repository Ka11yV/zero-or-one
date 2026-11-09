// 입출력 장치: 7세그먼트 표시기와 키패드
import type { Editor } from '../editor/editor';
import { t } from '../i18n';
import { h, rich } from './dom';

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

// ---------- 숫자 다이얼 (4비트 = 시계처럼 16칸) ----------

/** 부호 있는 4비트로 읽기: 8~15 → −8~−1 */
export const signed4 = (v: number) => (v & 8 ? (v & 15) - 16 : v & 15);

const WHEEL_COLORS = ['#5aa9ff', '#ffb547', '#3ddc84', '#ff7ab6'];

/**
 * 4비트 값을 16칸 원 위의 바늘로 보여 주는 카드. 바깥 = 부호 없는 0~15, 안쪽 = 부호 있는 −8~7.
 * 15 다음이 0으로 "돌아가는" 것과 1111 = 15 = −1 이 한눈에 보인다.
 */
export function numberWheelCard(editor: Editor, pins: () => string[]): { el: HTMLElement; render(): void; sync(): void } {
  const el = h('section', { class: 'card device wheel-card' });
  let needles: { name: string; g: SVGGElement; dot: SVGCircleElement; label: HTMLElement; last: number | undefined | null }[] = [];
  const S = 200;
  const C = S / 2;
  const pos = (i: number, r: number) => {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
  };
  const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>) => {
    const e = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };
  const render = () => {
    el.textContent = '';
    const names = pins().filter((n) => [...editor.doc.inputs, ...editor.doc.outputs].some((p) => p.name === n && p.width === 4));
    el.hidden = !names.length;
    needles = [];
    if (!names.length) return;
    const svg = svgEl('svg', { viewBox: `0 0 ${S} ${S}`, class: 'number-wheel', role: 'img', 'aria-label': t('device.wheel') });
    svg.append(svgEl('circle', { cx: String(C), cy: String(C), r: '92', class: 'rim' }));
    // 음수 영역(8~15) 호
    const neg = svgEl('path', { class: 'neg-arc', d: '' });
    const p8 = pos(8, 92);
    const p0 = pos(0, 92);
    neg.setAttribute('d', `M ${p8.x} ${p8.y} A 92 92 0 0 1 ${p0.x} ${p0.y}`);
    svg.append(neg);
    for (let i = 0; i < 16; i++) {
      const o = pos(i, 80);
      const n = pos(i, 56);
      const tick = pos(i, 92);
      const tick2 = pos(i, 87);
      svg.append(svgEl('line', { x1: String(tick.x), y1: String(tick.y), x2: String(tick2.x), y2: String(tick2.y), class: 'tick' }));
      const u = svgEl('text', { x: String(o.x), y: String(o.y + 4), class: 'u' });
      u.textContent = String(i);
      const sg = svgEl('text', { x: String(n.x), y: String(n.y + 3.5), class: `s ${i >= 8 ? 'minus' : ''}` });
      sg.textContent = String(signed4(i));
      svg.append(u, sg);
    }
    const legend = h('div', { class: 'wheel-legend' });
    names.forEach((name, k) => {
      const color = WHEEL_COLORS[k % WHEEL_COLORS.length]!;
      const g = svgEl('g', { class: 'needle', style: `--c:${color};transform-origin:${C}px ${C}px` });
      g.append(svgEl('line', { x1: String(C), y1: String(C), x2: String(C), y2: String(C - 66 + k * 6) }));
      const dot = svgEl('circle', { cx: String(C), cy: String(C - 92), r: String(6 + k * 2), class: 'needle-dot', style: `stroke:${color}` });
      svg.append(g, dot);
      const label = h('span', { class: 'wheel-val' });
      legend.append(h('div', { class: 'wheel-row', style: `--c:${color}` }, h('span', { class: 'swatch' }), h('b', {}, name), label));
      needles.push({ name, g, dot: dot as SVGCircleElement, label, last: null });
    });
    svg.append(svgEl('circle', { cx: String(C), cy: String(C), r: '4', class: 'hub' }));
    el.append(h('h2', {}, t('device.wheel')), h('p', { class: 'muted small' }, t('device.wheelHint')), h('div', { class: 'wheel-wrap' }, svg, legend));
    sync();
  };
  const sync = () => {
    const vals = new Map(editor.ioValues().map((v) => [v.name, v.value]));
    for (const n of needles) {
      const v = vals.get(n.name);
      if (v === n.last) continue;
      n.last = v;
      if (v === undefined) {
        n.g.style.opacity = '0.2';
        n.label.textContent = '?';
        continue;
      }
      n.g.style.opacity = '1';
      const deg = ((v & 15) / 16) * 360;
      n.g.style.transform = `rotate(${deg}deg)`;
      const p = pos(v & 15, 92);
      n.dot.setAttribute('cx', String(p.x));
      n.dot.setAttribute('cy', String(p.y));
      const bits = (v & 15).toString(2).padStart(4, '0');
      n.label.replaceChildren(h('code', { class: 'inline' }, bits), ` = ${v & 15}`, v & 8 ? h('span', { class: 'minus' }, ` (${signed4(v)})`) : '');
    }
  };
  return { el, render, sync };
}

// ---------- 세로셈 (덧셈의 자리별 올림) ----------

export interface ColumnAddition {
  /** 자리 i로 들어오는 올림 (carries[0] = cin, carries[n] = 최종 올림) */
  carries: number[];
  aBits: number[];
  bBits: number[];
  sumBits: number[];
  cout: number;
}

/** 순수 함수: a + b + cin을 자리별로 (비트 0 = 1의 자리) */
export function columnAddition(a: number, b: number, cin: number, n: number): ColumnAddition {
  const carries = [cin & 1];
  const aBits: number[] = [];
  const bBits: number[] = [];
  const sumBits: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = (a >> i) & 1;
    const y = (b >> i) & 1;
    const t = x + y + carries[i]!;
    aBits.push(x);
    bBits.push(y);
    sumBits.push(t & 1);
    carries.push(t >> 1);
  }
  return { carries, aBits, bBits, sumBits, cout: carries[n]! };
}

export interface ColumnAddPins {
  a: string;
  b: string;
  cin?: string;
  sum: string;
  cout: string;
}

/**
 * 세로셈 카드: 위에서부터 올림 / a / + b / 정답 / 내 회로.
 * 올림이 1인 자리는 오른쪽 아래(아랫자리)에서 올라온 화살표로 표시하고, 내 회로 줄에서 정답과 다른 자리는 빨갛게.
 */
export function columnAddCard(editor: Editor, spec: () => ColumnAddPins | undefined): { el: HTMLElement; render(): void; sync(): void } {
  const el = h('section', { class: 'card device column-card' });
  let refresh: (() => void) | null = null;
  const render = () => {
    el.textContent = '';
    refresh = null;
    const p = spec();
    const width = (name: string) => [...editor.doc.inputs, ...editor.doc.outputs].find((x) => x.name === name)?.width;
    const n = p ? width(p.a) : undefined;
    el.hidden = !p || !n || width(p.b) !== n || width(p.sum) !== n;
    if (!p || !n || el.hidden) return;

    // 칸: [라벨] [cout 자리] [n-1 … 0]
    const grid = h('div', { class: 'col-grid', style: `--cols:${n + 1}` });
    const cell = (cls: string, text = '') => h('span', { class: `cc ${cls}` }, text);
    const row = (label: string, cls: string) => {
      const cells = Array.from({ length: n + 1 }, (_, k) => cell(`${cls} ${k > 0 && (n - k) % 4 === 3 && k !== 1 ? 'nib' : ''}`));
      grid.append(h('span', { class: `cl ${cls}` }, label), ...cells);
      return cells;
    };
    const place = row('', 'place');
    const carryRow = row(t('device.colCarry'), 'carry');
    const aRow = row(p.a, 'a');
    const bRow = row(`+ ${p.b}`, 'b');
    grid.append(h('span', { class: 'col-rule', style: `grid-column: 1 / span ${n + 2}` }));
    const ansRow = row(t('device.colAnswer'), 'ans');
    const mineRow = row(t('device.colMine'), 'mine');
    // 자리값 (1, 2, 4, …)
    for (let i = 0; i < n; i++) place[n - i]!.textContent = String(2 ** i);
    place[0]!.textContent = '';
    const explain = h('ol', { class: 'col-explain' });
    el.append(h('h2', {}, t('device.column')), rich(t('device.columnHint'), 'rich col-hint'), h('div', { class: 'col-wrap' }, grid), n <= 4 ? explain : '');

    refresh = () => {
      const v = new Map(editor.ioValues().map((x) => [x.name, x.value]));
      const A = v.get(p.a) ?? 0;
      const B = v.get(p.b) ?? 0;
      const CIN = p.cin ? (v.get(p.cin) ?? 0) : 0;
      const c = columnAddition(A, B, CIN, n);
      const mySum = v.get(p.sum);
      const myCout = v.get(p.cout);
      for (let i = 0; i < n; i++) {
        const k = n - i;
        aRow[k]!.textContent = String(c.aBits[i]);
        bRow[k]!.textContent = String(c.bBits[i]);
        ansRow[k]!.textContent = String(c.sumBits[i]);
        // 이 자리로 들어오는 올림 (1의 자리는 cin)
        const ci = c.carries[i]!;
        const showCin = i > 0 || !!p.cin;
        carryRow[k]!.textContent = showCin && ci ? '1' : '';
        carryRow[k]!.classList.toggle('on', showCin && ci === 1);
        carryRow[k]!.classList.toggle('from-cin', i === 0 && !!p.cin && ci === 1);
        const mine = mySum === undefined ? undefined : (mySum >> i) & 1;
        mineRow[k]!.textContent = mine === undefined ? '?' : String(mine);
        mineRow[k]!.classList.toggle('bad', mine !== undefined && mine !== c.sumBits[i]);
      }
      // 맨 왼쪽: 최종 올림 = cout
      carryRow[0]!.textContent = c.cout ? '1' : '';
      carryRow[0]!.classList.toggle('on', c.cout === 1);
      ansRow[0]!.textContent = String(c.cout);
      ansRow[0]!.classList.add('cout');
      mineRow[0]!.textContent = myCout === undefined ? '?' : String(myCout & 1);
      mineRow[0]!.classList.toggle('bad', myCout !== undefined && (myCout & 1) !== c.cout);
      mineRow[0]!.classList.add('cout');
      aRow[0]!.textContent = '';
      bRow[0]!.textContent = '';
      // 자리별 설명 (4자리 이하일 때)
      if (n <= 4) {
        explain.textContent = '';
        for (let i = 0; i < n; i++) {
          const ci = c.carries[i]!;
          const terms = [String(c.aBits[i]), String(c.bBits[i]), ...(ci && (i > 0 || p.cin) ? [t('device.colCarryTerm')] : [])];
          const total = c.aBits[i]! + c.bBits[i]! + (i > 0 || p.cin ? ci : 0);
          const li = h('li', { class: c.carries[i + 1] ? 'carry' : '' });
          li.append(
            h('b', {}, t('device.colPlace', { p: 2 ** i })),
            ' ',
            `${terms.join(' + ')} = ${total} → `,
            c.carries[i + 1] ? t('device.colWriteCarry', { s: c.sumBits[i]! }) : t('device.colWrite', { s: c.sumBits[i]! }),
          );
          explain.append(li);
        }
        explain.append(h('li', { class: 'muted' }, c.cout ? t('device.colCoutOn', { cout: p.cout }) : t('device.colCoutOff', { cout: p.cout })));
      }
    };
    refresh();
  };
  const sync = () => refresh?.();
  return { el, render, sync };
}

// ---------- 전가산기 단계별 보기 ----------

/** 전가산기를 두 번의 반가산기 + OR로 나눈 값 (순수 함수) */
export function fullAdderSteps(a: number, b: number, cin: number) {
  const t1 = a + b;
  const s1 = t1 & 1;
  const c1 = t1 >> 1;
  const t2 = s1 + cin;
  const sum = t2 & 1;
  const c2 = t2 >> 1;
  return { t1, s1, c1, t2, sum, c2, cout: c1 | c2 };
}

/**
 * 전가산기 단계별 카드: (a + b) + cin 을 반가산기① → 반가산기② → OR 로.
 * 회로 구조가 드러나므로 버튼을 눌러야 펼쳐진다.
 */
export function fullAdderStepsCard(editor: Editor, enabled: () => boolean): { el: HTMLElement; render(): void; sync(): void } {
  const el = h('section', { class: 'card device fa-card' });
  let open = false;
  let refresh: (() => void) | null = null;
  const render = () => {
    el.textContent = '';
    refresh = null;
    el.hidden = !enabled();
    if (el.hidden) return;
    el.append(h('h2', {}, t('device.faSteps')));
    if (!open) {
      const b = h('button', { type: 'button', class: 'btn fa-reveal' }, `🔍 ${t('device.faReveal')}`);
      b.onclick = () => {
        open = true;
        render();
      };
      el.append(rich(t('device.faIntro'), 'rich fa-intro'), b, h('p', { class: 'muted small' }, t('device.faSpoiler')));
      return;
    }
    // 블록 그림
    const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>, text?: string) => {
      const e = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      if (text !== undefined) e.textContent = text;
      return e;
    };
    const svg = svgEl('svg', { viewBox: '0 0 300 185', class: 'fa-diagram', role: 'img', 'aria-label': t('device.faSteps') });
    const wire = (d: string) => svgEl('path', { d, class: 'fw' });
    const W = {
      a: wire('M 26 30 H 60'),
      b: wire('M 26 60 H 60'),
      cin: wire('M 26 128 H 165'),
      s1: wire('M 120 34 H 145 V 100 H 165'),
      c1: wire('M 120 58 H 134 V 158 H 238'),
      sum: wire('M 225 100 H 272'),
      c2: wire('M 225 128 H 230 V 170 H 238'),
      cout: wire('M 278 164 H 292'),
    };
    const box = (x: number, y: number, w: number, hh: number, label: string, sub: string) => {
      const g = svgEl('g', { class: 'fbox' });
      g.append(
        svgEl('rect', { x: String(x), y: String(y), width: String(w), height: String(hh), rx: '7' }),
        svgEl('text', { x: String(x + w / 2), y: String(y + hh / 2 - 1), class: 'fb-title' }, label),
        svgEl('text', { x: String(x + w / 2), y: String(y + hh / 2 + 12), class: 'fb-sub' }, sub),
      );
      return g;
    };
    const val = (x: number, y: number) => svgEl('text', { x: String(x), y: String(y), class: 'fv' });
    const V = {
      a: val(42, 24),
      b: val(42, 54),
      cin: val(70, 122),
      s1: val(152, 62),
      c1: val(142, 150),
      sum: val(250, 94),
      c2: val(214, 164),
      cout: val(292, 158),
    };
    svg.append(
      ...Object.values(W),
      box(60, 18, 60, 54, t('device.faHA'), '①'),
      box(165, 88, 60, 52, t('device.faHA'), '②'),
      box(238, 150, 40, 28, 'OR', ''),
      svgEl('text', { x: '4', y: '34', class: 'fl' }, 'a'),
      svgEl('text', { x: '4', y: '64', class: 'fl' }, 'b'),
      svgEl('text', { x: '0', y: '132', class: 'fl' }, 'cin'),
      svgEl('text', { x: '276', y: '104', class: 'fl out' }, 'sum'),
      svgEl('text', { x: '248', y: '140', class: 'fl out' }, 'cout'),
      ...Object.values(V),
    );
    const steps = h('ol', { class: 'fa-steps' });
    el.append(rich(t('device.faIntro'), 'rich fa-intro'), svg, steps, rich(t('device.faWhyOr'), 'rich fa-why'));
    refresh = () => {
      const v = new Map(editor.ioValues().map((x) => [x.name, x.value ?? 0]));
      const a = (v.get('a') ?? 0) & 1;
      const b = (v.get('b') ?? 0) & 1;
      const cin = (v.get('cin') ?? 0) & 1;
      const r = fullAdderSteps(a, b, cin);
      const vals: Record<keyof typeof W, number> = { a, b, cin, s1: r.s1, c1: r.c1, sum: r.sum, c2: r.c2, cout: r.cout };
      for (const k of Object.keys(W) as (keyof typeof W)[]) {
        W[k].setAttribute('class', `fw ${vals[k] ? 'on' : ''}`);
        V[k].textContent = String(vals[k]);
        V[k].setAttribute('class', `fv ${vals[k] ? 'on' : ''}`);
      }
      steps.replaceChildren(
        h('li', {}, rich(t('device.faStep1', { a, b, t: r.t1, s: r.s1, c: r.c1 }), 'rich')),
        h('li', {}, rich(t('device.faStep2', { s: r.s1, cin, t: r.t2, sum: r.sum, c: r.c2 }), 'rich')),
        h('li', {}, rich(t('device.faStep3', { c1: r.c1, c2: r.c2, cout: r.cout }), 'rich')),
        h('li', { class: 'muted' }, rich(t('device.faCheck', { a, b, cin, total: a + b + cin, cout: r.cout, sum: r.sum }), 'rich')),
      );
    };
    refresh();
  };
  const sync = () => refresh?.();
  return { el, render, sync };
}
