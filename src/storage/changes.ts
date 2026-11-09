// 로컬 저장 변경 알림: 진행 기록·내 칩·도전 과제 플래그가 저장되면 동기화에 알린다.
type Listener = () => void;
const listeners = new Set<Listener>();
let muted = 0;

export function onLocalChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notifyLocalChange(): void {
  if (muted) return;
  for (const fn of listeners) fn();
}

/** 서버에서 받은 데이터를 로컬에 쓸 때처럼 "변경"으로 치지 않을 저장 */
export function withoutNotify<T>(fn: () => T): T {
  muted++;
  try {
    return fn();
  } finally {
    muted--;
  }
}
