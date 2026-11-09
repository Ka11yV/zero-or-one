import { Editor } from '../editor/editor';
import type { EditorDoc } from '../editor/doc';
import { getLang, t } from '../i18n';
import { isProgramLevel, LEVELS, type CircuitLevel, type Level } from '../levels';
import { CHIP_SUMMARY } from '../levels/chipInfo';
import { generateTruthTable, type ChipLibrary } from '../sim';
import { formatValue } from './inputsCard';
import { levelRecord, type Progress } from '../storage/progress';
import { button, h, rich } from './dom';
import { celebrate, type CelebrationHandle, type CelebrationInfo } from './celebrate';

export interface ModalHandle {
  close(): void;
  el: HTMLElement;
}

const openModals = new Set<() => void>();

/** 열려 있는 창을 모두 닫는다 (화면 전환 시) */
export function closeAllModals(): void {
  for (const close of [...openModals]) close();
}

/** 화면 위에 뜨는 카드. Esc나 바깥 클릭으로 닫힌다 (dismissable일 때) */
export function openModal(content: HTMLElement, opts: { wide?: boolean; dismissable?: boolean; onClose?: () => void } = {}): ModalHandle {
  const card = h('div', { class: `modal ${opts.wide ? 'wide' : ''}`, role: 'dialog', 'aria-modal': 'true' }, content);
  const backdrop = h('div', { class: 'modal-backdrop' }, card);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    openModals.delete(close);
    backdrop.remove();
    window.removeEventListener('keydown', onKey, true);
    opts.onClose?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && opts.dismissable !== false) {
      e.stopPropagation();
      close();
    }
  };
  if (opts.dismissable !== false) {
    backdrop.addEventListener('pointerdown', (e) => {
      if (e.target === backdrop) close();
    });
  }
  window.addEventListener('keydown', onKey, true);
  document.body.append(backdrop);
  openModals.add(close);
  return { close, el: card };
}

export function principleCard(level: Level): HTMLElement {
  const p = level.text[getLang()].principle;
  return h(
    'article',
    { class: 'principle' },
    h('h3', { class: 'principle-title' }, p.title),
    rich(p.body),
    p.formula ? h('div', { class: 'formula' }, h('span', { class: 'label' }, t('clear.formula')), h('code', {}, p.formula)) : null,
    p.usage ? h('div', { class: 'usage' }, h('span', { class: 'label' }, t('clear.usage')), h('p', {}, p.usage)) : null,
  );
}

export interface ClearInfo {
  level: Level;
  next?: Level;
  onNext: () => void;
  onMap: () => void;
  /** 연출에 필요한 정보 (별점, 점수, 해금 칩, 챕터 완료, 엔딩) */
  celebration: CelebrationInfo;
}

export function showClear(info: ClearInfo): ModalHandle {
  const { level } = info;
  const stage = h('div');
  const rest = h(
    'div',
    { class: 'clear-rest' },
    h('p', { class: 'muted clear-level' }, `${level.id} · ${level.text[getLang()].title}`),
    principleCard(level),
    info.celebration.ending ? h('p', { class: 'muted' }, t('ending.thanks')) : !info.next ? h('p', { class: 'muted' }, t('clear.chapterDone')) : null,
  );
  const actions = h('div', { class: 'actions' });
  rest.append(actions);
  const content = h('div', { class: 'clear' }, stage, rest);
  let fx: CelebrationHandle | null = null;
  const m = openModal(content, { dismissable: true, onClose: () => fx?.dispose() });
  fx = celebrate(stage, m.el, info.celebration);
  void fx.done.then(() => rest.classList.add('show'));
  actions.append(
    button(t('clear.stay'), () => m.close(), 'ghost'),
    button(t('clear.map'), () => {
      m.close();
      info.onMap();
    }),
  );
  if (info.next) {
    actions.append(
      button(
        t('clear.next'),
        () => {
          m.close();
          info.onNext();
        },
        'primary',
      ),
    );
  }
  return m;
}

export function showCodex(progress: Progress): ModalHandle {
  const list = h('div', { class: 'codex' });
  const cleared = LEVELS.filter((l) => levelRecord(progress, l.id).cleared);
  if (!cleared.length) list.append(h('p', { class: 'muted' }, t('codex.empty')));
  for (const l of LEVELS) {
    const done = levelRecord(progress, l.id).cleared;
    const d = h('details', { class: `codex-item ${done ? '' : 'locked'}` });
    d.append(h('summary', {}, h('span', { class: 'lid' }, l.id), done ? l.text[getLang()].principle.title : t('codex.locked')));
    if (done) d.append(principleCard(l));
    list.append(d);
  }
  const content = h('div', {}, h('h2', {}, t('codex.title')), list);
  const m = openModal(content, { wide: true });
  content.append(h('div', { class: 'actions' }, button(t('common.close'), () => m.close())));
  return m;
}

/** 칩 내부 회로를 읽기 전용으로 보여준다 (입력 스위치로 실험 가능) */
export interface InsideContext {
  /** 칩 id → 칩을 만든 회로 원본 (캠페인 칩 + 내 칩) */
  sources: Record<string, EditorDoc>;
  lib: ChipLibrary;
  /** 내 칩 설명 */
  notes?: Record<string, string>;
}

export function showChipInside(chipId: string, ctx: InsideContext): ModalHandle {
  const { lib } = ctx;
  const src = ctx.sources[chipId];
  const canvas = h('canvas', { class: 'board inside', tabindex: '0' });
  const content = h('div', { class: 'inside-view' }, h('h2', {}, t('inside.title', { chip: chipId })));
  let editor: Editor | null = null;
  const m = openModal(content, { wide: true, onClose: () => editor?.dispose() });
  const info = chipInfoCard(chipId, lib, ctx.notes?.[chipId]);
  if (!src) content.append(info, h('p', { class: 'error' }, t('inside.none')));
  else {
    content.append(
      h('div', { class: 'inside-body' }, info, h('div', { class: 'inside-right' }, h('p', { class: 'muted small' }, t('inside.desc')), h('div', { class: 'inside-stage' }, canvas))),
    );
    editor = new Editor(canvas, lib, structuredClone(src), {
      readOnly: true,
      onOpenChip: (inner) => {
        m.close();
        showChipInside(inner, ctx);
      },
      messages: { connect: () => '', renameInvalid: () => '' },
    });
  }
  content.append(h('div', { class: 'actions' }, button(t('common.close'), () => m.close())));
  return m;
}

/** 진리표를 보여줄 최대 입력 비트 수 (2⁴ = 16행) */
const INFO_TABLE_BITS = 4;

/** 칩 내부 보기 왼쪽의 설명: 한 줄 규칙, 식, 핀, (작은 조합 칩이면) 진리표 */
function chipInfoCard(chipId: string, lib: ChipLibrary, note?: string): HTMLElement {
  const lang = getLang();
  const level = LEVELS.find((l): l is CircuitLevel => !isProgramLevel(l) && l.unlocks?.chipId === chipId);
  const def = lib.get(chipId);
  const box = h('section', { class: 'chip-info' });
  const summary = CHIP_SUMMARY[chipId]?.[lang] ?? note;
  box.append(h('h3', {}, t('inside.what')));
  if (summary) box.append(...summary.split('\n').map((line) => h('p', { class: 'chip-rule' }, line)));
  else box.append(h('p', { class: 'muted' }, t('inside.noSummary')));

  if (def) {
    const pins = (ps: { name: string; width: number }[]) => ps.map((p) => (p.width > 1 ? `${p.name}[${p.width}]` : p.name)).join(', ');
    box.append(
      h('dl', { class: 'chip-pins' }, h('dt', {}, t('inside.inputs')), h('dd', {}, pins(def.inputs) || '—'), h('dt', {}, t('inside.outputs')), h('dd', {}, pins(def.outputs) || '—')),
    );
  }
  const formula = level?.text[lang].principle.formula;
  if (formula) box.append(h('h3', {}, t('inside.formula')), h('code', { class: 'formula' }, formula));

  // 작은 조합 칩은 진리표로 규칙을 한눈에 보여준다 (기억 칩은 시간에 따라 달라지므로 제외)
  const bits = def ? def.inputs.reduce((s, p) => s + p.width, 0) : Infinity;
  if (def && level && level.test.kind !== 'sequence' && bits <= INFO_TABLE_BITS) {
    try {
      const bin = new Set(level.binaryPins ?? []);
      const rows = generateTruthTable(def, lib);
      const cell = (v: number, p: { name: string; width: number }, cls: string) =>
        h('td', { class: `${cls} ${p.width === 1 ? `v${v ? 1 : 0}` : ''}` }, formatValue(v, p.width, bin.has(p.name)));
      box.append(
        h('h3', {}, t('inside.truth')),
        h(
          'div',
          { class: 'table-wrap' },
          h(
            'table',
            { class: 'truth' },
            h('thead', {}, h('tr', {}, ...def.inputs.map((p) => h('th', { class: 'in' }, p.name)), ...def.outputs.map((p) => h('th', { class: 'out' }, p.name)))),
            h(
              'tbody',
              {},
              ...rows.map((r) => h('tr', {}, ...r.in.map((v, i) => cell(v, def.inputs[i]!, 'in')), ...r.out.map((v, i) => cell(v, def.outputs[i]!, 'out')))),
            ),
          ),
        ),
      );
    } catch {
      /* 진리표를 만들 수 없으면 생략 */
    }
  }
  if (level) box.append(h('p', { class: 'muted small' }, t('inside.fromLevel', { id: level.id, title: level.text[lang].title })));
  return box;
}
