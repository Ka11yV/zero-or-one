import { describe, expect, it } from 'vitest';
import { LEVELS } from '../../src/levels';
import { CHIP_SUMMARY } from '../../src/levels/chipInfo';

describe('칩 설명', () => {
  it('레벨에서 해금되는 모든 칩에 한국어/영어 설명이 있다', () => {
    for (const l of LEVELS) {
      const id = l.unlocks?.chipId;
      if (!id) continue;
      expect(CHIP_SUMMARY[id]?.ko, id).toBeTruthy();
      expect(CHIP_SUMMARY[id]?.en, id).toBeTruthy();
    }
  });
});
