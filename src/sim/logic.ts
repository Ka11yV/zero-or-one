// 논리 그래프: NAND 게이트만으로 된 회로를 "같은 식은 한 번만" 저장하며 간단히 줄인다.
// 회로 최적화(가장 빠르게)에 쓴다. 피드백 루프가 없는 조합 회로 전용.
import { GateType, type Netlist, type PinDef } from './types';

export type LogicNode =
  | { k: 'in'; pin: string; bit: number }
  | { k: 'c'; v: 0 | 1 }
  | { k: 'nand'; a: number; b: number };

/**
 * 노드는 만들어진 순서가 곧 위상 순서다(자식이 항상 먼저 만들어진다).
 * nand()는 만들기 전에 다음 규칙으로 줄인다:
 *  - NAND(0, x) = 1,  NAND(1, x) = NOT x
 *  - NOT(NOT x) = x
 *  - NAND(x, NOT x) = 1
 *  - 똑같은 NAND(a, b)는 하나만 (구조적 해싱)
 */
export class LogicGraph {
  readonly nodes: LogicNode[] = [];
  readonly depth: number[] = [];
  private readonly hash = new Map<string, number>();
  private c0 = -1;
  private c1 = -1;

  input(pin: string, bit: number): number {
    const key = `in:${pin}:${bit}`;
    const hit = this.hash.get(key);
    if (hit !== undefined) return hit;
    return this.push({ k: 'in', pin, bit }, key, 0);
  }

  constant(v: 0 | 1): number {
    if (v === 0) return this.c0 >= 0 ? this.c0 : (this.c0 = this.push({ k: 'c', v: 0 }, 'c0', 0));
    return this.c1 >= 0 ? this.c1 : (this.c1 = this.push({ k: 'c', v: 1 }, 'c1', 0));
  }

  /** x가 NOT y(= NAND(y, y))이면 y */
  notOf(x: number): number | undefined {
    const n = this.nodes[x]!;
    return n.k === 'nand' && n.a === n.b ? n.a : undefined;
  }

  constOf(x: number): 0 | 1 | undefined {
    const n = this.nodes[x]!;
    return n.k === 'c' ? n.v : undefined;
  }

  nand(a: number, b: number): number {
    if (a > b) [a, b] = [b, a];
    const ca = this.constOf(a);
    const cb = this.constOf(b);
    if (ca === 0 || cb === 0) return this.constant(1);
    if (ca === 1 && cb === 1) return this.constant(0);
    if (ca === 1) return this.not(b);
    if (cb === 1) return this.not(a);
    if (a === b) {
      const inner = this.notOf(a);
      if (inner !== undefined) return inner;
    } else if (this.notOf(a) === b || this.notOf(b) === a) return this.constant(1);
    const key = `${a},${b}`;
    const hit = this.hash.get(key);
    if (hit !== undefined) return hit;
    return this.push({ k: 'nand', a, b }, key, 1 + Math.max(this.depth[a]!, this.depth[b]!));
  }

  not(x: number): number {
    return this.nand(x, x);
  }
  and(x: number, y: number): number {
    return this.not(this.nand(x, y));
  }
  or(x: number, y: number): number {
    return this.nand(this.not(x), this.not(y));
  }

  /** 여러 개를 균형 잡힌 나무 모양으로 묶는다 (지연이 log 단계로 늘어난다) */
  tree(items: number[], op: (x: number, y: number) => number, empty: 0 | 1): number {
    if (!items.length) return this.constant(empty);
    let level = items;
    while (level.length > 1) {
      const next: number[] = [];
      for (let i = 0; i < level.length; i += 2) next.push(i + 1 < level.length ? op(level[i]!, level[i + 1]!) : level[i]!);
      level = next;
    }
    return level[0]!;
  }

  /** roots에서 거슬러 올라가며 쓰이는 노드 집합 */
  cone(roots: number[]): Set<number> {
    const seen = new Set<number>();
    const stack = [...roots];
    while (stack.length) {
      const x = stack.pop()!;
      if (seen.has(x)) continue;
      seen.add(x);
      const n = this.nodes[x]!;
      if (n.k === 'nand') stack.push(n.a, n.b);
    }
    return seen;
  }

  private push(n: LogicNode, key: string, d: number): number {
    const id = this.nodes.length;
    this.nodes.push(n);
    this.depth.push(d);
    this.hash.set(key, id);
    return id;
  }
}

export class CyclicError extends Error {}

/**
 * 컴파일된 넷리스트(블록 없음)를 논리 그래프로 옮긴다. 출력 핀마다 비트별 노드 id.
 * 피드백 루프가 있으면 CyclicError.
 */
export function logicFromNetlist(nl: Netlist, g = new LogicGraph()): { graph: LogicGraph; outputs: Map<string, number[]> } {
  if (nl.blocks.length) throw new CyclicError('memory blocks');
  const driver = new Int32Array(nl.netCount).fill(-1);
  for (let i = 0; i < nl.gateCount; i++) driver[nl.gateOut[i]!] = i;
  const inputNet = new Map<number, { pin: string; bit: number }>();
  for (const [pin, nets] of nl.inputs) nets.forEach((n, bit) => inputNet.set(n, { pin, bit }));

  const memo = new Map<number, number>();
  const visiting = new Set<number>();
  const nodeOf = (net: number): number => {
    const known = memo.get(net);
    if (known !== undefined) return known;
    const inp = inputNet.get(net);
    let id: number;
    if (inp) id = g.input(inp.pin, inp.bit);
    else {
      const gi = driver[net]!;
      if (gi < 0) id = g.constant(0); // 아무것도 연결되지 않은 선은 0
      else {
        const type = nl.gateType[gi];
        if (type === GateType.Const0) id = g.constant(0);
        else if (type === GateType.Const1) id = g.constant(1);
        else {
          if (visiting.has(net)) throw new CyclicError('feedback loop');
          visiting.add(net);
          const a = nl.gateIn0[gi]!;
          const b = nl.gateIn1[gi]!;
          id = g.nand(a < 0 ? g.constant(0) : nodeOf(a), b < 0 ? g.constant(0) : nodeOf(b));
          visiting.delete(net);
        }
      }
    }
    memo.set(net, id);
    return id;
  };

  const outputs = new Map<string, number[]>();
  for (const [pin, nets] of nl.outputs) outputs.set(pin, nets.map(nodeOf));
  return { graph: g, outputs };
}

// ---------- 진리표에서 다시 만들기 (2단 논리) ----------

/** 입력 비트 순서: 핀 순서대로, 각 핀은 LSB부터 */
export function inputBits(inputs: PinDef[]): { pin: string; bit: number }[] {
  return inputs.flatMap((p) => Array.from({ length: p.width }, (_, bit) => ({ pin: p.name, bit })));
}

/** 각 노드의 값을 모든 입력 조합(2^n 행)에 대해 계산. 결과[node][row] */
export function evaluateAll(g: LogicGraph, bits: { pin: string; bit: number }[]): Uint8Array[] {
  const rows = 1 << bits.length;
  const index = new Map(bits.map((b, i) => [`${b.pin}:${b.bit}`, i]));
  const vals: Uint8Array[] = [];
  for (const n of g.nodes) {
    const v = new Uint8Array(rows);
    if (n.k === 'c') v.fill(n.v);
    else if (n.k === 'in') {
      const i = index.get(`${n.pin}:${n.bit}`);
      if (i !== undefined) for (let r = 0; r < rows; r++) v[r] = (r >> i) & 1;
    } else {
      const a = vals[n.a]!;
      const b = vals[n.b]!;
      for (let r = 0; r < rows; r++) v[r] = a[r]! & b[r]! ? 0 : 1;
    }
    vals.push(v);
  }
  return vals;
}

/** 곱항: mask 비트가 1인 변수만 쓰고, 그 변수의 값은 value 비트 */
interface Cube {
  value: number;
  mask: number;
}

/** 퀸-매클러스키: 주 항(prime implicant)을 구하고 탐욕적으로 덮는다 */
export function minimizeSop(n: number, ones: number[]): Cube[] {
  if (!ones.length) return [];
  const full = (1 << n) - 1;
  if (ones.length === 1 << n) return [{ value: 0, mask: 0 }];
  let current = new Map<string, Cube>();
  for (const m of ones) current.set(`${m}/${full}`, { value: m, mask: full });
  const primes: Cube[] = [];
  while (current.size) {
    const next = new Map<string, Cube>();
    const used = new Set<string>();
    const list = [...current.entries()];
    // 같은 mask끼리만, 한 비트만 다른 쌍을 합친다
    const byMask = new Map<number, [string, Cube][]>();
    for (const e of list) {
      const arr = byMask.get(e[1].mask) ?? [];
      arr.push(e);
      byMask.set(e[1].mask, arr);
    }
    for (const group of byMask.values()) {
      const lookup = new Map(group.map(([k, c]) => [c.value, k]));
      for (const [k, c] of group) {
        for (let i = 0; i < n; i++) {
          const bit = 1 << i;
          if (!(c.mask & bit) || c.value & bit) continue;
          const otherKey = lookup.get(c.value | bit);
          if (otherKey === undefined) continue;
          used.add(k).add(otherKey);
          const merged = { value: c.value & ~bit, mask: c.mask & ~bit };
          next.set(`${merged.value}/${merged.mask}`, merged);
        }
      }
    }
    for (const [k, c] of list) if (!used.has(k)) primes.push(c);
    current = next;
  }

  const covers = (c: Cube, m: number) => (m & c.mask) === c.value;
  const left = new Set(ones);
  const chosen: Cube[] = [];
  // 필수 주 항 먼저
  for (const m of ones) {
    const cands = primes.filter((p) => covers(p, m));
    if (cands.length === 1 && !chosen.includes(cands[0]!)) chosen.push(cands[0]!);
  }
  for (const c of chosen) for (const m of [...left]) if (covers(c, m)) left.delete(m);
  while (left.size) {
    let best: Cube | undefined;
    let bestScore = -1;
    for (const p of primes) {
      let s = 0;
      for (const m of left) if (covers(p, m)) s++;
      // 많이 덮을수록, 변수가 적을수록(=게이트가 적을수록) 좋다
      const score = s * 64 - popcount(p.mask);
      if (s && score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (!best) break;
    chosen.push(best);
    for (const m of [...left]) if (covers(best, m)) left.delete(m);
  }
  return chosen;
}

function popcount(x: number): number {
  let c = 0;
  for (; x; x &= x - 1) c++;
  return c;
}

/** 곱의 합(SOP) 회로를 만든다: OR( AND(리터럴...) ... ) */
export function buildSop(g: LogicGraph, vars: number[], cubes: Cube[]): number {
  const terms = cubes.map((c) => {
    const lits: number[] = [];
    vars.forEach((v, i) => {
      if (c.mask & (1 << i)) lits.push(c.value & (1 << i) ? v : g.not(v));
    });
    return g.tree(lits, (x, y) => g.and(x, y), 1);
  });
  return g.tree(terms, (x, y) => g.or(x, y), 0);
}
