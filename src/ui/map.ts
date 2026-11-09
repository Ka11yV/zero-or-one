import { getLang, onLangChange, setLang, t } from '../i18n';
import { CHAPTERS, LEVELS } from '../levels';
import { isUnlocked, levelRecord, type Progress } from '../storage/progress';
import { button, h, stars } from './dom';
import { sparkle } from './fx/particles';
import { muteButton } from './fx/muteButton';

export interface MapActions {
  openLevel(id: string): void;
  openSandbox(): void;
  openCodex(): void;
  openAchievements(): void;
  /** 방금 깬 레벨: 타일을 반짝인다 */
  highlight?: string;
}

export function mountMap(root: HTMLElement, progress: Progress, actions: MapActions): { dispose(): void } {
  const render = () => {
    root.textContent = '';
    document.title = t('app.title');
    document.documentElement.lang = getLang();
    const done = LEVELS.filter((l) => levelRecord(progress, l.id).cleared).length;

    const header = h(
      'header',
      { class: 'toolbar' },
      h('div', { class: 'brand' }, h('h1', { class: 'title' }, t('app.title'))),
      h(
        'div',
        { class: 'group end' },
        button(`📖 ${t('map.codex')}`, actions.openCodex),
        button(`🏆 ${t('achv.title')}`, actions.openAchievements),
        button(`🧪 ${t('map.sandbox')}`, actions.openSandbox),
        muteButton(),
        button(t('toolbar.lang'), () => setLang(getLang() === 'ko' ? 'en' : 'ko'), 'ghost'),
      ),
    );

    const chapters = h('div', { class: 'chapters' });
    // 다음에 할 레벨 = 열려 있고 아직 안 깬 첫 레벨
    const nextId = LEVELS.find((l) => isUnlocked(progress, l.id) && !levelRecord(progress, l.id).cleared)?.id;
    for (const ch of CHAPTERS) {
      const upcoming = ch.levels.length === 0;
      const card = h(
        'section',
        { class: `chapter ${upcoming ? 'upcoming' : ''}` },
        h(
          'div',
          { class: 'chapter-head' },
          h('span', { class: 'chapter-no' }, String(ch.id)),
          h('div', {}, h('h2', {}, ch.title[getLang()]), h('p', { class: 'muted' }, ch.subtitle[getLang()])),
        ),
      );
      if (upcoming) card.append(h('p', { class: 'upcoming-tag' }, t('map.upcoming')));
      const tiles = h('div', { class: 'tiles' });
      for (const l of ch.levels) {
        const rec = levelRecord(progress, l.id);
        const open = isUnlocked(progress, l.id);
        const tile = h(
          'button',
          {
            type: 'button',
            class: `tile ${rec.cleared ? 'cleared' : open ? 'open' : 'locked'} ${l.id === nextId ? 'next' : ''} ${l.id === actions.highlight ? 'just-cleared' : ''}`,
            title: open ? l.text[getLang()].title : t('map.locked'),
          },
          h('span', { class: 'tile-id' }, l.id),
          h('span', { class: 'tile-title' }, open ? l.text[getLang()].title : '🔒'),
          rec.cleared ? stars(rec.stars) : h('span', { class: 'stars' }, ' '),
        );
        if (l.id === nextId) tile.append(h('span', { class: 'next-tag' }, t('fx.next')));
        if (open) tile.onclick = () => actions.openLevel(l.id);
        else tile.disabled = true;
        tiles.append(tile);
      }
      card.append(tiles);
      chapters.append(card);
    }

    root.append(
      header,
      h(
        'main',
        { class: 'map' },
        h('div', { class: 'map-intro' }, h('p', {}, t('map.intro')), h('p', { class: 'muted' }, t('map.progress', { done, total: LEVELS.length }))),
        chapters,
      ),
    );
  };
  const off = onLangChange(render);
  render();
  // 방금 깬 레벨 타일로 스크롤하고 반짝이기 (처음 그릴 때 한 번)
  const glow = root.querySelector<HTMLElement>('.tile.just-cleared');
  if (glow) {
    glow.scrollIntoView({ block: 'center' });
    setTimeout(() => sparkle(glow.getBoundingClientRect(), 22), 250);
  }
  return { dispose: off };
}
