import { describe, expect, it } from 'vitest';
import { addInstance, addIO, connect, emptyDoc, toChipDef } from '../../src/editor/doc';
import { evaluateAchievements } from '../../src/game/achievements';
import { isProgramLevel, LEVELS, solutionChip, type CircuitLevel } from '../../src/levels';
import { createLibrary, generateTruthTable, SELF } from '../../src/sim';
import { checkChipName, dependentsOf, emptyCustomStore, putChip, removeChip } from '../../src/storage/customChips';
import { emptyProgress } from '../../src/storage/progress';
import { collectChips, decodeBundle, encodeBundle, makeBundle, parseBundle } from '../../src/storage/share';
import { screenPixels } from '../../src/ui/devices';

const campaign = LEVELS.filter((l): l is CircuitLevel => !isProgramLevel(l) && !!l.unlocks).map((l) => solutionChip(l));
const pin = (inst: string, p: string) => ({ inst, pin: p });

/** 샌드박스에서 AND + NOT으로 만든 MYNAND */
function myNandDoc() {
  const lib = createLibrary(campaign);
  const d = emptyDoc();
  addIO(d, 'input', 0, 0);
  addIO(d, 'input', 0, 60);
  addIO(d, 'output', 300, 30);
  const and = addInstance(d, 'AND', 100, 0).uid;
  const not = addInstance(d, 'NOT', 200, 0).uid;
  connect(d, lib, pin(SELF, 'a'), pin(and, 'a'));
  connect(d, lib, pin(SELF, 'b'), pin(and, 'b'));
  connect(d, lib, pin(and, 'out'), pin(not, 'in'));
  connect(d, lib, pin(not, 'out'), pin(SELF, 'out'));
  return d;
}

describe('내 칩', () => {
  it('이름 규칙: 대문자 시작, 예약어(내장·캠페인 칩) 금지, 중복은 exists', () => {
    const s = putChip(emptyCustomStore(), toChipDef(myNandDoc(), 'MYNAND'), myNandDoc(), {});
    expect(checkChipName('mynand', s)).toBe('format');
    expect(checkChipName('1ABC', s)).toBe('format');
    expect(checkChipName('NAND', s)).toBe('reserved');
    expect(checkChipName('CPU', s)).toBe('reserved'); // 아직 안 깬 캠페인 칩도 예약
    expect(checkChipName('MYNAND', s)).toBe('exists');
    expect(checkChipName('MY_CHIP2', s)).toBeNull();
  });

  it('저장한 칩을 다른 회로에서 쓰고, 쓰는 칩이 있으면 dependents로 알 수 있다', () => {
    let s = putChip(emptyCustomStore(), toChipDef(myNandDoc(), 'MYNAND'), myNandDoc(), { description: 'nand' });
    const lib = createLibrary([...campaign, ...Object.values(s.chips)]);
    const d = emptyDoc();
    addIO(d, 'input', 0, 0);
    addIO(d, 'output', 300, 0);
    const u = addInstance(d, 'MYNAND', 100, 0).uid;
    connect(d, lib, pin(SELF, 'a'), pin(u, 'a'));
    connect(d, lib, pin(SELF, 'a'), pin(u, 'b'));
    connect(d, lib, pin(u, 'out'), pin(SELF, 'out'));
    expect(generateTruthTable(toChipDef(d), lib).map((r) => r.out[0])).toEqual([1, 0]); // NOT
    s = putChip(s, toChipDef(d, 'MYNOT'), d, {});
    expect(dependentsOf(s, 'MYNAND')).toEqual(['MYNOT']);
    s = removeChip(s, 'MYNOT');
    expect(Object.keys(s.chips)).toEqual(['MYNAND']);
    expect(s.meta.MYNAND?.description).toBe('nand');
  });
});

describe('공유 묶음', () => {
  it('회로가 쓰는 칩을 안쪽까지 모은다 (안쪽이 먼저)', () => {
    const lib = createLibrary(campaign);
    const d = emptyDoc();
    addInstance(d, 'XOR', 0, 0);
    const ids = collectChips(d, lib).map((c) => c.id);
    expect(ids[ids.length - 1]).toBe('XOR');
    expect(ids).not.toContain('NAND');
  });

  it('링크 문자열로 인코딩했다가 그대로 되돌린다', async () => {
    const lib = createLibrary(campaign);
    const b = makeBundle(myNandDoc(), lib);
    const code = await encodeBundle(b);
    expect(code).toMatch(/^[zj][\w-]+$/);
    expect(await decodeBundle(code)).toEqual(b);
    expect(await decodeBundle('zgarbage')).toBeNull();
    expect(parseBundle({ format: 'x' })).toBeNull();
  });
});

describe('픽셀 화면', () => {
  it('0xE0 + 2y는 왼쪽 8칸(최상위 비트가 맨 왼쪽), 다음 바이트는 오른쪽 8칸', () => {
    const mem = new Uint8Array(256);
    mem[0xe0] = 0x80; // (0, 0)
    mem[0xe1] = 0x01; // (15, 0)
    mem[0xfe] = 0x40; // (1, 15)
    const px = screenPixels(mem);
    expect(px[0]![0]).toBe(true);
    expect(px[0]![15]).toBe(true);
    expect(px[15]![1]).toBe(true);
    expect(px.flat().filter(Boolean)).toHaveLength(3);
  });
});

describe('도전 과제', () => {
  it('빈 기록이면 아무것도 달성하지 않았고, 플래그로 판정하는 과제는 플래그로 달성', () => {
    const base = { progress: emptyProgress(), custom: emptyCustomStore(), flags: new Set<'pixel' | 'shared'>() };
    expect(evaluateAchievements(base).filter((x) => x.done)).toEqual([]);
    const done = evaluateAchievements({ ...base, flags: new Set(['pixel'] as const) }).filter((x) => x.done).map((x) => x.a.id);
    expect(done).toEqual(['pixel']);
  });
});
