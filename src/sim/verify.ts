import type { ChipLibrary } from './builtins';
import { compile } from './netlist';
import { Simulator } from './simulator';
import { CompileError, type ChipDef, type PinDef } from './types';

// ---------- 테스트 정의 ----------

/** 진리표 한 행: in/out 값은 핀 선언 순서대로(다비트 핀은 정수) */
export interface TruthRow {
  in: number[];
  out: number[];
}

export interface TruthTableTest {
  kind: 'truth';
  rows: TruthRow[];
}

/** 순차 회로 테스트 한 단계: 입력 설정 → (클럭 펄스) → 출력 확인 */
export interface SequenceStep {
  set?: Record<string, number>;
  /** true면 clockPin을 0→1→0으로 한 번 펄스 */
  clock?: boolean;
  /** clock과 함께: 펄스를 이 횟수만큼 반복 (CPU 실행 등) */
  repeat?: number;
  expect?: Record<string, number>;
}

export interface SequenceTest {
  kind: 'sequence';
  clockPin?: string;
  steps: SequenceStep[];
}

export type CircuitTest = TruthTableTest | SequenceTest;

// ---------- 결과 ----------

export interface RowResult {
  index: number;
  inputs: Record<string, number>;
  expected: Record<string, number>;
  actual: Record<string, number>;
  ok: boolean;
  /** 이 행에서 회로가 안정되지 않음(발진) */
  oscillated: boolean;
}

export interface VerifyResult {
  pass: boolean;
  rows: RowResult[];
  failedCount: number;
  /** 컴파일 오류(단락, 폭 불일치 등) */
  error?: { code: string; message: string };
}

/** 회로를 테스트에 대해 실행한다. 실패한 행 정보는 UI가 진리표 강조에 사용한다. */
export function runTest(def: ChipDef, library: ChipLibrary, test: CircuitTest): VerifyResult {
  let sim: Simulator;
  try {
    sim = new Simulator(compile(def, library));
  } catch (e) {
    if (e instanceof CompileError) return { pass: false, rows: [], failedCount: 0, error: { code: e.code, message: e.message } };
    throw e;
  }
  const rows = test.kind === 'truth' ? runTruth(sim, def, test) : runSequence(sim, def, test);
  const failedCount = rows.filter((r) => !r.ok).length;
  return { pass: failedCount === 0, rows, failedCount };
}

function runTruth(sim: Simulator, def: ChipDef, test: TruthTableTest): RowResult[] {
  return test.rows.map((row, index) => {
    const inputs: Record<string, number> = {};
    def.inputs.forEach((p, i) => {
      inputs[p.name] = row.in[i] ?? 0;
      sim.setInput(p.name, inputs[p.name]!);
    });
    const { stable } = sim.settle();
    const expected: Record<string, number> = {};
    const actual: Record<string, number> = {};
    let ok = stable;
    def.outputs.forEach((p, i) => {
      expected[p.name] = row.out[i] ?? 0;
      actual[p.name] = sim.getOutput(p.name);
      if (actual[p.name] !== expected[p.name]) ok = false;
    });
    return { index, inputs, expected, actual, ok, oscillated: !stable };
  });
}

function runSequence(sim: Simulator, def: ChipDef, test: SequenceTest): RowResult[] {
  const clockPin = test.clockPin ?? 'clk';
  const current: Record<string, number> = Object.fromEntries(def.inputs.map((p) => [p.name, 0]));
  return test.steps.map((step, index) => {
    let stable = true;
    const run = () => {
      if (!sim.settle().stable) stable = false;
    };
    if (step.set) {
      for (const [k, v] of Object.entries(step.set)) {
        current[k] = v;
        sim.setInput(k, v);
      }
      run();
    }
    if (step.clock) {
      for (let n = step.repeat ?? 1; n > 0; n--) {
        sim.setInput(clockPin, 1);
        run();
        sim.setInput(clockPin, 0);
        run();
      }
    }
    const expected = step.expect ?? {};
    const actual: Record<string, number> = {};
    let ok = stable;
    for (const [k, v] of Object.entries(expected)) {
      actual[k] = sim.getOutput(k);
      if (actual[k] !== v) ok = false;
    }
    return { index, inputs: { ...current }, expected: { ...expected }, actual, ok, oscillated: !stable };
  });
}

// ---------- 진리표 생성 ----------

/** 입력 비트 총합이 이 값 이하일 때만 전수 진리표를 만든다. */
export const MAX_TRUTH_TABLE_BITS = 10;

export interface GeneratedRow extends TruthRow {
  stable: boolean;
}

/**
 * 현재 회로의 진리표를 전수 생성한다 (UI의 "실시간 진리표"용).
 * 행 순서: 첫 번째 입력 핀이 최상위 → 사람이 읽는 표 순서(00, 01, 10, 11).
 */
export function generateTruthTable(def: ChipDef, library: ChipLibrary): GeneratedRow[] {
  const totalBits = def.inputs.reduce((s, p) => s + p.width, 0);
  if (totalBits > MAX_TRUTH_TABLE_BITS) {
    throw new Error(`입력 비트가 ${totalBits}개라 전수 진리표를 만들 수 없습니다 (최대 ${MAX_TRUTH_TABLE_BITS})`);
  }
  const sim = new Simulator(compile(def, library));
  const rows: GeneratedRow[] = [];
  for (const ins of enumerateInputs(def.inputs)) {
    def.inputs.forEach((p, i) => sim.setInput(p.name, ins[i]!));
    const { stable } = sim.settle();
    rows.push({ in: ins, out: def.outputs.map((p) => sim.getOutput(p.name)), stable });
  }
  return rows;
}

/** 모든 입력 조합을 사람이 읽는 순서로 나열 */
export function enumerateInputs(inputs: PinDef[]): number[][] {
  const totalBits = inputs.reduce((s, p) => s + p.width, 0);
  const result: number[][] = [];
  for (let combo = 0; combo < 1 << totalBits; combo++) {
    let shift = totalBits;
    result.push(
      inputs.map((p) => {
        shift -= p.width;
        return (combo >>> shift) & ((1 << p.width) - 1);
      }),
    );
  }
  return result;
}

/** 함수로부터 진리표 테스트를 만든다 (레벨 정의용). */
export function truthTableFrom(inputs: PinDef[], fn: (...ins: number[]) => number[]): TruthTableTest {
  return { kind: 'truth', rows: enumerateInputs(inputs).map((ins) => ({ in: ins, out: fn(...ins) })) };
}

/** 결정적 의사난수 (테스트가 매번 같은 표본을 쓰도록) */
function lcg(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x;
  };
}

/** 입력 비트가 이 값 이하면 전수 테스트, 넘으면 표본 테스트 */
export const EXHAUSTIVE_MAX_BITS = 9;

/**
 * 입력 조합 표본: 경계값(0, 1, 최댓값, 중간값, 0101…, 1010…)을 고루 섞은 줄 + 의사난수 줄.
 * 8비트 가산기처럼 전수(2^17줄) 테스트가 불가능한 회로용.
 */
export function sampleInputs(inputs: PinDef[], count = 48, seed = 7): number[][] {
  const edges = inputs.map((p) => {
    const max = 2 ** p.width - 1;
    return [...new Set([0, 1, max, max >>> 1, (max >>> 1) + 1, 0x5555 & max, 0xaaaa & max])];
  });
  const rows: number[][] = [];
  const seen = new Set<string>();
  const push = (r: number[]) => {
    const k = r.join(',');
    if (!seen.has(k)) {
      seen.add(k);
      rows.push(r);
    }
  };
  const longest = Math.max(...edges.map((e) => e.length));
  for (let i = 0; i < longest * 3; i++) push(edges.map((e, j) => e[(i + j * 3) % e.length]!));
  const rnd = lcg(seed);
  for (let guard = 0; rows.length < count && guard < count * 20; guard++) {
    push(inputs.map((p) => rnd() % 2 ** p.width));
  }
  return rows.slice(0, Math.max(count, 1));
}

/** 작은 회로는 전수, 큰 회로는 표본으로 진리표 테스트를 만든다 */
export function autoTest(inputs: PinDef[], fn: (...ins: number[]) => number[], count = 48): TruthTableTest {
  const bits = inputs.reduce((s, p) => s + p.width, 0);
  if (bits <= EXHAUSTIVE_MAX_BITS) return truthTableFrom(inputs, fn);
  return { kind: 'truth', rows: sampleInputs(inputs, count).map((ins) => ({ in: ins, out: fn(...ins) })) };
}
