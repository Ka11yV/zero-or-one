// 화면 전환(해시 라우팅): #/ = 챕터 맵, #/level/<id> = 레벨, #/sandbox = 샌드박스
import { emptyDoc, toChipDef } from '../editor/doc';
import { levelStartDoc } from '../game/levelDoc';
import { getLang, t } from '../i18n';
import { CHAPTERS, getLevel, isProgramLevel, nextLevel } from '../levels';
import { nandCountOf } from '../sim/netlist';
import { CHIP_SUMMARY } from '../levels/chipInfo';
import { BUILTINS, BUS_WIDTHS, createLibrary, type ChipDef } from '../sim';
import {
  isUnlocked,
  levelRecord,
  libraryFor,
  loadProgress,
  recordClear,
  recordHint,
  saveProgress,
  starsFor,
  unlockedChips,
  type LevelRecord,
  type Progress,
} from '../storage/progress';
import { loadSandbox, loadSandboxBackup, saveSandboxBackup, saveSandboxDebounced, saveSandboxNow } from '../storage/store';
import { loadCustomChips, putChip, saveCustomChips } from '../storage/customChips';
import { decodeBundle, type CircuitBundle } from '../storage/share';
import { customNotes, type SandboxTools } from './sandboxTools';
import type { Editor } from '../editor/editor';
import { button, h } from './dom';
import { initSeenChips } from '../storage/seenChips';
import { levelPanel } from './levelPanel';
import { mountMap } from './map';
import { closeAllModals, openModal, showChipInside, showClear, showCodex } from './modal';
import { sandboxPanel } from './sandboxPanel';
import { mountWorkspace } from './workspace';
import { mountProgram } from './programScreen';
import { showAchievements } from './achievementsModal';
import { accountButton } from './accountModal';
import { createSync } from '../storage/sync';

type Route = { name: 'map' } | { name: 'level'; id: string } | { name: 'sandbox'; share?: string };

function parseRoute(hash: string): Route {
  const m = /^#\/level\/([\w-]+)$/.exec(hash);
  if (m) return { name: 'level', id: m[1]! };
  if (hash === '#/sandbox') return { name: 'sandbox' };
  const s = /^#\/sandbox\?c=([\w-]+)$/.exec(hash);
  if (s) return { name: 'sandbox', share: s[1]! };
  return { name: 'map' };
}

export function startApp(root: HTMLElement): void {
  let progress: Progress = loadProgress();
  initSeenChips(unlockedChips(progress));
  let screen: { dispose(): void } | null = null;
  let draftTimer: ReturnType<typeof setTimeout> | undefined;
  /** 맵으로 돌아갔을 때 반짝일 레벨 (방금 깬 레벨) */
  let lastCleared: string | undefined;

  // 계정 동기화: 서버 기록이 합쳐지면 진행 기록을 다시 읽는다. 맵이면 다시 그리고, 작업 중인 화면은 건드리지 않는다
  const sync = createSync({
    onRemoteApplied: () => {
      progress = loadProgress();
      if (parseRoute(location.hash).name === 'map') render();
    },
  });

  const setProgress = (p: Progress) => {
    progress = p;
    saveProgress(p);
  };
  const go = (hash: string) => {
    if (location.hash === hash) render();
    else location.hash = hash;
  };

  /**
   * 공유 회로 불러오기: 필요한 칩을 내 칩(가져온 칩)으로 추가하고, 확인을 받은 뒤 지금 샌드박스를 백업하고 바꾼다.
   * 같은 이름의 다른 내 칩이 있으면 아무것도 바꾸지 않는다.
   */
  const importBundle = (b: CircuitBundle, editor: Editor | null) => {
    const custom = loadCustomChips();
    const same = (x: ChipDef, y: ChipDef) =>
      JSON.stringify([x.inputs, x.outputs, x.kind === 'composite' ? [x.instances, x.wires] : 0]) ===
      JSON.stringify([y.inputs, y.outputs, y.kind === 'composite' ? [y.instances, y.wires] : 0]);
    const samePins = (x: ChipDef, y: ChipDef) => JSON.stringify([x.inputs, x.outputs]) === JSON.stringify([y.inputs, y.outputs]);
    const builtin = new Set(BUILTINS.map((c) => c.id));
    const conflicts: string[] = [];
    let next = custom;
    for (const c of b.chips) {
      if (builtin.has(c.id)) continue;
      const mine = progress.chips[c.id];
      if (mine) {
        if (!samePins(mine, c)) conflicts.push(c.id);
        continue;
      }
      const existing = custom.chips[c.id];
      if (existing) {
        if (!same(existing, c)) conflicts.push(c.id);
        continue;
      }
      next = putChip(next, c, undefined, { imported: true, description: b.notes?.[c.id] });
    }
    if (conflicts.length) {
      const m = openModal(h('div', {}, h('h2', {}, t('share.conflictTitle')), h('p', {}, t('share.conflict', { list: conflicts.join(', ') }))));
      m.el.append(h('div', { class: 'actions' }, button(t('common.close'), () => m.close())));
      return;
    }
    const content = h(
      'div',
      {},
      h('h2', {}, `⬆ ${t('share.importTitle')}`),
      h('p', {}, t('share.importConfirm', { parts: b.doc.instances.length, chips: b.chips.length })),
      h('p', { class: 'muted small' }, t('share.importBackup')),
    );
    const m = openModal(content);
    content.append(
      h(
        'div',
        { class: 'actions' },
        button(t('common.cancel'), () => m.close(), 'ghost'),
        button(
          t('share.importDo'),
          () => {
            m.close();
            saveSandboxBackup(editor?.doc ?? loadSandbox() ?? emptyDoc());
            saveCustomChips(next);
            saveSandboxNow(b.doc);
            if (location.hash !== '#/sandbox') location.hash = '#/sandbox';
            else render();
          },
          'primary',
        ),
      ),
    );
  };

  const render = () => {
    clearTimeout(draftTimer);
    screen?.dispose();
    screen = null;
    // 화면이 바뀌면(뒤로 가기 등) 앞 화면의 창은 닫는다
    closeAllModals();
    root.className = '';
    const route = parseRoute(location.hash);

    if (route.name === 'level') {
      const level = getLevel(route.id);
      if (!level || !isUnlocked(progress, level.id)) return go('#/');
      const lib = libraryFor(progress);
      /** 클리어 기록을 남기고 연출을 띄운다. before = 기록하기 전의 이 레벨 기록 */
      const showClearFor = (score: number, before: LevelRecord) => {
        lastCleared = level.id;
        const next = nextLevel(level.id);
        const libNow = libraryFor(progress);
        const cpu = libNow.get('CPU');
        const chapter = CHAPTERS.find((c) => c.id === level.chapter)!;
        const lastOfChapter = chapter.levels[chapter.levels.length - 1]?.id === level.id;
        const nextChapter = CHAPTERS.find((c) => c.id === level.chapter + 1);
        const chipId = level.unlocks?.chipId;
        const chip = chipId ? progress.chips[chipId] : undefined;
        showClear({
          level,
          next: next && isUnlocked(progress, next.id) ? next : undefined,
          onNext: () => next && go(`#/level/${next.id}`),
          onMap: () => go('#/'),
          celebration: {
            firstClear: !before.cleared,
            prevStars: before.stars,
            stars: starsFor(level, score),
            score,
            goal: level.stars ? ('maxNand' in level.stars ? level.stars.maxNand : level.stars.maxBytes) : undefined,
            unit: isProgramLevel(level) ? 'bytes' : 'nand',
            unlocked: chip
              ? { spec: chip, nand: nandCountOf(chip, libNow), summary: CHIP_SUMMARY[chip.id]?.[getLang()] ?? '' }
              : undefined,
            chapterDone: lastOfChapter
              ? { no: chapter.id, title: chapter.title[getLang()], nextTitle: nextChapter ? `${nextChapter.id} · ${nextChapter.title[getLang()]}` : undefined }
              : undefined,
            ending: !next && cpu ? { cpuNand: nandCountOf(cpu, libNow) } : undefined,
          },
        });
      };

      if (isProgramLevel(level)) {
        let srcTimer: ReturnType<typeof setTimeout> | undefined;
        const save = (src: string) => setProgress({ ...progress, programs: { ...progress.programs, [level.id]: src } });
        const ps = mountProgram(root, {
          level,
          chapterTitle: () => CHAPTERS.find((c) => c.id === level.chapter)?.title[getLang()] ?? '',
          lib,
          cpu: lib.get('CPU'),
          source: progress.programs?.[level.id] ?? level.starter[getLang()],
          onSource: (src) => {
            clearTimeout(srcTimer);
            srcTimer = setTimeout(() => save(src), 400);
          },
          hintsUsed: levelRecord(progress, level.id).hintsUsed,
          onHint: (n) => setProgress(recordHint(progress, level.id, n)),
          onPass: (bytes) => {
            const before = levelRecord(progress, level.id);
            setProgress(recordClear(progress, level, null, null, bytes));
            showClearFor(bytes, before);
          },
          onBack: () => go('#/'),
        });
        root.className = 'screen-program';
        screen = {
          dispose: () => {
            ps.dispose();
            clearTimeout(srcTimer);
          },
        };
        return;
      }

      const initial = () => levelStartDoc(level);
      const doc = structuredClone(progress.drafts[level.id] ?? initial());
      const tx = () => level.text[getLang()];
      const ws = mountWorkspace(root, {
        lib,
        doc,
        title: () => `${level.id} · ${tx().title}`,
        subtitle: () => CHAPTERS.find((c) => c.id === level.chapter)?.title[getLang()] ?? '',
        paletteIO: false,
        paletteChips: level.allowedChips.filter((c) => lib.has(c)),
        lockIO: true,
        onBack: () => go('#/'),
        initialDoc: initial,
        onDocChange: (d) => {
          clearTimeout(draftTimer);
          const snapshot = structuredClone(d);
          draftTimer = setTimeout(() => setProgress({ ...progress, drafts: { ...progress.drafts, [level.id]: snapshot } }), 500);
        },
        onOpenChip: (chip) => showChipInside(chip, { sources: progress.chipSources, lib }),
        panel: (el, editor, toast) =>
          levelPanel(el, editor, toast, {
            level,
            hintsUsed: levelRecord(progress, level.id).hintsUsed,
            onHint: (n) => setProgress(recordHint(progress, level.id, n)),
            onPass: (nandCount) => {
              const chip = level.unlocks ? toChipDef(editor.doc, level.unlocks.chipId) : null;
              const draft = structuredClone(editor.doc);
              const before = levelRecord(progress, level.id);
              setProgress(recordClear({ ...progress, drafts: { ...progress.drafts, [level.id]: draft } }, level, editor.doc, chip, nandCount));
              showClearFor(nandCount, before);
            },
          }),
      });
      root.className = 'screen-level';
      screen = ws;
      return;
    }

    if (route.name === 'sandbox') {
      // 샌드박스 = 캠페인 칩 + 내 칩. 캠페인에서 같은 id를 해금했으면 플레이어의 캠페인 칩이 우선
      const custom = loadCustomChips();
      const lib = createLibrary([...Object.values(custom.chips), ...Object.values(progress.chips)]);
      const chips = ['NAND', 'CONST0', 'CONST1', ...unlockedChips(progress), ...BUS_WIDTHS.flatMap((w) => [`SPLIT${w}`, `MERGE${w}`])];
      const customIds = Object.keys(custom.chips)
        .filter((id) => !progress.chips[id])
        .sort();
      let sbEditor: Editor | null = null;
      const remount = () => {
        if (sbEditor) saveSandboxNow(sbEditor.doc);
        render();
      };
      const insideCtx = () => ({ sources: { ...custom.sources, ...progress.chipSources }, lib, notes: customNotes(custom) });
      const tools: SandboxTools = {
        custom: () => loadCustomChips(),
        setCustom: (store) => {
          saveCustomChips(store);
          remount();
        },
        importBundle: (b) => importBundle(b, sbEditor),
        restoreBackup: () => {
          const prev = loadSandboxBackup();
          if (!prev || !sbEditor) return;
          sbEditor.resetTo(prev);
          sbEditor.fit();
        },
        openChip: (id) => showChipInside(id, insideCtx()),
      };
      const ws = mountWorkspace(root, {
        lib,
        doc: loadSandbox() ?? emptyDoc(),
        title: () => t('app.sandbox'),
        subtitle: () => '',
        paletteIO: true,
        paletteChips: chips,
        paletteCustom: customIds,
        lockIO: false,
        onBack: () => go('#/'),
        onDocChange: (d) => saveSandboxDebounced(() => d),
        onOpenChip: (chip) => showChipInside(chip, insideCtx()),
        panel: (el, editor, toast) => sandboxPanel(el, editor, toast, tools),
      });
      sbEditor = ws.editor;
      root.className = 'screen-sandbox';
      screen = ws;
      // 공유 링크로 들어왔으면: 주소에서 지우고 불러오기 확인
      if (route.share) {
        history.replaceState(null, '', '#/sandbox');
        void decodeBundle(route.share).then((b) => {
          if (b) importBundle(b, sbEditor);
          else ws.toast(t('share.badLink'), 'error');
        });
      }
      return;
    }

    root.className = 'screen-map';
    const highlight = lastCleared;
    lastCleared = undefined;
    screen = mountMap(root, progress, {
      highlight,
      openLevel: (id) => go(`#/level/${id}`),
      openSandbox: () => go('#/sandbox'),
      openCodex: () => showCodex(progress),
      openAchievements: () => showAchievements(progress),
      account: () => accountButton(sync),
    });
  };

  window.addEventListener('hashchange', render);
  render();
  void sync.init();
}
