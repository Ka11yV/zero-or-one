import { describe, expect, it } from 'vitest';
import { toChipDef } from '../../src/editor/doc';
import { levelStartDoc } from '../../src/game/levelDoc';
import { isProgramLevel, LEVELS } from '../../src/levels';

describe('레벨 시작 회로', () => {
  for (const level of LEVELS) {
    if (isProgramLevel(level)) continue;
    it(`${level.id}: 입출력 핀이 레벨 명세와 같고 선·부품은 비어 있다`, () => {
      const def = toChipDef(levelStartDoc(level));
      expect(def.inputs).toEqual(level.inputs);
      expect(def.outputs).toEqual(level.outputs);
      expect(def.instances).toEqual([]);
      expect(def.wires).toEqual([]);
    });
  }
});
