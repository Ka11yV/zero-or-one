// 계정 세이브 합치기 (순수 함수). 원칙: 어느 쪽 기록도 잃지 않는다.
//  - 레벨 기록: 클리어 여부 OR, 별 최대, 최소 NAND, 힌트 사용 최대
//  - 해금 칩·작업 중 회로·프로그램: 합집합, 같은 항목이 다르면 prefer 쪽
//  - 내 칩: 합집합, 같은 이름이면 더 최근에 저장된 쪽
//  - 도전 과제 플래그: 합집합
import type { CustomChipStore } from './customChips';
import { emptyCustomStore, parseCustomStore } from './customChips';
import type { LevelRecord, Progress } from './progress';
import { emptyProgress, parseProgress } from './progress';

export const SAVE_GAME = 'logic';

/** 서버에 올리는 한 벌 (게임 'logic') */
export interface LogicSave {
  progress: Progress;
  custom: CustomChipStore;
  flags: string[];
}

export type Prefer = 'local' | 'remote';

export const emptySave = (): LogicSave => ({ progress: emptyProgress(), custom: emptyCustomStore(), flags: [] });

/** 서버에서 받은 값 검사. 알 수 없는 형식이면 빈 세이브로 (덮어쓰지 않도록 합치기만 함) */
export function parseSave(v: unknown): LogicSave {
  const o = (v ?? {}) as Partial<Record<keyof LogicSave, unknown>>;
  return {
    progress: parseProgress(o.progress) ?? emptyProgress(),
    custom: parseCustomStore(o.custom) ?? emptyCustomStore(),
    flags: Array.isArray(o.flags) ? o.flags.filter((f): f is string => typeof f === 'string') : [],
  };
}

function mergeRecord(a: LevelRecord | undefined, b: LevelRecord | undefined): LevelRecord {
  if (!a) return b!;
  if (!b) return a;
  const best = [a.bestNand, b.bestNand].filter((n): n is number => typeof n === 'number');
  return {
    cleared: a.cleared || b.cleared,
    stars: Math.max(a.stars, b.stars),
    hintsUsed: Math.max(a.hintsUsed, b.hintsUsed),
    ...(best.length ? { bestNand: Math.min(...best) } : {}),
  };
}

/** 합집합. 둘 다 있으면 win 쪽 */
function union<T>(win: Record<string, T> | undefined, lose: Record<string, T> | undefined): Record<string, T> {
  return { ...(lose ?? {}), ...(win ?? {}) };
}

export function mergeProgress(local: Progress, remote: Progress, prefer: Prefer): Progress {
  const [win, lose] = prefer === 'local' ? [local, remote] : [remote, local];
  const levels: Record<string, LevelRecord> = {};
  for (const id of new Set([...Object.keys(local.levels), ...Object.keys(remote.levels)])) levels[id] = mergeRecord(local.levels[id], remote.levels[id]);
  const chips = union(win.chips, lose.chips);
  // 칩 원본 회로는 고른 칩과 같은 쪽 것을 쓴다
  const chipSources: Progress['chipSources'] = {};
  for (const id of Object.keys(chips)) {
    const src = win.chips[id] ? (win.chipSources[id] ?? lose.chipSources[id]) : lose.chipSources[id];
    if (src) chipSources[id] = src;
  }
  const programs = union(win.programs, lose.programs);
  return {
    ...emptyProgress(),
    levels,
    chips,
    chipSources,
    drafts: union(win.drafts, lose.drafts),
    ...(Object.keys(programs).length ? { programs } : {}),
  };
}

export function mergeCustom(local: CustomChipStore, remote: CustomChipStore, prefer: Prefer): CustomChipStore {
  const out = emptyCustomStore();
  for (const id of new Set([...Object.keys(local.chips), ...Object.keys(remote.chips)])) {
    const l = local.chips[id];
    const r = remote.chips[id];
    const lt = local.meta[id]?.updated ?? 0;
    const rt = remote.meta[id]?.updated ?? 0;
    const side = !r ? local : !l ? remote : lt !== rt ? (lt > rt ? local : remote) : prefer === 'local' ? local : remote;
    out.chips[id] = side.chips[id]!;
    if (side.sources[id]) out.sources[id] = side.sources[id]!;
    if (side.meta[id]) out.meta[id] = side.meta[id]!;
  }
  return out;
}

export function mergeSave(local: LogicSave, remote: LogicSave, prefer: Prefer): LogicSave {
  return {
    progress: mergeProgress(local.progress, remote.progress, prefer),
    custom: mergeCustom(local.custom, remote.custom, prefer),
    flags: [...new Set([...local.flags, ...remote.flags])].sort(),
  };
}

/** 내용 비교 (키 순서 무관) */
export function sameSave(a: LogicSave, b: LogicSave): boolean {
  return stable(a) === stable(b);
}

function stable(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([p], [q]) => (p < q ? -1 : p > q ? 1 : 0))) : x,
  );
}
