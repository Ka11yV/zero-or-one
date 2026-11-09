import type { Editor } from '../editor/editor';
import { t } from '../i18n';
import { h } from './dom';

const hex2 = (v: number) => v.toString(16).toUpperCase().padStart(2, '0');

interface View {
  blockIndex: number;
  cells: HTMLElement[];
  values: Int16Array;
  cur: number;
  last: number;
}

/**
 * 메모리 뷰어: 회로 안의 RAM 칩(빠른 모드로 시뮬레이션되는 것)의 내용을 주소 순서대로 보여준다.
 * 현재 주소 칸과 마지막으로 쓴 칸을 강조한다.
 */
export function memoryViewer(editor: Editor): { el: HTMLElement; render(): void; sync(): void } {
  const el = h('section', { class: 'card memory' });
  let views: View[] = [];

  const render = () => {
    el.textContent = '';
    views = [];
    const nl = editor.netlist;
    const sim = editor.sim;
    const blocks = nl && sim ? nl.blocks.map((b, i) => ({ b, i })).filter(({ i }) => sim.blockStates[i]?.mem) : [];
    el.hidden = blocks.length === 0;
    if (!blocks.length) return;
    el.append(h('h2', {}, t('panel.memory')), h('p', { class: 'muted small' }, t('panel.memoryHint')));

    for (const { b, i } of blocks.slice(0, 8)) {
      const size = sim!.blockStates[i]!.mem!.length;
      const big = size > 16;
      // 작은 메모리(≤16칸)는 10진수가 잘리지 않게 한 줄에 8칸, 256칸은 16진수 16칸
      const cols = big ? 16 : Math.min(8, size);
      const grid = h('div', { class: `mem-grid ${big ? 'big' : ''}`, style: `grid-template-columns: ${big ? '22px ' : ''}repeat(${cols}, 1fr)` });
      const cells: HTMLElement[] = [];
      for (let a = 0; a < size; a++) {
        if (big && a % 16 === 0) grid.append(h('span', { class: 'mem-row' }, hex2(a)));
        const cell = h('span', { class: 'mem-cell', title: '' });
        cells.push(cell);
        grid.append(cell);
      }
      // 최상위 부품이면 칩 이름만, 다른 칩 안에 들어 있으면 경로도 함께
      const label = b.path.includes('/') ? `${b.chipId} · ${b.path}` : b.chipId;
      el.append(h('div', { class: 'mem-title' }, label, h('span', { class: 'muted' }, ` (${size} × 8bit${big ? ', HEX' : ''})`)), grid);
      views.push({ blockIndex: i, cells, values: new Int16Array(size).fill(-1), cur: -1, last: -1 });
    }
    sync();
  };

  const sync = () => {
    const nl = editor.netlist;
    const sim = editor.sim;
    if (!nl || !sim) return;
    for (const v of views) {
      const st = sim.blockStates[v.blockIndex];
      const blk = nl.blocks[v.blockIndex];
      if (!st?.mem || !blk) continue;
      const big = st.mem.length > 16;
      for (let a = 0; a < st.mem.length; a++) {
        const val = st.mem[a]!;
        if (v.values[a] === val) continue;
        v.values[a] = val;
        const cell = v.cells[a]!;
        cell.textContent = big ? hex2(val) : String(val);
        cell.title = `${t('panel.memoryAddr')} ${a} (0x${hex2(a)}) = ${val}`;
        cell.classList.toggle('zero', val === 0);
      }
      const addrBits = blk.inputs.get('addr');
      const cur = addrBits ? sim.readNets(addrBits) : -1;
      if (cur !== v.cur) {
        v.cells[v.cur]?.classList.remove('cur');
        v.cells[cur]?.classList.add('cur');
        v.cur = cur;
      }
      const last = typeof st.lastWrite === 'number' ? st.lastWrite : -1;
      if (last !== v.last) {
        v.cells[v.last]?.classList.remove('last');
        v.cells[last]?.classList.add('last');
        v.last = last;
      }
    }
  };

  return { el, render, sync };
}
