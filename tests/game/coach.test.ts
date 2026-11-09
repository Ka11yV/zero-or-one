import { describe, expect, it } from 'vitest';
import { coachKeys, diagnose, levelCoachText } from '../../src/game/coach';
import { getLevel, isProgramLevel, LEVELS, levelBuilder, solutionChip, type CircuitLevel } from '../../src/levels';
import { createLibrary, runTest, type CompositeChipDef, type PinDef, type VerifyResult } from '../../src/sim';

const P = (name: string, width = 1): PinDef => ({ name, width });

/** 가짜 결과: rows = [입력, 정답, 내 출력] */
function fake(_ins: PinDef[], _outs: PinDef[], rows: [Record<string, number>, Record<string, number>, Record<string, number>][]): VerifyResult {
  const rs = rows.map(([inputs, expected, actual], index) => ({
    index,
    inputs,
    expected,
    actual,
    oscillated: false,
    ok: Object.keys(expected).every((k) => expected[k] === actual[k]),
  }));
  const failedCount = rs.filter((r) => !r.ok).length;
  return { pass: failedCount === 0, rows: rs, failedCount };
}

/** 4비트 입력 하나 → 4비트 출력: 정답 f, 내 회로 g */
const unary = (f: (x: number) => number, g: (x: number) => number) =>
  fake([P('in', 4)], [P('out', 4)], Array.from({ length: 16 }, (_, x) => [{ in: x }, { out: f(x) & 15 }, { out: g(x) & 15 }]));

describe('diagnose (패턴)', () => {
  const neg = (x: number) => 16 - x;
  it('정답보다 1 작음 / 1 큼 / k 차이', () => {
    expect(diagnose(unary(neg, (x) => 15 - x), { inputs: [P('in', 4)], outputs: [P('out', 4)] })).toEqual({ kind: 'offset', pin: 'out', k: -1 });
    expect(diagnose(unary(neg, (x) => 17 - x), { inputs: [P('in', 4)], outputs: [P('out', 4)] })).toEqual({ kind: 'offset', pin: 'out', k: 1 });
    expect(diagnose(unary(neg, (x) => 13 - x), { inputs: [P('in', 4)], outputs: [P('out', 4)] })).toMatchObject({ kind: 'offset', k: -3 });
  });
  it('정반대 (1비트)', () => {
    const r = fake([P('a'), P('b')], [P('out')], [
      [{ a: 0, b: 0 }, { out: 0 }, { out: 1 }],
      [{ a: 0, b: 1 }, { out: 1 }, { out: 0 }],
      [{ a: 1, b: 0 }, { out: 1 }, { out: 0 }],
      [{ a: 1, b: 1 }, { out: 0 }, { out: 1 }],
    ]);
    expect(diagnose(r, { inputs: [P('a'), P('b')], outputs: [P('out')] })).toEqual({ kind: 'inverted', pin: 'out' });
  });
  it('늘 같은 값 / 입력 그대로', () => {
    expect(diagnose(unary(neg, () => 0), { inputs: [P('in', 4)], outputs: [P('out', 4)] })).toEqual({ kind: 'constant', pin: 'out', value: 0 });
    expect(diagnose(unary(neg, (x) => x), { inputs: [P('in', 4)], outputs: [P('out', 4)] })).toEqual({ kind: 'passthrough', pin: 'out', other: 'in' });
  });
  it('두 출력이 바뀜', () => {
    const ins = [P('a'), P('b')];
    const outs = [P('sum'), P('carry')];
    const rows: [Record<string, number>, Record<string, number>, Record<string, number>][] = [];
    for (const a of [0, 1]) for (const b of [0, 1]) rows.push([{ a, b }, { sum: a ^ b, carry: a & b }, { sum: a & b, carry: a ^ b }]);
    expect(diagnose(fake(ins, outs, rows), { inputs: ins, outputs: outs })).toMatchObject({ kind: 'swapped' });
  });
  it('특정 조건에서만 틀림 (비트 / 값 전체)', () => {
    const ins = [P('a'), P('b')];
    const bit = fake(ins, [P('out')], [
      [{ a: 0, b: 0 }, { out: 0 }, { out: 0 }],
      [{ a: 0, b: 1 }, { out: 1 }, { out: 1 }],
      [{ a: 1, b: 0 }, { out: 1 }, { out: 1 }],
      [{ a: 1, b: 1 }, { out: 0 }, { out: 1 }],
    ]);
    // a=1이면서 b=1인 한 줄만 틀림 → a=1 조건은 맞은 줄(1,0)도 있으므로 b 비트도 확인… 둘 다 단독 조건이 아님
    expect(diagnose(bit, { inputs: ins, outputs: [P('out')] })).toBeNull();
    const ins4 = [P('x', 4)];
    const whole = fake(ins4, [P('y')], Array.from({ length: 16 }, (_, x) => [{ x }, { y: 1 }, { y: x === 0 ? 0 : 1 }]));
    expect(diagnose(whole, { inputs: ins4, outputs: [P('y')] })).toEqual({ kind: 'condition', pin: 'y', cond: { pin: 'x', value: 0 } });
  });
  it('통과·오류면 코칭 없음', () => {
    expect(diagnose(unary((x) => x, (x) => x), { inputs: [P('in', 4)], outputs: [P('out', 4)] })).toBeNull();
    expect(diagnose({ pass: false, rows: [], failedCount: 0, error: { code: 'x', message: '' } }, { inputs: [], outputs: [] })).toBeNull();
  });
  it('맞춤 문구 키: 구체적인 것부터', () => {
    expect(coachKeys({ kind: 'offset', pin: 'diff', k: 1 })).toEqual(['offset+1@diff', 'offset+1', 'offset@diff', 'offset']);
    expect(coachKeys({ kind: 'condition', pin: 'cout', cond: { pin: 'b', value: 0 } })[1]).toBe('condition:b=0');
    expect(levelCoachText({ kind: 'inverted', pin: 'lt' }, { 'inverted@lt': 'X', inverted: 'Y' })).toBe('X');
    expect(levelCoachText({ kind: 'inverted', pin: 'eq' }, { 'inverted@lt': 'X', inverted: 'Y' })).toBe('Y');
  });
});

// ---------- 실제 레벨에서 흔한 실수를 재현 ----------

/** 그 레벨 직전까지 해금한 칩(참조 정답)으로 라이브러리 */
function libBefore(id: string) {
  const chips: CompositeChipDef[] = [];
  for (const l of LEVELS) {
    if (l.id === id) break;
    if (!isProgramLevel(l) && l.unlocks) chips.push(solutionChip(l));
  }
  return createLibrary(chips);
}

function coachFor(id: string, wire: (b: ReturnType<typeof levelBuilder>) => void) {
  const level = getLevel(id) as CircuitLevel;
  const b = levelBuilder(level, 'TRY');
  wire(b);
  const result = runTest(b.build(), libBefore(id), level.test);
  const c = diagnose(result, level);
  return { c, ko: c ? levelCoachText(c, level.text.ko.coach) : undefined, en: c ? levelCoachText(c, level.text.en.coach) : undefined };
}

describe('레벨 맞춤 코칭 (3장)', () => {
  it('3-4: 뒤집기만 하고 +1을 안 함', () => {
    const { c, ko, en } = coachFor('3-4', (b) => {
      const sp = b.add('SPLIT4');
      const mg = b.add('MERGE4');
      b.wire('in', `${sp}.in`);
      for (let i = 0; i < 4; i++) {
        const n = b.add('NOT');
        b.wire(`${sp}.b${i}`, `${n}.in`).wire(`${n}.out`, `${mg}.b${i}`);
      }
      b.wire(`${mg}.out`, 'out');
    });
    expect(c).toMatchObject({ kind: 'offset', k: -1 });
    expect(ko).toContain('뒤집기만');
    expect(en).toContain('only flipped');
  });

  it('3-5: NEG4 + cin=1 → 1을 두 번 더함 (실제로 겪은 실수)', () => {
    const { c, ko } = coachFor('3-5', (b) => {
      const neg = b.add('NEG4');
      const add = b.add('ADD4');
      const one = b.add('CONST1');
      b.wire('b', `${neg}.in`).wire('a', `${add}.a`).wire(`${neg}.out`, `${add}.b`).wire(`${one}.out`, `${add}.cin`).wire(`${add}.sum`, 'diff').wire(`${add}.cout`, 'cout');
    });
    expect(c).toMatchObject({ kind: 'offset', pin: 'diff', k: 1 });
    expect(ko).toContain('NEG4 안에 이미 +1');
  });

  it('3-5: NEG4 + cin=0 → b = 0일 때만 cout이 틀림', () => {
    const { c, ko } = coachFor('3-5', (b) => {
      const neg = b.add('NEG4');
      const add = b.add('ADD4');
      const zero = b.add('CONST0');
      b.wire('b', `${neg}.in`).wire('a', `${add}.a`).wire(`${neg}.out`, `${add}.b`).wire(`${zero}.out`, `${add}.cin`).wire(`${add}.sum`, 'diff').wire(`${add}.cout`, 'cout');
    });
    expect(c).toMatchObject({ kind: 'condition', cond: { pin: 'b', value: 0 } });
    expect(ko).toContain('b = 0일 때만');
  });

  it('3-6: lt에 cout을 그대로 → 정반대', () => {
    const { c, ko } = coachFor('3-6', (b) => {
      const sub = b.add('SUB4');
      const sp = b.add('SPLIT4');
      const o1 = b.add('OR');
      const o2 = b.add('OR');
      const nor = b.add('NOR');
      b.wire('a', `${sub}.a`).wire('b', `${sub}.b`).wire(`${sub}.diff`, `${sp}.in`);
      b.wire(`${sp}.b0`, `${o1}.a`).wire(`${sp}.b1`, `${o1}.b`).wire(`${sp}.b2`, `${o2}.a`).wire(`${sp}.b3`, `${o2}.b`);
      b.wire(`${o1}.out`, `${nor}.a`).wire(`${o2}.out`, `${nor}.b`).wire(`${nor}.out`, 'eq').wire(`${sub}.cout`, 'lt');
    });
    expect(c).toMatchObject({ kind: 'inverted', pin: 'lt' });
    expect(ko).toContain('NOT을 하나');
  });

  it('3장 어려운 레벨에는 "어디에 쓰일까?"와 맞춤 코칭이 두 언어 모두 있다', () => {
    for (const id of ['3-4', '3-5', '3-6', '3-B']) {
      const l = getLevel(id) as CircuitLevel;
      for (const lang of ['ko', 'en'] as const) {
        expect(l.text[lang].why, `${id} ${lang}`).toBeTruthy();
        expect(Object.keys(l.text[lang].coach ?? {}).sort()).toEqual(Object.keys(l.text.ko.coach ?? {}).sort());
      }
    }
  });
});
