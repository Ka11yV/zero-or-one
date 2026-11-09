import { describe, expect, it } from 'vitest';
import { ChipBuilder, compile, measure, runTest, Simulator } from '../../src/sim';
import { COUNTER4, D_LATCH, DFF, lib, REG1, SR_LATCH } from './chips';

describe('SR 래치', () => {
  const l = lib();

  it('S로 세트, R로 리셋, 둘 다 0이면 기억한다', () => {
    const res = runTest(SR_LATCH, l, {
      kind: 'sequence',
      steps: [
        { set: { s: 0, r: 1 }, expect: { q: 0, nq: 1 } },
        { set: { s: 0, r: 0 }, expect: { q: 0, nq: 1 } }, // 유지
        { set: { s: 1, r: 0 }, expect: { q: 1, nq: 0 } },
        { set: { s: 0, r: 0 }, expect: { q: 1, nq: 0 } }, // 유지
        { set: { s: 0, r: 1 }, expect: { q: 0, nq: 1 } },
      ],
    });
    expect(res.rows.filter((r) => !r.ok)).toEqual([]);
    expect(res.pass).toBe(true);
  });

  it('전원 투입 시 발진하지 않고 결정적인 상태로 시작한다', () => {
    const a = new Simulator(compile(SR_LATCH, l));
    const b = new Simulator(compile(SR_LATCH, l));
    expect(a.busy).toBe(false);
    expect(a.getOutput('q')).toBe(b.getOutput('q'));
    expect(a.getOutput('q')).not.toBe(a.getOutput('nq'));
  });

  it('피드백 루프가 있으므로 지연 깊이는 정의되지 않는다', () => {
    expect(measure(compile(SR_LATCH, l))).toEqual({ nandCount: 4, depth: null });
  });
});

describe('D 래치', () => {
  it('e=1이면 투명, e=0이면 유지', () => {
    const res = runTest(D_LATCH, lib(), {
      kind: 'sequence',
      steps: [
        { set: { e: 1, d: 0 }, expect: { q: 0 } },
        { set: { d: 1 }, expect: { q: 1 } },
        { set: { e: 0 }, expect: { q: 1 } },
        { set: { d: 0 }, expect: { q: 1 } }, // e=0 이므로 무시
        { set: { e: 1 }, expect: { q: 0 } },
      ],
    });
    expect(res.pass).toBe(true);
  });
});

describe('D 플립플롭 (상승 엣지)', () => {
  it('클럭 상승 순간의 d만 저장한다', () => {
    const res = runTest(DFF, lib(), {
      kind: 'sequence',
      clockPin: 'clk',
      steps: [
        { set: { d: 0 }, clock: true, expect: { q: 0 } },
        { set: { d: 1 }, expect: { q: 0 } }, // 클럭 전에는 변화 없음
        { clock: true, expect: { q: 1 } },
        { set: { d: 0 }, expect: { q: 1 } },
        { set: { clk: 1 }, expect: { q: 0 } }, // 상승 엣지에 반영
        { set: { d: 1 }, expect: { q: 0 } }, // clk=1 유지 중 d 변화는 무시
        { set: { clk: 0 }, expect: { q: 0 } }, // 하강 엣지는 무시
      ],
    });
    expect(res.rows.filter((r) => !r.ok)).toEqual([]);
  });
});

describe('레지스터 / 카운터', () => {
  it('1비트 레지스터: load=1일 때만 저장', () => {
    const res = runTest(REG1, lib(), {
      kind: 'sequence',
      steps: [
        { set: { load: 1, d: 0 }, clock: true, expect: { q: 0 } },
        { set: { load: 0, d: 1 }, clock: true, expect: { q: 0 } },
        { set: { load: 1 }, clock: true, expect: { q: 1 } },
        { set: { load: 0, d: 0 }, clock: true, expect: { q: 1 } },
        { clock: true, expect: { q: 1 } },
      ],
    });
    expect(res.pass).toBe(true);
  });

  it('4비트 카운터: 리셋 후 클럭마다 +1, 15 다음은 0', () => {
    const steps = [{ set: { reset: 1 }, clock: true, expect: { q: 0 } }, { set: { reset: 0 } }];
    for (let i = 1; i <= 17; i++) steps.push({ clock: true, expect: { q: i & 15 } } as never);
    steps.push({ set: { reset: 1 }, clock: true, expect: { q: 0 } } as never);
    const res = runTest(COUNTER4, lib(), { kind: 'sequence', steps });
    expect(res.rows.filter((r) => !r.ok)).toEqual([]);
  });
});

describe('발진 감지', () => {
  const l = lib();

  it('자기 자신에 연결된 NOT은 안정되지 않는다', () => {
    const b = new ChipBuilder('RING', [], ['out']);
    const n = b.add('NOT');
    const ring = b.fan(`${n}.out`, `${n}.in`, 'out').build();
    const sim = new Simulator(compile(ring, l));
    expect(sim.busy).toBe(true);
    const r = sim.settle(100);
    expect(r).toEqual({ stable: false, steps: 100 });
    // 한 단계마다 값이 뒤집힌다 (단계 실행 시각화용)
    const v = sim.getOutput('out');
    sim.step();
    expect(sim.getOutput('out')).toBe(v ^ 1);
  });

  it('검증기는 발진한 행을 실패로 표시한다', () => {
    const b = new ChipBuilder('RING2', ['x'], ['out']);
    const n = b.add('NOT');
    const ring = b.fan(`${n}.out`, `${n}.in`, 'out').build();
    const res = runTest(ring, l, { kind: 'truth', rows: [{ in: [0], out: [0] }] });
    expect(res.pass).toBe(false);
    expect(res.rows[0]!.oscillated).toBe(true);
  });
});
