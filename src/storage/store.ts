import { isEditorDoc, type EditorDoc } from '../editor/doc';

const SANDBOX_KEY = 'logic-game:v1:sandbox';

function read(key: string): unknown {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장 공간 부족·비공개 모드 등 — 저장 없이 계속 */
  }
}

export function loadSandbox(): EditorDoc | null {
  const v = read(SANDBOX_KEY);
  return isEditorDoc(v) ? v : null;
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** 잦은 편집 중에도 저장은 0.5초에 한 번만 */
export function saveSandboxDebounced(doc: () => EditorDoc): void {
  clearTimeout(timer);
  timer = setTimeout(() => write(SANDBOX_KEY, doc()), 500);
}

/** 지금 바로 저장 (화면을 다시 그리기 전에) */
export function saveSandboxNow(doc: EditorDoc): void {
  clearTimeout(timer);
  write(SANDBOX_KEY, doc);
}

const BACKUP_KEY = 'logic-game:v1:sandbox-backup';

/** 불러오기로 샌드박스를 바꾸기 직전 회로 (되돌리기용) */
export function saveSandboxBackup(doc: EditorDoc): void {
  write(BACKUP_KEY, doc);
}

export function loadSandboxBackup(): EditorDoc | null {
  const v = read(BACKUP_KEY);
  return isEditorDoc(v) ? v : null;
}

const PROGRAM_KEY = 'logic-game:sandbox-program';

export function loadSandboxProgram(): { src: string; auto: boolean; target?: string } {
  const v = read(PROGRAM_KEY) as { src?: string; auto?: boolean; target?: string } | null;
  return { src: v?.src ?? '', auto: v?.auto ?? true, target: v?.target };
}

export function saveSandboxProgram(p: { src: string; auto: boolean; target?: string }): void {
  write(PROGRAM_KEY, p);
}
