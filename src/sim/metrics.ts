import { GateType, type Netlist } from './types';

export interface CircuitMetrics {
  /** 평탄화했을 때 NAND 게이트 개수 */
  nandCount: number;
  /** 입력→출력 최장 경로의 게이트 수 (지연 깊이). 피드백 루프가 있으면 null */
  depth: number | null;
}

export function measure(nl: Netlist): CircuitMetrics {
  let nandCount = 0;
  for (let g = 0; g < nl.gateCount; g++) if (nl.gateType[g] === GateType.Nand) nandCount++;
  for (const b of nl.blocks) nandCount += b.nandCount;
  // 기억 칩(블록)이 있으면 순차 회로이므로 지연 깊이는 정의하지 않는다
  return { nandCount, depth: nl.blocks.length ? null : computeDepth(nl) };
}

function computeDepth(nl: Netlist): number | null {
  const driver = new Int32Array(nl.netCount).fill(-1);
  for (let g = 0; g < nl.gateCount; g++) driver[nl.gateOut[g]!] = g;

  // 0 = 미방문, 1 = 방문 중, 2 = 완료
  const state = new Uint8Array(nl.gateCount);
  const depth = new Int32Array(nl.gateCount);

  // 재귀 대신 명시적 스택 (큰 회로에서 스택 오버플로 방지)
  const visit = (root: number): boolean => {
    const stack: number[] = [root];
    while (stack.length) {
      const g = stack[stack.length - 1]!;
      if (state[g] === 2) {
        stack.pop();
        continue;
      }
      state[g] = 1;
      let pending = false;
      let best = 0;
      for (const net of [nl.gateIn0[g]!, nl.gateIn1[g]!]) {
        if (net < 0) continue;
        const d = driver[net]!;
        if (d < 0) continue;
        if (state[d] === 1) return false; // 피드백 루프
        if (state[d] === 0) {
          stack.push(d);
          pending = true;
        } else best = Math.max(best, depth[d]!);
      }
      if (!pending) {
        depth[g] = nl.gateType[g] === GateType.Nand ? best + 1 : 0;
        state[g] = 2;
        stack.pop();
      }
    }
    return true;
  };

  let max = 0;
  for (const bits of nl.outputs.values()) {
    for (const net of bits) {
      const d = driver[net]!;
      if (d < 0) continue;
      if (!visit(d)) return null;
      max = Math.max(max, depth[d]!);
    }
  }
  return max;
}
