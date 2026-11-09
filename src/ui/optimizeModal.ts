import type { Editor } from '../editor/editor';
import { optimizeFastest, optimizeKeepChips, type OptimizeMetrics, type OptimizeResult } from '../editor/optimize';
import { t } from '../i18n';
import { button, h, rich } from './dom';
import { openModal } from './modal';
import type { Toast } from './workspace';

/** 회로 최적화 창: 현재 / 정리(칩 유지) / 최고 속도(NAND로 펼치기)를 비교하고 하나를 적용한다 */
export function showOptimize(editor: Editor, toast: Toast): void {
  const body = h('div', { class: 'optimize' }, h('p', { class: 'muted' }, t('opt.computing')));
  const content = h(
    'div',
    {},
    h('h2', {}, `⚡ ${t('opt.title')}`),
    rich(t('opt.intro')),
    body,
    h('div', { class: 'actions' }, button(t('common.close'), () => m.close())),
  );
  const m = openModal(content, { wide: false });

  // 큰 회로는 계산에 시간이 걸릴 수 있으므로 창을 먼저 띄운 뒤 계산한다
  setTimeout(() => {
    const doc = editor.doc;
    const lib = editor.lib;
    const results: { key: 'keep' | 'fast'; res: OptimizeResult }[] = [
      { key: 'keep', res: optimizeKeepChips(doc, lib) },
      { key: 'fast', res: optimizeFastest(doc, lib) },
    ];
    const before = results.map((r) => r.res.before).find((b): b is OptimizeMetrics => !!b);
    body.textContent = '';
    if (!before) {
      const reason = results[0]!.res.ok ? 'compile' : results[0]!.res.reason;
      body.append(h('p', { class: 'error' }, t(`opt.reason.${reason}`)));
      return;
    }

    const depthText = (d: number | null) => (d === null ? t('panel.depthLoop') : String(d));
    const okDepths = results.flatMap((r) => (r.res.ok && r.res.after.depth !== null ? [r.res.after.depth] : []));
    const bestDepth = Math.min(before.depth ?? Infinity, ...okDepths);
    const cell = (v: string, good = false) => h('td', { class: good ? 'good' : '' }, v);
    const diff = (a: number, b: number) => (b < a ? ` (−${a - b})` : '');

    const rows: HTMLElement[] = [
      h('tr', {}, h('th', {}, t('opt.current')), cell(String(before.nandCount)), cell(depthText(before.depth)), cell(String(before.parts)), h('td', {})),
    ];
    for (const { key, res } of results) {
      const name = h('th', {}, t(`opt.${key}`), h('div', { class: 'muted small' }, t(`opt.${key}Desc`)));
      if (!res.ok) {
        rows.push(h('tr', { class: 'unavailable' }, name, h('td', { colspan: '4', class: 'muted' }, t(`opt.reason.${res.reason}`))));
        continue;
      }
      const a = res.after;
      const same = a.nandCount === before.nandCount && a.depth === before.depth && a.parts === before.parts;
      const apply = button(same ? t('opt.arrangeOnly') : t('opt.apply'), () => {
        editor.resetTo(res.doc);
        editor.fit();
        toast(same ? t('arrange.done') : t('opt.applied', { nand: a.nandCount, depth: depthText(a.depth) }), 'success');
        m.close();
      }, same ? '' : 'primary');
      rows.push(
        h(
          'tr',
          {},
          name,
          cell(`${a.nandCount}${diff(before.nandCount, a.nandCount)}`, a.nandCount < before.nandCount),
          cell(`${depthText(a.depth)}${a.depth !== null && before.depth !== null ? diff(before.depth, a.depth) : ''}`, a.depth !== null && a.depth === bestDepth && a.depth < (before.depth ?? Infinity)),
          cell(String(a.parts)),
          h('td', {}, apply),
        ),
      );
    }
    body.append(
      h(
        'table',
        { class: 'opt-table' },
        h('thead', {}, h('tr', {}, h('th', {}), h('th', {}, t('panel.nandCount')), h('th', {}, t('panel.depth')), h('th', {}, t('opt.parts')), h('th', {}))),
        h('tbody', {}, ...rows),
      ),
      h('p', { class: 'muted small' }, t('opt.note')),
    );
  }, 30);
}
