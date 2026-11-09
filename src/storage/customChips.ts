// 샌드박스에서 만든 "내 칩" 저장소. 캠페인 진행 기록(logic-game:v1:progress)과 별개 키에 저장한다.
import { isEditorDoc, type EditorDoc } from '../editor/doc';
import { isProgramLevel, LEVELS } from '../levels';
import { BUILTINS, type CompositeChipDef } from '../sim';

const KEY = 'logic-game:v1:custom-chips';

export interface CustomChipMeta {
  description?: string;
  /** 공유 링크/파일에서 가져온 칩 (직접 만든 칩이 아님) */
  imported?: boolean;
  updated: number;
}

export interface CustomChipStore {
  version: 1;
  chips: Record<string, CompositeChipDef>;
  sources: Record<string, EditorDoc>;
  meta: Record<string, CustomChipMeta>;
}

export const emptyCustomStore = (): CustomChipStore => ({ version: 1, chips: {}, sources: {}, meta: {} });

export function loadCustomChips(): CustomChipStore {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as CustomChipStore) : null;
    if (v && v.version === 1 && typeof v.chips === 'object') {
      const sources = Object.fromEntries(Object.entries(v.sources ?? {}).filter(([, d]) => isEditorDoc(d)));
      return { version: 1, chips: v.chips, sources, meta: v.meta ?? {} };
    }
  } catch {
    /* 손상 — 빈 저장소 */
  }
  return emptyCustomStore();
}

export function saveCustomChips(s: CustomChipStore): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 저장 불가 */
  }
}

/** 직접 지을 수 없는 이름: 내장 칩, 캠페인에서 해금되는 칩(아직 안 깬 것도 포함) */
export function reservedChipIds(): Set<string> {
  return new Set([...BUILTINS.map((b) => b.id), ...LEVELS.flatMap((l) => (!isProgramLevel(l) && l.unlocks ? [l.unlocks.chipId] : []))]);
}

export const CHIP_NAME_RE = /^[A-Z][A-Z0-9_]{0,15}$/;

export type ChipNameProblem = 'format' | 'reserved' | 'exists' | null;

/** 새 칩 이름 검사. exists = 같은 이름의 내 칩이 이미 있음(덮어쓰기 확인 필요) */
export function checkChipName(name: string, store: CustomChipStore): ChipNameProblem {
  if (!CHIP_NAME_RE.test(name)) return 'format';
  if (reservedChipIds().has(name)) return 'reserved';
  if (store.chips[name]) return 'exists';
  return null;
}

/** 이 칩을 직접 쓰는 다른 내 칩들 */
export function dependentsOf(store: CustomChipStore, id: string): string[] {
  return Object.values(store.chips)
    .filter((c) => c.id !== id && c.instances.some((i) => i.chip === id))
    .map((c) => c.id);
}

export function putChip(store: CustomChipStore, def: CompositeChipDef, source: EditorDoc | undefined, meta: Omit<CustomChipMeta, 'updated'>): CustomChipStore {
  return {
    version: 1,
    chips: { ...store.chips, [def.id]: def },
    sources: source ? { ...store.sources, [def.id]: structuredClone(source) } : store.sources,
    meta: { ...store.meta, [def.id]: { ...meta, updated: Date.now() } },
  };
}

export function removeChip(store: CustomChipStore, id: string): CustomChipStore {
  const { [id]: _c, ...chips } = store.chips;
  const { [id]: _s, ...sources } = store.sources;
  const { [id]: _m, ...meta } = store.meta;
  return { version: 1, chips, sources, meta };
}
