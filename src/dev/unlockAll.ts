// 테스트 서버(localhost:5318) 전용 확인 도구. main.ts에서 VITE_TEST_SERVER일 때만 불러온다.
import { emptyDoc } from '../editor/doc';
import { getLang } from '../i18n';
import { CHAPTERS, getLevel, isProgramLevel, LEVELS, nextLevel, solutionChip } from '../levels';
import { CHIP_SUMMARY } from '../levels/chipInfo';
import { createLibrary, type ChipDef } from '../sim';
import { nandCountOf } from '../sim/netlist';
import { emptyProgress, recordClear, saveProgress } from '../storage/progress';
import { showClear } from '../ui/modal';

const guard = () => {
  if (location.port !== '5318') throw new Error('test server only');
};

/** upTo 레벨 직전까지 참조 정답으로 클리어한 진행 기록을 만든다 (이 서버의 저장소만 바뀜) */
export function devUnlockAll(upTo?: string): void {
  guard();
  let p = emptyProgress();
  for (const l of LEVELS) {
    if (upTo && l.id === upTo) break;
    p = isProgramLevel(l) ? recordClear(p, l, null, null, 0) : recordClear(p, l, emptyDoc(), l.unlocks ? solutionChip(l) : null, 0);
  }
  saveProgress(p);
}

/** 레벨을 풀지 않고 클리어 연출만 재생한다 */
export function devCelebrate(id: string, opts: { stars?: number; prevStars?: number; first?: boolean; score?: number } = {}): void {
  guard();
  const level = getLevel(id);
  if (!level) throw new Error(`no level ${id}`);
  const chips: ChipDef[] = LEVELS.flatMap((l) => (!isProgramLevel(l) && l.unlocks ? [solutionChip(l)] : []));
  const lib = createLibrary(chips);
  const chapter = CHAPTERS.find((c) => c.id === level.chapter)!;
  const next = nextLevel(id);
  const nextChapter = CHAPTERS.find((c) => c.id === level.chapter + 1);
  const chip = level.unlocks ? lib.get(level.unlocks.chipId) : undefined;
  const goal = level.stars ? ('maxNand' in level.stars ? level.stars.maxNand : level.stars.maxBytes) : undefined;
  showClear({
    level,
    next,
    onNext: () => undefined,
    onMap: () => undefined,
    celebration: {
      firstClear: opts.first ?? true,
      prevStars: opts.prevStars ?? 0,
      stars: opts.stars ?? 3,
      score: opts.score ?? goal ?? 10,
      goal,
      unit: isProgramLevel(level) ? 'bytes' : 'nand',
      unlocked: chip ? { spec: chip, nand: nandCountOf(chip, lib), summary: CHIP_SUMMARY[chip.id]?.[getLang()] ?? '' } : undefined,
      chapterDone:
        chapter.levels[chapter.levels.length - 1]?.id === id
          ? { no: chapter.id, title: chapter.title[getLang()], nextTitle: nextChapter ? `${nextChapter.id} · ${nextChapter.title[getLang()]}` : undefined }
          : undefined,
      ending: !next ? { cpuNand: nandCountOf(lib.get('CPU')!, lib) } : undefined,
    },
  });
}
