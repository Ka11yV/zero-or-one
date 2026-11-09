import { emptyDoc, genId, type EditorDoc } from '../editor/doc';
import { GRID } from '../editor/geometry';
import type { CircuitLevel } from '../levels';

/** 레벨 시작 회로: 입력 핀은 왼쪽, 출력 핀은 오른쪽에 세로로 고르게 배치 */
export function levelStartDoc(level: CircuitLevel): EditorDoc {
  const doc = emptyDoc();
  const column = (count: number, i: number) => (i - (count - 1) / 2) * 5 * GRID - GRID;
  level.inputs.forEach((p, i) => {
    doc.inputs.push({ id: genId(doc, 'i'), name: p.name, width: p.width, x: -16 * GRID, y: column(level.inputs.length, i) });
  });
  level.outputs.forEach((p, i) => {
    doc.outputs.push({ id: genId(doc, 'o'), name: p.name, width: p.width, x: 14 * GRID, y: column(level.outputs.length, i) });
  });
  return doc;
}
