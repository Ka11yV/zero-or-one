// NAND 설명 창: 이 게임의 기본 부품. 입력을 바꾸면 트랜지스터 4개(CMOS)의 스위치와 전기가 흐르는 길이 바뀐다.
import { t } from '../i18n';
import { button, h, rich } from './dom';
import { openModal, type ModalHandle } from './modal';

const SVG_NS = 'http://www.w3.org/2000/svg';

function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>, text?: string): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

/** 트랜지스터 상태 (순수): P형은 입력이 0일 때, N형은 입력이 1일 때 연결된다 */
export function nandSwitches(a: 0 | 1, b: 0 | 1): { pa: boolean; pb: boolean; na: boolean; nb: boolean; out: 0 | 1 } {
  return { pa: a === 0, pb: b === 0, na: a === 1, nb: b === 1, out: a && b ? 0 : 1 };
}

/** 트랜지스터 하나: 상자 + 안쪽 스위치(연결이면 곧은 선, 끊김이면 꺾인 선) */
function transistor(x: number, y: number, kind: 'P' | 'N', input: 'a' | 'b') {
  const g = s('g', { class: `tr ${kind === 'P' ? 'pmos' : 'nmos'}` });
  g.append(
    s('rect', { x: String(x - 22), y: String(y), width: '44', height: '40', rx: '7', class: 'tr-box' }),
    s('line', { x1: String(x), y1: String(y + 6), x2: String(x), y2: String(y + 34), class: 'sw-closed' }),
    s('path', { d: `M ${x} ${y + 6} L ${x} ${y + 15} M ${x} ${y + 34} L ${x} ${y + 25} M ${x} ${y + 25} L ${x + 11} ${y + 13}`, class: 'sw-open' }),
    s('text', { x: String(x + 30), y: String(y + 16), class: 'tr-kind' }, kind),
    s('text', { x: String(x + 30), y: String(y + 32), class: 'tr-in' }, input),
  );
  return g;
}

export function showNandInfo(): ModalHandle {
  let a: 0 | 1 = 1;
  let b: 0 | 1 = 1;

  // ---------- 회로 그림 (세로: 전원 → P 두 개(나란히) → out → N 두 개(일렬) → 접지) ----------
  const svg = s('svg', { viewBox: '0 0 300 340', class: 'cmos', role: 'img', 'aria-label': t('nand.diagram') });
  const seg = (d: string, id: string) => s('path', { d, class: 'w', 'data-seg': id });
  const segs = {
    vdd: seg('M 70 26 H 210', 'vdd'),
    pLtop: seg('M 90 26 V 50', 'pLtop'),
    pRtop: seg('M 190 26 V 50', 'pRtop'),
    pLbot: seg('M 90 90 V 120 H 140', 'pLbot'),
    pRbot: seg('M 190 90 V 120 H 140', 'pRbot'),
    outNode: seg('M 140 120 V 150 M 140 135 H 250', 'outNode'),
    nMid: seg('M 140 190 V 214', 'nMid'),
    nBot: seg('M 140 254 V 290', 'nBot'),
    gnd: seg('M 100 290 H 180', 'gnd'),
  };
  const pa = transistor(90, 50, 'P', 'a');
  const pb = transistor(190, 50, 'P', 'b');
  const na = transistor(140, 150, 'N', 'a');
  const nb = transistor(140, 214, 'N', 'b');
  const outDot = s('circle', { cx: '262', cy: '135', r: '11', class: 'out-lamp' });
  const outText = s('text', { x: '262', y: '140', class: 'out-val' });
  svg.append(
    ...Object.values(segs),
    s('text', { x: '140', y: '16', class: 'rail-label' }, t('nand.vdd')),
    s('text', { x: '140', y: '326', class: 'rail-label' }, t('nand.gnd')),
    s('line', { x1: '108', y1: '298', x2: '172', y2: '298', class: 'gnd-mark' }),
    s('line', { x1: '120', y1: '305', x2: '160', y2: '305', class: 'gnd-mark' }),
    pa,
    pb,
    na,
    nb,
    outDot,
    outText,
    s('text', { x: '262', y: '163', class: 'out-label' }, 'out'),
  );

  // ---------- 입력 스위치 · 진리표 · 지금 설명 ----------
  const btnA = h('button', { type: 'button', class: 'nand-in' });
  const btnB = h('button', { type: 'button', class: 'nand-in' });
  const now = h('div', { class: 'nand-now' });
  const rows = ([[0, 0], [0, 1], [1, 0], [1, 1]] as const).map(([x, y]) => {
    const tr = h('tr', {}, h('td', {}, String(x)), h('td', {}, String(y)), h('td', { class: 'o' }, String(x && y ? 0 : 1)));
    tr.onclick = () => {
      a = x;
      b = y;
      paint();
    };
    return { tr, x, y };
  });
  const table = h('table', { class: 'truth nand-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'a'), h('th', {}, 'b'), h('th', {}, 'out'))), h('tbody', {}, ...rows.map((r) => r.tr)));

  const paint = () => {
    const st = nandSwitches(a, b);
    btnA.textContent = `a = ${a}`;
    btnB.textContent = `b = ${b}`;
    btnA.classList.toggle('on', a === 1);
    btnB.classList.toggle('on', b === 1);
    pa.classList.toggle('conduct', st.pa);
    pb.classList.toggle('conduct', st.pb);
    na.classList.toggle('conduct', st.na);
    nb.classList.toggle('conduct', st.nb);
    // 전선 색: hi = 전원(1)과 이어짐, lo = 접지(0)와 이어짐, 나머지 = 끊김
    const level: Record<string, 'hi' | 'lo' | ''> = {
      vdd: 'hi',
      pLtop: 'hi',
      pRtop: 'hi',
      pLbot: st.pa ? 'hi' : st.out ? '' : 'lo',
      pRbot: st.pb ? 'hi' : st.out ? '' : 'lo',
      outNode: st.out ? 'hi' : 'lo',
      nMid: st.nb ? 'lo' : st.na ? (st.out ? 'hi' : 'lo') : '',
      nBot: 'lo',
      gnd: 'lo',
    };
    // 끊긴 P 아래쪽 선은 out과 같은 값이지만 길이 아님 → 흐리게
    if (!st.pa) level.pLbot = '';
    if (!st.pb) level.pRbot = '';
    for (const [k, el] of Object.entries(segs)) el.setAttribute('class', `w ${level[k] ?? ''}`);
    outDot.setAttribute('class', `out-lamp ${st.out ? 'hi' : 'lo'}`);
    outText.textContent = String(st.out);
    rows.forEach((r) => r.tr.classList.toggle('current', r.x === a && r.y === b));
    const zeros = [a === 0 ? 'a' : '', b === 0 ? 'b' : ''].filter(Boolean);
    now.replaceChildren(
      rich(st.out ? t('nand.nowOne', { which: zeros.join(t('nand.and')) }) : t('nand.nowZero'), 'rich'),
    );
  };
  btnA.onclick = () => {
    a = a ? 0 : 1;
    paint();
  };
  btnB.onclick = () => {
    b = b ? 0 : 1;
    paint();
  };

  const content = h(
    'div',
    { class: 'nand-info' },
    h('h2', {}, `⊼ ${t('nand.title')}`),
    rich(t('nand.lead'), 'rich nand-lead'),
    h(
      'div',
      { class: 'nand-body' },
      h('div', { class: 'nand-left' }, h('div', { class: 'nand-inputs' }, btnA, btnB), now, table, h('p', { class: 'muted small' }, t('nand.tableHint'))),
      h('div', { class: 'nand-right' }, svg, rich(t('nand.legend'), 'rich nand-legend')),
    ),
    rich(t('nand.foot'), 'rich nand-foot'),
  );
  const m = openModal(content, { wide: true });
  content.append(h('div', { class: 'actions' }, button(t('common.close'), () => m.close(), 'primary')));
  paint();
  return m;
}
