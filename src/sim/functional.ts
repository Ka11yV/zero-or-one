// 기능 모델(빠른 모드): 플레이어가 레벨 테스트로 검증한 칩을, 같은 동작을 하는 JS 코드로 대신 시뮬레이션한다.
// - 큰 회로(RAM, CPU)의 컴파일 시간을 줄이고,
// - 메모리 내용을 주소 순서대로 읽을 수 있게 한다(메모리 뷰어).
import type { ChipDef, PinDef } from './types';

export interface ModelState {
  /** 메모리 칩의 내용 (메모리 뷰어가 읽는다) */
  mem?: Uint8Array;
  /** 마지막으로 쓴 주소 (뷰어 강조용) */
  lastWrite?: number;
  [k: string]: unknown;
}

export interface FunctionalModel {
  createState(): ModelState;
  /** 현재 입력값으로 출력값을 계산한다. 클럭 상승 엣지 등 상태 변화도 여기서 처리한다. */
  evaluate(state: ModelState, inputs: Record<string, number>): Record<string, number>;
}

const samePins = (a: PinDef[], b: PinDef[]) =>
  a.length === b.length && a.every((p, i) => p.name === b[i]!.name && p.width === b[i]!.width);

/** 레벨 6의 RAM 인터페이스: addr, d[8], write, clk → q[8] */
function ramModel(addrBits: number): { pins: { inputs: PinDef[]; outputs: PinDef[] }; model: FunctionalModel } {
  const size = 1 << addrBits;
  return {
    pins: {
      inputs: [
        { name: 'addr', width: addrBits },
        { name: 'd', width: 8 },
        { name: 'write', width: 1 },
        { name: 'clk', width: 1 },
      ],
      outputs: [{ name: 'q', width: 8 }],
    },
    model: {
      createState: () => ({ mem: new Uint8Array(size), lastClk: -1, lastWrite: -1 }),
      evaluate(state, inp) {
        const mem = state.mem!;
        const addr = inp.addr! & (size - 1);
        // 상승 엣지(0 → 1)에서 write = 1이면 저장. 첫 평가(-1)는 엣지로 보지 않는다.
        if (state.lastClk === 0 && inp.clk === 1 && inp.write === 1) {
          mem[addr] = inp.d! & 255;
          state.lastWrite = addr;
        }
        state.lastClk = inp.clk;
        return { q: mem[addr]! };
      },
    },
  };
}

const MODELS: Record<string, ReturnType<typeof ramModel>> = {
  RAM4: ramModel(2),
  RAM16: ramModel(4),
  RAM256: ramModel(8),
};

/**
 * 이 칩을 기능 모델로 대신할 수 있으면 모델을 돌려준다.
 * 조건: 플레이어가 레벨 테스트를 통과한(verified) 칩이고, 핀 구성이 모델과 정확히 같을 것.
 */
export function modelFor(def: ChipDef): FunctionalModel | undefined {
  if (def.kind !== 'composite' || !def.verified) return undefined;
  const m = MODELS[def.id];
  if (!m || !samePins(def.inputs, m.pins.inputs) || !samePins(def.outputs, m.pins.outputs)) return undefined;
  return m.model;
}
