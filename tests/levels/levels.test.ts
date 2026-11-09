import { describe, expect, it } from 'vitest';
import { assemble, emulate } from '../../src/cpu/isa';
import { runProgram } from '../../src/cpu/run';
import { CHAPTERS, isProgramLevel, LEVELS, solutionChip, type CircuitLevel, type ProgramLevel } from '../../src/levels';
import { BUILTINS, compile, createLibrary, measure, runTest, type ChipDef } from '../../src/sim';
import { emptyProgress, isUnlocked, recordClear, starsFor, unlockedChips } from '../../src/storage/progress';
import { emptyDoc } from '../../src/editor/doc';

const builtinIds = new Set(BUILTINS.map((b) => b.id));

describe('캠페인 레벨', () => {
  // 앞 레벨부터 차례로 참조 정답을 칩으로 만들어 라이브러리에 쌓는다 (플레이어와 같은 순서)
  const madeChips: ChipDef[] = [];
  const unlockedSoFar = new Set<string>(builtinIds);

  for (const level of LEVELS) {
    if (isProgramLevel(level)) {
      describe(`${level.id} ${level.text.ko.title} (프로그램)`, () => programLevelTests(level, () => madeChips));
      continue;
    }
    describe(`${level.id} ${level.text.ko.title}`, () => {
      // 8장(CPU)은 RAM256이 들어가므로 빠른 모드(검증된 칩)로 돌린다 — 게이트 수준과의 동등성은 functional.test에서 확인
      const lib = createLibrary(madeChips.map((c) => (level.chapter >= 8 ? { ...c, verified: true } : c)));
      const available = new Set(unlockedSoFar);
      const sol = solutionChip(level, `SOL_${level.id}`);

      it('허용 칩은 내장 칩이거나 이전 레벨에서 해금된 칩', () => {
        for (const c of level.allowedChips) expect(available.has(c), c).toBe(true);
      });

      it('참조 정답은 허용 칩만 사용', () => {
        for (const inst of sol.instances) expect(level.allowedChips, inst.chip).toContain(inst.chip);
      });

      it('참조 정답이 테스트를 통과', () => {
        const res = runTest(sol, lib, level.test);
        expect(res.error).toBeUndefined();
        expect(res.rows.filter((r) => !r.ok)).toEqual([]);
      });

      if (level.stars) {
        it(`별점 목표(NAND ≤ ${level.stars.maxNand})는 달성 가능`, () => {
          expect(measure(compile(sol, lib)).nandCount).toBeLessThanOrEqual(level.stars!.maxNand);
        });
      }

      it('한/영 텍스트가 모두 채워져 있음', () => checkText(level.text));

      if (level.unlocks) {
        it('해금 칩 id가 내장 칩과 겹치지 않음', () => expect(builtinIds.has(level.unlocks!.chipId)).toBe(false));
      }

      // 다음 레벨을 위해 이 레벨의 칩을 등록
      if (level.unlocks) {
        madeChips.push(solutionChip(level));
        unlockedSoFar.add(level.unlocks.chipId);
      }
    });
  }

  it('레벨 id 중복 없음', () => {
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length);
  });

  it('챕터 9개 (0~8)', () => {
    expect(CHAPTERS.map((c) => c.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

function checkText(text: ProgramLevel['text']) {
  for (const lang of ['ko', 'en'] as const) {
    const t = text[lang];
    expect(t.title && t.briefing && t.principle.title && t.principle.body).toBeTruthy();
    expect(t.hints.every((h) => h.length > 0)).toBe(true);
  }
}

function programLevelTests(level: ProgramLevel, chips: () => ChipDef[]) {
  const asm = assemble(level.solution);
  const imageFor = (mem: Record<number, number> = {}) => {
    const img = new Uint8Array(asm.image);
    for (const [a, v] of Object.entries(mem)) img[Number(a)] = v;
    return img;
  };

  it('참조 프로그램은 오류 없이 어셈블된다', () => expect(asm.errors).toEqual([]));

  it('기준 에뮬레이터로 모든 경우를 통과', () => {
    for (const c of level.cases) {
      const r = emulate(imageFor(c.mem), c.input ?? 0, level.maxCycles);
      expect(r.halted).toBe(true);
      expect(r.outs).toEqual(c.outs);
    }
  });

  it('참조 CPU 회로(8-5 정답)에서 실제로 실행해도 통과', () => {
    const lib = createLibrary(chips().map((c) => ({ ...c, verified: true })));
    const cpu = lib.get('CPU')!;
    for (const c of level.cases) {
      const r = runProgram(cpu, lib, imageFor(c.mem), c.input ?? 0, level.maxCycles);
      expect(r.halted).toBe(true);
      expect(r.outs).toEqual(c.outs);
      expect(r.cycles).toBe(emulate(imageFor(c.mem), c.input ?? 0, level.maxCycles).cycles);
    }
  });

  if (level.stars) {
    it(`별점 목표(${level.stars.maxBytes}바이트)는 달성 가능`, () => expect(asm.size).toBeLessThanOrEqual(level.stars!.maxBytes));
  }

  it('시작 코드는 어셈블된다', () => {
    for (const lang of ['ko', 'en'] as const) expect(assemble(level.starter[lang]).errors).toEqual([]);
  });

  it('한/영 텍스트가 모두 채워져 있음', () => checkText(level.text));
}

describe('진행 상태', () => {
  it('첫 레벨만 열려 있고, 클리어하면 다음 레벨이 열린다', () => {
    let p = emptyProgress();
    expect(isUnlocked(p, LEVELS[0]!.id)).toBe(true);
    expect(isUnlocked(p, LEVELS[1]!.id)).toBe(false);
    p = recordClear(p, LEVELS[0]!, emptyDoc(), null, 0);
    expect(isUnlocked(p, LEVELS[1]!.id)).toBe(true);
  });

  it('클리어하면 칩이 해금되고, 별점은 최고 기록 유지', () => {
    const not = LEVELS.find((l) => l.id === '1-1') as CircuitLevel;
    let p = recordClear(emptyProgress(), not, emptyDoc(), solutionChip(not), 1);
    expect(p.levels['1-1']).toMatchObject({ cleared: true, stars: 3, bestNand: 1 });
    expect(unlockedChips(p)).toEqual(['NOT']);
    expect(p.chips.NOT!.verified).toBe(true);
    p = recordClear(p, not, emptyDoc(), solutionChip(not), 5);
    expect(p.levels['1-1']).toMatchObject({ stars: 3, bestNand: 1 });
  });

  it('별점: 목표 이하 ★★★, 1.5배 이하 ★★, 그 외 ★', () => {
    const xor = LEVELS.find((l) => l.id === '1-5')!; // maxNand 4
    expect(starsFor(xor, 4)).toBe(3);
    expect(starsFor(xor, 6)).toBe(2);
    expect(starsFor(xor, 9)).toBe(1);
  });
});
