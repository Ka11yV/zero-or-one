import { evaluateAchievements, readFlags } from '../game/achievements';
import { getLang, t } from '../i18n';
import { loadCustomChips } from '../storage/customChips';
import type { Progress } from '../storage/progress';
import { button, h } from './dom';
import { openModal } from './modal';

export function showAchievements(progress: Progress): void {
  const list = evaluateAchievements({ progress, custom: loadCustomChips(), flags: readFlags() });
  const done = list.filter((x) => x.done).length;
  const lang = getLang();
  const grid = h(
    'div',
    { class: 'achv-grid' },
    ...list.map(({ a, done }) =>
      h(
        'div',
        { class: `achv ${done ? 'done' : ''}` },
        h('span', { class: 'achv-icon' }, done ? a.icon : '🔒'),
        h('div', {}, h('strong', {}, a.title[lang]), h('p', { class: 'small muted' }, a.desc[lang])),
      ),
    ),
  );
  const bar = h('div', { class: 'achv-bar' }, h('span', { style: `width:${(done / list.length) * 100}%` }));
  const content = h('div', {}, h('h2', {}, `🏆 ${t('achv.title')}`), h('p', { class: 'muted' }, t('achv.progress', { done, total: list.length })), bar, grid);
  const m = openModal(content, { wide: true });
  content.append(h('div', { class: 'actions' }, button(t('common.close'), () => m.close())));
}
