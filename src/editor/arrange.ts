// 정렬: 선택한 부품 맞춤 / 간격 균등, 그리고 회로 전체를 신호 흐름 순서로 자동 정렬 (순수 함수)
import { SELF, type ChipLibrary } from '../sim';
import { instanceBounds, type EditorDoc, type Selection } from './doc';
import { GRID, ioRect, snap, type Rect } from './geometry';

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vmiddle' | 'bottom' | 'distH' | 'distV';

/** 위치를 옮길 수 있는 항목 하나 (칩 또는 입출력 핀) */
interface Item {
  key: string;
  rect: Rect;
  move(x: number, y: number): void;
}

function itemsOf(doc: EditorDoc, lib: ChipLibrary, sel?: Selection): Item[] {
  const items: Item[] = [];
  for (const inst of doc.instances) {
    if (sel && !sel.instances.has(inst.uid)) continue;
    items.push({ key: inst.uid, rect: instanceBounds(lib, inst), move: (x, y) => ((inst.x = x), (inst.y = y)) });
  }
  for (const n of [...doc.inputs, ...doc.outputs]) {
    if (sel && !sel.io.has(n.id)) continue;
    items.push({ key: n.id, rect: ioRect(n), move: (x, y) => ((n.x = x), (n.y = y)) });
  }
  return items;
}

/** 선택된 항목 중 정렬 대상 개수 (배선 제외) */
export function alignableCount(sel: Selection): number {
  return sel.instances.size + sel.io.size;
}

/**
 * 선택한 항목을 맞춘다. 맞춤은 2개 이상, 간격 균등은 3개 이상일 때 동작한다.
 * 위치는 격자에 맞춘다. 바뀐 것이 있으면 true.
 */
export function alignSelection(doc: EditorDoc, lib: ChipLibrary, sel: Selection, mode: AlignMode): boolean {
  const items = itemsOf(doc, lib, sel);
  const dist = mode === 'distH' || mode === 'distV';
  if (items.length < (dist ? 3 : 2)) return false;
  const x0 = Math.min(...items.map((i) => i.rect.x));
  const y0 = Math.min(...items.map((i) => i.rect.y));
  const x1 = Math.max(...items.map((i) => i.rect.x + i.rect.w));
  const y1 = Math.max(...items.map((i) => i.rect.y + i.rect.h));
  let changed = false;
  const place = (it: Item, x: number, y: number) => {
    x = snap(x);
    y = snap(y);
    if (x !== it.rect.x || y !== it.rect.y) changed = true;
    it.move(x, y);
  };

  if (dist) {
    // 양 끝 항목은 그대로 두고, 사이 간격(빈 공간)을 똑같이 나눈다
    const h = mode === 'distH';
    const pos = (r: Rect) => (h ? r.x : r.y);
    const size = (r: Rect) => (h ? r.w : r.h);
    const sorted = [...items].sort((a, b) => pos(a.rect) - pos(b.rect) || a.key.localeCompare(b.key));
    const first = sorted[0]!.rect;
    const last = sorted[sorted.length - 1]!.rect;
    const span = pos(last) + size(last) - pos(first);
    const total = sorted.reduce((s, i) => s + size(i.rect), 0);
    const gap = (span - total) / (sorted.length - 1);
    let cur = pos(first);
    for (const it of sorted) {
      if (h) place(it, cur, it.rect.y);
      else place(it, it.rect.x, cur);
      cur += size(it.rect) + gap;
    }
    return changed;
  }

  for (const it of items) {
    const r = it.rect;
    switch (mode) {
      case 'left': place(it, x0, r.y); break;
      case 'right': place(it, x1 - r.w, r.y); break;
      case 'hcenter': place(it, (x0 + x1) / 2 - r.w / 2, r.y); break;
      case 'top': place(it, r.x, y0); break;
      case 'bottom': place(it, r.x, y1 - r.h); break;
      case 'vmiddle': place(it, r.x, (y0 + y1) / 2 - r.h / 2); break;
    }
  }
  return changed;
}

const COL_GAP = 5 * GRID;
const ROW_GAP = 2 * GRID;

/**
 * 자동 정렬: 신호가 왼쪽 → 오른쪽으로 흐르도록 열을 나눈다.
 * - 입력 핀은 첫 열, 출력 핀은 마지막 열
 * - 칩은 "입력에서 몇 단계 떨어져 있는가"(최장 경로)에 따라 열을 정한다. 피드백 루프는 무시한다.
 * - 각 열 안에서는 연결된 앞 열 항목들의 평균 높이 순으로 놓아 선이 덜 꼬이게 한다.
 * 회로의 왼쪽 위 기준점은 그대로 유지한다. 바뀐 것이 있으면 true.
 */
export function autoArrange(doc: EditorDoc, lib: ChipLibrary): boolean {
  const all = itemsOf(doc, lib);
  if (!all.length) return false;
  const origin = { x: Math.min(...all.map((i) => i.rect.x)), y: Math.min(...all.map((i) => i.rect.y)) };
  const byKey = new Map(all.map((i) => [i.key, i]));

  // 노드 키: 칩 = uid, 입출력 핀 = IONode id
  const inputIdByName = new Map(doc.inputs.map((n) => [n.name, n.id]));
  const outputIdByName = new Map(doc.outputs.map((n) => [n.name, n.id]));
  const preds = new Map<string, string[]>();
  for (const w of doc.wires) {
    const from = w.from.inst === SELF ? inputIdByName.get(w.from.pin) : w.from.inst;
    const to = w.to.inst === SELF ? outputIdByName.get(w.to.pin) : w.to.inst;
    if (!from || !to || !byKey.has(from) || !byKey.has(to)) continue;
    const list = preds.get(to) ?? [];
    if (!list.includes(from)) list.push(from);
    preds.set(to, list);
  }

  // 칩의 열 번호 = 1 + (앞 칩들의 최대 열 번호). 입력 핀은 0열
  const level = new Map<string, number>();
  for (const n of doc.inputs) level.set(n.id, 0);
  const visiting = new Set<string>();
  const levelOf = (k: string): number => {
    const known = level.get(k);
    if (known !== undefined) return known;
    if (visiting.has(k)) return -1; // 피드백 루프: 이 간선은 무시
    visiting.add(k);
    let best = 0;
    for (const p of preds.get(k) ?? []) best = Math.max(best, levelOf(p) + 1);
    visiting.delete(k);
    const v = Math.max(1, best);
    level.set(k, v);
    return v;
  };
  // 위쪽에 있던 칩부터 계산해 루프를 끊는 위치가 원래 배치에 따라 일정하게 정해지도록
  const instOrder = [...doc.instances].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const inst of instOrder) levelOf(inst.uid);
  const lastCol = Math.max(0, ...doc.instances.map((i) => level.get(i.uid)!)) + 1;
  for (const n of doc.outputs) level.set(n.id, lastCol);

  const cols: Item[][] = Array.from({ length: lastCol + 1 }, () => []);
  for (const it of all) cols[level.get(it.key)!]!.push(it);

  // 열 안 순서: 첫 열(입력)은 원래 위아래 순서, 그다음 열부터는 앞 열 연결의 평균 순번
  const rank = new Map<string, number>();
  cols.forEach((col, c) => {
    const score = new Map<string, number>();
    for (const it of col) {
      const ranks = (preds.get(it.key) ?? []).map((p) => rank.get(p)).filter((r): r is number => r !== undefined);
      score.set(it.key, c === 0 || !ranks.length ? Infinity : ranks.reduce((s, r) => s + r, 0) / ranks.length);
    }
    col.sort((a, b) => score.get(a.key)! - score.get(b.key)! || a.rect.y - b.rect.y || a.rect.x - b.rect.x);
    col.forEach((it, i) => rank.set(it.key, i / Math.max(1, col.length - 1)));
  });

  // 실제 좌표: 열마다 세로로 쌓고, 모든 열을 가장 긴 열의 가운데에 맞춘다
  const heights = cols.map((col) => col.reduce((s, it) => s + it.rect.h, 0) + ROW_GAP * Math.max(0, col.length - 1));
  const tallest = Math.max(...heights);
  let changed = false;
  let x = origin.x;
  cols.forEach((col, c) => {
    if (!col.length) return;
    const width = Math.max(...col.map((it) => it.rect.w));
    let y = origin.y + (tallest - heights[c]!) / 2;
    for (const it of col) {
      const nx = snap(x);
      const ny = snap(y);
      if (nx !== it.rect.x || ny !== it.rect.y) changed = true;
      it.move(nx, ny);
      y += it.rect.h + ROW_GAP;
    }
    x += width + COL_GAP;
  });
  return changed;
}
