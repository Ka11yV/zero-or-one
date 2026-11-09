import { describe, expect, it } from 'vitest';
import { isProgramLevel, LEVELS, solutionChip, type CircuitLevel } from '../../src/levels';
import { ChipBuilder, compile, createLibrary, measure, runTest, Simulator, type ChipDef, type SequenceStep } from '../../src/sim';
import { modelFor } from '../../src/sim/functional';

/** 레벨 순서대로 참조 정답 칩을 만든다. verified = true면 빠른 모드 대상이 된다 */
function referenceChips(verified: boolean): ChipDef[] {
  return LEVELS.filter((l): l is CircuitLevel => !isProgramLevel(l) && !!l.unlocks).map((l) => ({ ...solutionChip(l), verified }));
}

/** RAM 하나만 들어 있는 시험용 회로 */
function wrapper(chip: string, addrBits: number) {
  const b = new ChipBuilder('WRAP', [`addr:${addrBits}`, 'd:8', 'write', 'clk'], ['q:8']);
  const r = b.add(chip);
  for (const p of ['addr', 'd', 'write', 'clk']) b.wire(p, `${r}.${p}`);
  b.wire(`${r}.q`, 'q');
  return b.build();
}

/** 결정적 무작위 쓰기/읽기 순서. 읽기 전에 모든 주소를 먼저 써서 전원 투입 시 값의 차이를 없앤다 */
function randomOps(addrBits: number, count: number, seed = 3): SequenceStep[] {
  let x = seed;
  const rnd = () => (x = (Math.imul(x, 1103515245) + 12345) >>> 0) >>> 8;
  const size = 1 << addrBits;
  const steps: SequenceStep[] = [];
  for (let a = 0; a < size; a++) steps.push({ set: { write: 1, addr: a, d: (a * 37 + 5) & 255 }, clock: true });
  for (let i = 0; i < count; i++) {
    const write = rnd() % 3 === 0 ? 1 : 0;
    steps.push({ set: { write, addr: rnd() % size, d: rnd() % 256 }, clock: rnd() % 2 === 0 });
  }
  return steps;
}

function trace(def: ChipDef, chips: ChipDef[], steps: SequenceStep[]): number[] {
  const sim = new Simulator(compile(def, createLibrary(chips)));
  const out: number[] = [];
  for (const s of steps) {
    for (const [k, v] of Object.entries(s.set ?? {})) sim.setInput(k, v);
    sim.settle();
    if (s.clock) {
      sim.setInput('clk', 1);
      sim.settle();
      sim.setInput('clk', 0);
      sim.settle();
    }
    out.push(sim.getOutput('q'));
  }
  return out;
}

describe('기능 모델(빠른 모드)', () => {
  const gate = referenceChips(false);
  const fast = referenceChips(true);

  for (const [chip, bits, ops] of [
    ['RAM4', 2, 200],
    ['RAM16', 4, 300],
    ['RAM256', 8, 300],
  ] as const) {
    it(`${chip}: 게이트 수준과 빠른 모드의 출력이 모든 단계에서 같다`, () => {
      const steps = randomOps(bits, ops);
      const def = wrapper(chip, bits);
      expect(trace(def, fast, steps)).toEqual(trace(def, gate, steps));
    });

    it(`${chip}: 빠른 모드는 블록 1개로 컴파일되고 NAND 개수는 같다`, () => {
      const def = wrapper(chip, bits);
      const nlFast = compile(def, createLibrary(fast));
      const nlGate = compile(def, createLibrary(gate));
      expect(nlFast.blocks).toHaveLength(1);
      expect(nlFast.gateCount).toBe(0);
      expect(measure(nlFast).nandCount).toBe(measure(nlGate).nandCount);
    });
  }

  it('검증되지 않은(verified 없는) 칩은 대체하지 않는다', () => {
    expect(compile(wrapper('RAM4', 2), createLibrary(gate)).blocks).toHaveLength(0);
  });

  it('핀 구성이 다르면 같은 이름이라도 대체하지 않는다', () => {
    const ram4 = fast.find((c) => c.id === 'RAM4')!;
    expect(modelFor(ram4)).toBeDefined();
    expect(modelFor({ ...ram4, outputs: [{ name: 'out', width: 8 }] })).toBeUndefined();
    expect(modelFor({ ...ram4, inputs: [{ name: 'addr', width: 3 }, ...ram4.inputs.slice(1)] })).toBeUndefined();
  });

  it('레벨 6-2, 6-3, 6-B 참조 정답은 빠른 모드로도 테스트를 통과한다', () => {
    for (const id of ['6-2', '6-3', '6-B']) {
      const level = LEVELS.find((l) => l.id === id) as CircuitLevel;
      const res = runTest(solutionChip(level, `S_${id}`), createLibrary(fast), level.test);
      expect(res.rows.filter((r) => !r.ok), id).toEqual([]);
    }
  });

  it('메모리 내용을 주소 순서대로 읽을 수 있다', () => {
    const sim = new Simulator(compile(wrapper('RAM16', 4), createLibrary(fast)));
    for (const [a, v] of [[3, 33], [15, 150]] as const) {
      sim.setInput('write', 1);
      sim.setInput('addr', a);
      sim.setInput('d', v);
      sim.settle();
      sim.setInput('clk', 1);
      sim.settle();
      sim.setInput('clk', 0);
      sim.settle();
    }
    const st = sim.blockState(sim.netlist.blocks[0]!.path)!;
    expect(st.mem![3]).toBe(33);
    expect(st.mem![15]).toBe(150);
    expect(st.lastWrite).toBe(15);
  });
});
