// 회로 최적화 (샌드박스)
//  1) 정리: 칩 구조는 그대로 두고 쓸모없는 부품, 중복 칩, NOT 두 번을 없앤다.
//  2) 최고 속도: 조합 회로를 NAND로 펼친 뒤 식을 줄이고, 출력 비트마다 지연이 가장 짧은 형태(원래 구조 / 2단 논리)를 고른다.
// 결과는 항상 원래 회로와 같은 동작인지 시뮬레이션으로 확인하고, 자동 정렬해서 돌려준다.
import {
  compile,
  enumerateInputs,
  measure,
  sampleInputs,
  SELF,
  Simulator,
  type ChipLibrary,
  type PinRef,
} from '../sim';
import { buildSop, CyclicError, evaluateAll, inputBits, LogicGraph, logicFromNetlist, minimizeSop } from '../sim/logic';
import { autoArrange } from './arrange';
import { addInstance, cloneDoc, emptyDoc, toChipDef, type EditorDoc, type EWire } from './doc';

export interface OptimizeMetrics {
  nandCount: number;
  depth: number | null;
  parts: number;
}

export type OptimizeResult =
  | { ok: true; doc: EditorDoc; before: OptimizeMetrics; after: OptimizeMetrics }
  | { ok: false; reason: 'empty' | 'compile' | 'memory' | 'loop' | 'too-big' | 'mismatch'; before?: OptimizeMetrics };

/** 펼친 결과가 이보다 크면 화면에서 다루기 어려우므로 하지 않는다 */
export const MAX_FLAT_NANDS = 1500;
/** 진리표로 다시 만들어 보는(2단 논리) 최대 입력 비트 */
export const MAX_SYNTH_BITS = 8;

export function metricsOf(doc: EditorDoc, lib: ChipLibrary): OptimizeMetrics | null {
  try {
    const m = measure(compile(toChipDef(doc), lib));
    return { nandCount: m.nandCount, depth: m.depth, parts: doc.instances.length };
  } catch {
    return null;
  }
}

// ================= 1) 정리 (칩 유지) =================

const isWireFrom = (w: EWire, inst: string, pin?: string) => w.from.inst === inst && (pin === undefined || w.from.pin === pin);

/** 출력까지 이어지지 않는 부품과 그 배선을 지운다 */
function removeDead(doc: EditorDoc): boolean {
  const live = new Set<string>();
  const stack = doc.wires.filter((w) => w.to.inst === SELF).map((w) => w.from.inst);
  while (stack.length) {
    const u = stack.pop()!;
    if (u === SELF || live.has(u)) continue;
    live.add(u);
    for (const w of doc.wires) if (w.to.inst === u) stack.push(w.from.inst);
  }
  const before = doc.instances.length;
  doc.instances = doc.instances.filter((i) => live.has(i.uid));
  doc.wires = doc.wires.filter((w) => (w.from.inst === SELF || live.has(w.from.inst)) && (w.to.inst === SELF || live.has(w.to.inst)));
  return doc.instances.length !== before;
}

/** from 핀에서 나가던 선을 모두 to 핀에서 나가도록 바꾼다 */
function redirect(doc: EditorDoc, from: PinRef, to: PinRef): void {
  for (const w of doc.wires) if (isWireFrom(w, from.inst, from.pin)) w.from = { ...to };
}

/** 각 인스턴스의 입력 핀 → 신호 출처 */
function sourcesOf(doc: EditorDoc): Map<string, Map<string, string>> {
  const m = new Map<string, Map<string, string>>();
  for (const w of doc.wires) {
    if (w.to.inst === SELF) continue;
    const pins = m.get(w.to.inst) ?? new Map<string, string>();
    pins.set(w.to.pin, `${w.from.inst}.${w.from.pin}`);
    m.set(w.to.inst, pins);
  }
  return m;
}

/** 같은 칩이 같은 신호를 받고 있으면 하나만 남긴다 */
function mergeDuplicates(doc: EditorDoc, lib: ChipLibrary): boolean {
  const src = sourcesOf(doc);
  const seen = new Map<string, string>();
  const drop = new Set<string>();
  for (const inst of doc.instances) {
    const def = lib.get(inst.chip);
    if (!def) continue;
    const pins = src.get(inst.uid);
    const sig = `${inst.chip}|${def.inputs.map((p) => pins?.get(p.name) ?? '-').join('|')}`;
    const keep = seen.get(sig);
    if (!keep) {
      seen.set(sig, inst.uid);
      continue;
    }
    for (const p of def.outputs) redirect(doc, { inst: inst.uid, pin: p.name }, { inst: keep, pin: p.name });
    drop.add(inst.uid);
  }
  if (!drop.size) return false;
  doc.instances = doc.instances.filter((i) => !drop.has(i.uid));
  doc.wires = doc.wires.filter((w) => !drop.has(w.to.inst) && !drop.has(w.from.inst));
  return true;
}

/** NOT 칩 또는 두 입력이 같은 NAND = 뒤집기. 그 입력의 출처를 돌려준다 */
function inverterInput(doc: EditorDoc, uid: string, src: Map<string, Map<string, string>>): PinRef | undefined {
  const inst = doc.instances.find((i) => i.uid === uid);
  const pins = src.get(uid);
  if (!inst || !pins) return undefined;
  let s: string | undefined;
  if (inst.chip === 'NOT') s = pins.get('in');
  else if (inst.chip === 'NAND' && pins.get('a') && pins.get('a') === pins.get('b')) s = pins.get('a');
  if (!s) return undefined;
  const dot = s.indexOf('.');
  return { inst: s.slice(0, dot), pin: s.slice(dot + 1) };
}

/** NOT(NOT x) → x */
function removeDoubleInverters(doc: EditorDoc): boolean {
  const src = sourcesOf(doc);
  let changed = false;
  for (const inst of doc.instances) {
    const x = inverterInput(doc, inst.uid, src);
    if (!x || x.inst === SELF) continue;
    const y = inverterInput(doc, x.inst, src);
    if (!y) continue;
    if (doc.wires.some((w) => isWireFrom(w, inst.uid, 'out'))) {
      redirect(doc, { inst: inst.uid, pin: 'out' }, y);
      changed = true;
    }
  }
  return changed;
}

/** 출력 핀 하나에 선이 두 개 이상 들어가지 않게(입력 → 출력 직결 정리 후) 중복 선 제거 */
function dedupeWires(doc: EditorDoc): void {
  const seen = new Set<string>();
  doc.wires = doc.wires.filter((w) => {
    const k = `${w.from.inst}.${w.from.pin}>${w.to.inst}.${w.to.pin}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function cleanupDoc(doc0: EditorDoc, lib: ChipLibrary): EditorDoc {
  const doc = cloneDoc(doc0);
  for (let round = 0; round < 50; round++) {
    let changed = removeDoubleInverters(doc);
    changed = mergeDuplicates(doc, lib) || changed;
    changed = removeDead(doc) || changed;
    dedupeWires(doc);
    if (!changed) break;
  }
  return doc;
}

// ================= 2) 최고 속도 (NAND로 펼치기) =================

export function flattenFastDoc(doc0: EditorDoc, lib: ChipLibrary): EditorDoc {
  const def = toChipDef(doc0);
  const nl = compile(def, lib);
  const { graph: g, outputs } = logicFromNetlist(nl);
  const bits = inputBits(def.inputs);

  // 출력 비트마다: 원래 구조 / 곱의 합 / 합의 곱 중 지연이 가장 짧은 것
  if (bits.length <= MAX_SYNTH_BITS) {
    const vals = evaluateAll(g, bits);
    const vars = bits.map((b) => g.input(b.pin, b.bit));
    const coneSize = (x: number) => g.cone([x]).size;
    for (const [pin, nodes] of outputs) {
      outputs.set(
        pin,
        nodes.map((orig) => {
          const v = vals[orig]!;
          const ones: number[] = [];
          const zeros: number[] = [];
          v.forEach((x, r) => (x ? ones : zeros).push(r));
          const sop = buildSop(g, vars, minimizeSop(bits.length, ones));
          const pos = g.not(buildSop(g, vars, minimizeSop(bits.length, zeros)));
          let best = orig;
          for (const c of [sop, pos]) {
            const better = g.depth[c]! < g.depth[best]! || (g.depth[c] === g.depth[best] && coneSize(c) < coneSize(best));
            if (better) best = c;
          }
          return best;
        }),
      );
    }
  }
  return graphToDoc(g, outputs, doc0);
}

/** 논리 그래프 → NAND 칩으로 된 편집 문서 (입출력 핀은 원래 이름/폭/id 유지) */
function graphToDoc(g: LogicGraph, outputs: Map<string, number[]>, original: EditorDoc): EditorDoc {
  const doc = emptyDoc();
  doc.nextId = original.nextId;
  doc.inputs = original.inputs.map((n) => ({ ...n }));
  doc.outputs = original.outputs.map((n) => ({ ...n }));
  const wire = (from: PinRef, to: PinRef) => doc.wires.push({ id: `w${doc.nextId++}`, from, to });

  // 다비트 입력은 버스 분리기로 비트를 꺼낸다 (쓰이는 핀만)
  const used = g.cone([...outputs.values()].flat());
  const splitOf = new Map<string, string>();
  for (const n of doc.inputs) {
    if (n.width === 1) continue;
    const needed = [...used].some((x) => {
      const node = g.nodes[x]!;
      return node.k === 'in' && node.pin === n.name;
    });
    if (!needed) continue;
    const s = addInstance(doc, `SPLIT${n.width}`, 0, 0);
    wire({ inst: SELF, pin: n.name }, { inst: s.uid, pin: 'in' });
    splitOf.set(n.name, s.uid);
  }

  const source = new Map<number, PinRef>();
  const ordered = [...used].sort((a, b) => a - b); // 위상 순서
  for (const x of ordered) {
    const n = g.nodes[x]!;
    if (n.k === 'in') {
      const io = doc.inputs.find((i) => i.name === n.pin)!;
      source.set(x, io.width === 1 ? { inst: SELF, pin: n.pin } : { inst: splitOf.get(n.pin)!, pin: `b${n.bit}` });
    } else if (n.k === 'c') {
      const c = addInstance(doc, n.v ? 'CONST1' : 'CONST0', 0, 0);
      source.set(x, { inst: c.uid, pin: 'out' });
    } else {
      const nand = addInstance(doc, 'NAND', 0, 0);
      wire(source.get(n.a)!, { inst: nand.uid, pin: 'a' });
      wire(source.get(n.b)!, { inst: nand.uid, pin: 'b' });
      source.set(x, { inst: nand.uid, pin: 'out' });
    }
  }

  for (const o of doc.outputs) {
    const nodes = outputs.get(o.name);
    if (!nodes) continue;
    if (o.width === 1) {
      wire(source.get(nodes[0]!)!, { inst: SELF, pin: o.name });
      continue;
    }
    const m = addInstance(doc, `MERGE${o.width}`, 0, 0);
    nodes.forEach((x, bit) => wire(source.get(x)!, { inst: m.uid, pin: `b${bit}` }));
    wire({ inst: m.uid, pin: 'out' }, { inst: SELF, pin: o.name });
  }
  return doc;
}

// ================= 같은 동작인지 확인 =================

/** 조합 회로는 모든 입력(≤10비트) 또는 표본, 순차 회로는 무작위 입력 순서로 두 회로의 출력을 비교 */
export function sameBehavior(a: EditorDoc, b: EditorDoc, lib: ChipLibrary): boolean {
  const da = toChipDef(a);
  const db = toChipDef(b);
  const sa = new Simulator(compile(da, lib));
  const sb = new Simulator(compile(db, lib));
  const bitsTotal = da.inputs.reduce((s, p) => s + p.width, 0);
  const rows = bitsTotal <= 10 ? enumerateInputs(da.inputs) : sampleInputs(da.inputs, 256);
  // 순차 회로까지 고려해 한 번 더 섞은 순서로도 비교
  const shuffled = sampleInputs(da.inputs, 256, 11);
  for (const row of [...rows, ...shuffled]) {
    da.inputs.forEach((p, i) => {
      sa.setInput(p.name, row[i]!);
      sb.setInput(p.name, row[i]!);
    });
    sa.settle();
    sb.settle();
    for (const p of da.outputs) if (sa.getOutput(p.name) !== sb.getOutput(p.name)) return false;
  }
  return true;
}

// ================= 진입점 =================

function finish(doc: EditorDoc, original: EditorDoc, lib: ChipLibrary, before: OptimizeMetrics): OptimizeResult {
  autoArrange(doc, lib);
  const after = metricsOf(doc, lib);
  if (!after) return { ok: false, reason: 'compile', before };
  if (!sameBehavior(original, doc, lib)) return { ok: false, reason: 'mismatch', before };
  return { ok: true, doc, before, after };
}

function precheck(doc: EditorDoc, lib: ChipLibrary): OptimizeMetrics | OptimizeResult {
  if (!doc.instances.length || !doc.outputs.length) return { ok: false, reason: 'empty' };
  const before = metricsOf(doc, lib);
  if (!before) return { ok: false, reason: 'compile' };
  return before;
}

/** 정리 (칩 유지) */
export function optimizeKeepChips(doc: EditorDoc, lib: ChipLibrary): OptimizeResult {
  const before = precheck(doc, lib);
  if ('ok' in before) return before;
  return finish(cleanupDoc(doc, lib), doc, lib, before);
}

/** 최고 속도 (NAND로 펼치기) */
export function optimizeFastest(doc: EditorDoc, lib: ChipLibrary): OptimizeResult {
  const before = precheck(doc, lib);
  if ('ok' in before) return before;
  if (before.nandCount > MAX_FLAT_NANDS * 4) return { ok: false, reason: 'too-big', before };
  let flat: EditorDoc;
  try {
    flat = flattenFastDoc(doc, lib);
  } catch (e) {
    if (e instanceof CyclicError) return { ok: false, reason: e.message === 'memory blocks' ? 'memory' : 'loop', before };
    throw e;
  }
  if (flat.instances.filter((i) => i.chip === 'NAND').length > MAX_FLAT_NANDS) return { ok: false, reason: 'too-big', before };
  return finish(flat, doc, lib, before);
}
