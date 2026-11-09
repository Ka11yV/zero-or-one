import { describe, expect, it } from 'vitest';
import {
  addInstance,
  addIO,
  connect,
  copySelection,
  emptyDoc,
  emptySelection,
  paste,
  removeSelection,
  renameIO,
  selectInRect,
  setIOWidth,
  toChipDef,
  type EditorDoc,
} from '../../src/editor/doc';
import { distToPath, ioPin, wirePath } from '../../src/editor/geometry';
import { History } from '../../src/editor/history';
import { hitTest } from '../../src/editor/hit';
import { Camera } from '../../src/editor/camera';
import { createLibrary, runTest, SELF, truthTableFrom } from '../../src/sim';

const lib = createLibrary();
const pin = (inst: string, p: string) => ({ inst, pin: p });

/** 편집기 연산만으로 NAND 4개 XOR를 만든다 (M2 완료 기준 시나리오) */
function buildXor(): EditorDoc {
  const d = emptyDoc();
  const a = addIO(d, 'input', 0, 0);
  const b = addIO(d, 'input', 0, 100);
  const out = addIO(d, 'output', 400, 40);
  expect([a.name, b.name, out.name]).toEqual(['a', 'b', 'out']);
  const [n1, n2, n3, n4] = [0, 1, 2, 3].map((i) => addInstance(d, 'NAND', 100 + i * 60, 40).uid);
  const ok = (r: ReturnType<typeof connect>) => expect(r.ok).toBe(true);
  ok(connect(d, lib, pin(SELF, 'a'), pin(n1!, 'a')));
  ok(connect(d, lib, pin(SELF, 'b'), pin(n1!, 'b')));
  ok(connect(d, lib, pin(SELF, 'a'), pin(n2!, 'a')));
  ok(connect(d, lib, pin(n1!, 'out'), pin(n2!, 'b')));
  ok(connect(d, lib, pin(n3!, 'a'), pin(n1!, 'out'))); // 반대 방향으로 끌어도 정규화된다
  ok(connect(d, lib, pin(SELF, 'b'), pin(n3!, 'b')));
  ok(connect(d, lib, pin(n2!, 'out'), pin(n4!, 'a')));
  ok(connect(d, lib, pin(n3!, 'out'), pin(n4!, 'b')));
  ok(connect(d, lib, pin(n4!, 'out'), pin(SELF, 'out')));
  return d;
}

describe('편집 문서', () => {
  it('편집기로 만든 XOR가 진리표를 통과한다', () => {
    const d = buildXor();
    const res = runTest(toChipDef(d), lib, truthTableFrom(toChipDef(d).inputs, (a, b) => [a ^ b]));
    expect(res.pass).toBe(true);
  });

  it('배선은 항상 source → sink 방향으로 저장된다', () => {
    const d = buildXor();
    const w = d.wires[4]!;
    expect(w.to.pin).toBe('a');
    expect(w.from.pin).toBe('out');
  });

  it('연결 규칙: 같은 역할끼리, 폭이 다른 핀끼리는 거부', () => {
    const d = emptyDoc();
    const n1 = addInstance(d, 'NAND', 0, 0).uid;
    const n2 = addInstance(d, 'NAND', 100, 0).uid;
    const s = addInstance(d, 'SPLIT4', 200, 0).uid;
    expect(connect(d, lib, pin(n1, 'out'), pin(n2, 'out'))).toMatchObject({ ok: false, reason: 'same-role' });
    expect(connect(d, lib, pin(n1, 'a'), pin(n2, 'b'))).toMatchObject({ ok: false, reason: 'same-role' });
    expect(connect(d, lib, pin(n1, 'out'), pin(s, 'in'))).toMatchObject({ ok: false, reason: 'width', widths: [1, 4] });
    expect(connect(d, lib, pin(n1, 'out'), pin(n1, 'out'))).toMatchObject({ ok: false, reason: 'self' });
    expect(d.wires).toHaveLength(0);
  });

  it('입력 핀에 새 선을 연결하면 기존 선을 교체한다 (단락 방지)', () => {
    const d = emptyDoc();
    const n1 = addInstance(d, 'NAND', 0, 0).uid;
    const n2 = addInstance(d, 'NAND', 0, 100).uid;
    const n3 = addInstance(d, 'NAND', 200, 0).uid;
    connect(d, lib, pin(n1, 'out'), pin(n3, 'a'));
    const r = connect(d, lib, pin(n2, 'out'), pin(n3, 'a'));
    expect(r.ok && r.replaced?.from.inst).toBe(n1);
    expect(d.wires).toHaveLength(1);
    expect(d.wires[0]!.from.inst).toBe(n2);
  });

  it('부품을 지우면 연결된 선도 함께 지워진다', () => {
    const d = buildXor();
    const sel = emptySelection();
    sel.instances.add(d.instances[0]!.uid); // n1: 선 4개 연결
    removeSelection(d, sel);
    expect(d.instances).toHaveLength(3);
    expect(d.wires).toHaveLength(5);
  });

  it('입출력 노드를 지우면 연결된 선도 지워진다', () => {
    const d = buildXor();
    const sel = emptySelection();
    sel.io.add(d.inputs[0]!.id); // a: 선 2개
    removeSelection(d, sel);
    expect(d.wires).toHaveLength(7);
    expect(toChipDef(d).inputs.map((p) => p.name)).toEqual(['b']);
  });

  it('이름 변경은 선 참조도 갱신하고, 중복/잘못된 이름은 거부', () => {
    const d = buildXor();
    const a = d.inputs[0]!;
    expect(renameIO(d, a.id, 'b')).toBe(false);
    expect(renameIO(d, a.id, '1x')).toBe(false);
    expect(renameIO(d, a.id, 'x')).toBe(true);
    expect(d.wires.filter((w) => w.from.inst === SELF && w.from.pin === 'x')).toHaveLength(2);
    expect(runTest(toChipDef(d), lib, truthTableFrom(toChipDef(d).inputs, (x, b) => [x ^ b])).pass).toBe(true);
  });

  it('비트 폭을 바꾸면 맞지 않는 선이 제거된다', () => {
    const d = buildXor();
    setIOWidth(d, d.inputs[0]!.id, 4);
    expect(d.wires).toHaveLength(7);
    expect(d.inputs[0]!.width).toBe(4);
  });

  it('복사/붙여넣기: 내부 선은 함께, 외부 선은 제외하고 새 id로', () => {
    const d = buildXor();
    const sel = emptySelection();
    for (const i of d.instances) sel.instances.add(i.uid);
    const clip = copySelection(d, sel)!;
    expect(clip.wires).toHaveLength(4); // NAND끼리 연결된 선만
    const pasted = paste(d, clip, 0, 200);
    expect(d.instances).toHaveLength(8);
    expect(pasted.instances.size).toBe(4);
    expect(new Set(d.instances.map((i) => i.uid)).size).toBe(8);
    expect(d.wires).toHaveLength(13);
  });

  it('범위 선택', () => {
    const d = buildXor();
    const sel = selectInRect(d, lib, { x: -10, y: -10, w: 60, h: 200 });
    expect(sel.io.size).toBe(2);
    expect(sel.instances.size).toBe(0);
  });
});

describe('실행 취소', () => {
  it('record → undo → redo', () => {
    const h = new History();
    const d = emptyDoc();
    h.record(d);
    addIO(d, 'input', 0, 0);
    const undone = h.undo(d)!;
    expect(undone.inputs).toHaveLength(0);
    const redone = h.redo(undone)!;
    expect(redone.inputs).toHaveLength(1);
    expect(h.canRedo).toBe(false);
  });

  it('새 편집은 다시 실행 스택을 비운다', () => {
    const h = new History();
    let d = emptyDoc();
    h.record(d);
    addIO(d, 'input', 0, 0);
    d = h.undo(d)!;
    h.record(d);
    expect(h.canRedo).toBe(false);
  });
});

describe('도형 / 히트 테스트', () => {
  it('핀 > 부품 > 선 순서로 맞힌다', () => {
    const d = buildXor();
    const a = d.inputs[0]!;
    const p = ioPin(a, 'input');
    expect(hitTest(d, lib, { x: p.x + 1, y: p.y }, 6)).toMatchObject({ kind: 'pin', pin: { key: 'self.a' } });
    expect(hitTest(d, lib, { x: a.x + 10, y: a.y + 10 }, 6)).toMatchObject({ kind: 'io', io: 'input' });
    const nand = d.instances[3]!;
    expect(hitTest(d, lib, { x: nand.x + 30, y: nand.y + 5 }, 6)).toEqual({ kind: 'instance', uid: nand.uid });
    expect(hitTest(d, lib, { x: -500, y: -500 }, 6)).toBeNull();
  });

  it('배선 경로는 직교 선분으로 이뤄지고 양 끝을 지난다', () => {
    for (const [s, t] of [
      [{ x: 0, y: 0 }, { x: 200, y: 80 }],
      [{ x: 200, y: 0 }, { x: 0, y: 100 }],
      [{ x: 200, y: 0 }, { x: 180, y: 0 }],
    ] as const) {
      const path = wirePath(s, t);
      expect(path[0]).toEqual(s);
      expect(path[path.length - 1]).toEqual(t);
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1]!;
        const b = path[i]!;
        expect(a.x === b.x || a.y === b.y).toBe(true);
      }
      expect(distToPath(s, path)).toBe(0);
    }
  });

  it('카메라: 확대해도 커서 아래 월드 좌표는 고정', () => {
    const c = new Camera();
    const before = c.toWorld(300, 200);
    c.zoomAt(300, 200, 2);
    const after = c.toWorld(300, 200);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(c.toScreen(after.x, after.y)).toEqual({ x: 300, y: 200 });
  });
});
