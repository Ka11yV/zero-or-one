// 샌드박스 고급 도구: 내 칩 저장/관리, 공유·내보내기, 메모리에 프로그램 적재
import { assemble } from '../cpu/isa';
import { autoArrange } from '../editor/arrange';
import { emptyDoc, genId, toChipDef, type EditorDoc } from '../editor/doc';
import type { Editor } from '../editor/editor';
import { GRID } from '../editor/geometry';
import { setFlag } from '../game/achievements';
import { t } from '../i18n';
import type { ChipLibrary, CompositeChipDef } from '../sim';
import { nandCountOf } from '../sim/netlist';
import { checkChipName, dependentsOf, putChip, removeChip, type CustomChipStore } from '../storage/customChips';
import { encodeBundle, makeBundle, parseBundle, type CircuitBundle } from '../storage/share';
import { loadSandboxBackup, loadSandboxProgram, saveSandboxProgram } from '../storage/store';
import { button, h } from './dom';
import { openModal } from './modal';
import type { Toast } from './workspace';

export interface SandboxTools {
  custom(): CustomChipStore;
  /** 내 칩 저장소를 바꾸고 샌드박스를 다시 그린다 (팔레트·라이브러리 갱신) */
  setCustom(store: CustomChipStore): void;
  /** 다른 회로(공유·파일)를 불러온다: 확인 → 백업 → 교체 */
  importBundle(b: CircuitBundle): void;
  /** 백업해 둔 이전 샌드박스로 되돌린다 */
  restoreBackup(): void;
  /** 내부 보기 창 */
  openChip(id: string): void;
}

const pinsText = (ps: { name: string; width: number }[]) => ps.map((p) => (p.width > 1 ? `${p.name}[${p.width}]` : p.name)).join(', ') || '—';

/** 칩 정의만 있고 편집 원본이 없을 때(가져온 칩) 자동 배치한 편집 문서를 만든다 */
export function chipDefToDoc(def: CompositeChipDef, lib: ChipLibrary): EditorDoc {
  const doc = emptyDoc();
  def.inputs.forEach((p, i) => doc.inputs.push({ id: genId(doc, 'i'), name: p.name, width: p.width, x: 0, y: i * 3 * GRID }));
  def.outputs.forEach((p, i) => doc.outputs.push({ id: genId(doc, 'o'), name: p.name, width: p.width, x: 20 * GRID, y: i * 3 * GRID }));
  for (const inst of def.instances) doc.instances.push({ uid: inst.uid, chip: inst.chip, x: 0, y: 0 });
  for (const w of def.wires) doc.wires.push({ id: genId(doc, 'w'), from: { ...w.from }, to: { ...w.to } });
  autoArrange(doc, lib);
  return doc;
}

// ================= 내 칩 카드 =================

export function myChipsCard(editor: Editor, toast: Toast, tools: SandboxTools): { el: HTMLElement; render(): void } {
  const el = h('section', { class: 'card tools-card' });
  /** 불러와 편집 중인 칩 이름 (저장 기본값) */
  let editing = '';

  const render = () => {
    el.textContent = '';
    const n = Object.keys(tools.custom().chips).length;
    const save = button(`💾 ${t('custom.save')}`, () => openSave(), 'primary');
    save.disabled = !editor.doc.inputs.length || !editor.doc.outputs.length || !!editor.compileError;
    save.title = save.disabled ? t('custom.saveNeedIO') : t('custom.saveHint');
    el.append(
      h('h2', {}, t('custom.title')),
      h('div', { class: 'tools-row' }, save, button(`📦 ${t('custom.manage', { n })}`, () => openManage())),
      h('div', { class: 'tools-row' }, button(`🔗 ${t('share.title')}`, () => openShare(editor, toast, tools))),
    );
  };

  const openSave = () => {
    const store = tools.custom();
    const name = h('input', { type: 'text', class: 'chip-name-input', maxlength: '16', spellcheck: 'false', value: editing, placeholder: 'MY_CHIP' });
    const desc = h('textarea', { class: 'chip-desc-input', rows: '2', maxlength: '200', placeholder: t('custom.descPlaceholder') });
    desc.value = editing ? (store.meta[editing]?.description ?? '') : '';
    const msg = h('p', { class: 'small' });
    const overwrite = h('input', { type: 'checkbox' });
    const overwriteRow = h('label', { class: 'check-row', hidden: '' }, overwrite, t('custom.overwrite'));
    const ok = button(t('custom.saveConfirm'), () => doSave(), 'primary');
    const check = () => {
      name.value = name.value.toUpperCase().replace(/[^A-Z0-9_]/g, '');
      const v = name.value;
      let problem = checkChipName(v, store);
      const self = editor.doc.instances.some((i) => i.chip === v);
      overwriteRow.hidden = problem !== 'exists';
      if (problem === 'exists' && overwrite.checked) problem = null;
      msg.className = 'small ' + (problem || self ? 'error' : 'muted');
      msg.textContent = self ? t('custom.err.self') : problem ? t(`custom.err.${problem}`) : t('custom.nameOk');
      ok.disabled = !!problem || self;
    };
    name.oninput = check;
    overwrite.onchange = check;
    const doSave = () => {
      check();
      if (ok.disabled) return;
      const def = toChipDef(editor.doc, name.value);
      const next = putChip(store, def, editor.doc, { description: desc.value.trim() || undefined });
      editing = name.value;
      m.close();
      toast(t('custom.saved', { name: name.value }), 'success');
      tools.setCustom(next);
    };
    const content = h(
      'div',
      { class: 'save-chip' },
      h('h2', {}, `💾 ${t('custom.save')}`),
      h('p', { class: 'muted' }, t('custom.saveIntro')),
      h('dl', { class: 'chip-pins' }, h('dt', {}, t('inside.inputs')), h('dd', {}, pinsText(editor.doc.inputs)), h('dt', {}, t('inside.outputs')), h('dd', {}, pinsText(editor.doc.outputs))),
      h('label', { class: 'field' }, h('span', {}, t('custom.name')), name),
      msg,
      overwriteRow,
      h('label', { class: 'field' }, h('span', {}, t('custom.desc')), desc),
      h('div', { class: 'actions' }, button(t('common.cancel'), () => m.close(), 'ghost'), ok),
    );
    const m = openModal(content);
    name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSave();
    });
    check();
    name.focus();
  };

  const openManage = () => {
    const store = tools.custom();
    const ids = Object.keys(store.chips).sort();
    const list = h('div', { class: 'chip-list' });
    if (!ids.length) list.append(h('p', { class: 'muted' }, t('custom.empty')));
    for (const id of ids) {
      const def = store.chips[id]!;
      const meta = store.meta[id];
      let nand = '—';
      try {
        nand = nandCountOf(def, editor.lib).toLocaleString();
      } catch {
        /* 칩이 깨졌을 때 */
      }
      const deps = dependentsOf(store, id);
      const usedHere = editor.doc.instances.some((i) => i.chip === id);
      const del = button(t('custom.delete'), () => {
        if (del.dataset.armed) {
          m.close();
          toast(t('custom.deleted', { name: id }));
          tools.setCustom(removeChip(tools.custom(), id));
        } else {
          del.dataset.armed = '1';
          del.textContent = usedHere ? t('custom.deleteUsedConfirm') : t('custom.deleteConfirm');
          del.classList.add('danger');
        }
      }, 'ghost');
      if (deps.length) {
        del.disabled = true;
        del.title = t('custom.usedBy', { list: deps.join(', ') });
      }
      const load = button(t('custom.load'), () => {
        const src = tools.custom().sources[id] ?? chipDefToDoc(def, editor.lib);
        editor.resetTo(src);
        editor.fit();
        editing = id;
        m.close();
        toast(t('custom.loaded', { name: id }));
      });
      list.append(
        h(
          'div',
          { class: 'chip-row' },
          h(
            'div',
            { class: 'chip-row-main' },
            h('strong', {}, id),
            meta?.imported ? h('span', { class: 'tag' }, t('custom.importedTag')) : null,
            h('span', { class: 'muted small' }, ` ${pinsText(def.inputs)} → ${pinsText(def.outputs)} · NAND ${nand}`),
            meta?.description ? h('p', { class: 'small chip-desc' }, meta.description) : null,
          ),
          h(
            'div',
            { class: 'chip-row-actions' },
            button(t('custom.inside'), () => {
              m.close();
              tools.openChip(id);
            }, 'ghost'),
            load,
            del,
          ),
        ),
      );
    }
    const content = h('div', {}, h('h2', {}, `📦 ${t('custom.manageTitle')}`), h('p', { class: 'muted small' }, t('custom.manageHint')), list);
    const m = openModal(content, { wide: true });
    content.append(h('div', { class: 'actions' }, button(t('common.close'), () => m.close())));
  };

  return { el, render };
}

// ================= 공유 · 내보내기 =================

function openShare(editor: Editor, toast: Toast, tools: SandboxTools): void {
  const notes = Object.fromEntries(Object.entries(tools.custom().meta).flatMap(([k, m]) => (m.description ? [[k, m.description]] : [])));
  const bundle = makeBundle(editor.doc, editor.lib, notes);
  const linkBox = h('input', { type: 'text', readonly: '', class: 'share-link', placeholder: t('share.linkPlaceholder') });
  const info = h('p', { class: 'muted small' }, t('share.contains', { parts: editor.doc.instances.length, chips: bundle.chips.length }));
  const copy = button(`🔗 ${t('share.copyLink')}`, async () => {
    const code = await encodeBundle(bundle);
    const url = `${location.origin}${location.pathname}#/sandbox?c=${code}`;
    linkBox.value = url;
    linkBox.select();
    try {
      await navigator.clipboard.writeText(url);
      toast(t('share.copied', { n: Math.round(url.length / 1024) || 1 }), 'success');
    } catch {
      toast(t('share.copyManual'));
    }
    setFlag('shared');
  }, 'primary');
  const download = button(`⬇ ${t('share.download')}`, () => {
    const blob = new Blob([JSON.stringify(bundle, null, 1)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `circuit-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setFlag('shared');
  });
  const file = h('input', { type: 'file', accept: '.json,application/json', hidden: '' });
  file.onchange = async () => {
    const f = file.files?.[0];
    if (!f) return;
    try {
      const b = parseBundle(JSON.parse(await f.text()));
      if (!b) throw new Error('bad');
      m.close();
      tools.importBundle(b);
    } catch {
      toast(t('share.badFile'), 'error');
    }
  };
  const upload = button(`⬆ ${t('share.upload')}`, () => file.click());
  const backup = loadSandboxBackup();
  const content = h(
    'div',
    { class: 'share' },
    h('h2', {}, `🔗 ${t('share.title')}`),
    h('p', { class: 'muted' }, t('share.intro')),
    info,
    h('div', { class: 'tools-row' }, copy, download, upload, file),
    linkBox,
    h('p', { class: 'muted small' }, t('share.note')),
    backup
      ? h(
          'div',
          { class: 'tools-row' },
          button(`↩ ${t('share.restore')}`, () => {
            m.close();
            tools.restoreBackup();
          }, 'ghost'),
        )
      : null,
  );
  const m = openModal(content);
  content.append(h('div', { class: 'actions' }, button(t('common.close'), () => m.close())));
}

// ================= 메모리에 프로그램 적재 =================

export function programCard(editor: Editor, toast: Toast): { el: HTMLElement; render(): void; afterRebuild(): void } {
  const el = h('section', { class: 'card program-card' });
  const saved = loadSandboxProgram();
  let src = saved.src || t('sbprog.starter');
  let auto = saved.auto;
  let target = saved.target;
  const code = h('textarea', { class: 'code small-code', spellcheck: 'false', rows: '8', wrap: 'off' });
  code.value = src;
  const status = h('div', { class: 'asm-status' });
  const select = h('select', { class: 'mem-target' });
  const autoBox = h('input', { type: 'checkbox' });
  autoBox.checked = auto;

  const memBlocks = () => {
    const nl = editor.netlist;
    const sim = editor.sim;
    return nl && sim ? nl.blocks.map((b, i) => ({ b, i })).filter(({ i }) => !!sim.blockStates[i]?.mem) : [];
  };
  const persist = () => saveSandboxProgram({ src, auto, target });

  const load = (quiet = false) => {
    const asm = assemble(src);
    status.textContent = '';
    if (asm.errors.length) {
      const e = asm.errors[0]!;
      status.append(h('span', { class: 'error' }, `${t('prog.line', { n: e.line })} ${t(e.key, e.params ?? {})}`));
      return;
    }
    const blk = memBlocks().find(({ b }) => b.path === target) ?? memBlocks()[0];
    if (!blk) return;
    editor.writeMemory(blk.i, asm.image);
    status.append(h('span', { class: 'ok' }, `✓ ${t('sbprog.loaded', { n: asm.size, path: blk.b.path })}`));
    if (!quiet) toast(t('sbprog.loadedToast', { path: blk.b.path }), 'success');
  };

  const render = () => {
    const blocks = memBlocks();
    el.hidden = !blocks.length;
    if (!blocks.length) return;
    select.textContent = '';
    for (const { b } of blocks) {
      const size = editor.sim!.blockStates[blocks.find((x) => x.b === b)!.i]!.mem!.length;
      const o = h('option', { value: b.path }, `${b.chipId} · ${b.path} (${size}B)`);
      if (b.path === target) o.selected = true;
      select.append(o);
    }
    if (!blocks.some(({ b }) => b.path === target)) target = blocks[0]!.b.path;
    el.textContent = '';
    el.append(
      h('h2', {}, t('sbprog.title')),
      h('p', { class: 'muted small' }, t('sbprog.hint')),
      h('label', { class: 'field' }, h('span', {}, t('sbprog.target')), select),
      code,
      h('div', { class: 'tools-row' }, button(`⤓ ${t('sbprog.load')}`, () => load(), 'primary'), h('label', { class: 'check-row' }, autoBox, t('sbprog.auto'))),
      status,
    );
  };

  code.oninput = () => {
    src = code.value;
    persist();
  };
  code.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      code.setRangeText('  ', code.selectionStart, code.selectionEnd, 'end');
      src = code.value;
    }
  });
  select.onchange = () => {
    target = select.value;
    persist();
  };
  autoBox.onchange = () => {
    auto = autoBox.checked;
    persist();
  };

  return {
    el,
    render,
    /** 회로가 다시 컴파일되면 메모리가 비므로, 옵션이 켜져 있으면 다시 적재 */
    afterRebuild() {
      render();
      if (auto && saved.src !== undefined && src.trim() && memBlocks().length) load(true);
    },
  };
}

/** 칩 설명: 캠페인 칩은 한 줄 설명, 내 칩은 저장할 때 쓴 설명 */
export function customNotes(store: CustomChipStore): Record<string, string> {
  return Object.fromEntries(Object.entries(store.meta).flatMap(([k, m]) => (m.description ? [[k, m.description]] : [])));
}
