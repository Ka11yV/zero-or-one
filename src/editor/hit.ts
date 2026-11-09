import type { ChipLibrary } from '../sim';
import { instanceBounds, layoutPins, type EditorDoc } from './doc';
import { distToPath, ioRect, pinKey, rectContains, wirePath, type PinGeom, type Pt } from './geometry';

export type Hit =
  | { kind: 'pin'; pin: PinGeom }
  | { kind: 'instance'; uid: string }
  | { kind: 'io'; id: string; io: 'input' | 'output' }
  | { kind: 'wire'; id: string }
  | null;

/** 우선순위: 핀 > 부품 몸체 > 선. tol은 화면 픽셀 기준 허용 오차를 월드 단위로 바꾼 값 */
export function hitTest(doc: EditorDoc, lib: ChipLibrary, p: Pt, tol: number): Hit {
  const pins = layoutPins(doc, lib);
  let best: PinGeom | null = null;
  let bestD = tol + 3;
  for (const pin of pins.values()) {
    const d = Math.hypot(pin.x - p.x, pin.y - p.y);
    if (d <= bestD) {
      bestD = d;
      best = pin;
    }
  }
  if (best) return { kind: 'pin', pin: best };

  for (let i = doc.instances.length - 1; i >= 0; i--) {
    const inst = doc.instances[i]!;
    if (rectContains(instanceBounds(lib, inst), p)) return { kind: 'instance', uid: inst.uid };
  }
  for (const n of doc.inputs) if (rectContains(ioRect(n), p)) return { kind: 'io', id: n.id, io: 'input' };
  for (const n of doc.outputs) if (rectContains(ioRect(n), p)) return { kind: 'io', id: n.id, io: 'output' };

  for (let i = doc.wires.length - 1; i >= 0; i--) {
    const w = doc.wires[i]!;
    const a = pins.get(pinKey(w.from));
    const b = pins.get(pinKey(w.to));
    if (a && b && distToPath(p, wirePath(a, b)) <= tol) return { kind: 'wire', id: w.id };
  }
  return null;
}
