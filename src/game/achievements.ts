// 도전 과제: 진행 기록·내 칩·플래그로 판정한다. 플래그는 진행 기록과 별개 키에 저장.
import type { Lang } from '../i18n';
import { isProgramLevel, LEVELS } from '../levels';
import { nandCountOf } from '../sim/netlist';
import type { CustomChipStore } from '../storage/customChips';
import { notifyLocalChange } from '../storage/changes';
import { levelRecord, libraryFor, type Progress } from '../storage/progress';

const FLAG_KEY = 'logic-game:achv-flags';
export type AchvFlag = 'pixel' | 'shared';

export function readFlags(): Set<AchvFlag> {
  try {
    return new Set(JSON.parse(globalThis.localStorage?.getItem(FLAG_KEY) ?? '[]') as AchvFlag[]);
  } catch {
    return new Set();
  }
}

export function writeFlags(s: Set<AchvFlag>): void {
  try {
    globalThis.localStorage?.setItem(FLAG_KEY, JSON.stringify([...s]));
  } catch {
    /* 저장 불가 */
  }
}

export function setFlag(f: AchvFlag): void {
  const s = readFlags();
  if (s.has(f)) return;
  s.add(f);
  writeFlags(s);
  notifyLocalChange();
}

export interface AchvContext {
  progress: Progress;
  custom: CustomChipStore;
  flags: Set<AchvFlag>;
}

export interface Achievement {
  id: string;
  icon: string;
  title: Record<Lang, string>;
  desc: Record<Lang, string>;
  done(c: AchvContext): boolean;
}

const cleared = (c: AchvContext, id: string) => levelRecord(c.progress, id).cleared;
const best = (c: AchvContext, id: string) => levelRecord(c.progress, id).bestNand;
const chapterStars = (c: AchvContext, ch: number) => {
  const ls = LEVELS.filter((l) => l.chapter === ch);
  return ls.length > 0 && ls.every((l) => levelRecord(c.progress, l.id).stars === 3);
};

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-chip',
    icon: '🔌',
    title: { ko: '첫 칩', en: 'First Chip' },
    desc: { ko: 'NAND로 첫 칩(NOT)을 만든다', en: 'Build your first chip (NOT) from NAND' },
    done: (c) => !!c.progress.chips.NOT,
  },
  {
    id: 'xor4',
    icon: '✂️',
    title: { ko: '군더더기 없는 XOR', en: 'Lean XOR' },
    desc: { ko: 'XOR를 NAND 4개로 만든다', en: 'Build XOR from 4 NAND gates' },
    done: (c) => (best(c, '1-5') ?? Infinity) <= 4,
  },
  {
    id: 'fa9',
    icon: '➕',
    title: { ko: '전가산기 장인', en: 'Full-Adder Artisan' },
    desc: { ko: '전가산기를 NAND 9개 이하로 만든다', en: 'Build a full adder with 9 NAND gates or fewer' },
    done: (c) => (best(c, '3-2') ?? Infinity) <= 9,
  },
  {
    id: 'ch1-stars',
    icon: '⭐',
    title: { ko: '기본기 완벽', en: 'Perfect Basics' },
    desc: { ko: '챕터 1의 모든 레벨 ★★★', en: 'Three stars on every level of chapter 1' },
    done: (c) => chapterStars(c, 1),
  },
  {
    id: 'ram',
    icon: '🗄️',
    title: { ko: '256바이트', en: '256 Bytes' },
    desc: { ko: 'RAM 256칸을 완성한다', en: 'Complete the 256-cell RAM' },
    done: (c) => cleared(c, '6-3'),
  },
  {
    id: 'calc',
    icon: '🧮',
    title: { ko: '내가 만든 계산기', en: 'Homemade Calculator' },
    desc: { ko: '계산기 보스를 깬다', en: 'Beat the calculator boss' },
    done: (c) => cleared(c, '7-B'),
  },
  {
    id: 'cpu',
    icon: '🧠',
    title: { ko: '컴퓨터 탄생', en: 'A Computer Is Born' },
    desc: { ko: 'CPU를 조립한다', en: 'Assemble the CPU' },
    done: (c) => !!c.progress.chips.CPU,
  },
  {
    id: 'cpu-small',
    icon: '🪶',
    title: { ko: '날씬한 CPU', en: 'Slim CPU' },
    desc: { ko: 'NAND 50,000개 이하로 CPU를 만든다 (RAM 포함)', en: 'Build a CPU with at most 50,000 NAND gates (RAM included)' },
    done: (c) => {
      const cpu = c.progress.chips.CPU;
      if (!cpu) return false;
      try {
        return nandCountOf(cpu, libraryFor(c.progress)) <= 50000;
      } catch {
        return false;
      }
    },
  },
  {
    id: 'programs',
    icon: '📜',
    title: { ko: '어셈블리 달인', en: 'Assembly Master' },
    desc: { ko: '모든 프로그램 레벨 ★★★', en: 'Three stars on every program level' },
    done: (c) => {
      const ps = LEVELS.filter(isProgramLevel);
      return ps.length > 0 && ps.every((l) => levelRecord(c.progress, l.id).stars === 3);
    },
  },
  {
    id: 'all-stars',
    icon: '🏆',
    title: { ko: '완벽주의자', en: 'Perfectionist' },
    desc: { ko: '모든 레벨 ★★★', en: 'Three stars on every level' },
    done: (c) => LEVELS.every((l) => levelRecord(c.progress, l.id).stars === 3),
  },
  {
    id: 'custom',
    icon: '💾',
    title: { ko: '나만의 칩', en: 'My Own Chip' },
    desc: { ko: '샌드박스에서 회로를 칩으로 저장한다', en: 'Save a sandbox circuit as a chip' },
    done: (c) => Object.values(c.custom.meta).some((m) => !m.imported),
  },
  {
    id: 'nested',
    icon: '🪆',
    title: { ko: '칩 속의 칩', en: 'Chips in Chips' },
    desc: { ko: '내 칩 안에 다른 내 칩을 넣는다', en: 'Use one of your chips inside another of your chips' },
    done: (c) => Object.values(c.custom.chips).some((d) => d.instances.some((i) => !!c.custom.chips[i.chip])),
  },
  {
    id: 'pixel',
    icon: '🖼️',
    title: { ko: '첫 픽셀', en: 'First Pixel' },
    desc: { ko: '픽셀 화면(메모리 0xE0~0xFF)에 점을 찍는다', en: 'Light a pixel on the screen (memory 0xE0–0xFF)' },
    done: (c) => c.flags.has('pixel'),
  },
  {
    id: 'shared',
    icon: '📤',
    title: { ko: '자랑하기', en: 'Show-off' },
    desc: { ko: '회로를 공유 링크나 파일로 내보낸다', en: 'Export a circuit as a share link or file' },
    done: (c) => c.flags.has('shared'),
  },
];

export function evaluateAchievements(c: AchvContext): { a: Achievement; done: boolean }[] {
  return ACHIEVEMENTS.map((a) => ({ a, done: a.done(c) }));
}
