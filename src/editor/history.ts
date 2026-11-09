import { cloneDoc, type EditorDoc } from './doc';

/**
 * 스냅샷 기반 실행 취소/다시 실행.
 * 편집 직전에 record()로 현재 문서를 저장한다. 회로 문서는 작아서(수 KB) 스냅샷이 단순하고 안전하다.
 */
export class History {
  private undoStack: EditorDoc[] = [];
  private redoStack: EditorDoc[] = [];

  constructor(private readonly limit = 200) {}

  record(doc: EditorDoc): void {
    this.undoStack.push(cloneDoc(doc));
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(current: EditorDoc): EditorDoc | null {
    const prev = this.undoStack.pop();
    if (!prev) return null;
    this.redoStack.push(cloneDoc(current));
    return prev;
  }

  redo(current: EditorDoc): EditorDoc | null {
    const next = this.redoStack.pop();
    if (!next) return null;
    this.undoStack.push(cloneDoc(current));
    return next;
  }

  /** 마지막 record()를 취소 (편집이 실제로 일어나지 않았을 때) */
  discardLast(): void {
    this.undoStack.pop();
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
