// 시뮬레이션 엔진의 핵심 데이터 모델. DOM/브라우저 API에 의존하지 않는다.

export type ChipId = string;

/** 칩의 입출력 핀. width = 비트 폭(1~16). */
export interface PinDef {
  name: string;
  width: number;
}

/**
 * 내장 칩의 동작 종류.
 * - nand: 원시 게이트 (a, b → out)
 * - const0 / const1: 상수 출력
 * - alias: 게이트 없이 넷만 연결 (버스 분리/합치기). aliasMap[i] = [입력 비트 인덱스, 출력 비트 인덱스]
 */
export type BuiltinBehavior =
  | { type: 'nand' }
  | { type: 'const'; value: 0 | 1 }
  | { type: 'alias'; map: AliasBit[] };

export interface AliasBit {
  from: { pin: string; bit: number };
  to: { pin: string; bit: number };
}

/** 칩 인스턴스(회로에 배치된 부품). x/y/rot는 편집기용이며 엔진은 무시한다. */
export interface Instance {
  uid: string;
  chip: ChipId;
  x?: number;
  y?: number;
  rot?: 0 | 90 | 180 | 270;
}

/** 'self' = 이 칩 자신의 외부 입출력 핀. */
export const SELF = 'self';

export interface PinRef {
  inst: string; // 인스턴스 uid 또는 SELF
  pin: string;
}

export interface Wire {
  from: PinRef;
  to: PinRef;
  points?: [number, number][];
}

interface ChipDefBase {
  id: ChipId;
  inputs: PinDef[];
  outputs: PinDef[];
  nameKey?: string;
  icon?: string;
  /** 레벨 테스트 통과 여부 — M6에서 기능 모델 대체 조건으로 사용 */
  verified?: boolean;
}

export interface BuiltinChipDef extends ChipDefBase {
  kind: 'builtin';
  behavior: BuiltinBehavior;
}

export interface CompositeChipDef extends ChipDefBase {
  kind: 'composite';
  instances: Instance[];
  wires: Wire[];
}

export type ChipDef = BuiltinChipDef | CompositeChipDef;

/** 원시 게이트 종류 (평탄화 결과). */
export const GateType = {
  Nand: 0,
  Const0: 1,
  Const1: 2,
} as const;
export type GateType = (typeof GateType)[keyof typeof GateType];

/** 컴파일된 평탄 넷리스트. 넷 = 1비트 신호선. */
export interface Netlist {
  netCount: number;
  gateCount: number;
  gateType: Uint8Array;
  /** 게이트 입력 넷 (입력이 없거나 1개면 -1) */
  gateIn0: Int32Array;
  gateIn1: Int32Array;
  gateOut: Int32Array;
  /** CSR 형식 팬아웃: 넷 n을 입력으로 쓰는 게이트들 = fanout[fanoutStart[n] .. fanoutStart[n+1]) */
  fanoutStart: Int32Array;
  fanout: Int32Array;
  /** 최상위 칩의 입출력 핀 → 비트별 넷 (LSB 먼저) */
  inputs: Map<string, number[]>;
  outputs: Map<string, number[]>;
  /** 최상위 회로의 핀('uid.pin' 또는 'self.name') → 비트별 넷. 편집기가 선 색을 칠할 때 사용 */
  pinNets: Map<string, number[]>;
  inputOrder: PinDef[];
  outputOrder: PinDef[];
  warnings: CompileWarning[];
  /** 기능 모델로 대체된 칩 인스턴스 (빠른 모드) */
  blocks: BlockInstance[];
  /** CSR 형식: 넷 n을 입력으로 쓰는 블록들 */
  blockFanoutStart: Int32Array;
  blockFanout: Int32Array;
}

/** 기능 모델로 시뮬레이션되는 칩 인스턴스 */
export interface BlockInstance {
  /** 인스턴스 경로 (최상위 uid 또는 'c3/c7') */
  path: string;
  chipId: ChipId;
  model: import('./functional').FunctionalModel;
  inputs: Map<string, number[]>;
  outputs: Map<string, number[]>;
  /** 이 칩을 NAND로 펼쳤을 때의 개수 (별점 계산용) */
  nandCount: number;
}

export interface CompileWarning {
  kind: 'undriven-input' | 'unconnected-output';
  path: string;
}

export class CompileError extends Error {
  constructor(
    public readonly code:
      | 'unknown-chip'
      | 'recursive-chip'
      | 'unknown-pin'
      | 'unknown-instance'
      | 'width-mismatch'
      | 'multiple-drivers'
      | 'duplicate-uid',
    message: string,
  ) {
    super(message);
    this.name = 'CompileError';
  }
}
