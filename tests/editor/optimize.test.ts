import { describe, expect, it } from 'vitest';
import { addInstance, addIO, connect, emptyDoc, toChipDef, type EditorDoc } from '../../src/editor/doc';
import { cleanupDoc, metricsOf, optimizeFastest, optimizeKeepChips, sameBehavior } from '../../src/editor/optimize';
import { isProgramLevel, LEVELS, solutionChip, type CircuitLevel } from '../../src/levels';
import { compile, createLibrary, generateTruthTable, SELF, type ChipDef } from '../../src/sim';
import { LogicGraph, minimizeSop } from '../../src/sim/logic';

const chips: ChipDef[] = LEVELS.filter((l): l is CircuitLevel => !isProgramLevel(l) && !!l.unlocks).map((l) => ({ ...solutionChip(l), verified: true }));
const lib = createLibrary(chips);
const pin = (inst: string, p: string) => ({ inst, pin: p });
const ok = (r: ReturnType<typeof connect>) => expect(r.ok, JSON.stringify(r)).toBe(true);

/** 플레이어가 짤 법한 XOR: (a OR b) AND NOT(a AND b), 거기에 쓸모없는 칩과 중복 칩을 섞는다 */
function clumsyXor(): EditorDoc {
  const d = emptyDoc();
  addIO(d, 'input', 0, 0);
  addIO(d, 'input', 0, 100);
  addIO(d, 'output', 600, 50);
  const or = addInstance(d, 'OR', 100, 0).uid;
  const and1 = addInstance(d, 'AND', 100, 100).uid;
  const and1dup = addInstance(d, 'AND', 100, 200).uid; // 같은 입력을 받는 중복
  const not = addInstance(d, 'NOT', 200, 100).uid;
  const and2 = addInstance(d, 'AND', 300, 50).uid;
  const dead = addInstance(d, 'XNOR', 300, 300).uid; // 출력에 이어지지 않음
  ok(connect(d, lib, pin(SELF, 'a'), pin(or, 'a')));
  ok(connect(d, lib, pin(SELF, 'b'), pin(or, 'b')));
  ok(connect(d, lib, pin(SELF, 'a'), pin(and1, 'a')));
  ok(connect(d, lib, pin(SELF, 'b'), pin(and1, 'b')));
  ok(connect(d, lib, pin(SELF, 'a'), pin(and1dup, 'a')));
  ok(connect(d, lib, pin(SELF, 'b'), pin(and1dup, 'b')));
  ok(connect(d, lib, pin(and1dup, 'out'), pin(not, 'in')));
  ok(connect(d, lib, pin(or, 'out'), pin(and2, 'a')));
  ok(connect(d, lib, pin(not, 'out'), pin(and2, 'b')));
  ok(connect(d, lib, pin(and1, 'out'), pin(dead, 'a')));
  ok(connect(d, lib, pin(and2, 'out'), pin(SELF, 'out')));
  return d;
}

describe('회로 최적화: 정리(칩 유지)', () => {
  it('출력에 안 쓰이는 칩과 중복 칩을 지우고, 동작은 그대로다', () => {
    const d = clumsyXor();
    const r = optimizeKeepChips(d, lib);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.instances.map((i) => i.chip).sort()).toEqual(['AND', 'AND', 'NOT', 'OR']);
    expect(r.after.nandCount).toBeLessThan(r.before.nandCount);
    expect(generateTruthTable(toChipDef(r.doc), lib)).toEqual(generateTruthTable(toChipDef(d), lib));
    // 원본은 그대로
    expect(d.instances).toHaveLength(6);
  });

  it('NOT 두 번은 없앤다 (입력 → 출력 직결도 동작한다)', () => {
    const d = emptyDoc();
    addIO(d, 'input', 0, 0);
    addIO(d, 'output', 300, 0);
    const n1 = addInstance(d, 'NOT', 100, 0).uid;
    const n2 = addInstance(d, 'NAND', 200, 0).uid;
    ok(connect(d, lib, pin(SELF, 'a'), pin(n1, 'in')));
    ok(connect(d, lib, pin(n1, 'out'), pin(n2, 'a')));
    ok(connect(d, lib, pin(n1, 'out'), pin(n2, 'b')));
    ok(connect(d, lib, pin(n2, 'out'), pin(SELF, 'out')));
    const c = cleanupDoc(d, lib);
    expect(c.instances).toHaveLength(0);
    expect(() => compile(toChipDef(c), lib)).not.toThrow();
    expect(sameBehavior(d, c, lib)).toBe(true);
  });
});

describe('회로 최적화: 최고 속도', () => {
  it('XOR: 지연이 줄거나 같고, NAND 수도 줄며, 동작은 그대로다', () => {
    const d = clumsyXor();
    const r = optimizeFastest(d, lib);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.after.depth!).toBeLessThanOrEqual(r.before.depth!);
    expect(r.after.nandCount).toBeLessThan(r.before.nandCount);
    expect(r.doc.instances.every((i) => i.chip === 'NAND' || i.chip.startsWith('SPLIT') || i.chip.startsWith('MERGE') || i.chip.startsWith('CONST'))).toBe(true);
  });

  it('다비트 회로(4비트 가산기 칩 하나)도 펼쳐서 더 빠르게 만든다', () => {
    const d = emptyDoc();
    const a = addIO(d, 'input', 0, 0, 4);
    const b = addIO(d, 'input', 0, 100, 4);
    const s = addIO(d, 'output', 400, 0, 4);
    const add = addInstance(d, 'ADD4', 100, 0).uid;
    const zero = addInstance(d, 'CONST0', 100, 200).uid;
    ok(connect(d, lib, pin(SELF, a.name), pin(add, 'a')));
    ok(connect(d, lib, pin(SELF, b.name), pin(add, 'b')));
    ok(connect(d, lib, pin(zero, 'out'), pin(add, 'cin')));
    ok(connect(d, lib, pin(add, 'sum'), pin(SELF, s.name)));
    const before = metricsOf(d, lib)!;
    const r = optimizeFastest(d, lib);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.after.depth!).toBeLessThan(before.depth!);
    expect(sameBehavior(d, r.doc, lib)).toBe(true);
  });

  it('3비트·5비트처럼 팔레트에 없는 폭도 버스 분리기로 나눈다', () => {
    const d = emptyDoc();
    const a = addIO(d, 'input', 0, 0, 5);
    const o = addIO(d, 'output', 300, 0);
    const sp = addInstance(d, 'SPLIT5', 100, 0).uid;
    const and = addInstance(d, 'AND', 200, 0).uid;
    ok(connect(d, lib, pin(SELF, a.name), pin(sp, 'in')));
    ok(connect(d, lib, pin(sp, 'b0'), pin(and, 'a')));
    ok(connect(d, lib, pin(sp, 'b4'), pin(and, 'b')));
    ok(connect(d, lib, pin(and, 'out'), pin(SELF, o.name)));
    const r = optimizeFastest(d, lib);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.instances.some((i) => i.chip === 'SPLIT5')).toBe(true);
    expect(r.after.nandCount).toBe(2);
  });

  it('피드백 루프(래치)나 메모리 칩이 있으면 하지 않는다', () => {
    const d = emptyDoc();
    addIO(d, 'input', 0, 0);
    addIO(d, 'input', 0, 100);
    addIO(d, 'output', 300, 0);
    const [n1, n2] = [addInstance(d, 'NAND', 100, 0).uid, addInstance(d, 'NAND', 100, 100).uid];
    ok(connect(d, lib, pin(SELF, 'a'), pin(n1, 'a')));
    ok(connect(d, lib, pin(SELF, 'b'), pin(n2, 'b')));
    ok(connect(d, lib, pin(n2, 'out'), pin(n1, 'b')));
    ok(connect(d, lib, pin(n1, 'out'), pin(n2, 'a')));
    ok(connect(d, lib, pin(n1, 'out'), pin(SELF, 'out')));
    expect(optimizeFastest(d, lib)).toMatchObject({ ok: false, reason: 'loop' });
    // 칩 유지 정리는 순차 회로에도 쓸 수 있다
    expect(optimizeKeepChips(d, lib).ok).toBe(true);

    const m = emptyDoc();
    const addr = addIO(m, 'input', 0, 0, 2);
    const q = addIO(m, 'output', 300, 0, 8);
    const ram = addInstance(m, 'RAM4', 100, 0).uid;
    ok(connect(m, lib, pin(SELF, addr.name), pin(ram, 'addr')));
    ok(connect(m, lib, pin(ram, 'q'), pin(SELF, q.name)));
    expect(optimizeFastest(m, lib)).toMatchObject({ ok: false, reason: 'memory' });
  });

  it('빈 회로', () => {
    expect(optimizeFastest(emptyDoc(), lib)).toMatchObject({ ok: false, reason: 'empty' });
  });
});

describe('논리 그래프', () => {
  it('NOT(NOT x) = x, NAND(x, NOT x) = 1, 같은 NAND는 하나', () => {
    const g = new LogicGraph();
    const x = g.input('a', 0);
    const y = g.input('b', 0);
    expect(g.not(g.not(x))).toBe(x);
    expect(g.nand(x, g.not(x))).toBe(g.constant(1));
    expect(g.nand(x, y)).toBe(g.nand(y, x));
  });

  it('퀸-매클러스키: 다수결 함수는 항 3개', () => {
    const ones = [0, 1, 2, 3, 4, 5, 6, 7].filter((m) => ((m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1)) >= 2);
    expect(minimizeSop(3, ones)).toHaveLength(3);
  });
});
