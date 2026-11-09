// 팔레트 "NEW" 배지용: 플레이어가 이미 본(놓아 본) 칩 목록. 진행 기록과 별개 키.
const KEY = 'logic-game:seen-chips';

function read(): Set<string> | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

function write(s: Set<string>): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify([...s]));
  } catch {
    /* 저장 불가 — 무시 */
  }
}

/** 처음 실행이면 지금까지 해금한 칩은 모두 본 것으로 친다 (기존 플레이어에게 NEW가 쏟아지지 않게) */
export function initSeenChips(unlocked: string[]): void {
  if (!read()) write(new Set(unlocked));
}

export function isNewChip(id: string): boolean {
  const s = read();
  return !!s && !s.has(id);
}

export function markChipSeen(id: string): void {
  const s = read() ?? new Set<string>();
  if (s.has(id)) return;
  s.add(id);
  write(s);
}
