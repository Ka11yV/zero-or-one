// 플레이어가 만든 CPU 칩(회로)으로 프로그램을 실행한다.
// CPU 핀: 입력 run, pa[8], pd[8], pw, in[8], reset, clk / 출력 out[8], ow, halt, pc[8], a[8]
import { compile, Simulator, type ChipDef, type ChipLibrary, type PinDef, type SequenceStep } from '../sim';

export const CPU_INPUTS: PinDef[] = [
  { name: 'run', width: 1 },
  { name: 'pa', width: 8 },
  { name: 'pd', width: 8 },
  { name: 'pw', width: 1 },
  { name: 'in', width: 8 },
  { name: 'reset', width: 1 },
  { name: 'clk', width: 1 },
];
export const CPU_OUTPUTS: PinDef[] = [
  { name: 'out', width: 8 },
  { name: 'ow', width: 1 },
  { name: 'halt', width: 1 },
  { name: 'pc', width: 8 },
  { name: 'a', width: 8 },
];

/** 프로그램 적재 단계: run = 0인 동안 pa/pd/pw로 RAM에 직접 쓴다 */
export function loadSteps(image: Uint8Array, addrs: Iterable<number>): SequenceStep[] {
  const steps: SequenceStep[] = [{ set: { run: 0, pw: 1, reset: 0 } }];
  for (const a of [...addrs].sort((x, y) => x - y)) steps.push({ set: { pa: a, pd: image[a]! }, clock: true });
  return steps;
}

/** 실행 시작: 적재를 끝내고 리셋 펄스 (PC = 0, 단계 = T0, halt = 0).
 *  리셋하는 동안에는 run = 0으로 두어 RAM에 아무것도 쓰이지 않게 한다. */
export function startSteps(input = 0): SequenceStep[] {
  return [
    { set: { pw: 0, in: input, reset: 1 }, clock: true },
    { set: { reset: 0, run: 1 } },
  ];
}

/** CPU 시뮬레이터를 감싼 실행기 (프로그램 화면과 테스트가 함께 쓴다) */
export class CpuRunner {
  readonly sim: Simulator;
  cycles = 0;
  outs: number[] = [];

  constructor(cpu: ChipDef, lib: ChipLibrary) {
    this.sim = new Simulator(compile(cpu, lib));
  }

  private pulse(): void {
    const s = this.sim;
    s.setInput('clk', 1);
    s.settle();
    s.setInput('clk', 0);
    s.settle();
  }

  /** 256바이트 전체를 적재하고 리셋한다 */
  load(image: Uint8Array, input = 0): void {
    const s = this.sim;
    s.setInput('run', 0);
    s.setInput('reset', 0);
    s.setInput('pw', 1);
    for (let a = 0; a < 256; a++) {
      s.setInput('pa', a);
      s.setInput('pd', image[a]!);
      s.settle();
      this.pulse();
    }
    s.setInput('pw', 0);
    s.setInput('in', input);
    s.setInput('reset', 1);
    s.settle();
    this.pulse();
    s.setInput('reset', 0);
    s.setInput('run', 1);
    s.settle();
    this.cycles = 0;
    this.outs = [];
    // 적재하면서 쓴 칸은 "마지막으로 쓴 칸"으로 치지 않는다
    for (const st of this.sim.blockStates) if (st && 'lastWrite' in st) st.lastWrite = -1;
  }

  setInputValue(v: number): void {
    this.sim.setInput('in', v & 255);
    this.sim.settle();
  }

  get halted(): boolean {
    return this.sim.getOutput('halt') === 1;
  }

  /** 한 클럭. OUT 명령이 출력 레지스터에 쓰는 순간(ow = 1)을 기록한다 */
  step(): void {
    const write = this.sim.getOutput('ow') === 1;
    this.pulse();
    this.cycles++;
    if (write) this.outs.push(this.sim.getOutput('out'));
  }

  /** 멈출 때까지(또는 최대 클럭) 실행 */
  runUntilHalt(maxCycles: number): void {
    while (!this.halted && this.cycles < maxCycles) this.step();
  }

  reg(name: 'out' | 'pc' | 'a'): number {
    return this.sim.getOutput(name);
  }
}

export interface ProgramRun {
  outs: number[];
  halted: boolean;
  cycles: number;
}

export function runProgram(cpu: ChipDef, lib: ChipLibrary, image: Uint8Array, input: number, maxCycles: number): ProgramRun {
  const r = new CpuRunner(cpu, lib);
  r.load(image, input);
  r.runUntilHalt(maxCycles);
  return { outs: r.outs, halted: r.halted, cycles: r.cycles };
}
