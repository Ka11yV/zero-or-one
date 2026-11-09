// 프로그램 레벨 화면: 어셈블리 편집기 + 플레이어의 CPU 칩으로 실행 + 테스트
import { assemble, disassemble, OPS, type AsmResult } from '../cpu/isa';
import { CpuRunner, runProgram } from '../cpu/run';
import { getLang, onLangChange, setLang, t } from '../i18n';
import type { ProgramCase, ProgramLevel } from '../levels';
import type { ChipDef, ChipLibrary } from '../sim';
import { decimalDisplay, KEYPAD_KEYS, pixelScreen } from './devices';
import { setFlag } from '../game/achievements';
import { button, h, rich } from './dom';
import { muteButton } from './fx/muteButton';

export interface ProgramScreenConfig {
  level: ProgramLevel;
  chapterTitle: () => string;
  lib: ChipLibrary;
  /** 플레이어가 8-5에서 만든 CPU 칩 */
  cpu: ChipDef | undefined;
  source: string;
  onSource(src: string): void;
  hintsUsed: number;
  onHint(n: number): void;
  onPass(bytes: number): void;
  onBack(): void;
}

/** 실행 속도: 초당 클럭 수 (마지막은 최대) */
const SPEEDS = [2, 8, 40, 300, 3000, Infinity];
const hex2 = (v: number) => v.toString(16).toUpperCase().padStart(2, '0');

interface CaseResult {
  c: ProgramCase;
  outs: number[];
  halted: boolean;
  cycles: number;
  ok: boolean;
}

export function mountProgram(root: HTMLElement, cfg: ProgramScreenConfig): { dispose(): void } {
  const { level } = cfg;
  root.textContent = '';
  const text = () => level.text[getLang()];

  // ---------- 상태 ----------
  let source = cfg.source;
  let asm: AsmResult = assemble(source);
  let runner: CpuRunner | null = null;
  let running = false;
  let speed = 3;
  let input = level.cases[0]?.input ?? 0;
  let lastFrame = 0;
  let budget = 0;
  let raf = 0;
  let tab: 'brief' | 'test' | 'hint' = 'brief';
  let hintsShown = cfg.hintsUsed;
  let results: CaseResult[] | null = null;
  let editTimer: ReturnType<typeof setTimeout> | undefined;

  // ---------- 화면 뼈대 ----------
  const btn = (cls = '') => h('button', { type: 'button', class: `btn ${cls}`.trim() });
  const backBtn = btn('ghost');
  const runBtn = btn('primary');
  const stepInstrBtn = btn();
  const stepClkBtn = btn();
  const reloadBtn = btn();
  const speedInput = h('input', { type: 'range', min: '0', max: String(SPEEDS.length - 1), step: '1', value: String(speed) });
  const speedLabel = h('span', { class: 'speed-label' });
  const langBtn = btn('ghost');
  const title = h('h1', { class: 'title' });
  const subtitle = h('span', { class: 'subtitle' });
  root.append(
    h(
      'header',
      { class: 'toolbar' },
      backBtn,
      h('div', { class: 'brand' }, title, subtitle),
      h('div', { class: 'group' }, runBtn, stepInstrBtn, stepClkBtn, h('label', { class: 'speed' }, speedInput, speedLabel), reloadBtn),
      h('div', { class: 'group end' }, muteButton(), langBtn),
    ),
  );

  const code = h('textarea', { class: 'code', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', wrap: 'off' });
  code.value = source;
  const gutter = h('pre', { class: 'gutter', 'aria-hidden': 'true' });
  const asmStatus = h('div', { class: 'asm-status' });
  const isaBox = h('section', { class: 'card isa' });
  const codeCard = h('section', { class: 'card code-card' }, h('h2', { class: 'code-title' }), h('div', { class: 'code-wrap' }, gutter, code), asmStatus);
  const left = h('aside', { class: 'code-pane' }, codeCard, isaBox);

  const regsBox = h('div', { class: 'regs' });
  const outDisplay = decimalDisplay(3);
  const screen = pixelScreen();
  const outLog = h('div', { class: 'out-log' });
  const inputBox = h('div', { class: 'cpu-input' });
  const machine = h('section', { class: 'card machine' }, h('h2', { class: 'machine-title' }), h('div', { class: 'machine-top' }, h('div', { class: 'display-box' }, outDisplay.el, outLog), regsBox, h('figure', { class: 'screen-box', title: '' }, screen.el, h('figcaption', { class: 'screen-caption' }))), inputBox);
  const memGrid = h('div', { class: 'mem-grid big cpu-mem' });
  const memInfo = h('p', { class: 'muted small mem-info' });
  const memCard = h('section', { class: 'card' }, h('h2', { class: 'mem-title-h' }), memInfo, memGrid);
  const center = h('main', { class: 'machine-pane' }, machine, memCard);

  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const body = h('section', { class: 'card tab-body' });
  const summary = h('div', { class: 'summary' });
  const testBtn = h('button', { type: 'button', class: 'btn primary test-btn' });
  const right = h('aside', { class: 'panel' }, tabs, body, h('div', { class: 'test-bar' }, summary, testBtn));
  const toastEl = h('div', { class: 'toast', role: 'status' });
  root.append(h('div', { class: 'program-layout' }, left, center, right), toastEl);

  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const toast = (msg: string, kind: 'info' | 'error' | 'success' = 'info') => {
    toastEl.textContent = msg;
    toastEl.className = `toast show ${kind}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.className = 'toast'), 2800);
  };

  // 메모리 칸 256개 (만들어 두고 값만 바꾼다)
  const cells: HTMLElement[] = [];
  memGrid.style.gridTemplateColumns = `22px repeat(16, 1fr)`;
  for (let a = 0; a < 256; a++) {
    if (a % 16 === 0) memGrid.append(h('span', { class: 'mem-row' }, hex2(a)));
    const c = h('span', { class: 'mem-cell' });
    cells.push(c);
    memGrid.append(c);
  }

  // ---------- 실행 ----------
  const imageFor = (c: ProgramCase | undefined) => {
    const img = new Uint8Array(asm.image);
    for (const [a, v] of Object.entries(c?.mem ?? {})) img[Number(a)] = v;
    return img;
  };

  /** CPU 안의 RAM 내용 (빠른 모드 블록에서 읽는다). 없으면 적재한 이미지 */
  const memory = (): { mem: ArrayLike<number>; lastWrite: number } => {
    if (runner) {
      const nl = runner.sim.netlist;
      const i = nl.blocks.findIndex((b) => b.chipId === 'RAM256');
      const st = i >= 0 ? runner.sim.blockStates[i] : undefined;
      // 적재하면서 쓴 칸은 강조하지 않는다 (실행 중에 쓴 칸만)
      if (st?.mem) return { mem: st.mem, lastWrite: runner.cycles > 0 && typeof st.lastWrite === 'number' ? st.lastWrite : -1 };
    }
    return { mem: imageFor(level.cases[0]), lastWrite: -1 };
  };

  const reload = () => {
    stop();
    if (!cfg.cpu) {
      runner = null;
      renderMachine();
      return;
    }
    if (!runner) runner = new CpuRunner(cfg.cpu, cfg.lib);
    runner.load(imageFor(level.cases[0]), input);
    renderMachine();
    renderControls();
  };

  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
    renderControls();
  };

  const opAt = (pc: number) => OPS[((memory().mem[pc] ?? 0) >> 4) & 15]!;

  const stepInstruction = () => {
    if (!runner || runner.halted) return;
    const n = opAt(runner.reg('pc')).memory ? 5 : 4;
    for (let i = 0; i < n && !runner.halted; i++) runner.step();
  };

  const frame = (now: number) => {
    if (!running || !runner) return;
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    const rate = SPEEDS[speed]!;
    budget += rate === Infinity ? 20000 : rate * dt;
    const start = performance.now();
    while (budget >= 1 && !runner.halted && performance.now() - start < 12) {
      runner.step();
      budget--;
      if (runner.cycles > 100000) break;
    }
    if (rate === Infinity) budget = 0;
    renderMachine();
    if (runner.halted || runner.cycles > 100000) {
      stop();
      if (runner.halted) toast(t('prog.halted', { n: runner.cycles }), 'success');
      return;
    }
    raf = requestAnimationFrame(frame);
  };

  const start = () => {
    if (!runner) return;
    if (runner.halted) reload();
    running = true;
    budget = 1;
    lastFrame = performance.now();
    raf = requestAnimationFrame(frame);
    renderControls();
  };

  // ---------- 그리기 ----------
  const renderControls = () => {
    title.textContent = `${level.id} · ${text().title}`;
    subtitle.textContent = cfg.chapterTitle();
    document.title = `${title.textContent} · ${t('app.title')}`;
    backBtn.textContent = t('toolbar.back');
    runBtn.textContent = running ? `⏸ ${t('toolbar.pause')}` : `▶ ${t('toolbar.run')}`;
    stepInstrBtn.textContent = `⏭ ${t('prog.stepInstr')}`;
    stepClkBtn.textContent = `⏯ ${t('prog.stepClock')}`;
    reloadBtn.textContent = `↺ ${t('prog.reload')}`;
    reloadBtn.title = t('prog.reloadHint');
    speedLabel.textContent = SPEEDS[speed] === Infinity ? t('speed.6') : t('prog.hz', { n: SPEEDS[speed]! });
    langBtn.textContent = t('toolbar.lang');
    const ok = !!runner && !asm.errors.length;
    runBtn.disabled = !ok;
    stepInstrBtn.disabled = !ok || running;
    stepClkBtn.disabled = !ok || running;
    reloadBtn.disabled = !cfg.cpu;
  };

  const renderGutter = () => {
    const pc = runner && !asm.errors.length ? runner.reg('pc') : -1;
    const errLines = new Set(asm.errors.map((e) => e.line));
    const lines = source.split('\n').length;
    let out = '';
    for (let i = 1; i <= lines; i++) {
      const a = asm.lineAddr.get(i);
      const mark = errLines.has(i) ? '✗' : a !== undefined && a === pc ? '▶' : ' ';
      out += `${mark}${a !== undefined ? hex2(a) : '  '}\n`;
    }
    gutter.textContent = out;
  };

  const renderAsmStatus = () => {
    asmStatus.textContent = '';
    if (asm.errors.length) {
      asmStatus.append(
        h('ul', { class: 'asm-errors' }, ...asm.errors.slice(0, 6).map((e) => h('li', {}, t('prog.line', { n: e.line }), ' ', t(e.key, e.params ?? {})))),
      );
    } else {
      asmStatus.append(h('span', { class: 'ok' }, `✓ ${t('prog.bytes', { n: asm.size })}`));
      if (level.stars) asmStatus.append(h('span', { class: 'muted' }, ` · ${t('prog.starGoal', { n: level.stars.maxBytes })}`));
    }
  };

  const reg = (label: string, value: string, title = '') => h('div', { class: 'reg', title }, h('span', { class: 'reg-name' }, label), h('span', { class: 'reg-val' }, value));

  const renderMachine = () => {
    renderGutter();
    regsBox.textContent = '';
    if (!cfg.cpu) {
      regsBox.append(h('p', { class: 'error' }, t('prog.noCpu')));
      outDisplay.update(undefined);
      return;
    }
    if (!runner) return;
    const pc = runner.reg('pc');
    const a = runner.reg('a');
    const { mem, lastWrite } = memory();
    regsBox.append(
      reg('PC', `0x${hex2(pc)}`, t('prog.pcHint')),
      reg('A', `${a} · 0x${hex2(a)}`, t('prog.aHint')),
      reg(t('prog.now'), runner.halted ? 'HALT' : disassemble(mem, pc)),
      reg(t('prog.clock'), String(runner.cycles)),
      h('div', { class: `reg lamp ${runner.halted ? 'on' : ''}` }, h('span', { class: 'reg-name' }, 'HALT'), h('span', { class: 'lamp-dot' })),
    );
    outDisplay.update(runner.outs.length ? runner.reg('out') : undefined);
    if (screen.update(mem)) setFlag('pixel');
    outLog.textContent = runner.outs.length ? `${t('prog.outs')}: ${runner.outs.join(', ')}` : t('prog.noOut');

    for (let i = 0; i < 256; i++) {
      const v = mem[i] ?? 0;
      const c = cells[i]!;
      const txt = hex2(v);
      if (c.textContent !== txt) c.textContent = txt;
      c.classList.toggle('zero', v === 0);
      c.classList.toggle('prog', asm.used.has(i));
      c.classList.toggle('cur', i === pc || i === ((pc + 1) & 255));
      c.classList.toggle('last', i === lastWrite);
    }
  };

  const renderInput = () => {
    inputBox.textContent = '';
    const field = h('input', { type: 'number', min: '0', max: '255', value: String(input) });
    const apply = (v: number) => {
      input = Math.max(0, Math.min(255, Math.trunc(v) || 0));
      field.value = String(input);
      runner?.setInputValue(input);
    };
    field.oninput = () => apply(Number(field.value));
    const pad = h('div', { class: 'keypad small' });
    for (const k of KEYPAD_KEYS.filter((k) => k.code <= 9)) {
      const b = h('button', { type: 'button', class: 'btn key' }, k.label);
      b.onclick = () => apply(input >= 100 ? k.code : input * 10 + k.code);
      pad.append(b);
    }
    const clear = h('button', { type: 'button', class: 'btn key op' }, 'C');
    clear.onclick = () => apply(0);
    pad.append(clear);
    inputBox.append(h('h3', {}, t('prog.input')), h('p', { class: 'muted small' }, t('prog.inputHint')), h('div', { class: 'cpu-input-row' }, field, pad));
  };

  const renderIsa = () => {
    isaBox.textContent = '';
    const rows = OPS.map((o) =>
      h(
        'tr',
        {},
        h('td', { class: 'op-code' }, o.code.toString(16).toUpperCase()),
        h('td', { class: 'op-name' }, o.name + (o.operand === 'none' ? '' : o.operand === 'value' ? ' n' : ' addr')),
        h('td', {}, t(`isa.${o.name}`)),
      ),
    );
    isaBox.append(
      h('h2', {}, t('prog.isa')),
      h('table', { class: 'isa-table' }, h('tbody', {}, ...rows)),
      h('p', { class: 'muted small' }, t('prog.isaNote')),
    );
  };

  // ---------- 오른쪽 패널 ----------
  const describeCase = (c: ProgramCase) => {
    const parts: string[] = [];
    if (c.input !== undefined) parts.push(`IN = ${c.input}`);
    for (const [a, v] of Object.entries(c.mem ?? {})) parts.push(`[0x${hex2(Number(a))}] = ${v}`);
    return parts.join(', ') || '—';
  };

  const renderTabs = () => {
    tabs.textContent = '';
    for (const id of ['brief', 'test', 'hint'] as const) {
      const b = h('button', { type: 'button', role: 'tab', class: `tab ${tab === id ? 'active' : ''}` }, t(id === 'test' ? 'prog.tabTest' : `level.tab.${id}`));
      const bad = results?.filter((r) => !r.ok).length;
      if (id === 'test' && bad) b.append(h('span', { class: 'badge' }, String(bad)));
      b.onclick = () => {
        tab = id;
        renderTabs();
        renderBody();
      };
      tabs.append(b);
    }
  };

  const renderBody = () => {
    body.textContent = '';
    if (tab === 'brief') {
      body.append(h('h2', { class: 'level-title' }, `${level.id} · ${text().title}`));
      const why = text().why;
      if (why) body.append(h('aside', { class: 'why-card' }, h('h3', {}, t('level.why')), rich(why)));
      body.append(rich(text().briefing));
      body.append(
        h(
          'ul',
          { class: 'facts' },
          h('li', {}, t('prog.cases', { n: level.cases.length })),
          level.stars ? h('li', {}, t('prog.starGoal', { n: level.stars.maxBytes })) : null,
          h('li', {}, t('prog.runsOnYourCpu')),
        ),
      );
    } else if (tab === 'test') {
      body.append(h('h2', {}, t('prog.tabTest')));
      const rows = level.cases.map((c, i) => {
        const r = results?.[i];
        return h(
          'tr',
          { class: r && !r.ok ? 'bad' : '' },
          h('td', { class: 'muted' }, String(i + 1)),
          h('td', {}, describeCase(c)),
          h('td', { class: 'out' }, c.outs.join(', ')),
          h('td', { class: 'now' }, r ? `${r.outs.join(', ') || '—'}${r.halted ? '' : ` (${t('prog.notHalted')})`}` : '·'),
          h('td', { class: 'mark' }, r ? (r.ok ? '✓' : '✗') : ''),
        );
      });
      body.append(
        h(
          'div',
          { class: 'table-wrap' },
          h(
            'table',
            { class: 'truth prog-cases' },
            h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, t('prog.caseData')), h('th', { class: 'out' }, t('level.goal')), h('th', { class: 'now' }, t('level.current')), h('th', {}, ''))),
            h('tbody', {}, ...rows),
          ),
        ),
        h('p', { class: 'muted small' }, t('prog.testNote', { n: level.maxCycles })),
      );
    } else {
      const hints = text().hints;
      body.append(h('h2', {}, t('level.tab.hint')));
      if (!hintsShown) body.append(h('p', { class: 'muted' }, t('level.hintNone')));
      hints.slice(0, hintsShown).forEach((hint, i) => body.append(h('div', { class: 'hint-item' }, h('span', { class: 'hint-no' }, String(i + 1)), rich(hint))));
      if (hintsShown < hints.length) {
        body.append(
          button(t('level.hintShow', { n: hintsShown + 1 }), () => {
            hintsShown++;
            cfg.onHint(hintsShown);
            renderBody();
          }),
        );
      }
    }
  };

  const renderSummary = () => {
    summary.textContent = '';
    if (asm.errors.length) summary.append(h('span', { class: 'error' }, t('prog.hasErrors', { n: asm.errors.length })));
    else if (results) {
      const bad = results.filter((r) => !r.ok).length;
      summary.append(bad ? h('span', { class: 'warn' }, t('prog.casesFailed', { n: bad })) : h('span', { class: 'ok' }, t('prog.casesOk')));
    }
  };

  const runTests = () => {
    if (!cfg.cpu) return toast(t('prog.noCpu'), 'error');
    if (asm.errors.length) {
      toast(t('prog.hasErrors', { n: asm.errors.length }), 'error');
      return;
    }
    stop();
    results = level.cases.map((c) => {
      const r = runProgram(cfg.cpu!, cfg.lib, imageFor(c), c.input ?? 0, level.maxCycles);
      return { c, ...r, ok: r.halted && r.outs.length === c.outs.length && r.outs.every((v, i) => v === c.outs[i]) };
    });
    const bad = results.filter((r) => !r.ok).length;
    tab = 'test';
    renderTabs();
    renderBody();
    renderSummary();
    if (bad) toast(t('prog.casesFailed', { n: bad }), 'error');
    else cfg.onPass(asm.size);
  };

  // ---------- 이벤트 ----------
  const onEdit = () => {
    source = code.value;
    clearTimeout(editTimer);
    editTimer = setTimeout(() => {
      asm = assemble(source);
      results = null;
      cfg.onSource(source);
      renderAsmStatus();
      renderSummary();
      renderTabs();
      if (tab === 'test') renderBody();
      if (!asm.errors.length) reload();
      else {
        stop();
        renderGutter();
      }
    }, 300);
    renderGutter();
  };
  code.addEventListener('input', onEdit);
  code.addEventListener('scroll', () => (gutter.scrollTop = code.scrollTop));
  code.addEventListener('keydown', (e) => {
    // Tab 키로 들여쓰기
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = code.selectionStart;
      code.setRangeText('  ', s, code.selectionEnd, 'end');
      onEdit();
    }
  });

  backBtn.onclick = () => cfg.onBack();
  runBtn.onclick = () => (running ? stop() : start());
  stepInstrBtn.onclick = () => {
    stepInstruction();
    renderMachine();
  };
  stepClkBtn.onclick = () => {
    if (runner && !runner.halted) runner.step();
    renderMachine();
  };
  reloadBtn.onclick = reload;
  speedInput.oninput = () => {
    speed = Number(speedInput.value);
    renderControls();
  };
  langBtn.onclick = () => setLang(getLang() === 'ko' ? 'en' : 'ko');
  testBtn.onclick = runTests;
  const onKey = (e: KeyboardEvent) => {
    if (!e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== 'r') return;
    e.preventDefault();
    if (document.querySelector('.modal-backdrop')) return;
    runTests();
  };
  window.addEventListener('keydown', onKey);

  const renderAll = () => {
    renderControls();
    (codeCard.querySelector('.code-title') as HTMLElement).textContent = t('prog.code');
    (machine.querySelector('.machine-title') as HTMLElement).textContent = t('prog.machine');
    (memCard.querySelector('.mem-title-h') as HTMLElement).textContent = t('prog.memory');
    memInfo.textContent = t('prog.memoryHint');
    (machine.querySelector('.screen-caption') as HTMLElement).textContent = t('device.screenShort');
    testBtn.replaceChildren(t('level.test'), h('kbd', {}, 'Ctrl+R'));
    renderAsmStatus();
    renderIsa();
    renderInput();
    renderTabs();
    renderBody();
    renderSummary();
    renderMachine();
  };
  const offLang = onLangChange(renderAll);
  renderAll();
  if (!asm.errors.length) reload();

  return {
    dispose() {
      stop();
      clearTimeout(editTimer);
      offLang();
      window.removeEventListener('keydown', onKey);
      cfg.onSource(source);
    },
  };
}
