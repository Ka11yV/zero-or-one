// 클리어 연출: 도장 → 별 → 점수 카운트업 → (새 칩 해금 세리머니) → (챕터 완료 배너 | 엔딩 탑)
// 클릭·Space·Esc로 언제든 건너뛸 수 있고, 건너뛰면 모든 요소가 최종 상태로 바로 보인다.
import { t } from '../i18n';
import { h } from './dom';
import { chipArt, type ChipArtSpec } from './fx/chipArt';
import { burst, burstAt, clearParticles, confetti, fireworksShow, reducedMotion, sparkle } from './fx/particles';
import { sfx } from './fx/sound';

export interface CelebrationInfo {
  /** 이 레벨을 처음 깼는가 */
  firstClear: boolean;
  /** 이전 최고 별점 (처음이면 0) */
  prevStars: number;
  /** 이번 별점 */
  stars: number;
  /** 점수 (NAND 개수 또는 프로그램 바이트) */
  score: number;
  goal?: number;
  unit: 'nand' | 'bytes';
  unlocked?: { spec: ChipArtSpec; nand: number; summary: string };
  chapterDone?: { no: number; title: string; nextTitle?: string };
  ending?: { cpuNand: number };
}

export interface CelebrationPlan {
  flash: boolean;
  /** 이미 채워진 채로 시작하는 별 수 */
  starsFrom: number;
  /** 최종 표시 별 수 */
  starsTo: number;
  countUp: boolean;
  goalBadge: boolean;
  bigFireworks: boolean;
  confetti: boolean;
  unlock: boolean;
  chapterBanner: boolean;
  endingTower: boolean;
}

/** 어떤 연출을 할지 (순수 함수 — 테스트 대상) */
export function planCelebration(info: CelebrationInfo): CelebrationPlan {
  const best = Math.max(info.prevStars, info.stars);
  const goalMet = info.goal !== undefined && info.score <= info.goal;
  if (info.firstClear) {
    return {
      flash: true,
      starsFrom: 0,
      starsTo: best,
      countUp: true,
      goalBadge: goalMet,
      bigFireworks: best === 3 || !!info.chapterDone || !!info.ending,
      confetti: true,
      unlock: !!info.unlocked,
      chapterBanner: !!info.chapterDone && !info.ending,
      endingTower: !!info.ending,
    };
  }
  const improved = info.stars > info.prevStars;
  return {
    flash: false,
    starsFrom: Math.min(info.prevStars, best),
    starsTo: best,
    countUp: true,
    goalBadge: goalMet && improved,
    bigFireworks: improved && best === 3,
    confetti: improved,
    unlock: false,
    chapterBanner: false,
    endingTower: false,
  };
}

const STAR_PATH = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z';

function starSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'fx-star');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', STAR_PATH);
  svg.append(p);
  return svg;
}

const TOWER = ['NAND', 'NOT · AND · OR · XOR', 'MUX · DEC · ADD', 'LATCH · DFF · REG', 'RAM', 'ALU · CONTROL', 'CPU'];

export interface CelebrationHandle {
  /** 연출이 끝나면(또는 건너뛰면) 풀린다 */
  done: Promise<void>;
  skip(): void;
  dispose(): void;
}

/**
 * stage 안에 연출을 그린다. root는 건너뛰기 클릭을 받을 요소(모달 카드).
 */
export function celebrate(stage: HTMLElement, root: HTMLElement, info: CelebrationInfo): CelebrationHandle {
  const plan = planCelebration(info);
  let skipped = reducedMotion();
  const pending = new Set<() => void>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const wait = (ms: number) =>
    skipped
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          const id = setTimeout(() => {
            timers.delete(id);
            pending.delete(resolve);
            resolve();
          }, ms);
          timers.add(id);
          pending.add(resolve);
        });

  const skip = () => {
    if (skipped) return;
    skipped = true;
    stage.classList.add('fx-done');
    for (const id of timers) clearTimeout(id);
    timers.clear();
    for (const r of [...pending]) r();
    pending.clear();
  };

  // ---------- 무대 구성 (최종 상태를 먼저 만들고 애니메이션 클래스를 단다) ----------
  stage.textContent = '';
  stage.classList.add('clear-stage');
  if (skipped) stage.classList.add('fx-done');

  const stamp = h('div', { class: 'fx-stamp' });
  stamp.innerHTML = `<svg viewBox="0 0 320 76" role="img"><defs><linearGradient id="fx-stamp-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6d8"/><stop offset=".45" stop-color="#ffcf5c"/><stop offset="1" stop-color="#ff9a2e"/></linearGradient></defs><text x="160" y="60" text-anchor="middle"></text></svg>`;
  stamp.querySelector('text')!.textContent = t('fx.clear');
  const starEls = [0, 1, 2].map(() => starSvg());
  starEls.forEach((s, i) => s.classList.toggle('on', i < plan.starsFrom));
  const starsRow = h('div', { class: 'fx-stars' }, ...starEls);
  const scoreNum = h('span', { class: 'fx-score-num' }, String(plan.countUp && !skipped ? 0 : info.score));
  const scoreLine = h(
    'div',
    { class: 'fx-score' },
    scoreNum,
    h('span', { class: 'fx-score-unit' }, info.unit === 'nand' ? t('fx.nandUnit') : t('fx.bytesUnit')),
    info.goal !== undefined ? h('span', { class: 'fx-goal muted' }, t('fx.goal', { n: info.goal })) : null,
  );
  const goalBadge = h('span', { class: 'fx-goal-badge', hidden: '' }, t('fx.goalMet'));
  scoreLine.append(goalBadge);
  const extra = h('div', { class: 'fx-extra' });
  stage.append(stamp, starsRow, scoreLine, extra);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      if (!skipped) {
        e.preventDefault();
        e.stopPropagation();
        skip();
      }
    }
  };
  const onDown = (e: Event) => {
    if ((e.target as HTMLElement).closest('button')) return;
    skip();
  };
  window.addEventListener('keydown', onKey, true);
  root.addEventListener('pointerdown', onDown);

  let overlay: HTMLElement | null = null;

  const showFinal = () => {
    starEls.forEach((s, i) => s.classList.toggle('on', i < plan.starsTo));
    scoreNum.textContent = String(info.score);
    goalBadge.hidden = !plan.goalBadge;
  };

  // ---------- 단계 ----------
  const run = async () => {
    // 1) 플래시 + 도장
    if (plan.flash && !skipped) {
      const flash = h('div', { class: 'fx-flash' });
      document.body.append(flash);
      setTimeout(() => flash.remove(), 700);
    }
    stamp.classList.add('in');
    sfx.pop();
    if (!skipped && !plan.flash) burstAt(stamp, { count: 50, power: 300 });
    await wait(plan.flash ? 450 : 250);

    // 2) 별
    for (let i = plan.starsFrom; i < plan.starsTo; i++) {
      if (skipped) break;
      const s = starEls[i]!;
      s.classList.add('on', 'pop');
      sfx.star(i);
      burstAt(s, { count: 26, power: 220, colors: ['#ffe14d', '#ffb547', '#ffffff'] });
      await wait(380);
    }
    if (plan.bigFireworks && !skipped) {
      sfx.fanfare();
      fireworksShow(info.ending ? 8 : info.chapterDone ? 6 : 3, 240, () => sfx.boom());
    }
    if (plan.confetti && !skipped) confetti(plan.bigFireworks ? 200 : 90);

    // 3) 점수 카운트업
    if (plan.countUp && !skipped) {
      const dur = 700;
      const t0 = performance.now();
      let lastTick = 0;
      await new Promise<void>((resolve) => {
        pending.add(resolve);
        const step = (now: number) => {
          if (skipped) return resolve();
          const k = Math.min(1, (now - t0) / dur);
          const v = Math.round(info.score * (1 - (1 - k) ** 3));
          scoreNum.textContent = String(v);
          if (now - lastTick > 60 && k < 1) {
            sfx.tick();
            lastTick = now;
          }
          if (k < 1) requestAnimationFrame(step);
          else {
            pending.delete(resolve);
            resolve();
          }
        };
        requestAnimationFrame(step);
      });
    }
    showFinal();
    if (plan.goalBadge) goalBadge.classList.add('pop');
    await wait(plan.goalBadge ? 450 : 150);

    // 4) 새 칩 해금 세리머니
    if (plan.unlock && info.unlocked) {
      const badge = h('div', { class: 'fx-unlock-badge' }, h('span', { class: 'fx-ub-label' }, t('fx.newChip')), h('strong', {}, info.unlocked.spec.id));
      if (skipped) extra.append(badge);
      else {
        await unlockCeremony(info.unlocked, badge);
      }
    }

    // 5) 챕터 완료 배너
    if (plan.chapterBanner && info.chapterDone) {
      const c = info.chapterDone;
      const banner = h(
        'div',
        { class: 'fx-chapter' },
        h('div', { class: 'fx-ribbon' }, t('fx.chapterDone', { n: c.no })),
        h('div', { class: 'fx-chapter-title' }, c.title),
        c.nextTitle ? h('div', { class: 'fx-chapter-next' }, t('fx.nextChapter', { title: c.nextTitle })) : null,
      );
      extra.append(banner);
      if (!skipped) {
        sparkle(banner.getBoundingClientRect(), 30);
        await wait(700);
      }
    }

    // 6) 엔딩 탑
    if (plan.endingTower && info.ending) {
      const tower = h('div', { class: 'fx-tower' });
      const floors = TOWER.map((name, i) => h('div', { class: 'fx-floor', style: `--i:${i}` }, name));
      // 아래층부터 쌓이도록 역순으로 넣는다 (column-reverse)
      tower.append(...floors);
      const nandNum = h('strong', { class: 'fx-ending-num' }, skipped ? info.ending.cpuNand.toLocaleString() : '0');
      const caption = h('p', { class: 'fx-ending-caption' }, t('fx.endingLead'), ' ', nandNum, ' ', t('fx.endingTail'));
      extra.append(h('div', { class: 'fx-ending' }, tower, caption));
      for (let i = 0; i < floors.length; i++) {
        if (skipped) break;
        floors[i]!.classList.add('up');
        sfx.rise(i);
        sparkle(floors[i]!.getBoundingClientRect(), 10);
        await wait(320);
      }
      floors.forEach((f) => f.classList.add('up'));
      if (!skipped) {
        fireworksShow(10, 200, () => sfx.boom());
        const target = info.ending.cpuNand;
        const t0 = performance.now();
        await new Promise<void>((resolve) => {
          pending.add(resolve);
          const step = (now: number) => {
            if (skipped) return resolve();
            const k = Math.min(1, (now - t0) / 1600);
            nandNum.textContent = Math.round(target * (1 - (1 - k) ** 3)).toLocaleString();
            if (k < 1) requestAnimationFrame(step);
            else resolve();
          };
          requestAnimationFrame(step);
        });
      }
      nandNum.textContent = info.ending.cpuNand.toLocaleString();
    }
  };

  /** 화면 가득 해금 연출 → [획득!]을 누르면 배지가 결과 영역으로 날아가 안착 */
  const unlockCeremony = async (u: NonNullable<CelebrationInfo['unlocked']>, badge: HTMLElement) => {
    const art = chipArt(u.spec);
    const claim = h('button', { type: 'button', class: 'btn primary fx-claim' }, t('fx.claim'));
    const card = h(
      'div',
      { class: 'fx-unlock-card' },
      h('div', { class: 'fx-unlock-ribbon' }, t('fx.newChip')),
      h('div', { class: 'fx-unlock-art' }, art),
      h('div', { class: 'fx-unlock-name' }, u.spec.id),
      h('p', { class: 'fx-unlock-summary' }, u.summary),
      h('p', { class: 'fx-unlock-nand muted' }, t('fx.madeOf', { n: u.nand.toLocaleString() })),
      claim,
    );
    overlay = h('div', { class: 'fx-unlock' }, h('div', { class: 'fx-rays' }), card);
    overlay.addEventListener('pointerdown', (e) => {
      if (!(e.target as HTMLElement).closest('button')) skip();
    });
    document.body.append(overlay);
    sfx.unlock();
    await wait(900);
    if (!skipped) {
      burstAt(art, { count: 120, power: 520 });
      sparkle(card.getBoundingClientRect(), 40);
    }
    claim.focus();
    // [획득!] 또는 건너뛰기까지 기다린다
    await new Promise<void>((resolve) => {
      pending.add(resolve);
      claim.onclick = () => {
        pending.delete(resolve);
        resolve();
      };
    });
    extra.append(badge);
    const ov = overlay;
    overlay = null;
    if (!skipped && ov) {
      // 카드 → 배지 자리로 날아가기 (FLIP)
      const from = card.getBoundingClientRect();
      const to = badge.getBoundingClientRect();
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);
      const s = Math.max(0.08, to.width / from.width);
      ov.classList.add('leaving');
      card.style.transition = 'transform 0.55s cubic-bezier(.5,-0.2,.4,1), opacity 0.55s';
      card.style.transform = `translate(${dx}px, ${dy}px) scale(${s})`;
      card.style.opacity = '0.2';
      badge.classList.add('arrive');
      await wait(560);
      burst(to.left + to.width / 2, to.top + to.height / 2, { count: 40, power: 260 });
      sfx.star(2);
    }
    ov?.remove();
  };

  const done = run()
    .catch(() => undefined)
    .finally(() => {
      showFinal();
      stage.classList.add('fx-done');
      overlay?.remove();
      window.removeEventListener('keydown', onKey, true);
      root.removeEventListener('pointerdown', onDown);
    });

  return {
    done,
    skip,
    dispose() {
      skip();
      overlay?.remove();
      clearParticles();
      window.removeEventListener('keydown', onKey, true);
      root.removeEventListener('pointerdown', onDown);
    },
  };
}
