import type { Lang } from '../i18n';
import type { ChipBuilder, ChipId, CircuitTest, CompositeChipDef, PinDef } from '../sim';

export interface PrincipleCard {
  title: string;
  /** "왜 이렇게 되는가" — 단락은 빈 줄로 구분 */
  body: string;
  /** 불 대수식 등 (선택) */
  formula?: string;
  /** 컴퓨터 속 어디에 쓰이나 */
  usage?: string;
}

export interface LevelText {
  title: string;
  /** 왜 필요한가 + 목표 설명 */
  briefing: string;
  /** ① 개념 질문 → ② 부분 구조 → ③ 거의 정답 */
  hints: [string, string, string];
  principle: PrincipleCard;
}

/** 패널에 붙는 입출력 장치 */
export interface LevelDevices {
  /** 7세그먼트로 보여줄 출력 핀 (폭 7, 비트 0 = a … 비트 6 = g) — 왼쪽 자리부터 */
  seg7?: string[];
  /** 키패드: 누르면 이 핀에 키 값을 넣고 클럭을 한 번 */
  keypad?: { pin: string };
}

export interface CircuitLevel {
  kind?: 'circuit';
  id: string;
  chapter: number;
  inputs: PinDef[];
  outputs: PinDef[];
  /** 이 레벨에서 쓸 수 있는 칩 (내장 칩 또는 이전 레벨에서 해금한 칩) */
  allowedChips: ChipId[];
  test: CircuitTest;
  /** 클리어 시 플레이어의 회로가 이 id의 칩이 된다 */
  unlocks?: { chipId: ChipId };
  /** 별점: NAND 개수 ≤ maxNand → ★★★, ≤ 1.5배 → ★★, 그 외 클리어 → ★ */
  stars?: { maxNand: number };
  /** 진리표에서 2진수로 보여줄 다비트 핀 (예: 디코더의 원-핫 출력) */
  binaryPins?: string[];
  devices?: LevelDevices;
  text: Record<Lang, LevelText>;
  /** 참조 정답 (자동 테스트 전용, 플레이어에게 비공개) */
  solution: (b: ChipBuilder) => void;
}

/** 프로그램 테스트 한 경우: 메모리 초깃값·입력값 → 기대 출력(OUT 순서) */
export interface ProgramCase {
  /** 프로그램과 함께 적재할 데이터 (주소 → 값) */
  mem?: Record<number, number>;
  /** IN 명령이 읽는 값 */
  input?: number;
  /** OUT 명령으로 나와야 하는 값들 (순서대로) */
  outs: number[];
}

/** 기계어 프로그램을 짜는 레벨 (플레이어가 만든 CPU 칩으로 실행) */
export interface ProgramLevel {
  kind: 'program';
  id: string;
  chapter: number;
  /** 프로그램 레벨은 칩을 해금하지 않는다 */
  unlocks?: undefined;
  cases: ProgramCase[];
  /** 무한 반복 방지: 경우마다 최대 클럭 수 */
  maxCycles: number;
  /** 별점: 프로그램 크기(바이트) ≤ maxBytes → ★★★, ≤ 1.5배 → ★★ */
  stars?: { maxBytes: number };
  /** 처음 열었을 때 편집기에 들어 있는 코드 */
  starter: Record<Lang, string>;
  text: Record<Lang, LevelText>;
  /** 참조 정답 프로그램 (자동 테스트 전용) */
  solution: string;
}

export type Level = CircuitLevel | ProgramLevel;

export const isProgramLevel = (l: Level): l is ProgramLevel => l.kind === 'program';

export interface Chapter {
  id: number;
  title: Record<Lang, string>;
  subtitle: Record<Lang, string>;
  levels: Level[];
}

export type { CompositeChipDef };
