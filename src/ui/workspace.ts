import type { EditorDoc } from '../editor/doc';
import { alignableCount, type AlignMode } from '../editor/arrange';
import { Editor, SPEEDS, type PlaceItem } from '../editor/editor';
import { getLang, onLangChange, setLang, t } from '../i18n';
import type { ChipLibrary } from '../sim';
import { h } from './dom';
import { muteButton } from './fx/muteButton';
import { isNewChip, markChipSeen } from '../storage/seenChips';

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

  // ---------- 팔레트 ----------
  const renderPalette = () => {
    palette.textContent = '';
    palette.append(h('h2', {}, t('palette.title')));
    const section = (titleKey: string, items: { item: PlaceItem; label: string; icon: string }[]) => {
      if (!items.length) return;
      palette.append(h('h3', {}, t(titleKey)));
      const list = h('div', { class: 'parts' });
      for (const e of items) {
        const chipId = e.item.kind === 'chip' ? e.item.chip : undefined;
        // NEW 배지는 플레이어가 만든 칩에만 (NAND·상수·버스 같은 내장 부품은 제외)
        const fresh = chipId !== undefined && cfg.lib.get(chipId)?.kind === 'composite' && isNewChip(chipId);
        const b = h(
          'button',
          { type: 'button', class: `part ${fresh ? 'fresh' : ''}`, title: t('palette.hint') },
          h('span', { class: 'icon' }, e.icon),
          e.label,
          fresh ? h('span', { class: 'new-badge' }, t('palette.new')) : null,
        );
        b.addEventListener('pointerdown', (ev) => {
          if (ev.button !== 0) return;
          if (fresh && chipId) {
            markChipSeen(chipId);
            b.classList.remove('fresh');
            b.querySelector('.new-badge')?.remove();
          }
          ev.preventDefault();
          editor.beginPaletteDrag(e.item, ev);
        });
        list.append(b);
      }
      palette.append(list);
    };
    const chipItem = (id: string) => ({ item: { kind: 'chip', chip: id } as PlaceItem, label: chipName(id), icon: chipIcon(id) });
    if (cfg.paletteIO) {
      section('palette.io', [
        { item: { kind: 'input' }, label: t('palette.input'), icon: '⏻' },
        { item: { kind: 'output' }, label: t('palette.output'), icon: '◉' },
      ]);
    }
    section('palette.gates', cfg.paletteChips.filter(isBuiltinGate).map(chipItem));
    section('palette.chips', cfg.paletteChips.filter((c) => !isBuiltinGate(c) && !isBus(c)).map(chipItem));
    section('palette.custom', (cfg.paletteCustom ?? []).map((id) => ({ ...chipItem(id), icon: '◆' })));
    section('palette.bus', cfg.paletteChips.filter(isBus).map(chipItem));
    palette.append(h('p', { class: 'hint' }, cfg.paletteChips.length || cfg.paletteIO ? t('palette.hint') : t('level.noChips')));
  };

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
      clearTimeout(toastTimer);
      editor.dispose();
    },
  };
}
