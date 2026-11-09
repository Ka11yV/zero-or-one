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
