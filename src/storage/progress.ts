// 캠페인 진행 상태 — 순수 함수 + localStorage 저장
import type { EditorDoc } from '../editor/doc';
import { isEditorDoc } from '../editor/doc';
import { LEVELS, type Level } from '../levels';
import { createLibrary, type ChipLibrary, type CompositeChipDef } from '../sim';
import { notifyLocalChange } from './changes';

export interface LevelRecord {
  cleared: boolean;
  stars: number;
  hintsUsed: number;
  bestNand?: number;
}

export interface Progress {
  version: 1;
  levels: Record<string, LevelRecord>;
  /** 플레이어가 만든 칩 정의 (id → 정의) */
  chips: Record<string, CompositeChipDef>;
  /** 칩 내부 들여다보기용: 칩을 만든 회로 원본 */
  chipSources: Record<string, EditorDoc>;
  /** 레벨별 작업 중인 회로 */
  drafts: Record<string, EditorDoc>;
  /** 프로그램 레벨(8장)별 작성 중인 어셈블리 코드 */
  programs?: Record<string, string>;
}

export const emptyProgress = (): Progress => ({ version: 1, levels: {}, chips: {}, chipSources: {}, drafts: {} });

export function levelRecord(p: Progress, id: string): LevelRecord {
  return p.levels[id] ?? { cleared: false, stars: 0, hintsUsed: 0 };
}

/** 첫 레벨은 항상 열려 있고, 이후 레벨은 바로 앞 레벨을 클리어하면 열린다 */
export function isUnlocked(p: Progress, id: string): boolean {
  const i = LEVELS.findIndex((l) => l.id === id);
  if (i < 0) return false;
  return i === 0 || levelRecord(p, LEVELS[i - 1]!.id).cleared;
}

/** 별점: 회로 레벨은 NAND 개수, 프로그램 레벨은 프로그램 크기(바이트)로 */
export function starsFor(level: Level, nandCount: number): number {
  const max = level.stars ? ('maxNand' in level.stars ? level.stars.maxNand : level.stars.maxBytes) : undefined;
  if (max === undefined) return 3;
  if (nandCount <= max) return 3;
  if (nandCount <= Math.ceil(max * 1.5)) return 2;
  return 1;
}

/** 클리어 기록: 별점은 최고 기록 유지, 해금 칩은 최신 회로로 갱신 */
/** 클리어 기록 (프로그램 레벨은 doc = null, score = 프로그램 바이트 수) */
export function recordClear(p: Progress, level: Level, doc: EditorDoc | null, chip: CompositeChipDef | null, nandCount: number): Progress {
  const prev = levelRecord(p, level.id);
  const stars = starsFor(level, nandCount);
  const next: Progress = {
    ...p,
    levels: {
      ...p.levels,
      [level.id]: {
        cleared: true,
        stars: Math.max(prev.stars, stars),
        hintsUsed: prev.hintsUsed,
        bestNand: prev.bestNand === undefined ? nandCount : Math.min(prev.bestNand, nandCount),
      },
    },
  };
  if (chip && doc && level.unlocks) {
    next.chips = { ...p.chips, [level.unlocks.chipId]: { ...chip, verified: true } };
    next.chipSources = { ...p.chipSources, [level.unlocks.chipId]: structuredClone(doc) };
  }
  return next;
}

export function recordHint(p: Progress, levelId: string, used: number): Progress {
  const r = levelRecord(p, levelId);
  if (used <= r.hintsUsed) return p;
  return { ...p, levels: { ...p.levels, [levelId]: { ...r, hintsUsed: used } } };
}

/** 내장 칩 + 플레이어가 만든 칩 */
export function libraryFor(p: Progress): ChipLibrary {
  return createLibrary(Object.values(p.chips));
}

/** 플레이어가 지금까지 해금한 칩 id (레벨 순서) */
export function unlockedChips(p: Progress): string[] {
  return LEVELS.flatMap((l) => (l.unlocks && p.chips[l.unlocks.chipId] ? [l.unlocks.chipId] : []));
}

// ---------- 저장 ----------

const KEY = 'logic-game:v1:progress';

function isProgress(v: unknown): v is Progress {
  const p = v as Progress;
  return !!p && p.version === 1 && typeof p.levels === 'object' && typeof p.chips === 'object';
}

/** 저장된(또는 서버에서 받은) 값을 검사해 진행 기록으로. 형식이 다르면 null */
export function parseProgress(v: unknown): Progress | null {
  if (!isProgress(v)) return null;
  const drafts = Object.fromEntries(Object.entries(v.drafts ?? {}).filter(([, d]) => isEditorDoc(d)));
  return { ...emptyProgress(), ...v, drafts };
}

export function loadProgress(): Progress {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const p = raw ? parseProgress(JSON.parse(raw)) : null;
    if (p) return p;
  } catch {
    /* 손상된 데이터 — 새로 시작 */
  }
  return emptyProgress();
}

/** 계정 동기화 직전 백업 (되돌리기용) */
export function backupProgress(p: Progress): void {
  try {
    globalThis.localStorage?.setItem(`${KEY}-backup`, JSON.stringify(p));
  } catch {
    /* 저장 불가 */
  }
}

export function saveProgress(p: Progress): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(p));
  } catch {
    /* 저장 불가 — 계속 진행 */
  }
  notifyLocalChange();
}
