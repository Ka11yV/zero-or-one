import { toChipDef } from '../editor/doc';
import type { Editor } from '../editor/editor';
import { t } from '../i18n';
import { generateTruthTable } from '../sim';
import { h } from './dom';
import { inputsCard } from './inputsCard';
import { timingChart } from './timingChart';
import { memoryViewer } from './memoryViewer';
import { screenCard, seg7Card } from './devices';
import { myChipsCard, programCard, type SandboxTools } from './sandboxTools';
import { setFlag } from '../game/achievements';
import { showOptimize } from './optimizeModal';
import type { PanelHooks, Toast } from './workspace';

const MAX_SHOWN_BITS = 6;

export function statsCard(editor: Editor): HTMLElement {
  const box = h('section', { class: 'card' }, h('h2', {}, t('panel.stats')));
  const m = editor.metrics;
  box.append(
    h(
      'dl',
      { class: 'stats' },
      h('dt', {}, t('panel.nandCount')),
      h('dd', {}, m ? String(m.nandCount) : '—'),
      h('dt', {}, t('panel.depth')),
      h('dd', {}, m ? (m.depth === null ? t('panel.depthLoop') : String(m.depth)) : '—'),
    ),
  );
  if (editor.warnings.length) {
    box.append(h('ul', { class: 'warnings' }, ...editor.warnings.slice(0, 8).map((w) => h('li', {}, t(`warn.${w.kind}`, { path: w.path })))));
  }
  return box;
}

export function helpCard(): HTMLElement {
  return h('section', { class: 'card help' }, h('h2', {}, t('panel.help')), h('p', {}, t('help.body')));
}

/** 현재 입력값과 같은 진리표 행을 강조 */
export function highlightCurrentRow(editor: Editor, rows: HTMLTableRowElement[]): void {
  const cur = editor.doc.inputs.map((n) => editor.inputValues.get(n.name) ?? 0).join(',');
  for (const tr of rows) tr.classList.toggle('current', tr.dataset.in === cur);
}

export function sandboxPanel(panel: HTMLElement, editor: Editor, toast: Toast, tools: SandboxTools): PanelHooks {
  const propsBox = h('section', { class: 'card' });
  // 샌드박스에서는 'clk' 라는 이름의 입력이 있으면 클럭 버튼을 보여준다
  const inputs = inputsCard(editor, () => 'clk');
  const chart = timingChart(editor);
  const truthBox = h('section', { class: 'card' });
  const statsBox = h('div');
  const helpBox = h('div');
  const memory = memoryViewer(editor);
  // 폭 7인 출력은 7세그먼트로도 보여준다
  const display = seg7Card(editor, () => editor.doc.outputs.filter((o) => o.width === 7).map((o) => o.name));
  const chipsCard = myChipsCard(editor, toast, tools);
  const screen = screenCard(editor, () => setFlag('pixel'));
  const prog = programCard(editor, toast);
  panel.append(propsBox, chipsCard.el, display.el, screen.el, inputs.el, prog.el, memory.el, truthBox, chart.el, statsBox, helpBox);
  let rowsEl: HTMLTableRowElement[] = [];

  const renderProps = () => {
    const io = editor.selectedIO();
    propsBox.hidden = !io;
    if (!io) return;
    propsBox.textContent = '';
    const name = h('input', { type: 'text', value: io.node.name, maxlength: '16', spellcheck: 'false' });
    name.onchange = () => {
      if (!editor.renameSelectedIO(name.value.trim())) name.value = io.node.name;
    };
    name.onkeydown = (e) => {
      if (e.key === 'Enter') name.blur();
    };
    const width = h('select');
    for (let w = 1; w <= 16; w++) {
      const o = h('option', { value: String(w) }, String(w));
      if (w === io.node.width) o.selected = true;
      width.append(o);
    }
    width.onchange = () => editor.setSelectedIOWidth(Number(width.value));
    propsBox.append(
      h('h2', {}, t('panel.props')),
      h('label', { class: 'field' }, h('span', {}, t('panel.name')), name),
      h('label', { class: 'field' }, h('span', {}, t('panel.width')), width),
    );
  };

  const renderTruth = () => {
    truthBox.textContent = '';
    rowsEl = [];
    truthBox.append(h('h2', {}, t('panel.truth')));
    const def = toChipDef(editor.doc);
    if (editor.compileError) {
      truthBox.append(h('p', { class: 'error' }, t(`err.${editor.compileError.code}`)));
      return;
    }
    if (!def.inputs.length || !def.outputs.length) {
      truthBox.append(h('p', { class: 'muted' }, t('panel.truthEmpty')));
      return;
    }
    if (def.inputs.reduce((s, p) => s + p.width, 0) > MAX_SHOWN_BITS) {
      truthBox.append(h('p', { class: 'muted' }, t('panel.truthTooMany', { max: MAX_SHOWN_BITS })));
      return;
    }
    const rows = generateTruthTable(def, editor.lib);
    const head = h('tr', {}, ...def.inputs.map((p) => h('th', { class: 'in' }, p.name)), ...def.outputs.map((p) => h('th', { class: 'out' }, p.name)));
    rowsEl = rows.map((r) =>
      h(
        'tr',
        { 'data-in': r.in.join(',') },
        ...r.in.map((v) => h('td', { class: 'in' }, String(v))),
        ...r.out.map((v) => h('td', { class: `out v${v ? 1 : 0}` }, r.stable ? String(v) : '~')),
      ),
    );
    truthBox.append(h('div', { class: 'table-wrap' }, h('table', { class: 'truth' }, h('thead', {}, head), h('tbody', {}, ...rowsEl))));
    highlightCurrentRow(editor, rowsEl);
  };

  const renderStats = () => {
    const card = statsCard(editor);
    const opt = h('button', { type: 'button', class: 'btn primary opt-btn', title: t('opt.hint') }, `⚡ ${t('opt.title')}`);
    opt.disabled = !editor.doc.instances.length || !!editor.compileError;
    opt.onclick = () => showOptimize(editor, toast);
    card.append(opt);
    statsBox.replaceChildren(card);
  };

  // 화면을 처음 열었을 때도 (회로가 막 컴파일된 상태) 자동 적재
  queueMicrotask(() => prog.afterRebuild());

  return {
    structure() {
      renderTruth();
      renderStats();
      renderProps();
      inputs.render();
      chart.reset();
      memory.render();
      display.render();
      screen.render();
      prog.afterRebuild();
      chipsCard.render();
    },
    selection: renderProps,
    sim: () => {
      highlightCurrentRow(editor, rowsEl);
      inputs.sync();
      chart.sample();
      memory.sync();
      display.sync();
      screen.sync();
    },
    dispose: () => inputs.dispose(),
    lang() {
      renderProps();
      inputs.render();
      chart.render();
      memory.render();
      display.render();
      screen.render();
      prog.render();
      chipsCard.render();
      renderTruth();
      renderStats();
      helpBox.replaceChildren(helpCard());
    },
  };
}
