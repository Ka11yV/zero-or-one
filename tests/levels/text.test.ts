// 레벨 설명 품질: "어디에 쓰일까?"·코칭이 두 언어로 빠짐없이, 코칭 키가 실제 핀을 가리키는지
import { describe, expect, it } from 'vitest';
import { isProgramLevel, LEVELS } from '../../src/levels';
import { signed4 } from '../../src/ui/devices';

const KINDS = ['inverted', 'offset', 'constant', 'passthrough', 'swapped', 'condition'];

describe('레벨 설명', () => {
  it('모든 레벨에 두 언어의 "어디에 쓰일까?" 가 있다', () => {
    for (const l of LEVELS) for (const lang of ['ko', 'en'] as const) expect(l.text[lang].why, `${l.id} ${lang}`).toBeTruthy();
  });

  it('코칭: 두 언어의 키가 같고, 키 형식과 핀 이름이 맞고, 자리표시자가 없다', () => {
    for (const l of LEVELS) {
      const ko = l.text.ko.coach ?? {};
      const en = l.text.en.coach ?? {};
      expect(Object.keys(en).sort(), l.id).toEqual(Object.keys(ko).sort());
      if (isProgramLevel(l)) continue;
      const ins = new Set(l.inputs.map((p) => p.name));
      const outs = new Set(l.outputs.map((p) => p.name));
      for (const key of Object.keys(ko)) {
        const [base, at] = key.split('@') as [string, string | undefined];
        const kind = /^[a-z]+/.exec(base)![0];
        expect(KINDS, `${l.id} ${key}`).toContain(kind);
        if (at) expect(outs.has(at), `${l.id} ${key}: 출력 핀 ${at}`).toBe(true);
        const cond = /^condition:(\w+)(?:\.\d+)?=\d+$/.exec(base);
        if (cond) expect(ins.has(cond[1]!), `${l.id} ${key}: 입력 핀 ${cond[1]}`).toBe(true);
        if (kind === 'offset') expect(base, `${l.id} ${key}`).toMatch(/^offset[+-]\d+$/);
        for (const msg of [ko[key]!, en[key]!]) expect(msg, `${l.id} ${key}`).not.toMatch(/\{\w+\}/);
      }
    }
  });

  it('다이얼·부호 표시 핀은 실제 4비트 핀', () => {
    for (const l of LEVELS) {
      if (isProgramLevel(l)) continue;
      const pins = new Map([...l.inputs, ...l.outputs].map((p) => [p.name, p.width]));
      for (const name of [...(l.devices?.wheel ?? []), ...(l.signedPins ?? [])]) expect(pins.get(name), `${l.id} ${name}`).toBe(4);
    }
  });

  it('부호 있는 4비트 읽기', () => {
    expect([0, 7, 8, 13, 15].map(signed4)).toEqual([0, 7, -8, -3, -1]);
  });
});

describe('세로셈', () => {
  it('자리별 올림 계산', async () => {
    const { columnAddition } = await import('../../src/ui/devices');
    // 3 + 1 = 4: 1의 자리 1+1=2 → 0 쓰고 올림, 2의 자리 1+0+1=2 → 0 쓰고 올림, 4의 자리 0+0+1=1
    expect(columnAddition(3, 1, 0, 4)).toEqual({ carries: [0, 1, 1, 0, 0], aBits: [1, 1, 0, 0], bBits: [1, 0, 0, 0], sumBits: [0, 0, 1, 0], cout: 0 });
    expect(columnAddition(15, 1, 0, 4).cout).toBe(1);
    expect(columnAddition(1, 1, 1, 1)).toMatchObject({ sumBits: [1], cout: 1 });
    const r = columnAddition(200, 100, 1, 8);
    expect(r.sumBits.reduce((v, b, i) => v | (b << i), 0) + r.cout * 256).toBe(301);
  });

  it('세로셈 핀은 실제 핀이고 폭이 맞다', () => {
    for (const l of LEVELS) {
      if (isProgramLevel(l) || !l.devices?.columnAdd) continue;
      const c = l.devices.columnAdd;
      const w = new Map([...l.inputs, ...l.outputs].map((p) => [p.name, p.width]));
      expect(w.get(c.a), l.id).toBe(w.get(c.b));
      expect(w.get(c.sum), l.id).toBe(w.get(c.a));
      expect(w.get(c.cout), l.id).toBe(1);
      if (c.cin) expect(w.get(c.cin), l.id).toBe(1);
    }
  });
});

describe('NAND 트랜지스터', () => {
  it('P는 0일 때, N은 1일 때 연결 → 둘 다 1일 때만 out = 0', async () => {
    const { nandSwitches } = await import('../../src/ui/nandModal');
    expect(nandSwitches(1, 1)).toEqual({ pa: false, pb: false, na: true, nb: true, out: 0 });
    expect(nandSwitches(0, 1)).toMatchObject({ pa: true, nb: true, na: false, out: 1 });
    expect(nandSwitches(0, 0).out).toBe(1);
  });
});

describe('전가산기 단계', () => {
  it('(a + b) + cin 두 단계 + OR = 실제 덧셈, 두 올림이 동시에 1인 경우 없음', async () => {
    const { fullAdderSteps } = await import('../../src/ui/devices');
    for (const a of [0, 1]) for (const b of [0, 1]) for (const c of [0, 1]) {
      const r = fullAdderSteps(a, b, c);
      expect(r.cout * 2 + r.sum).toBe(a + b + c);
      expect(r.c1 & r.c2).toBe(0);
    }
  });
});
