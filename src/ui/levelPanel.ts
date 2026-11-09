import { toChipDef } from '../editor/doc';
import type { Editor } from '../editor/editor';
import { getLang, t } from '../i18n';
import type { CircuitLevel as Level } from '../levels';
import { runTest, type SequenceTest, type VerifyResult } from '../sim';
import { h, rich } from './dom';
import { formatValue, inputsCard } from './inputsCard';
import { helpCard, highlightCurrentRow, statsCard } from './sandboxPanel';
import { timingChart } from './timingChart';
import { memoryViewer } from './memoryViewer';
import { columnAddCard, fullAdderStepsCard, keypadCard, numberWheelCard, seg7Card, signed4 } from './devices';
import { diagnose, levelCoachText, type Coaching } from '../game/coach';
import type { PanelHooks, Toast } from './workspace';

type Tab = 'brief' | 'truth' | 'hint';

const MAX_ROWS = 40;

export interface LevelPanelOptions {
  level: Level;
  hintsUsed: number;
  onHint: (used: number) => void;
  onPass: (nandCount: number) => void;
}

export function levelPanel(panel: HTMLElement, editor: Editor, toast: Toast, opts: LevelPanelOptions): PanelHooks {
  const { level } = opts;
  let tab: Tab = 'brief';
  let hintsShown = opts.hintsUsed;
  let result: VerifyResult | null = null;
  let rowsEl: HTMLTableRowElement[] = [];
  /** 테스트 버튼을 한 번이라도 눌렀나 (그 전에는 코칭을 보여 주지 않음: 빈 회로에 잔소리하지 않게) */
  let tested = false;

  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const body = h('section', { class: 'card tab-body' });
  const summary = h('div', { class: 'summary' });
  const testBtn = h('button', { type: 'button', class: 'btn primary test-btn' });
  const statsBox = h('div');
  const helpBox = h('div');
  const sequential = level.test.kind === 'sequence';
  const clockPin = level.test.kind === 'sequence' ? (level.test.clockPin ?? 'clk') : undefined;
  const inputs = inputsCard(editor, () => clockPin);
  const chart = sequential ? timingChart(editor) : null;
  const memory = memoryViewer(editor);
  const display = seg7Card(editor, () => level.devices?.seg7 ?? []);
  const wheel = numberWheelCard(editor, () => level.devices?.wheel ?? []);
  const column = columnAddCard(editor, () => level.devices?.columnAdd);
  const faSteps = fullAdderStepsCard(editor, () => !!level.devices?.faSteps);
  const keypad = level.devices?.keypad && clockPin ? keypadCard(editor, level.devices.keypad.pin, clockPin) : null;
  panel.append(tabs, body, ...(keypad ? [keypad.el] : []), display.el, wheel.el, faSteps.el, column.el, inputs.el, h('div', { class: 'test-bar' }, summary, testBtn), memory.el, ...(chart ? [chart.el] : []), statsBox, helpBox);

  const text = () => level.text[getLang()];

  const evaluate = () => {
    result = runTest(toChipDef(editor.doc), editor.lib, level.test);
  };

  /** 거의 맞았을 때 코칭 문구 (레벨 맞춤 → 일반) */
  const coaching = (): string | null => {
    if (!tested || !result) return null;
    const c = diagnose(result, level);
    if (!c) return null;
    return levelCoachText(c, text().coach) ?? genericCoach(c);
  };

  const renderTabs = () => {
    tabs.textContent = '';
    for (const id of ['brief', 'truth', 'hint'] as Tab[]) {
      const label = id === 'truth' && sequential ? t('level.tab.sequence') : t(`level.tab.${id}`);
      const b = h('button', { type: 'button', role: 'tab', class: `tab ${tab === id ? 'active' : ''}`, 'aria-selected': String(tab === id) }, label);
      if (id === 'truth' && result && !result.error && result.failedCount) b.append(h('span', { class: 'badge' }, String(result.failedCount)));
      b.onclick = () => {
        tab = id;
        renderTabs();
        renderBody();
      };
      tabs.append(b);
    }
  };

  const renderBrief = () => {
    const tx = text();
    const pinList = (pins: Level['inputs']) => pins.map((p) => (p.width > 1 ? `${p.name}[${p.width}]` : p.name)).join(', ');
    // 상수·버스는 늘 보조 부품이라 목록에서 뺀다
    const chips = level.allowedChips.filter((c) => !c.startsWith('CONST') && !/^(SPLIT|MERGE)\d+$/.test(c));
    body.append(h('h2', { class: 'level-title' }, `${level.id} · ${tx.title}`));
    if (tx.why) body.append(h('aside', { class: 'why-card' }, h('h3', {}, t('level.why')), rich(tx.why)));
    body.append(
      rich(tx.briefing),
      h(
        'ul',
        { class: 'facts' },
        h('li', {}, t('level.pins', { inputs: pinList(level.inputs), outputs: pinList(level.outputs) })),
        h(
          'li',
          {},
          !chips.length
            ? t('level.noChips')
            : chips.length <= 8
              ? t('level.usableChips', { chips: chips.join(', ') })
              : t('level.allChips'),
        ),
        level.stars ? h('li', {}, t('level.starGoal', { n: level.stars.maxNand })) : null,
        level.unlocks ? h('li', { class: 'unlock' }, t('level.unlocks', { chip: level.unlocks.chipId })) : null,
      ),
    );
  };

  /** 순차 테스트: 단계마다 (바꾼 입력, 클럭, 기대값, 실제값) */
  const renderSequence = (test: SequenceTest, res: VerifyResult) => {
    const ins = level.inputs.map((p) => p.name);
    const outs = level.outputs.map((p) => p.name);
    const head = h(
      'tr',
      {},
      h('th', {}, '#'),
      ...ins.map((n) => h('th', { class: 'in' }, n)),
      h('th', { title: t('level.clockCol') }, '⏱'),
      ...outs.map((n, i) => h('th', { class: `out ${i === 0 ? 'group-start' : ''}` }, n)),
      ...outs.map((n, i) => h('th', { class: `now ${i === 0 ? 'group-start' : ''}` }, n)),
      h('th', {}, ''),
    );
    const sub = h(
      'tr',
      { class: 'sub' },
      h('th', { colspan: String(ins.length + 2) }, ''),
      h('th', { colspan: String(outs.length), class: 'group-start' }, t('level.goal')),
      h('th', { colspan: String(outs.length), class: 'group-start' }, t('level.current')),
      h('th', {}, ''),
    );
    const rows = res.rows.map((r, i) => {
      const step = test.steps[i]!;
      const changed = new Set(Object.keys(step.set ?? {}));
      return h(
        'tr',
        { class: r.ok ? '' : 'bad' },
        h('td', { class: 'muted' }, String(i + 1)),
        ...ins.map((n) => h('td', { class: `in ${changed.has(n) ? 'changed' : ''}` }, String(r.inputs[n] ?? 0))),
        h('td', { class: 'clk' }, step.clock ? (step.repeat && step.repeat > 1 ? `↑↓×${step.repeat}` : '↑↓') : ''),
        ...outs.map((n, j) => h('td', { class: `out v${r.expected[n] ? 1 : 0} ${j === 0 ? 'group-start' : ''}` }, n in r.expected ? String(r.expected[n]) : '·')),
        ...outs.map((n, j) =>
          h('td', { class: `now v${r.actual[n] ? 1 : 0} ${j === 0 ? 'group-start' : ''}` }, r.oscillated ? '~' : n in r.actual ? String(r.actual[n]) : '·'),
        ),
        h('td', { class: 'mark' }, r.ok ? '✓' : '✗'),
      );
    });
    body.append(
      h('p', { class: 'muted small' }, t('level.sequenceHint')),
      h('div', { class: 'table-wrap' }, h('table', { class: 'truth seq' }, h('thead', {}, sub, head), h('tbody', {}, ...rows))),
    );
    if (res.rows.some((r) => r.oscillated)) body.append(h('p', { class: 'error' }, t('level.oscillation')));
  };

  const renderTruth = () => {
    rowsEl = [];
    body.append(h('h2', {}, sequential ? t('level.tab.sequence') : t('level.tab.truth')));
    if (result?.error) {
      body.append(h('p', { class: 'error' }, t('level.compileError', { msg: t(`err.${result.error.code}`) })));
      return;
    }
    const coach = coaching();
    if (coach) body.append(h('aside', { class: 'coach-card', role: 'status' }, h('span', { class: 'coach-icon', 'aria-hidden': 'true' }, '💡'), rich(coach)));
    if (level.test.kind === 'sequence' && result) return renderSequence(level.test, result);
    if (level.test.kind !== 'truth' || !result) return;
    if (result.error) {
      body.append(h('p', { class: 'error' }, t('level.compileError', { msg: t(`err.${result.error.code}`) })));
      return;
    }
    const ins = level.inputs.map((p) => p.name);
    const outs = level.outputs.map((p) => p.name);
    const width = new Map([...level.inputs, ...level.outputs].map((p) => [p.name, p.width]));
    const bin = new Set(level.binaryPins ?? []);
    const signed = new Set(level.signedPins ?? []);
    const fmt = (name: string, v: number | undefined) =>
      formatValue(v ?? 0, width.get(name) ?? 1, bin.has(name)) + (signed.has(name) && (v ?? 0) & 8 ? ` (${signed4(v ?? 0)})` : '');
    // 줄이 많으면(가산기 등) 틀린 줄을 우선으로 일부만 보여준다
    let shown = result.rows;
    if (shown.length > MAX_ROWS) {
      const bad = shown.filter((r) => !r.ok).slice(0, MAX_ROWS);
      const keep = new Set([...bad, ...shown.filter((r) => r.ok).slice(0, MAX_ROWS - bad.length)]);
      shown = shown.filter((r) => keep.has(r));
    }
    const head = h(
      'tr',
      {},
      ...ins.map((n) => h('th', { class: 'in' }, n)),
      ...outs.map((n, i) => h('th', { class: `out ${i === 0 ? 'group-start' : ''}` }, `${n}`)),
      ...outs.map((n, i) => h('th', { class: `now ${i === 0 ? 'group-start' : ''}` }, `${n}`)),
      h('th', {}, ''),
    );
    const sub = h(
      'tr',
      { class: 'sub' },
      h('th', { colspan: String(ins.length) }, ''),
      h('th', { colspan: String(outs.length), class: 'group-start' }, t('level.goal')),
      h('th', { colspan: String(outs.length), class: 'group-start' }, t('level.current')),
      h('th', {}, ''),
    );
    rowsEl = shown.map((r) =>
      h(
        'tr',
        { 'data-in': ins.map((n) => r.inputs[n]).join(','), class: r.ok ? '' : 'bad' },
        ...ins.map((n) => h('td', { class: 'in' }, fmt(n, r.inputs[n]))),
        ...outs.map((n, i) => h('td', { class: `out v${r.expected[n] ? 1 : 0} ${i === 0 ? 'group-start' : ''}` }, fmt(n, r.expected[n]))),
        ...outs.map((n, i) => h('td', { class: `now v${r.actual[n] ? 1 : 0} ${i === 0 ? 'group-start' : ''}` }, r.oscillated ? '~' : fmt(n, r.actual[n]))),
        h('td', { class: 'mark' }, r.ok ? '✓' : '✗'),
      ),
    );
    body.append(h('div', { class: 'table-wrap' }, h('table', { class: 'truth' }, h('thead', {}, sub, head), h('tbody', {}, ...rowsEl))));
    if (shown.length < result.rows.length) body.append(h('p', { class: 'muted small' }, t('level.rowsShown', { shown: shown.length, total: result.rows.length })));
    if (result.rows.some((r) => r.oscillated)) body.append(h('p', { class: 'error' }, t('level.oscillation')));
    highlightCurrentRow(editor, rowsEl);
  };

  const renderHints = () => {
    const hints = text().hints;
    body.append(h('h2', {}, t('level.tab.hint')));
    if (!hintsShown) body.append(h('p', { class: 'muted' }, t('level.hintNone')));
    hints.slice(0, hintsShown).forEach((hint, i) => body.append(h('div', { class: 'hint-item' }, h('span', { class: 'hint-no' }, String(i + 1)), rich(hint))));
    if (hintsShown < hints.length) {
      const b = h('button', { type: 'button', class: 'btn' }, t('level.hintShow', { n: hintsShown + 1 }));
      b.onclick = () => {
        hintsShown++;
        opts.onHint(hintsShown);
        renderBody();
      };
      body.append(b);
    }
  };

  const renderBody = () => {
    body.textContent = '';
    if (tab === 'brief') renderBrief();
    else if (tab === 'truth') renderTruth();
    else renderHints();
  };

  const renderSummary = () => {
    summary.textContent = '';
    if (!result) return;
    if (result.error) summary.append(h('span', { class: 'error' }, t('level.compileError', { msg: t(`err.${result.error.code}`) })));
    else if (result.failedCount) {
      summary.append(h('span', { class: 'warn' }, t('level.mismatch', { n: result.failedCount })));
      if (coaching()) {
        const b = h('button', { type: 'button', class: 'coach-link' }, `💡 ${t('coach.link')}`);
        b.onclick = () => {
          tab = 'truth';
          renderTabs();
          renderBody();
        };
        summary.append(b);
      }
    }
    else summary.append(h('span', { class: 'ok' }, t('level.allMatch')));
  };

  const runTestNow = () => {
    tested = true;
    evaluate();
    if (!result) return;
    if (result.error) toast(t('level.compileError', { msg: t(`err.${result.error.code}`) }), 'error');
    else if (!result.pass) {
      toast(t('level.failed', { n: result.failedCount }) + (coaching() ? ` · 💡 ${t('coach.link')}` : ''), 'error');
      tab = 'truth';
    } else opts.onPass(editor.metrics?.nandCount ?? 0);
    renderTabs();
    renderBody();
    renderSummary();
  };
  testBtn.onclick = runTestNow;

  // Ctrl+R: 테스트 실행 (브라우저 새로고침 대신). Mac의 ⌘R 새로고침은 그대로 둔다.
  const onKey = (e: KeyboardEvent) => {
    if (!e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== 'r') return;
    e.preventDefault();
    if (document.querySelector('.modal-backdrop')) return;
    runTestNow();
  };
  window.addEventListener('keydown', onKey);

  const renderAll = () => {
    testBtn.replaceChildren(t('level.test'), h('kbd', {}, 'Ctrl+R'));
    testBtn.title = t('level.testShortcut');
    renderTabs();
    renderBody();
    renderSummary();
    statsBox.replaceChildren(statsCard(editor));
    helpBox.replaceChildren(helpCard());
    inputs.render();
    chart?.render();
    memory.render();
    display.render();
    wheel.render();
    column.render();
    faSteps.render();
    keypad?.render();
  };

  evaluate();
  return {
    structure() {
      evaluate();
      renderTabs();
      if (tab === 'truth') renderBody();
      renderSummary();
      statsBox.replaceChildren(statsCard(editor));
      chart?.sample();
      memory.render();
      display.sync();
      wheel.sync();
      column.sync();
      faSteps.sync();
    },
    sim: () => {
      highlightCurrentRow(editor, rowsEl);
      inputs.sync();
      display.sync();
      wheel.sync();
      column.sync();
      faSteps.sync();
      chart?.sample();
      memory.sync();
    },
    lang: renderAll,
    dispose() {
      window.removeEventListener('keydown', onKey);
      inputs.dispose();
    },
  };
}

/** 일반 코칭 문구 */
function genericCoach(c: Coaching): string {
  const cond = c.cond
    ? c.cond.bit !== undefined
      ? t('coach.condBit', { pin: c.cond.pin, bit: c.cond.bit, v: c.cond.value })
      : t('coach.condValue', { pin: c.cond.pin, v: c.cond.value })
    : '';
  switch (c.kind) {
    case 'offset':
      return Math.abs(c.k!) === 1 ? t(c.k! > 0 ? 'coach.plus1' : 'coach.minus1', { pin: c.pin }) : t(c.k! > 0 ? 'coach.bigger' : 'coach.smaller', { pin: c.pin, n: Math.abs(c.k!) });
    case 'condition':
      return t('coach.condition', { cond });
    default:
      return t(`coach.${c.kind}`, { pin: c.pin, other: c.other ?? '', v: c.value ?? 0 });
  }
}
