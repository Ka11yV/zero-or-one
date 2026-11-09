import type { EditorDoc } from '../editor/doc';
import { alignableCount, type AlignMode } from '../editor/arrange';
import { Editor, SPEEDS, type PlaceItem } from '../editor/editor';
import { getLang, onLangChange, setLang, t } from '../i18n';
import type { ChipLibrary } from '../sim';
import { h } from './dom';
import { muteButton } from './fx/muteButton';
import { isNewChip, markChipSeen } from '../storage/seenChips';
import { CHIP_SUMMARY } from '../levels/chipInfo';
import { LEVELS } from '../levels';
import { matchRange, searchEntries, type SearchEntry } from './paletteSearch';

/** 오른쪽 패널이 편집기 이벤트에 반응하는 훅 */
export interface PanelHooks {
  structure?(): void;
  sim?(): void;
  selection?(): void;
  lang?(): void;
  dispose?(): void;
}

export interface WorkspaceConfig {
  lib: ChipLibrary;
  doc: EditorDoc;
  title: () => string;
  subtitle: () => string;
  /** 입력 스위치/출력 램프를 팔레트에 보일지 (레벨에서는 핀이 고정) */
  paletteIO: boolean;
  /** 팔레트에 보일 칩 id */
  paletteChips: string[];
  /** 샌드박스에서 만든 내 칩 (팔레트 별도 구역) */
  paletteCustom?: string[];
  lockIO: boolean;
  onBack?: () => void;
  /** "처음부터" 버튼: 초기 문서를 돌려준다 */
  initialDoc?: () => EditorDoc;
  onDocChange: (doc: EditorDoc) => void;
  onOpenChip: (chipId: string) => void;
  panel: (el: HTMLElement, editor: Editor, toast: Toast) => PanelHooks;
}

export type Toast = (msg: string, kind?: 'info' | 'error' | 'success') => void;

export interface Workspace {
  editor: Editor;
  toast: Toast;
  dispose(): void;
}

const isBus = (id: string) => /^(SPLIT|MERGE)\d+$/.test(id);
const isBuiltinGate = (id: string) => id === 'NAND' || id.startsWith('CONST');

function chipName(id: string): string {
  const m = /^(SPLIT|MERGE)(\d+)$/.exec(id);
  if (m) return t(`chip.${m[1]}`, { w: m[2]! });
  return isBuiltinGate(id) ? t(`chip.${id}`) : id;
}

/** 검색용 별칭: 두 언어의 레벨 제목·칩 설명 + 내장 부품의 흔한 이름 */
const BUILTIN_ALIASES: Record<string, string[]> = {
  NAND: ['nand', '낸드', '게이트', 'gate'],
  CONST0: ['constant', 'const', '상수', 'zero', '영', 'low'],
  CONST1: ['constant', 'const', '상수', 'one', '일', 'high'],
  SPLIT: ['split', 'bus', '버스', '나누기', '분리', '펼치기'],
  MERGE: ['merge', 'bus', '버스', '합치기', '묶기'],
};

function chipKeywords(id: string): string[] {
  const base = id.replace(/\d+$/, '');
  const summary = CHIP_SUMMARY[id];
  return [
    ...(BUILTIN_ALIASES[id] ?? BUILTIN_ALIASES[base] ?? []),
    ...LEVELS.filter((l) => l.unlocks?.chipId === id).flatMap((l) => [l.text.ko.title, l.text.en.title]),
    ...(summary ? [summary.ko, summary.en] : []),
  ];
}

function chipIcon(id: string): string {
  if (id === 'NAND') return '⊼';
  if (id === 'CONST0') return '0';
  if (id === 'CONST1') return '1';
  if (id.startsWith('SPLIT')) return '⑃';
  if (id.startsWith('MERGE')) return '⑂';
  return '▣';
}

export function mountWorkspace(root: HTMLElement, cfg: WorkspaceConfig): Workspace {
  root.textContent = '';
  const btn = (cls = '') => h('button', { type: 'button', class: `btn ${cls}`.trim() });
  const backBtn = btn('ghost');
  const runBtn = btn('primary');
  const stepBtn = btn();
  const speed = h('input', { type: 'range', min: '0', max: String(SPEEDS.length - 1), step: '1' });
  const speedLabel = h('span', { class: 'speed-label' });
  const undoBtn = btn();
  const redoBtn = btn();
  const fitBtn = btn();
  const arrangeBtn = btn();
  const arrangeMenu = h('div', { class: 'arrange-menu', hidden: '' });
  const clearBtn = btn('danger');
  const resetBtn = btn('danger');
  const langBtn = btn('ghost');
  const title = h('h1', { class: 'title' });
  const subtitle = h('span', { class: 'subtitle' });

  root.append(
    h(
      'header',
      { class: 'toolbar' },
      cfg.onBack ? backBtn : null,
      h('div', { class: 'brand' }, title, subtitle),
      h('div', { class: 'group' }, runBtn, stepBtn, h('label', { class: 'speed' }, speed, speedLabel)),
      h('div', { class: 'group' }, undoBtn, redoBtn, fitBtn, h('div', { class: 'arrange-wrap' }, arrangeBtn, arrangeMenu), cfg.initialDoc ? resetBtn : clearBtn),
      h('div', { class: 'group end' }, muteButton(), langBtn),
    ),
  );
  const palette = h('aside', { class: 'palette' });
  const canvas = h('canvas', { class: 'board', tabindex: '0' });
  const status = h('div', { class: 'status' });
  const toastEl = h('div', { class: 'toast', role: 'status' });
  const panel = h('aside', { class: 'panel' });
  root.append(h('div', { class: 'workspace' }, palette, h('main', { class: 'stage' }, canvas, status, toastEl), panel));

  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const toast: Toast = (msg, kind = 'info') => {
    toastEl.textContent = msg;
    toastEl.className = `toast show ${kind}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.className = 'toast'), 2800);
  };

  const editor = new Editor(canvas, cfg.lib, cfg.doc, {
    lockIO: cfg.lockIO,
    onOpenChip: cfg.onOpenChip,
    onToast: toast,
    messages: {
      connect: (reason, w) => t(`connect.${reason}`, w ? { a: w[0], b: w[1] } : {}),
      renameInvalid: () => t('name.invalid'),
      pendingWire: () => t('wire.pending'),
    },
  });
  speed.value = String(editor.speed);

  backBtn.onclick = () => cfg.onBack?.();
  runBtn.onclick = () => editor.setRunning(!editor.running);
  stepBtn.onclick = () => {
    editor.setRunning(false);
    editor.stepOnce();
  };
  speed.oninput = () => {
    editor.setSpeed(Number(speed.value));
    speedLabel.textContent = t(`speed.${editor.speed + 1}`);
  };
  undoBtn.onclick = () => editor.undo();
  redoBtn.onclick = () => editor.redo();
  fitBtn.onclick = () => editor.fit();

  // ---------- 정렬 메뉴 ----------
  const ALIGN: { mode: AlignMode; icon: string }[] = [
    { mode: 'left', icon: '⇤' },
    { mode: 'hcenter', icon: '↔' },
    { mode: 'right', icon: '⇥' },
    { mode: 'top', icon: '⤒' },
    { mode: 'vmiddle', icon: '↕' },
    { mode: 'bottom', icon: '⤓' },
    { mode: 'distH', icon: '⋯' },
    { mode: 'distV', icon: '⋮' },
  ];
  const alignBtns = new Map<AlignMode, HTMLButtonElement>();
  const autoBtn = btn('primary');
  const selHint = h('p', { class: 'muted small' });
  const autoHint = h('p', { class: 'muted small' });
  const sectionTitle = h('h3', {});
  const applied = (ok: boolean) => toast(ok ? t('arrange.done') : t('arrange.nothing'));
  for (const { mode, icon } of ALIGN) {
    const b = h('button', { type: 'button', class: 'btn icon-btn' }, icon);
    b.onclick = () => applied(editor.alignSelected(mode));
    alignBtns.set(mode, b);
  }
  autoBtn.onclick = () => {
    applied(editor.autoArrange());
    closeArrange();
  };
  arrangeMenu.append(sectionTitle, h('div', { class: 'align-grid' }, ...alignBtns.values()), selHint, h('hr'), autoBtn, autoHint);
  const renderArrange = () => {
    arrangeBtn.textContent = `▦ ${t('toolbar.arrange')} ▾`;
    sectionTitle.textContent = t('arrange.selection');
    const n = alignableCount(editor.sel);
    for (const { mode } of ALIGN) {
      const b = alignBtns.get(mode)!;
      b.title = t(`arrange.${mode}`);
      b.setAttribute('aria-label', b.title);
      b.disabled = n < (mode === 'distH' || mode === 'distV' ? 3 : 2);
    }
    selHint.textContent = n < 2 ? t('arrange.needTwo') : '';
    selHint.hidden = n >= 2;
    autoBtn.textContent = `✦ ${t('arrange.auto')}`;
    autoHint.textContent = t('arrange.autoHint');
  };
  const closeArrange = () => {
    arrangeMenu.hidden = true;
    arrangeBtn.classList.remove('active');
  };
  arrangeBtn.onclick = (e) => {
    e.stopPropagation();
    arrangeMenu.hidden = !arrangeMenu.hidden;
    arrangeBtn.classList.toggle('active', !arrangeMenu.hidden);
    renderArrange();
  };
  arrangeMenu.addEventListener('pointerdown', (e) => e.stopPropagation());
  const onDocDown = (e: PointerEvent) => {
    // 캔버스를 누를 때는 열어 둔다: 메뉴를 연 채로 부품을 골라 맞출 수 있게
    const target = e.target as Node;
    if (!arrangeMenu.hidden && !arrangeBtn.contains(target) && target !== canvas) closeArrange();
  };
  const onDocKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeArrange();
  };
  document.addEventListener('pointerdown', onDocDown);
  document.addEventListener('keydown', onDocKey);
  clearBtn.onclick = () => editor.clearAll();
  resetBtn.onclick = () => cfg.initialDoc && editor.resetTo(cfg.initialDoc());
  langBtn.onclick = () => setLang(getLang() === 'ko' ? 'en' : 'ko');

  // ---------- 팔레트 (검색 포함) ----------
  type PaletteEntry = SearchEntry & { item: PlaceItem; icon: string };
  let query = '';
  let active = 0;
  let visible: PaletteEntry[] = [];
  const searchInput = h('input', {
    type: 'search',
    class: 'palette-search-input',
    spellcheck: 'false',
    autocomplete: 'off',
    enterkeyhint: 'done',
  });
  const clearSearch = h('button', { type: 'button', class: 'palette-search-clear', hidden: '' }, '×');
  const searchBox = h('div', { class: 'palette-search' }, h('span', { class: 'search-icon', 'aria-hidden': 'true' }, '⌕'), searchInput, clearSearch, h('kbd', {}, '/'));
  const partsWrap = h('div', { class: 'palette-parts' });
  const paletteTitle = h('h2', {});
  const paletteHint = h('p', { class: 'hint' });
  palette.append(paletteTitle, searchBox, partsWrap, paletteHint);

  const unfresh = (chipId: string | undefined, b?: HTMLElement) => {
    if (!chipId || !isNewChip(chipId)) return;
    markChipSeen(chipId);
    b?.classList.remove('fresh');
    b?.querySelector('.new-badge')?.remove();
  };

  /** 이름 안의 검색어를 <mark>로 */
  const labelWithMatch = (label: string): (Node | string)[] => {
    const r = matchRange(label, query);
    return r ? [label.slice(0, r[0]), h('mark', {}, label.slice(r[0], r[1])), label.slice(r[1])] : [label];
  };

  const sections = (): { titleKey: string; entries: PaletteEntry[] }[] => {
    const chipEntry = (id: string, icon = chipIcon(id)): PaletteEntry => ({ id, label: chipName(id), icon, keywords: chipKeywords(id), item: { kind: 'chip', chip: id } });
    return [
      {
        titleKey: 'palette.io',
        entries: cfg.paletteIO
          ? [
              { id: 'INPUT', label: t('palette.input'), icon: '⏻', keywords: ['input', 'switch', '입력', '스위치', 'in'], item: { kind: 'input' } },
              { id: 'OUTPUT', label: t('palette.output'), icon: '◉', keywords: ['output', 'lamp', 'led', '출력', '램프', 'out'], item: { kind: 'output' } },
            ]
          : [],
      },
      { titleKey: 'palette.gates', entries: cfg.paletteChips.filter(isBuiltinGate).map((id) => chipEntry(id)) },
      { titleKey: 'palette.chips', entries: cfg.paletteChips.filter((c) => !isBuiltinGate(c) && !isBus(c)).map((id) => chipEntry(id)) },
      { titleKey: 'palette.custom', entries: (cfg.paletteCustom ?? []).map((id) => chipEntry(id, '◆')) },
      { titleKey: 'palette.bus', entries: cfg.paletteChips.filter(isBus).map((id) => chipEntry(id)) },
    ];
  };

  const renderPalette = () => {
    paletteTitle.textContent = t('palette.title');
    searchInput.placeholder = t('palette.search');
    searchInput.setAttribute('aria-label', t('palette.search'));
    clearSearch.title = t('palette.searchClear');
    clearSearch.hidden = !query;
    partsWrap.textContent = '';
    visible = [];
    const all = sections();
    const total = all.reduce((n, s) => n + s.entries.length, 0);
    searchBox.hidden = total < 2;
    for (const sec of all) {
      const entries = query ? searchEntries(query, sec.entries) : sec.entries;
      if (!entries.length) continue;
      partsWrap.append(h('h3', {}, t(sec.titleKey)));
      const list = h('div', { class: 'parts' });
      for (const e of entries) {
        const idx = visible.length;
        visible.push(e);
        const chipId = e.item.kind === 'chip' ? e.item.chip : undefined;
        // NEW 배지는 플레이어가 만든 칩에만 (NAND·상수·버스 같은 내장 부품은 제외)
        const fresh = chipId !== undefined && cfg.lib.get(chipId)?.kind === 'composite' && isNewChip(chipId);
        const b = h(
          'button',
          { type: 'button', class: `part ${fresh ? 'fresh' : ''} ${query && idx === active ? 'active' : ''}`, title: t('palette.hint'), 'data-index': String(idx) },
          h('span', { class: 'icon' }, e.icon),
          h('span', { class: 'part-label' }, ...labelWithMatch(e.label)),
          fresh ? h('span', { class: 'new-badge' }, t('palette.new')) : null,
        );
        b.addEventListener('pointerdown', (ev) => {
          if (ev.button !== 0) return;
          if (fresh) unfresh(chipId, b);
          ev.preventDefault();
          editor.beginPaletteDrag(e.item, ev);
        });
        list.append(b);
      }
      partsWrap.append(list);
    }
    if (query && !visible.length) partsWrap.append(h('p', { class: 'palette-empty' }, t('palette.noMatch', { q: query.trim() })));
    paletteHint.textContent = query && visible.length ? t('palette.searchHint') : cfg.paletteChips.length || cfg.paletteIO ? t('palette.hint') : t('level.noChips');
  };

  const setActive = (i: number) => {
    if (!visible.length) return;
    active = (i + visible.length) % visible.length;
    for (const b of partsWrap.querySelectorAll<HTMLElement>('.part')) b.classList.toggle('active', Number(b.dataset.index) === active);
    partsWrap.querySelector<HTMLElement>('.part.active')?.scrollIntoView({ block: 'nearest' });
  };
  searchInput.addEventListener('input', () => {
    query = searchInput.value;
    active = 0;
    renderPalette();
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(active + (e.key === 'ArrowDown' ? 1 : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = visible[active];
      if (!pick) return;
      if (pick.item.kind === 'chip') unfresh(pick.item.chip);
      editor.placeAtCenter(pick.item);
      toast(t('palette.placed', { name: pick.label }));
      searchInput.select();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      if (query) {
        searchInput.value = '';
        query = '';
        renderPalette();
      } else searchInput.blur();
    }
  });
  clearSearch.onclick = () => {
    searchInput.value = '';
    query = '';
    renderPalette();
    searchInput.focus();
  };
  // "/" 키로 검색창으로 (입력 중이 아닐 때)
  const onSlash = (e: KeyboardEvent) => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || searchBox.hidden) return;
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
    if (document.querySelector('.modal-backdrop')) return;
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  };
  document.addEventListener('keydown', onSlash);

  // ---------- 상태 표시 ----------
  const renderStatus = () => {
    status.textContent = '';
    const sim = editor.sim;
    let main: HTMLElement;
    if (editor.compileError) main = h('span', { class: 'error' }, `✖ ${t(`err.${editor.compileError.code}`)}`);
    else if (editor.oscillating) main = h('span', { class: 'error' }, t('status.oscillating'));
    else if (sim?.busy) main = h('span', { class: 'busy' }, t('status.settling', { n: editor.stepsSinceChange }));
    else main = h('span', { class: 'ok' }, `● ${t('status.ok')}`);
    status.append(main);
    if (editor.warnings.length) status.append(h('span', { class: 'warn' }, t('status.warnings', { n: editor.warnings.length })));
    const n = editor.sel.instances.size + editor.sel.io.size + editor.sel.wires.size;
    if (n) status.append(h('span', {}, t('status.selected', { n })));
    if (sim) status.append(h('span', { class: 'muted' }, t('status.time', { t: sim.time })));
  };

  const renderToolbar = () => {
    title.textContent = cfg.title();
    subtitle.textContent = cfg.subtitle();
    document.title = `${cfg.title()} · ${t('app.title')}`;
    backBtn.textContent = t('toolbar.back');
    runBtn.textContent = editor.running ? `⏸ ${t('toolbar.pause')}` : `▶ ${t('toolbar.run')}`;
    stepBtn.textContent = `⏭ ${t('toolbar.step')}`;
    speed.title = t('toolbar.speed');
    speedLabel.textContent = t(`speed.${editor.speed + 1}`);
    undoBtn.textContent = '↶';
    undoBtn.title = t('toolbar.undo');
    undoBtn.disabled = !editor.history.canUndo;
    redoBtn.textContent = '↷';
    redoBtn.title = t('toolbar.redo');
    redoBtn.disabled = !editor.history.canRedo;
    fitBtn.textContent = `⤢ ${t('toolbar.fit')}`;
    clearBtn.textContent = t('toolbar.clear');
    resetBtn.textContent = t('toolbar.reset');
    langBtn.textContent = t('toolbar.lang');
    document.documentElement.lang = getLang();
  };

  const hooks = cfg.panel(panel, editor, toast);

  let statusQueued = false;
  const queueStatus = () => {
    if (statusQueued) return;
    statusQueued = true;
    requestAnimationFrame(() => {
      statusQueued = false;
      renderStatus();
      hooks.sim?.();
    });
  };

  editor.on((kind) => {
    switch (kind) {
      case 'structure':
        hooks.structure?.();
        queueStatus();
        cfg.onDocChange(editor.doc);
        break;
      case 'layout':
        cfg.onDocChange(editor.doc);
        break;
      case 'selection':
        hooks.selection?.();
        if (!arrangeMenu.hidden) renderArrange();
        queueStatus();
        break;
      case 'history':
        renderToolbar();
        break;
      case 'sim':
        renderToolbar();
        queueStatus();
        break;
    }
  });

  const renderAll = () => {
    renderToolbar();
    renderArrange();
    renderPalette();
    renderStatus();
    hooks.lang?.();
  };
  const offLang = onLangChange(renderAll);
  renderAll();

  return {
    editor,
    toast,
    dispose() {
      hooks.dispose?.();
      offLang();
      document.removeEventListener('pointerdown', onDocDown);
      document.removeEventListener('keydown', onDocKey);
      document.removeEventListener('keydown', onSlash);
      clearTimeout(toastTimer);
      editor.dispose();
    },
  };
}
