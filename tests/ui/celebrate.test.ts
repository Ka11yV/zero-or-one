import { describe, expect, it } from 'vitest';
import { planCelebration, type CelebrationInfo } from '../../src/ui/celebrate';
import { chipArtLayout } from '../../src/ui/fx/chipArt';

const base: CelebrationInfo = { firstClear: true, prevStars: 0, stars: 3, score: 5, goal: 5, unit: 'nand' };
const neg4 = { id: 'NEG4', inputs: [{ name: 'in', width: 4 }], outputs: [{ name: 'out', width: 4 }] };

describe('클리어 연출 계획', () => {
  it('첫 클리어 ★★★: 플래시, 별 0→3, 대형 폭죽, 컨페티, 목표 배지', () => {
    expect(planCelebration(base)).toMatchObject({ flash: true, starsFrom: 0, starsTo: 3, bigFireworks: true, confetti: true, goalBadge: true, unlock: false });
  });

  it('첫 클리어 + 칩 해금이면 해금 세리머니', () => {
    expect(planCelebration({ ...base, unlocked: { spec: neg4, nand: 30, summary: '' } }).unlock).toBe(true);
  });

  it('첫 클리어 ★: 대형 폭죽 없음, 목표 배지 없음', () => {
    const p = planCelebration({ ...base, stars: 1, score: 20 });
    expect(p).toMatchObject({ bigFireworks: false, goalBadge: false, starsTo: 1 });
  });

  it('재클리어: 해금·플래시 없음, 늘어난 별만', () => {
    const p = planCelebration({ ...base, firstClear: false, prevStars: 2, stars: 3, unlocked: { spec: neg4, nand: 30, summary: '' } });
    expect(p).toMatchObject({ flash: false, unlock: false, starsFrom: 2, starsTo: 3, bigFireworks: true });
  });

  it('재클리어로 별이 줄어도 최고 기록으로 보여 주고, 큰 연출은 없다', () => {
    const p = planCelebration({ ...base, firstClear: false, prevStars: 3, stars: 1, score: 50 });
    expect(p).toMatchObject({ starsFrom: 3, starsTo: 3, bigFireworks: false, confetti: false, goalBadge: false });
  });

  it('챕터 마지막 레벨은 배너, 마지막 레벨은 엔딩 탑(배너 대신)', () => {
    const chapterDone = { no: 3, title: '1+1=10' };
    expect(planCelebration({ ...base, chapterDone })).toMatchObject({ chapterBanner: true, endingTower: false, bigFireworks: true });
    expect(planCelebration({ ...base, chapterDone, ending: { cpuNand: 59176 } })).toMatchObject({ chapterBanner: false, endingTower: true });
    expect(planCelebration({ ...base, firstClear: false, prevStars: 3, chapterDone, ending: { cpuNand: 1 } })).toMatchObject({ chapterBanner: false, endingTower: false });
  });
});

describe('칩 그림 배치', () => {
  it('핀 수와 라벨이 칩 정의와 같고, 다비트 핀은 폭을 표시', () => {
    const L = chipArtLayout(neg4);
    expect(L.pins.map((p) => [p.side, p.label])).toEqual([
      ['in', 'in[4]'],
      ['out', 'out[4]'],
    ]);
  });

  it('핀이 많으면 칩이 길어지고, 모든 핀이 몸체 안 높이에 있다', () => {
    const big = chipArtLayout({
      id: 'CPU',
      inputs: ['run', 'pa', 'pd', 'pw', 'in', 'reset', 'clk'].map((name) => ({ name, width: 1 })),
      outputs: ['out', 'ow', 'halt', 'pc', 'a'].map((name) => ({ name, width: 1 })),
    });
    expect(big.pins).toHaveLength(12);
    expect(big.body.h).toBeGreaterThan(chipArtLayout(neg4).body.h);
    for (const p of big.pins) expect(p.y > big.body.y && p.y < big.body.y + big.body.h).toBe(true);
  });
});
