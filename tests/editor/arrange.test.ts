import { describe, expect, it } from 'vitest';
import { alignSelection, autoArrange } from '../../src/editor/arrange';
import { addInstance, addIO, connect, emptyDoc, emptySelection, instanceBounds, toChipDef, type EditorDoc } from '../../src/editor/doc';
import { GRID, ioRect, rectsIntersect } from '../../src/editor/geometry';
import { createLibrary, generateTruthTable, SELF } from '../../src/sim';

const lib = createLibrary();
const pin = (inst: string, p: string) => ({ inst, pin: p });

/** 일부러 뒤죽박죽 놓은 NAND 4개 XOR */
function messyXor(): EditorDoc {
  const d = emptyDoc();
  addIO(d, 'input', 500, 300);
  addIO(d, 'input', -200, -400);
  addIO(d, 'output', -300, 100);
  const [n1, n2, n3, n4] = [
    [300, -100],
    [-100, 200],
    [700, 50],
    [0, 0],
  ].map(([x, y]) => addInstance(d, 'NAND', x!, y!).uid);
  connect(d, lib, pin(SELF, 'a'), pin(n1!, 'a'));
  connect(d, lib, pin(SELF, 'b'), pin(n1!, 'b'));
  connect(d, lib, pin(SELF, 'a'), pin(n2!, 'a'));
  connect(d, lib, pin(n1!, 'out'), pin(n2!, 'b'));
  connect(d, lib, pin(n1!, 'out'), pin(n3!, 'a'));
  connect(d, lib, pin(SELF, 'b'), pin(n3!, 'b'));
  connect(d, lib, pin(n2!, 'out'), pin(n4!, 'a'));
  connect(d, lib, pin(n3!, 'out'), pin(n4!, 'b'));
  connect(d, lib, pin(n4!, 'out'), pin(SELF, 'out'));
  return d;
}

const rects = (d: EditorDoc) => [...d.inputs.map(ioRect), ...d.outputs.map(ioRect), ...d.instances.map((i) => instanceBounds(lib, i))];

describe('자동 정렬', () => {
  it('입력 → 칩 → 출력 순서로 왼쪽에서 오른쪽으로 놓고, 겹치지 않으며, 동작은 그대로다', () => {
    const d = messyXor();
    const before = generateTruthTable(toChipDef(d), lib);
    expect(autoArrange(d, lib)).toBe(true);
    const x = (uid: string) => d.instances.find((i) => i.uid === uid)!.x;
    const [n1, n2, n3, n4] = d.instances.map((i) => i.uid);
    const inX = Math.max(...d.inputs.map((n) => n.x));
    expect(inX).toBeLessThan(x(n1!));
    expect(x(n1!)).toBeLessThan(x(n2!));
    expect(x(n2!)).toBe(x(n3!));
    expect(x(n3!)).toBeLessThan(x(n4!));
    expect(x(n4!)).toBeLessThan(d.outputs[0]!.x);
    // 입력의 원래 위아래 순서 유지 (b가 위에 있었다)
    expect(d.inputs[1]!.y).toBeLessThan(d.inputs[0]!.y);
    const rs = rects(d);
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) expect(rectsIntersect(rs[i]!, rs[j]!)).toBe(false);
    for (const r of rs) expect([r.x % GRID, r.y % GRID].map(Math.abs)).toEqual([0, 0]);
    expect(generateTruthTable(toChipDef(d), lib)).toEqual(before);
    // 한 번 더 하면 바뀌는 것이 없다
    expect(autoArrange(d, lib)).toBe(false);
  });

  it('피드백 루프(SR 래치)도 무한 반복 없이 정렬한다', () => {
    const d = emptyDoc();
    addIO(d, 'input', 0, 0);
    addIO(d, 'input', 0, 100);
    addIO(d, 'output', 300, 0);
    const [n1, n2] = [addInstance(d, 'NAND', 100, 300).uid, addInstance(d, 'NAND', 100, -300).uid];
    connect(d, lib, pin(SELF, 'a'), pin(n1, 'a'));
    connect(d, lib, pin(SELF, 'b'), pin(n2, 'b'));
    connect(d, lib, pin(n2, 'out'), pin(n1, 'b'));
    connect(d, lib, pin(n1, 'out'), pin(n2, 'a'));
    connect(d, lib, pin(n1, 'out'), pin(SELF, 'out'));
    expect(autoArrange(d, lib)).toBe(true);
    const rs = rects(d);
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) expect(rectsIntersect(rs[i]!, rs[j]!)).toBe(false);
  });

  it('빈 회로는 아무것도 하지 않는다', () => {
    expect(autoArrange(emptyDoc(), lib)).toBe(false);
  });
});

describe('선택 맞춤', () => {
  const setup = () => {
    const d = emptyDoc();
    const ids = [
      [0, 0],
      [200, 60],
      [500, 140],
    ].map(([x, y]) => addInstance(d, 'NAND', x!, y!).uid);
    const sel = emptySelection();
    ids.forEach((u) => sel.instances.add(u));
    return { d, sel };
  };

  it('왼쪽 / 위쪽 / 아래쪽 맞춤', () => {
    const { d, sel } = setup();
    alignSelection(d, lib, sel, 'left');
    expect(new Set(d.instances.map((i) => i.x))).toEqual(new Set([0]));
    alignSelection(d, lib, sel, 'top');
    expect(new Set(d.instances.map((i) => i.y))).toEqual(new Set([0]));
    const { d: d2, sel: s2 } = setup();
    alignSelection(d2, lib, s2, 'bottom');
    expect(new Set(d2.instances.map((i) => i.y))).toEqual(new Set([140]));
  });

  it('가로 간격 균등: 양 끝은 그대로, 가운데가 옮겨진다', () => {
    const { d, sel } = setup();
    expect(alignSelection(d, lib, sel, 'distH')).toBe(true);
    expect(d.instances.map((i) => i.x)).toEqual([0, 260, 500]);
  });

  it('선택한 것만 옮기고, 개수가 모자라면 아무것도 하지 않는다', () => {
    const { d } = setup();
    const one = emptySelection();
    one.instances.add(d.instances[0]!.uid);
    expect(alignSelection(d, lib, one, 'left')).toBe(false);
    const two = emptySelection();
    two.instances.add(d.instances[1]!.uid).add(d.instances[2]!.uid);
    expect(alignSelection(d, lib, two, 'distH')).toBe(false);
    alignSelection(d, lib, two, 'left');
    expect(d.instances.map((i) => i.x)).toEqual([0, 200, 200]);
  });

  it('입출력 핀도 함께 맞춘다', () => {
    const d = emptyDoc();
    const a = addIO(d, 'input', 0, 0);
    const n = addInstance(d, 'NAND', 300, 100);
    const sel = emptySelection();
    sel.io.add(a.id);
    sel.instances.add(n.uid);
    alignSelection(d, lib, sel, 'top');
    expect(a.y).toBe(n.y);
  });
});
