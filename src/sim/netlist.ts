import type { ChipLibrary } from './builtins';
import { modelFor } from './functional';
import {
  CompileError,
  GateType,
  SELF,
  type BlockInstance,
  type ChipDef,
  type CompileWarning,
  type CompositeChipDef,
  type Netlist,
  type PinDef,
  type PinRef,
} from './types';

type PinNets = Map<string, number[]>;

interface RawGate {
  type: GateType;
  in0: number;
  in1: number;
  out: number;
}

/** 경로 압축 + 랭크 없는 간단한 Union-Find (넷 병합용). */
class UnionFind {
  private parent: number[] = [];

  make(): number {
    const id = this.parent.length;
    this.parent.push(id);
    return id;
  }

  find(x: number): number {
    const p = this.parent;
    let r = x;
    while (p[r] !== r) r = p[r]!;
    while (p[x] !== r) {
      const next = p[x]!;
      p[x] = r;
      x = next;
    }
    return r;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[rb] = ra;
  }

  get size(): number {
    return this.parent.length;
  }
}

/**
 * 칩 정의를 원시 게이트(NAND/상수)로 이루어진 평탄한 넷리스트로 컴파일한다.
 * - 복합 칩은 재귀적으로 펼친다.
 * - 버스 분리/합치기(alias)는 게이트 없이 넷을 합친다.
 * - 단락(한 넷에 출력 2개 이상), 폭 불일치, 재귀 칩 정의를 검출한다.
 */
export function compile(top: ChipDef, library: ChipLibrary): Netlist {
  const uf = new UnionFind();
  const gates: RawGate[] = [];
  const drivers: { net: number; path: string }[] = [];
  const warnings: CompileWarning[] = [];
  const rawBlocks: BlockInstance[] = [];
  const nandMemo = new Map<string, number>();
  /** 최상위 회로의 모든 핀 → 원시 넷 (편집기의 신호 색 표시용) */
  const topPinsRaw = new Map<string, number[]>();

  const allocPins = (pins: PinDef[]): PinNets => {
    const m: PinNets = new Map();
    for (const p of pins) m.set(p.name, Array.from({ length: p.width }, () => uf.make()));
    return m;
  };

  const topInputs = allocPins(top.inputs);
  const topOutputs = allocPins(top.outputs);
  for (const [name, bits] of topInputs) for (const n of bits) drivers.push({ net: n, path: `<input ${name}>` });

  const expandInstance = (def: ChipDef, pins: PinNets, path: string, stack: Set<string>): void => {
    const model = modelFor(def);
    if (model) {
      // 빠른 모드: 펼치지 않고 블록 하나로
      const label = path.replace(/\/$/, '') || def.id;
      const outputs = new Map(def.outputs.map((p) => [p.name, pins.get(p.name)!]));
      for (const bits of outputs.values()) for (const n of bits) drivers.push({ net: n, path: label });
      rawBlocks.push({
        path: label,
        chipId: def.id,
        model,
        inputs: new Map(def.inputs.map((p) => [p.name, pins.get(p.name)!])),
        outputs,
        nandCount: nandCountOf(def, library, nandMemo),
      });
      return;
    }
    if (def.kind === 'composite') {
      if (stack.has(def.id)) {
        throw new CompileError('recursive-chip', `칩 '${def.id}'이(가) 자기 자신을 포함합니다 (${path})`);
      }
      stack.add(def.id);
      expandComposite(def, pins, path, stack, false);
      stack.delete(def.id);
      return;
    }
    const b = def.behavior;
    switch (b.type) {
      case 'nand': {
        const out = pins.get('out')![0]!;
        gates.push({ type: GateType.Nand, in0: pins.get('a')![0]!, in1: pins.get('b')![0]!, out });
        drivers.push({ net: out, path: path || def.id });
        break;
      }
      case 'const': {
        const out = pins.get('out')![0]!;
        gates.push({ type: b.value ? GateType.Const1 : GateType.Const0, in0: -1, in1: -1, out });
        drivers.push({ net: out, path: path || def.id });
        break;
      }
      case 'alias':
        for (const m of b.map) uf.union(pins.get(m.from.pin)![m.from.bit]!, pins.get(m.to.pin)![m.to.bit]!);
        break;
    }
  };

  const expandComposite = (
    def: CompositeChipDef,
    selfPins: PinNets,
    path: string,
    stack: Set<string>,
    isTop: boolean,
  ): void => {
    const instPins = new Map<string, PinNets>();
    const instDefs = new Map<string, ChipDef>();
    for (const inst of def.instances) {
      if (inst.uid === SELF || instPins.has(inst.uid)) {
        throw new CompileError('duplicate-uid', `인스턴스 id '${inst.uid}'이(가) 중복되었습니다 (${def.id})`);
      }
      const child = library.get(inst.chip);
      if (!child) throw new CompileError('unknown-chip', `알 수 없는 칩 '${inst.chip}' (${path}${inst.uid})`);
      instDefs.set(inst.uid, child);
      instPins.set(inst.uid, allocPins([...child.inputs, ...child.outputs]));
    }

    const touched = new Set<string>();
    const resolve = (ref: PinRef): number[] => {
      touched.add(`${ref.inst}.${ref.pin}`);
      const pins = ref.inst === SELF ? selfPins : instPins.get(ref.inst);
      if (!pins) throw new CompileError('unknown-instance', `알 수 없는 인스턴스 '${ref.inst}' (${def.id})`);
      const bits = pins.get(ref.pin);
      if (!bits) throw new CompileError('unknown-pin', `알 수 없는 핀 '${ref.inst}.${ref.pin}' (${def.id})`);
      return bits;
    };

    for (const w of def.wires) {
      const a = resolve(w.from);
      const b = resolve(w.to);
      if (a.length !== b.length) {
        throw new CompileError(
          'width-mismatch',
          `비트 폭 불일치: ${w.from.inst}.${w.from.pin}(${a.length}) ↔ ${w.to.inst}.${w.to.pin}(${b.length}) (${def.id})`,
        );
      }
      for (let i = 0; i < a.length; i++) uf.union(a[i]!, b[i]!);
    }

    if (isTop) {
      for (const [uid, pins] of instPins) for (const [name, bits] of pins) topPinsRaw.set(`${uid}.${name}`, bits);
      for (const [name, bits] of selfPins) topPinsRaw.set(`${SELF}.${name}`, bits);
      for (const inst of def.instances) {
        for (const p of instDefs.get(inst.uid)!.inputs) {
          if (!touched.has(`${inst.uid}.${p.name}`)) warnings.push({ kind: 'undriven-input', path: `${inst.uid}.${p.name}` });
        }
      }
      for (const p of def.outputs) {
        if (!touched.has(`${SELF}.${p.name}`)) warnings.push({ kind: 'unconnected-output', path: p.name });
      }
    }

    for (const inst of def.instances) {
      expandInstance(instDefs.get(inst.uid)!, instPins.get(inst.uid)!, `${path}${inst.uid}/`, stack);
    }
  };

  if (top.kind === 'composite') {
    expandComposite(top, new Map([...topInputs, ...topOutputs]), '', new Set([top.id]), true);
  } else {
    expandInstance(top, new Map([...topInputs, ...topOutputs]), '', new Set());
  }

  // ---- 단락 검사: 한 넷에 구동원이 둘 이상이면 오류 ----
  const driverOf = new Map<number, string>();
  for (const d of drivers) {
    const r = uf.find(d.net);
    const prev = driverOf.get(r);
    if (prev !== undefined) {
      throw new CompileError('multiple-drivers', `출력끼리 연결되었습니다(단락): ${prev} ↔ ${d.path}`);
    }
    driverOf.set(r, d.path);
  }

  // ---- 넷 번호를 0..N-1 로 압축 ----
  const dense = new Int32Array(uf.size).fill(-1);
  let netCount = 0;
  const canon = (raw: number): number => {
    if (raw < 0) return -1;
    const r = uf.find(raw);
    if (dense[r] === -1) dense[r] = netCount++;
    return dense[r]!;
  };

  const mapPins = (m: PinNets): Map<string, number[]> => new Map([...m].map(([k, v]) => [k, v.map(canon)]));
  const inputs = mapPins(topInputs);
  const outputs = mapPins(topOutputs);
  const pinNets = mapPins(topPinsRaw);

  const blocks: BlockInstance[] = rawBlocks.map((b) => ({ ...b, inputs: mapPins(b.inputs), outputs: mapPins(b.outputs) }));

  const gateCount = gates.length;
  const gateType = new Uint8Array(gateCount);
  const gateIn0 = new Int32Array(gateCount);
  const gateIn1 = new Int32Array(gateCount);
  const gateOut = new Int32Array(gateCount);
  gates.forEach((g, i) => {
    gateType[i] = g.type;
    gateIn0[i] = canon(g.in0);
    gateIn1[i] = canon(g.in1);
    gateOut[i] = canon(g.out);
  });

  // ---- 팬아웃(CSR) ----
  const counts = new Int32Array(netCount + 1);
  for (let g = 0; g < gateCount; g++) {
    const a = gateIn0[g]!;
    const b = gateIn1[g]!;
    if (a >= 0) counts[a] = counts[a]! + 1;
    if (b >= 0 && b !== a) counts[b] = counts[b]! + 1;
  }
  const fanoutStart = new Int32Array(netCount + 1);
  for (let n = 0; n < netCount; n++) fanoutStart[n + 1] = fanoutStart[n]! + counts[n]!;
  const fanout = new Int32Array(fanoutStart[netCount]!);
  const fill = fanoutStart.slice(0, netCount);
  for (let g = 0; g < gateCount; g++) {
    const a = gateIn0[g]!;
    const b = gateIn1[g]!;
    if (a >= 0) fanout[(fill[a] = fill[a]! + 1) - 1] = g;
    if (b >= 0 && b !== a) fanout[(fill[b] = fill[b]! + 1) - 1] = g;
  }

  // ---- 블록 팬아웃(CSR) ----
  const bCounts = new Int32Array(netCount + 1);
  const blockNets = blocks.map((b) => [...new Set([...b.inputs.values()].flat())]);
  for (const nets of blockNets) for (const n of nets) bCounts[n] = bCounts[n]! + 1;
  const blockFanoutStart = new Int32Array(netCount + 1);
  for (let n = 0; n < netCount; n++) blockFanoutStart[n + 1] = blockFanoutStart[n]! + bCounts[n]!;
  const blockFanout = new Int32Array(blockFanoutStart[netCount]!);
  const bFill = blockFanoutStart.slice(0, netCount);
  blockNets.forEach((nets, bi) => {
    for (const n of nets) blockFanout[(bFill[n] = bFill[n]! + 1) - 1] = bi;
  });

  return {
    blocks,
    blockFanoutStart,
    blockFanout,
    netCount,
    gateCount,
    gateType,
    gateIn0,
    gateIn1,
    gateOut,
    fanoutStart,
    fanout,
    inputs,
    outputs,
    pinNets,
    inputOrder: top.inputs,
    outputOrder: top.outputs,
    warnings,
  };
}

/** 칩을 NAND로 펼쳤을 때의 개수 (실제로 펼치지 않고 정의를 따라가며 센다) */
export function nandCountOf(def: ChipDef, library: ChipLibrary, memo = new Map<string, number>()): number {
  if (def.kind === 'builtin') return def.behavior.type === 'nand' ? 1 : 0;
  const cached = memo.get(def.id);
  if (cached !== undefined) return cached;
  memo.set(def.id, 0); // 재귀 정의 방어
  let n = 0;
  for (const inst of def.instances) {
    const child = library.get(inst.chip);
    if (child) n += nandCountOf(child, library, memo);
  }
  memo.set(def.id, n);
  return n;
}
