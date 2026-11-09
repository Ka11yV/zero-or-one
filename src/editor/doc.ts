// 편집 중인 회로 문서와 편집 연산 (순수 함수 — DOM 없이 테스트 가능)
import { SELF, type ChipLibrary, type CompositeChipDef, type PinRef, type Wire } from '../sim';
import { GRID, instancePins, instanceRect, ioPin, ioRect, pinKey, rectsIntersect, type PinGeom, type Rect } from './geometry';

export interface IONode {
  id: string;
  name: string;
  width: number;
  x: number;
  y: number;
}

export interface PlacedInstance {
  uid: string;
  chip: string;
  x: number;
  y: number;
}

/** 편집기 배선: 항상 from = source(신호 출처), to = sink(받는 쪽)으로 정규화 */
export interface EWire extends Wire {
  id: string;
}

export interface EditorDoc {
  inputs: IONode[];
  outputs: IONode[];
  instances: PlacedInstance[];
  wires: EWire[];
  nextId: number;
}

export interface Selection {
  instances: Set<string>;
  io: Set<string>;
  wires: Set<string>;
}

export const emptySelection = (): Selection => ({ instances: new Set(), io: new Set(), wires: new Set() });
export const selectionSize = (s: Selection): number => s.instances.size + s.io.size + s.wires.size;

export function emptyDoc(): EditorDoc {
  return { inputs: [], outputs: [], instances: [], wires: [], nextId: 1 };
}

export function cloneDoc(doc: EditorDoc): EditorDoc {
  return structuredClone(doc);
}

export function genId(doc: EditorDoc, prefix: string): string {
  return `${prefix}${doc.nextId++}`;
}

/** 편집 문서 → 엔진이 이해하는 칩 정의 */
export function toChipDef(doc: EditorDoc, id = 'SANDBOX'): CompositeChipDef {
  return {
    id,
    kind: 'composite',
    inputs: doc.inputs.map((n) => ({ name: n.name, width: n.width })),
    outputs: doc.outputs.map((n) => ({ name: n.name, width: n.width })),
    instances: doc.instances.map(({ uid, chip, x, y }) => ({ uid, chip, x, y })),
    wires: doc.wires.map(({ from, to }) => ({ from, to })),
  };
}

// ---------- 배치 / 조회 ----------

/** 문서의 모든 핀 위치. key = 'uid.pin' / 'self.name' */
export function layoutPins(doc: EditorDoc, lib: ChipLibrary): Map<string, PinGeom> {
  const m = new Map<string, PinGeom>();
  for (const n of doc.inputs) {
    const p = ioPin(n, 'input');
    m.set(p.key, p);
  }
  for (const n of doc.outputs) {
    const p = ioPin(n, 'output');
    m.set(p.key, p);
  }
  for (const inst of doc.instances) {
    const def = lib.get(inst.chip);
    if (!def) continue;
    for (const p of instancePins(inst, def)) m.set(p.key, p);
  }
  return m;
}

export function findIO(doc: EditorDoc, id: string): { node: IONode; kind: 'input' | 'output' } | undefined {
  const i = doc.inputs.find((n) => n.id === id);
  if (i) return { node: i, kind: 'input' };
  const o = doc.outputs.find((n) => n.id === id);
  return o ? { node: o, kind: 'output' } : undefined;
}

export function instanceBounds(lib: ChipLibrary, inst: PlacedInstance): Rect {
  const def = lib.get(inst.chip);
  return def ? instanceRect(inst, def) : { x: inst.x, y: inst.y, w: 3 * GRID, h: 2 * GRID };
}

export function docBounds(doc: EditorDoc, lib: ChipLibrary): Rect | null {
  const rects: Rect[] = [
    ...doc.inputs.map(ioRect),
    ...doc.outputs.map(ioRect),
    ...doc.instances.map((i) => instanceBounds(lib, i)),
  ];
  if (!rects.length) return null;
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y1 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ---------- 추가 ----------

export function addInstance(doc: EditorDoc, chip: string, x: number, y: number): PlacedInstance {
  const inst = { uid: genId(doc, 'c'), chip, x, y };
  doc.instances.push(inst);
  return inst;
}

const INPUT_NAMES = 'abcdefghijklmnopqrstuvwxyz'.split('');

export function nextIOName(doc: EditorDoc, kind: 'input' | 'output'): string {
  const used = new Set([...doc.inputs, ...doc.outputs].map((n) => n.name));
  if (kind === 'input') {
    const free = INPUT_NAMES.find((n) => !used.has(n) && n !== 'o');
    if (free) return free;
  } else if (!used.has('out')) return 'out';
  for (let i = 1; ; i++) {
    const n = kind === 'input' ? `in${i}` : `out${i}`;
    if (!used.has(n)) return n;
  }
}

export function addIO(doc: EditorDoc, kind: 'input' | 'output', x: number, y: number, width = 1): IONode {
  const node = { id: genId(doc, kind === 'input' ? 'i' : 'o'), name: nextIOName(doc, kind), width, x, y };
  (kind === 'input' ? doc.inputs : doc.outputs).push(node);
  return node;
}

// ---------- 연결 ----------

export type ConnectResult =
  | { ok: true; wire: EWire; replaced?: EWire }
  | { ok: false; reason: 'same-role' | 'width' | 'self'; widths?: [number, number] };

/** 두 핀을 연결한다. 방향은 자동 정규화되고, sink에 기존 선이 있으면 교체한다. */
export function connect(doc: EditorDoc, lib: ChipLibrary, a: PinRef, b: PinRef): ConnectResult {
  const pins = layoutPins(doc, lib);
  const pa = pins.get(pinKey(a));
  const pb = pins.get(pinKey(b));
  if (!pa || !pb) throw new Error('존재하지 않는 핀');
  if (pa.key === pb.key) return { ok: false, reason: 'self' };
  if (pa.role === pb.role) return { ok: false, reason: 'same-role' };
  if (pa.width !== pb.width) return { ok: false, reason: 'width', widths: [pa.width, pb.width] };
  const [src, dst] = pa.role === 'source' ? [pa, pb] : [pb, pa];

  const existing = doc.wires.findIndex((w) => pinKey(w.to) === dst.key);
  let replaced: EWire | undefined;
  if (existing >= 0) {
    if (pinKey(doc.wires[existing]!.from) === src.key) return { ok: true, wire: doc.wires[existing]! }; // 이미 같은 연결
    replaced = doc.wires.splice(existing, 1)[0];
  }
  const wire: EWire = { id: genId(doc, 'w'), from: { ...src.ref }, to: { ...dst.ref } };
  doc.wires.push(wire);
  return replaced ? { ok: true, wire, replaced } : { ok: true, wire };
}

// ---------- 삭제 ----------

const touches = (w: EWire, pred: (r: PinRef) => boolean) => pred(w.from) || pred(w.to);

export function removeSelection(doc: EditorDoc, sel: Selection): void {
  const ioNames = new Set(
    [...doc.inputs, ...doc.outputs].filter((n) => sel.io.has(n.id)).map((n) => n.name),
  );
  doc.instances = doc.instances.filter((i) => !sel.instances.has(i.uid));
  doc.inputs = doc.inputs.filter((n) => !sel.io.has(n.id));
  doc.outputs = doc.outputs.filter((n) => !sel.io.has(n.id));
  doc.wires = doc.wires.filter(
    (w) =>
      !sel.wires.has(w.id) &&
      !touches(w, (r) => (r.inst === SELF ? ioNames.has(r.pin) : sel.instances.has(r.inst))),
  );
}

// ---------- 이름 / 폭 변경 ----------

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,15}$/;

export function renameIO(doc: EditorDoc, id: string, name: string): boolean {
  const found = findIO(doc, id);
  if (!found) return false;
  const old = found.node.name;
  if (name === old) return true;
  if (!NAME_RE.test(name) || [...doc.inputs, ...doc.outputs].some((n) => n.name === name)) return false;
  found.node.name = name;
  for (const w of doc.wires) {
    for (const r of [w.from, w.to]) if (r.inst === SELF && r.pin === old) r.pin = name;
  }
  return true;
}

/** 비트 폭을 바꾸면 폭이 맞지 않게 되는 기존 선은 제거한다. */
export function setIOWidth(doc: EditorDoc, id: string, width: number): void {
  const found = findIO(doc, id);
  if (!found || width < 1 || width > 16) return;
  found.node.width = width;
  const name = found.node.name;
  doc.wires = doc.wires.filter((w) => !touches(w, (r) => r.inst === SELF && r.pin === name));
}

// ---------- 이동 ----------

export function moveSelection(doc: EditorDoc, sel: Selection, dx: number, dy: number): void {
  for (const i of doc.instances) if (sel.instances.has(i.uid)) { i.x += dx; i.y += dy; }
  for (const n of [...doc.inputs, ...doc.outputs]) if (sel.io.has(n.id)) { n.x += dx; n.y += dy; }
}

export function selectInRect(doc: EditorDoc, lib: ChipLibrary, r: Rect): Selection {
  const sel = emptySelection();
  for (const i of doc.instances) if (rectsIntersect(r, instanceBounds(lib, i))) sel.instances.add(i.uid);
  for (const n of [...doc.inputs, ...doc.outputs]) if (rectsIntersect(r, ioRect(n))) sel.io.add(n.id);
  return sel;
}

export function selectAll(doc: EditorDoc): Selection {
  return {
    instances: new Set(doc.instances.map((i) => i.uid)),
    io: new Set([...doc.inputs, ...doc.outputs].map((n) => n.id)),
    wires: new Set(doc.wires.map((w) => w.id)),
  };
}

// ---------- 복사 / 붙여넣기 ----------

/** 클립보드: 선택한 부품과, 양 끝이 모두 선택된 부품인 선만 담는다. (입출력 노드는 이름이 유일해야 하므로 제외) */
export interface Clipboard {
  instances: PlacedInstance[];
  wires: { from: PinRef; to: PinRef }[];
}

export function copySelection(doc: EditorDoc, sel: Selection): Clipboard | null {
  const instances = doc.instances.filter((i) => sel.instances.has(i.uid)).map((i) => ({ ...i }));
  if (!instances.length) return null;
  const wires = doc.wires
    .filter((w) => sel.instances.has(w.from.inst) && sel.instances.has(w.to.inst))
    .map((w) => ({ from: { ...w.from }, to: { ...w.to } }));
  return { instances, wires };
}

export function paste(doc: EditorDoc, clip: Clipboard, dx: number, dy: number): Selection {
  const sel = emptySelection();
  const map = new Map<string, string>();
  for (const i of clip.instances) {
    const n = addInstance(doc, i.chip, i.x + dx, i.y + dy);
    map.set(i.uid, n.uid);
    sel.instances.add(n.uid);
  }
  for (const w of clip.wires) {
    const wire: EWire = {
      id: genId(doc, 'w'),
      from: { inst: map.get(w.from.inst)!, pin: w.from.pin },
      to: { inst: map.get(w.to.inst)!, pin: w.to.pin },
    };
    doc.wires.push(wire);
    sel.wires.add(wire.id);
  }
  return sel;
}

// ---------- 저장 형식 검사 ----------

export function isEditorDoc(v: unknown): v is EditorDoc {
  const d = v as EditorDoc;
  return (
    !!d &&
    Array.isArray(d.inputs) &&
    Array.isArray(d.outputs) &&
    Array.isArray(d.instances) &&
    Array.isArray(d.wires) &&
    typeof d.nextId === 'number'
  );
}
