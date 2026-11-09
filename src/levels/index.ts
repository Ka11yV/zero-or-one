import { ChipBuilder, type CompositeChipDef } from '../sim';
import { chapter0 } from './ch0';
import { chapter1 } from './ch1';
import { chapter2 } from './ch2';
import { chapter3 } from './ch3';
import { chapter4 } from './ch4';
import { chapter5 } from './ch5';
import { chapter6 } from './ch6';
import { chapter7 } from './ch7';
import { chapter8 } from './ch8';
import type { Chapter, CircuitLevel, Level } from './types';

export type { Chapter, CircuitLevel, Level, LevelText, PrincipleCard, ProgramCase, ProgramLevel } from './types';
export { isProgramLevel } from './types';

export const CHAPTERS: Chapter[] = [
  chapter0,
  chapter1,
  chapter2,
  chapter3,
  chapter4,
  chapter5,
  chapter6,
  chapter7,
  chapter8,
];

/** 플레이 순서대로 정렬된 모든 레벨 */
export const LEVELS: Level[] = CHAPTERS.flatMap((c) => c.levels);

export function getLevel(id: string): Level | undefined {
  return LEVELS.find((l) => l.id === id);
}

export function nextLevel(id: string): Level | undefined {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i >= 0 ? LEVELS[i + 1] : undefined;
}

/** 레벨의 입출력 핀만 갖춘 빈 칩 빌더 */
export function levelBuilder(level: CircuitLevel, id = `LEVEL_${level.id}`): ChipBuilder {
  return new ChipBuilder(
    id,
    level.inputs.map((p) => (p.width > 1 ? `${p.name}:${p.width}` : p.name)),
    level.outputs.map((p) => (p.width > 1 ? `${p.name}:${p.width}` : p.name)),
  );
}

/** 참조 정답 회로 (테스트 전용) */
export function solutionChip(level: CircuitLevel, id?: string): CompositeChipDef {
  const b = levelBuilder(level, id ?? level.unlocks?.chipId);
  level.solution(b);
  return b.build();
}
