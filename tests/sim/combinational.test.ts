import { describe, expect, it } from 'vitest';
import { compile, createLibrary, generateTruthTable, measure, runTest, Simulator, truthTableFrom } from '../../src/sim';
import { ADD4, AND, FULL_ADDER, HALF_ADDER, lib, MUX, NOT, OR, XOR } from './chips';

const tt = (rows: [number[], number[]][]) => rows.map(([i, o]) => ({ in: i, out: o }));

describe('NAND (내장)', () => {
  it('진리표', () => {
    const l = createLibrary();
    expect(generateTruthTable(l.get('NAND')!, l).map(({ in: i, out }) => ({ in: i, out }))).toEqual(
      tt([
        [[0, 0], [1]],
        [[0, 1], [1]],
        [[1, 0], [1]],
        [[1, 1], [0]],
      ]),
    );
  });
});

describe('기본 게이트 (NAND로부터)', () => {
  const l = lib();
  const cases = [
    { def: NOT, fn: (a: number) => [a ^ 1], nand: 1, depth: 1 },
    { def: AND, fn: (a: number, b: number) => [a & b], nand: 2, depth: 2 },
    { def: OR, fn: (a: number, b: number) => [a | b], nand: 3, depth: 2 },
    { def: XOR, fn: (a: number, b: number) => [a ^ b], nand: 4, depth: 3 },
    { def: MUX, fn: (a: number, b: number, s: number) => [s ? b : a], nand: 4, depth: 3 },
  ] as const;

  for (const c of cases) {
    it(`${c.def.id}: 진리표 통과`, () => {
      const res = runTest(c.def, l, truthTableFrom(c.def.inputs, c.fn as (...x: number[]) => number[]));
      expect(res.error).toBeUndefined();
      expect(res.failedCount).toBe(0);
      expect(res.pass).toBe(true);
    });
    it(`${c.def.id}: NAND ${c.nand}개, 지연 깊이 ${c.depth}`, () => {
      expect(measure(compile(c.def, l))).toEqual({ nandCount: c.nand, depth: c.depth });
    });
  }
});

describe('산술 회로 (칩 계층 + 버스)', () => {
  const l = lib();

  it('반가산기', () => {
    expect(runTest(HALF_ADDER, l, truthTableFrom(HALF_ADDER.inputs, (a, b) => [a ^ b, a & b])).pass).toBe(true);
  });

  it('전가산기', () => {
    const t = truthTableFrom(FULL_ADDER.inputs, (a, b, c) => [(a + b + c) & 1, (a + b + c) >> 1]);
    expect(runTest(FULL_ADDER, l, t).pass).toBe(true);
  });

  it('4비트 가산기: 모든 512개 조합', () => {
    const t = truthTableFrom(ADD4.inputs, (a, b, c) => [(a + b + c) & 15, (a + b + c) >> 4]);
    expect(t.rows).toHaveLength(512);
    const res = runTest(ADD4, l, t);
    expect(res.failedCount).toBe(0);
  });

  it('4비트 가산기: 버스 분리/합치기는 게이트 비용 0', () => {
    // 전가산기 = 반가산기(XOR 4 + AND 2) ×2 + OR 3 = 15, ×4 = 60
    expect(measure(compile(ADD4, l)).nandCount).toBe(60);
  });

  it('리플 캐리: 1111 + 0001 은 올림이 여러 단계에 걸쳐 전파된다', () => {
    const sim = new Simulator(compile(ADD4, l));
    sim.setInput('a', 0b1111);
    sim.settle();
    sim.setInput('b', 1);
    const { stable, steps } = sim.settle();
    expect(stable).toBe(true);
    expect(sim.getOutput('sum')).toBe(0);
    expect(sim.getOutput('cout')).toBe(1);
    expect(steps).toBeGreaterThan(6); // 여러 전가산기를 거친 지연
  });
});

describe('검증기', () => {
  const l = lib();

  it('틀린 회로는 실패한 행을 보고한다 (AND를 OR 진리표로)', () => {
    const res = runTest(AND, l, truthTableFrom(AND.inputs, (a, b) => [a | b]));
    expect(res.pass).toBe(false);
    expect(res.failedCount).toBe(2);
    const bad = res.rows.filter((r) => !r.ok).map((r) => r.inputs);
    expect(bad).toEqual([
      { a: 0, b: 1 },
      { a: 1, b: 0 },
    ]);
    expect(res.rows[1]).toMatchObject({ expected: { out: 1 }, actual: { out: 0 } });
  });

  it('진리표 생성: 첫 입력이 최상위 비트 순서', () => {
    const rows = generateTruthTable(XOR, l);
    expect(rows.map((r) => [r.in, r.out])).toEqual([
      [[0, 0], [0]],
      [[0, 1], [1]],
      [[1, 0], [1]],
      [[1, 1], [0]],
    ]);
    expect(rows.every((r) => r.stable)).toBe(true);
  });

  it('입력 비트가 너무 많으면 진리표 생성 거부', () => {
    const big = { ...ADD4, inputs: [...ADD4.inputs, { name: 'x', width: 4 }] };
    expect(() => generateTruthTable(big, l)).toThrow();
  });
});
