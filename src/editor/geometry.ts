// 편집기 도형 계산 (순수 함수 — DOM 없이 테스트 가능)
import { SELF, type ChipDef, type PinRef } from '../sim';

export const GRID = 20;

export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 핀 하나의 화면 배치 정보. role: source = 신호를 내보냄(출력 핀·입력 스위치), sink = 받음 */
export interface PinGeom {
  ref: PinRef;
  key: string; // 'uid.pin' / 'self.name'
  x: number;
  y: number;
  side: 'left' | 'right';
  role: 'source' | 'sink';
  width: number;
  label: string;
}

export const pinKey = (ref: PinRef): string => `${ref.inst}.${ref.pin}`;

const CHAR_W = 9;
const PIN_LABEL_CHAR_W = 6.5;

/** 핀 이름을 칩 안에 표시할지 (NAND·상수처럼 뻔한 경우는 생략) */
export function showPinLabels(def: ChipDef): boolean {
  return !(def.id === 'NAND' || def.id.startsWith('CONST'));
}

export function chipLabel(def: ChipDef): string {
  if (def.id.startsWith('CONST')) return def.id.endsWith('1') ? '1' : '0';
  return def.id;
}

/** 칩 상자 크기 (그리드 배수). 핀 간격 = 1 그리드. */
export function chipSize(def: ChipDef): { w: number; h: number } {
  const rows = Math.max(def.inputs.length, def.outputs.length, 1);
  const h = (rows + 1) * GRID;
  let content = chipLabel(def).length * CHAR_W + 16;
  if (showPinLabels(def)) {
    const longest = (pins: { name: string }[]) => Math.max(0, ...pins.map((p) => p.name.length));
    content += (longest(def.inputs) + longest(def.outputs)) * PIN_LABEL_CHAR_W + 24;
  }
  const w = Math.max(3 * GRID, Math.ceil(content / GRID) * GRID);
  return { w, h };
}

function pinYs(count: number, rows: number): number[] {
  const offset = ((rows - count) * GRID) / 2;
  return Array.from({ length: count }, (_, i) => (i + 1) * GRID + offset);
}

export function instanceRect(inst: { x: number; y: number }, def: ChipDef): Rect {
  const { w, h } = chipSize(def);
  return { x: inst.x, y: inst.y, w, h };
}

export function instancePins(inst: { uid: string; x: number; y: number }, def: ChipDef): PinGeom[] {
  const rows = Math.max(def.inputs.length, def.outputs.length, 1);
  const { w } = chipSize(def);
  const ins = pinYs(def.inputs.length, rows).map((dy, i) => {
    const p = def.inputs[i]!;
    const ref = { inst: inst.uid, pin: p.name };
    return { ref, key: pinKey(ref), x: inst.x, y: inst.y + dy, side: 'left', role: 'sink', width: p.width, label: p.name } as PinGeom;
  });
  const outs = pinYs(def.outputs.length, rows).map((dy, i) => {
    const p = def.outputs[i]!;
    const ref = { inst: inst.uid, pin: p.name };
    return { ref, key: pinKey(ref), x: inst.x + w, y: inst.y + dy, side: 'right', role: 'source', width: p.width, label: p.name } as PinGeom;
  });
  return [...ins, ...outs];
}

// ---- 입출력 노드 (입력 스위치 / 출력 램프) ----
export const IO_W = 2 * GRID;
export const IO_H = 2 * GRID;

export function ioRect(node: { x: number; y: number }): Rect {
  return { x: node.x, y: node.y, w: IO_W, h: IO_H };
}

export function ioPin(node: { name: string; width: number; x: number; y: number }, kind: 'input' | 'output'): PinGeom {
  const ref = { inst: SELF, pin: node.name };
  return kind === 'input'
    ? { ref, key: pinKey(ref), x: node.x + IO_W, y: node.y + IO_H / 2, side: 'right', role: 'source', width: node.width, label: node.name }
    : { ref, key: pinKey(ref), x: node.x, y: node.y + IO_H / 2, side: 'left', role: 'sink', width: node.width, label: node.name };
}

// ---- 배선 경로 ----

/** source(오른쪽으로 나감) → sink(왼쪽으로 들어옴) 직교 경로 */
export function wirePath(s: Pt, t: Pt): Pt[] {
  if (s.y === t.y && t.x >= s.x) return [s, t];
  if (t.x - s.x >= 2 * GRID) {
    const midX = snap((s.x + t.x) / 2);
    return [s, { x: midX, y: s.y }, { x: midX, y: t.y }, t];
  }
  // 뒤로 돌아가는 선: 두 핀 사이 높이에서 우회
  const out = s.x + GRID;
  const back = t.x - GRID;
  const midY = Math.abs(s.y - t.y) >= 2 * GRID ? snap((s.y + t.y) / 2) : Math.max(s.y, t.y) + 2 * GRID;
  return [s, { x: out, y: s.y }, { x: out, y: midY }, { x: back, y: midY }, { x: back, y: t.y }, t];
}

export function snap(v: number, step = GRID): number {
  return Math.round(v / step) * step;
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let u = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  u = Math.max(0, Math.min(1, u));
  return Math.hypot(p.x - (a.x + u * dx), p.y - (a.y + u * dy));
}

export function distToPath(p: Pt, path: Pt[]): number {
  let d = Infinity;
  for (let i = 1; i < path.length; i++) d = Math.min(d, distToSegment(p, path[i - 1]!, path[i]!));
  return d;
}

export function rectContains(r: Rect, p: Pt): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

export function normRect(a: Pt, b: Pt): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}
