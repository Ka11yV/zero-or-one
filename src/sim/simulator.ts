import type { ModelState } from './functional';
import { GateType, type Netlist } from './types';

export interface SettleResult {
  /** true면 안정 상태 도달, false면 발진(oscillation) 의심 */
  stable: boolean;
  /** 사용한 게이트 지연 단계 수 */
  steps: number;
}

export const DEFAULT_MAX_STEPS = 10_000;

/**
 * 이벤트 기반, 단위 게이트 지연 시뮬레이터.
 *
 * - 한 step() = 게이트 지연 1단위. 큐에 있는 게이트를 "동시에" 평가한 뒤 결과를 한꺼번에 반영한다.
 *   그래서 단계 실행 시 신호가 게이트 하나씩 퍼져 나가는 모습을 그대로 보여줄 수 있다.
 * - 값이 바뀐 넷의 팬아웃 게이트만 다음 단계에 재평가한다.
 * - 피드백 루프(래치)는 자연스럽게 동작하고, 끝나지 않는 루프는 settle()이 발진으로 보고한다.
 */
export class Simulator {
  readonly netlist: Netlist;
  readonly values: Uint8Array;

  private queue: Int32Array;
  private queueLen = 0;
  private next: Int32Array;
  private queued: Uint8Array;
  private pendingOut: Uint8Array;
  /** 기능 모델 블록 상태 / 대기열 */
  readonly blockStates: ModelState[];
  private blockQueued: Uint8Array;
  private blockQueue: number[] = [];
  /** 지금까지 진행한 총 게이트 지연 단계 수 */
  time = 0;

  constructor(netlist: Netlist) {
    this.netlist = netlist;
    this.values = new Uint8Array(netlist.netCount);
    this.queue = new Int32Array(netlist.gateCount);
    this.next = new Int32Array(netlist.gateCount);
    this.queued = new Uint8Array(netlist.gateCount);
    this.pendingOut = new Uint8Array(netlist.gateCount);
    this.blockStates = netlist.blocks.map((b) => b.model.createState());
    this.blockQueued = new Uint8Array(netlist.blocks.length);
    this.reset();
  }

  /**
   * 모든 넷을 0으로 두고 전원을 켠 상태로 초기화한다.
   * 초기 안정화는 게이트를 "순서대로" 평가(가우스-자이델)해 대칭을 깨므로,
   * 교차 결합 래치도 발진하지 않고 결정적인 초기값을 갖는다.
   */
  reset(): void {
    const nl = this.netlist;
    this.values.fill(0);
    this.queued.fill(0);
    this.blockQueued.fill(0);
    this.blockQueue = [];
    this.netlist.blocks.forEach((b, i) => (this.blockStates[i] = b.model.createState()));
    this.queueLen = 0;
    this.time = 0;

    const maxPasses = Math.max(64, nl.gateCount);
    for (let pass = 0; pass < maxPasses; pass++) {
      let changed = false;
      for (let g = 0; g < nl.gateCount; g++) {
        const v = this.evaluate(g);
        const out = nl.gateOut[g]!;
        if (this.values[out] !== v) {
          this.values[out] = v;
          changed = true;
        }
      }
      for (let b = 0; b < nl.blocks.length; b++) {
        for (const [net, v] of this.evaluateBlock(b)) {
          if (this.values[net] !== v) {
            this.values[net] = v;
            changed = true;
          }
        }
      }
      if (!changed) return;
    }
    // 순차 평가로도 안정되지 않음 = 진짜 발진 회로. 모든 게이트를 큐에 넣어 이후 step()에서 관찰 가능하게 한다.
    for (let g = 0; g < nl.gateCount; g++) this.enqueue(g);
    for (let b = 0; b < nl.blocks.length; b++) this.enqueueBlock(b);
  }

  private evaluate(g: number): number {
    const nl = this.netlist;
    switch (nl.gateType[g]) {
      case GateType.Nand:
        return this.values[nl.gateIn0[g]!]! & this.values[nl.gateIn1[g]!]! ? 0 : 1;
      case GateType.Const1:
        return 1;
      default:
        return 0;
    }
  }

  /** 블록 하나를 평가해 [넷, 값] 목록을 돌려준다 (값은 아직 반영하지 않음) */
  private evaluateBlock(b: number): [number, number][] {
    const blk = this.netlist.blocks[b]!;
    const inputs: Record<string, number> = {};
    for (const [name, bits] of blk.inputs) inputs[name] = this.readBits(bits);
    const out = blk.model.evaluate(this.blockStates[b]!, inputs);
    const changes: [number, number][] = [];
    for (const [name, bits] of blk.outputs) {
      const v = out[name] ?? 0;
      for (let i = 0; i < bits.length; i++) changes.push([bits[i]!, (v >>> i) & 1]);
    }
    return changes;
  }

  /** 블록 상태를 밖에서 바꾼 뒤(메모리 적재 등) 다시 평가하도록 예약한다 */
  refreshBlock(b: number): void {
    if (b >= 0 && b < this.netlist.blocks.length) this.enqueueBlock(b);
  }

  private enqueueBlock(b: number): void {
    if (!this.blockQueued[b]) {
      this.blockQueued[b] = 1;
      this.blockQueue.push(b);
    }
  }

  private enqueue(g: number): void {
    if (!this.queued[g]) {
      this.queued[g] = 1;
      this.queue[this.queueLen++] = g;
    }
  }

  private scheduleFanout(net: number): void {
    const nl = this.netlist;
    for (let i = nl.fanoutStart[net]!, end = nl.fanoutStart[net + 1]!; i < end; i++) this.enqueue(nl.fanout[i]!);
    for (let i = nl.blockFanoutStart[net]!, end = nl.blockFanoutStart[net + 1]!; i < end; i++) this.enqueueBlock(nl.blockFanout[i]!);
  }

  /** 대기 중인 게이트 평가가 있는지 (= 아직 신호가 퍼지는 중) */
  get busy(): boolean {
    return this.queueLen > 0 || this.blockQueue.length > 0;
  }

  /** 입력 핀 값을 설정한다. value는 정수(LSB = 비트 0). */
  setInput(name: string, value: number): void {
    const bits = this.netlist.inputs.get(name);
    if (!bits) throw new Error(`알 수 없는 입력 핀 '${name}'`);
    for (let i = 0; i < bits.length; i++) {
      const net = bits[i]!;
      const v = (value >>> i) & 1;
      if (this.values[net] !== v) {
        this.values[net] = v;
        this.scheduleFanout(net);
      }
    }
  }

  /** 게이트 지연 1단계 진행. 값이 바뀐 넷 수를 반환한다. */
  step(): number {
    const nl = this.netlist;
    const n = this.queueLen;
    if (n === 0 && this.blockQueue.length === 0) return 0;

    // 1) 동시에 평가 (값은 아직 반영하지 않음)
    for (let i = 0; i < n; i++) {
      const g = this.queue[i]!;
      this.pendingOut[g] = this.evaluate(g);
      this.queued[g] = 0;
    }
    const blocks = this.blockQueue;
    this.blockQueue = [];
    const blockChanges: [number, number][] = [];
    for (const b of blocks) {
      this.blockQueued[b] = 0;
      for (const c of this.evaluateBlock(b)) blockChanges.push(c);
    }

    // 2) 결과를 한꺼번에 반영하고, 바뀐 넷의 팬아웃을 다음 큐로
    const cur = this.queue;
    this.queue = this.next;
    this.next = cur;
    this.queueLen = 0;
    let changed = 0;
    for (let i = 0; i < n; i++) {
      const g = cur[i]!;
      const out = nl.gateOut[g]!;
      const v = this.pendingOut[g]!;
      if (this.values[out] !== v) {
        this.values[out] = v;
        changed++;
        this.scheduleFanout(out);
      }
    }
    for (const [net, v] of blockChanges) {
      if (this.values[net] !== v) {
        this.values[net] = v;
        changed++;
        this.scheduleFanout(net);
      }
    }
    this.time++;
    return changed;
  }

  /** 더 이상 바뀌는 신호가 없을 때까지 진행한다. */
  settle(maxSteps: number = DEFAULT_MAX_STEPS): SettleResult {
    let steps = 0;
    while (this.busy && steps < maxSteps) {
      this.step();
      steps++;
    }
    return { stable: !this.busy, steps };
  }

  getOutput(name: string): number {
    const bits = this.netlist.outputs.get(name);
    if (!bits) throw new Error(`알 수 없는 출력 핀 '${name}'`);
    return this.readBits(bits);
  }

  getInput(name: string): number {
    const bits = this.netlist.inputs.get(name);
    if (!bits) throw new Error(`알 수 없는 입력 핀 '${name}'`);
    return this.readBits(bits);
  }

  /** 블록 상태 (메모리 뷰어용) */
  blockState(path: string): ModelState | undefined {
    const i = this.netlist.blocks.findIndex((b) => b.path === path);
    return i >= 0 ? this.blockStates[i] : undefined;
  }

  /** 넷 묶음의 값 (블록 입력 읽기 등) */
  readNets(bits: number[]): number {
    return this.readBits(bits);
  }

  private readBits(bits: number[]): number {
    let v = 0;
    for (let i = 0; i < bits.length; i++) v |= this.values[bits[i]!]! << i;
    return v >>> 0;
  }
}
