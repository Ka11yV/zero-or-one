import { CompileError, compile, DEFAULT_MAX_STEPS, measure, Simulator, type ChipLibrary, type CircuitMetrics, type CompileWarning, type Netlist } from '../sim';
import { Camera } from './camera';
import { alignSelection, autoArrange as arrangeAll, type AlignMode } from './arrange';
import {
  addInstance,
  addIO,
  connect,
  copySelection,
  docBounds,
  emptySelection,
  findIO,
  instanceBounds,
  layoutPins,
  moveSelection,
  paste,
  removeSelection,
  renameIO,
  selectAll,
  selectInRect,
  selectionSize,
  setIOWidth,
  toChipDef,
  type Clipboard,
  type EditorDoc,
  type Selection,
} from './doc';
import { chipSize, GRID, IO_H, IO_W, ioRect, normRect, rectsIntersect, snap, type PinGeom, type Pt, type Rect } from './geometry';
import { History } from './history';
import { hitTest } from './hit';
import { render, type RenderState, type WireDrag } from './renderer';

export type PlaceItem = { kind: 'chip'; chip: string } | { kind: 'input' | 'output' };

/** structure = 회로 연결이 바뀜(재컴파일), layout = 위치만 바뀜, selection, sim = 신호 값, toast = 알림 */
export type ChangeKind = 'structure' | 'layout' | 'selection' | 'sim' | 'history';

/** 속도 단계: every 프레임마다 steps 단계 진행 */
export const SPEEDS = [
  { every: 15, steps: 1 },
  { every: 5, steps: 1 },
  { every: 1, steps: 1 },
  { every: 1, steps: 10 },
  { every: 1, steps: 200 },
  { every: 1, steps: DEFAULT_MAX_STEPS },
] as const;

type Drag =
  | { kind: 'none' }
  | { kind: 'pan'; last: Pt }
  | { kind: 'wire'; drag: WireDrag }
  | { kind: 'move'; start: Pt; applied: Pt; moved: boolean; toggleInput?: string; deselectOnClick?: string }
  | { kind: 'box'; start: Pt; rect: Rect; additive: boolean };

export interface EditorOptions {
  /** 레벨 모드: 입출력 핀은 레벨이 정하므로 지우거나 바꿀 수 없다 */
  lockIO?: boolean;
  /** 읽기 전용(칩 내부 보기): 화면 이동과 입력 스위치 조작만 가능 */
  readOnly?: boolean;
  /** 복합 칩을 더블클릭했을 때 */
  onOpenChip?: (chipId: string) => void;
  onToast?: (msg: string, kind?: 'info' | 'error') => void;
  messages: {
    connect: (reason: 'same-role' | 'width' | 'self', widths?: [number, number]) => string;
    renameInvalid: () => string;
  };
}

export class Editor {
  doc: EditorDoc;
  readonly lib: ChipLibrary;
  readonly camera = new Camera();
  readonly history = new History();
  sel: Selection = emptySelection();

  // 시뮬레이션
  sim: Simulator | null = null;
  netlist: Netlist | null = null;
  compileError: CompileError | null = null;
  warnings: CompileWarning[] = [];
  metrics: CircuitMetrics | null = null;
  readonly inputValues = new Map<string, number>();
  running = true;
  speed = SPEEDS.length - 1;
  /** 마지막 입력 변경 이후 진행한 단계 수 (발진 판정용) */
  stepsSinceChange = 0;

  private pins = new Map<string, PinGeom>();
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private dirty = true;
  private frame = 0;
  private drag: Drag = { kind: 'none' };
  private hoverPin?: string;
  private hoverWire?: string;
  private ghost?: RenderState['ghost'];
  private spaceDown = false;
  private clipboard: Clipboard | null = null;
  private pasteCount = 0;
  private listeners = new Set<(k: ChangeKind) => void>();
  private disposers: (() => void)[] = [];

  constructor(canvas: HTMLCanvasElement, lib: ChipLibrary, doc: EditorDoc, private readonly opts: EditorOptions) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.lib = lib;
    this.doc = doc;
    this.rebuild();
    this.bindEvents();
    this.resize();
    const bounds = docBounds(doc, lib);
    if (bounds) this.camera.fit(bounds, this.width, this.height);
    else {
      this.camera.x = -this.width / 2;
      this.camera.y = -this.height / 2;
    }
    const loop = () => {
      this.tick();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  private raf = 0;

  // ================= 공개 API =================

  on(fn: (k: ChangeKind) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(k: ChangeKind): void {
    this.dirty = true;
    for (const fn of this.listeners) fn(k);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    for (const d of this.disposers) d();
  }

  get oscillating(): boolean {
    return !!this.sim?.busy && this.stepsSinceChange >= DEFAULT_MAX_STEPS;
  }

  undo(): void {
    const prev = this.history.undo(this.doc);
    if (prev) this.replaceDoc(prev);
  }

  redo(): void {
    const next = this.history.redo(this.doc);
    if (next) this.replaceDoc(next);
  }

  clearAll(): void {
    if (this.opts.readOnly) return;
    this.mutate(() => {
      this.doc.instances = [];
      if (!this.opts.lockIO) {
        this.doc.inputs = [];
        this.doc.outputs = [];
      }
      this.doc.wires = [];
    });
    this.setSelection(emptySelection());
  }

  /** 문서를 통째로 바꾼다 (레벨 초기화 등). 실행 취소 가능 */
  resetTo(doc: EditorDoc): void {
    this.history.record(this.doc);
    this.replaceDoc(structuredClone(doc));
  }

  /** 선택한 부품 맞춤 / 간격 균등. 위치만 바뀌므로 다시 컴파일하지 않는다 */
  alignSelected(mode: AlignMode): boolean {
    return this.rearrange(() => alignSelection(this.doc, this.lib, this.sel, mode));
  }

  /** 회로 전체를 신호 흐름(왼쪽 → 오른쪽) 순서로 자동 정렬하고 화면을 맞춘다 */
  autoArrange(): boolean {
    const ok = this.rearrange(() => arrangeAll(this.doc, this.lib));
    if (ok) this.fit();
    return ok;
  }

  private rearrange(fn: () => boolean): boolean {
    if (this.opts.readOnly) return false;
    this.history.record(this.doc);
    if (!fn()) {
      this.history.discardLast();
      return false;
    }
    this.pins = layoutPins(this.doc, this.lib);
    this.dirty = true;
    this.emit('layout');
    this.emit('history');
    return true;
  }

  fit(): void {
    const b = docBounds(this.doc, this.lib);
    if (b) this.camera.fit(b, this.width, this.height);
    this.dirty = true;
  }

  setRunning(r: boolean): void {
    this.running = r;
    this.emit('sim');
  }

  setSpeed(i: number): void {
    this.speed = Math.max(0, Math.min(SPEEDS.length - 1, i));
  }

  /** 게이트 지연 1단계 진행 (일시정지 상태에서 관찰용) */
  stepOnce(): void {
    if (!this.sim) return;
    this.sim.step();
    this.stepsSinceChange++;
    this.emit('sim');
    this.maybeRelease();
  }

  /** 선택된 입출력 노드 (정확히 1개일 때) */
  selectedIO(): ReturnType<typeof findIO> {
    if (this.sel.io.size !== 1 || this.sel.instances.size || this.sel.wires.size) return undefined;
    return findIO(this.doc, [...this.sel.io][0]!);
  }

  renameSelectedIO(name: string): boolean {
    const io = this.selectedIO();
    if (!io) return false;
    const before = io.node.name;
    if (name === before) return true;
    this.history.record(this.doc);
    if (!renameIO(this.doc, io.node.id, name)) {
      this.history.discardLast();
      this.opts.onToast?.(this.opts.messages.renameInvalid(), 'error');
      return false;
    }
    const v = this.inputValues.get(before);
    if (v !== undefined) {
      this.inputValues.delete(before);
      this.inputValues.set(name, v);
    }
    this.commit();
    return true;
  }

  setSelectedIOWidth(width: number): void {
    const io = this.selectedIO();
    if (!io || io.node.width === width) return;
    this.mutate(() => setIOWidth(this.doc, io.node.id, width));
    this.inputValues.delete(io.node.name);
  }

  /** 팔레트 항목을 화면 가운데(빈 곳)에 놓는다 */
  placeAtCenter(item: PlaceItem): void {
    const c = this.camera.toWorld(this.width / 2, this.height / 2);
    let { x, y } = this.originFor(item, c);
    const size = this.sizeOf(item);
    const rects = [
      ...this.doc.instances.map((i) => instanceBounds(this.lib, i)),
      ...[...this.doc.inputs, ...this.doc.outputs].map(ioRect),
    ];
    // 기존 부품과 겹치지 않는 자리를 찾을 때까지 아래로 내려간다 (여백 1칸)
    const occupied = (px: number, py: number) =>
      rects.some((r) => rectsIntersect(r, { x: px - GRID, y: py - GRID, w: size.w + 2 * GRID, h: size.h + 2 * GRID }));
    for (let i = 0; i < 60 && occupied(x, y); i++) y += GRID;
    this.place(item, x, y);
  }

  /** 팔레트에서 끌어오기 시작 (팔레트 버튼의 pointerdown에서 호출) */
  beginPaletteDrag(item: PlaceItem, e: PointerEvent): void {
    const start = { x: e.clientX, y: e.clientY };
    let dragging = false;
    const move = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 5) dragging = true;
      if (!dragging) return;
      const p = this.clientToWorld(ev.clientX, ev.clientY);
      if (p) {
        const o = this.originFor(item, p);
        this.ghost = item.kind === 'chip' ? { kind: 'chip', chip: item.chip, ...o } : { kind: item.kind, ...o };
      } else this.ghost = undefined;
      this.dirty = true;
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      this.ghost = undefined;
      this.dirty = true;
      if (!dragging) return this.placeAtCenter(item);
      const p = this.clientToWorld(ev.clientX, ev.clientY);
      if (p) {
        const o = this.originFor(item, p);
        this.place(item, o.x, o.y);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /** 핀 값 읽기 (컴파일 실패 시 undefined) */
  pinValue = (key: string): number | undefined => {
    const bits = this.netlist?.pinNets.get(key);
    if (!bits || !this.sim) return undefined;
    let v = 0;
    for (let i = 0; i < bits.length; i++) v |= this.sim.values[bits[i]!]! << i;
    return v >>> 0;
  };

  // ================= 내부: 문서 변경 =================

  private place(item: PlaceItem, x: number, y: number): void {
    this.history.record(this.doc);
    const sel = emptySelection();
    if (item.kind === 'chip') sel.instances.add(addInstance(this.doc, item.chip, x, y).uid);
    else sel.io.add(addIO(this.doc, item.kind, x, y).id);
    this.commit();
    this.setSelection(sel);
  }

  private sizeOf(item: PlaceItem): { w: number; h: number } {
    const def = item.kind === 'chip' ? this.lib.get(item.chip) : undefined;
    return def ? chipSize(def) : { w: IO_W, h: IO_H };
  }

  private originFor(item: PlaceItem, center: Pt): Pt {
    const { w, h } = this.sizeOf(item);
    return { x: snap(center.x - w / 2), y: snap(center.y - h / 2) };
  }

  private mutate(fn: () => void): void {
    this.history.record(this.doc);
    fn();
    this.commit();
  }

  private replaceDoc(doc: EditorDoc): void {
    this.doc = doc;
    const s = this.sel;
    const ids = new Set([...doc.inputs, ...doc.outputs].map((n) => n.id));
    const uids = new Set(doc.instances.map((i) => i.uid));
    const wids = new Set(doc.wires.map((w) => w.id));
    this.sel = {
      instances: new Set([...s.instances].filter((u) => uids.has(u))),
      io: new Set([...s.io].filter((u) => ids.has(u))),
      wires: new Set([...s.wires].filter((u) => wids.has(u))),
    };
    this.commit();
    this.emit('selection');
  }

  /** 문서가 바뀐 뒤 호출: 재컴파일 + 알림 */
  private commit(): void {
    this.rebuild();
    this.emit('structure');
    this.emit('history');
  }

  private rebuild(): void {
    this.pins = layoutPins(this.doc, this.lib);
    try {
      this.netlist = compile(toChipDef(this.doc), this.lib);
      this.sim = new Simulator(this.netlist);
      this.compileError = null;
      this.warnings = this.netlist.warnings;
      this.metrics = measure(this.netlist);
      for (const n of this.doc.inputs) {
        const v = (this.inputValues.get(n.name) ?? 0) & ((1 << n.width) - 1);
        this.inputValues.set(n.name, v);
        this.sim.setInput(n.name, v);
      }
      if (this.speed === SPEEDS.length - 1) this.sim.settle();
    } catch (e) {
      if (!(e instanceof CompileError)) throw e;
      this.netlist = null;
      this.sim = null;
      this.compileError = e;
      this.warnings = [];
      this.metrics = null;
    }
    this.stepsSinceChange = 0;
    this.dirty = true;
  }

  private setSelection(sel: Selection): void {
    this.sel = sel;
    this.emit('selection');
  }

  private toggleInput(id: string): void {
    const io = findIO(this.doc, id);
    if (!io || io.kind !== 'input') return;
    this.setInputValue(io.node.name, (this.inputValues.get(io.node.name) ?? 0) + 1);
  }

  /** 클럭 펄스 중이면 내려야 할 핀 이름 */
  private pendingRelease: string | null = null;
  private pulseFrame = 0;

  /** 펄스 진행 중인가 (자동 클럭이 겹쳐 누르지 않도록) */
  get pulsing(): boolean {
    return this.pendingRelease !== null;
  }

  /**
   * 클럭 한 번: 핀을 1로 올리고, 신호가 다 퍼진(안정된) 뒤 0으로 내린다.
   * 느린 속도에서는 올라감 → 전파 → 내려감이 단계별로 보인다.
   */
  pulse(name: string): void {
    if (this.pendingRelease || !this.doc.inputs.some((n) => n.name === name)) return;
    this.setInputValue(name, 1);
    this.pulseFrame = this.frame;
    if (this.sim) this.pendingRelease = name;
    else this.setInputValue(name, 0);
  }

  private maybeRelease(): void {
    const name = this.pendingRelease;
    if (!name || !this.sim) return;
    // 최소 2프레임은 1로 유지해 화면과 타이밍 차트에 보이게 한다
    if (this.frame - this.pulseFrame < 2 && this.running) return;
    if (!this.sim.busy || this.oscillating) {
      this.pendingRelease = null;
      this.setInputValue(name, 0);
    }
  }

  /** 지금 입출력 핀 값 (타이밍 차트용). 컴파일 실패 시 출력은 undefined */
  ioValues(): { name: string; width: number; kind: 'input' | 'output'; value: number | undefined }[] {
    return [
      ...this.doc.inputs.map((n) => ({ name: n.name, width: n.width, kind: 'input' as const, value: this.inputValues.get(n.name) ?? 0 })),
      ...this.doc.outputs.map((n) => ({ name: n.name, width: n.width, kind: 'output' as const, value: this.pinValue(`self.${n.name}`) })),
    ];
  }

  /**
   * 빠른 클럭: 한 번에 n번 펄스(0→1→0)하며 펄스마다 끝까지 안정시킨다.
   * 화면 갱신 없이 돌리므로 수백 Hz 이상도 가능하다. 발진하면 멈춘다.
   */
  fastPulses(name: string, n: number): void {
    const sim = this.sim;
    if (!sim || !this.doc.inputs.some((i) => i.name === name)) return;
    for (let k = 0; k < n; k++) {
      sim.setInput(name, 1);
      if (!sim.settle().stable) break;
      sim.setInput(name, 0);
      if (!sim.settle().stable) break;
    }
    this.inputValues.set(name, sim.getInput(name));
    this.stepsSinceChange = sim.busy ? DEFAULT_MAX_STEPS : 0;
    this.emit('sim');
  }

  /** 메모리 칩(기능 모델 블록)의 내용을 바꾼다 (프로그램 적재) */
  writeMemory(blockIndex: number, bytes: ArrayLike<number>): boolean {
    const sim = this.sim;
    const st = sim?.blockStates[blockIndex];
    if (!sim || !st?.mem) return false;
    st.mem.fill(0);
    for (let i = 0; i < Math.min(bytes.length, st.mem.length); i++) st.mem[i] = bytes[i]! & 255;
    st.lastWrite = -1;
    sim.refreshBlock(blockIndex);
    sim.settle();
    this.stepsSinceChange = 0;
    this.emit('sim');
    return true;
  }

  /** 입력 핀 값을 직접 설정한다 (다비트 입력의 숫자 칸 등). 폭을 넘는 값은 잘린다 */
  setInputValue(name: string, value: number): void {
    const node = this.doc.inputs.find((n) => n.name === name);
    if (!node) return;
    const v = (value >>> 0) & (2 ** node.width - 1);
    this.inputValues.set(name, v);
    if (this.sim) {
      this.sim.setInput(name, v);
      this.stepsSinceChange = 0;
    }
    this.emit('sim');
  }

  // ================= 시뮬레이션 루프 =================

  private tick(): void {
    this.frame++;
    const sim = this.sim;
    if (sim && this.running && sim.busy) {
      const sp = SPEEDS[this.speed]!;
      // 발진 중이면 즉시 모드라도 천천히 돌려 깜빡임을 보여준다
      const osc = this.oscillating;
      const every = osc ? Math.max(sp.every, 6) : sp.every;
      const steps = osc ? 1 : sp.steps;
      if (this.frame % every === 0) {
        for (let i = 0; i < steps && sim.busy; i++) {
          sim.step();
          this.stepsSinceChange++;
        }
        this.emit('sim');
      }
    }
    if (this.running) this.maybeRelease();
    if (this.dirty) {
      this.dirty = false;
      this.draw();
    }
  }

  private draw(): void {
    const wd = this.drag.kind === 'wire' ? this.drag.drag : undefined;
    render(this.ctx, {
      doc: this.doc,
      lib: this.lib,
      camera: this.camera,
      width: this.width,
      height: this.height,
      dpr: this.dpr,
      pins: this.pins,
      value: this.pinValue,
      sel: this.sel,
      hoverPin: this.hoverPin,
      hoverWire: this.hoverWire,
      wireDrag: wd,
      ghost: this.ghost,
      box: this.drag.kind === 'box' ? this.drag.rect : undefined,
    });
  }

  // ================= 입력 처리 =================

  private resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.width = r.width;
    this.height = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    this.dirty = true;
  }

  private clientToWorld(cx: number, cy: number): Pt | null {
    const r = this.canvas.getBoundingClientRect();
    if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return null;
    return this.camera.toWorld(cx - r.left, cy - r.top);
  }

  private local(e: PointerEvent | WheelEvent): Pt {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private listen<K extends keyof WindowEventMap>(
    target: Window | HTMLElement,
    type: K,
    fn: (e: WindowEventMap[K]) => void,
    opts?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, fn as EventListener, opts);
    this.disposers.push(() => target.removeEventListener(type, fn as EventListener, opts));
  }

  private bindEvents(): void {
    const c = this.canvas;
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(c);
    this.disposers.push(() => ro.disconnect());

    this.listen(c, 'pointerdown', (e) => this.onDown(e));
    this.listen(c, 'pointermove', (e) => this.onMove(e));
    this.listen(c, 'pointerup', (e) => this.onUp(e));
    this.listen(c, 'pointercancel', () => {
      this.drag = { kind: 'none' };
      this.dirty = true;
    });
    this.listen(c, 'contextmenu', (e) => e.preventDefault());
    this.listen(c, 'dblclick', (e) => {
      const sp = this.local(e as PointerEvent);
      const hit = hitTest(this.doc, this.lib, this.camera.toWorld(sp.x, sp.y), this.tol());
      if (hit?.kind !== 'instance') return;
      const inst = this.doc.instances.find((i) => i.uid === hit.uid);
      if (inst && this.lib.get(inst.chip)?.kind === 'composite') this.opts.onOpenChip?.(inst.chip);
    });
    this.listen(c, 'wheel', (e) => this.onWheel(e), { passive: false });
    this.listen(window, 'keydown', (e) => this.onKey(e));
    this.listen(window, 'keyup', (e) => {
      if (e.code === 'Space') {
        this.spaceDown = false;
        this.updateCursor();
      }
    });
  }

  private tol(): number {
    return 7 / this.camera.zoom;
  }

  private onDown(e: PointerEvent): void {
    this.canvas.focus();
    this.canvas.setPointerCapture(e.pointerId);
    const sp = this.local(e);
    const p = this.camera.toWorld(sp.x, sp.y);

    if (e.button === 1 || e.button === 2 || this.spaceDown) {
      this.drag = { kind: 'pan', last: sp };
      this.updateCursor();
      return;
    }
    if (e.button !== 0) return;

    const hit = hitTest(this.doc, this.lib, p, this.tol());
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;

    if (this.opts.readOnly) {
      // 읽기 전용: 입력 스위치 클릭만 허용, 나머지 드래그는 화면 이동
      if (hit?.kind === 'io' && hit.io === 'input') {
        this.drag = { kind: 'move', start: p, applied: { x: 0, y: 0 }, moved: false, toggleInput: hit.id };
      } else {
        this.drag = { kind: 'pan', last: sp };
        this.updateCursor();
      }
      return;
    }

    if (hit?.kind === 'pin') {
      this.drag = { kind: 'wire', drag: { from: hit.pin, to: p, valid: false } };
      return;
    }
    if (hit?.kind === 'instance' || hit?.kind === 'io') {
      const set = hit.kind === 'instance' ? 'instances' : 'io';
      const id = hit.kind === 'instance' ? hit.uid : hit.id;
      const already = this.sel[set].has(id);
      if (!already) {
        const sel = additive ? cloneSel(this.sel) : emptySelection();
        sel[set].add(id);
        this.setSelection(sel);
      }
      this.drag = {
        kind: 'move',
        start: p,
        applied: { x: 0, y: 0 },
        moved: false,
        toggleInput: hit.kind === 'io' && hit.io === 'input' && !additive ? hit.id : undefined,
        deselectOnClick: already && additive ? `${set}:${id}` : undefined,
      };
      return;
    }
    if (hit?.kind === 'wire') {
      const sel = additive ? cloneSel(this.sel) : emptySelection();
      if (additive && sel.wires.has(hit.id)) sel.wires.delete(hit.id);
      else sel.wires.add(hit.id);
      this.setSelection(sel);
      return;
    }
    if (!additive && selectionSize(this.sel)) this.setSelection(emptySelection());
    this.drag = { kind: 'box', start: p, rect: { x: p.x, y: p.y, w: 0, h: 0 }, additive };
  }

  private onMove(e: PointerEvent): void {
    const sp = this.local(e);
    const p = this.camera.toWorld(sp.x, sp.y);
    const d = this.drag;
    switch (d.kind) {
      case 'pan':
        this.camera.panBy(sp.x - d.last.x, sp.y - d.last.y);
        d.last = sp;
        this.dirty = true;
        return;
      case 'wire': {
        d.drag.to = p;
        const hit = hitTest(this.doc, this.lib, p, this.tol());
        const target = hit?.kind === 'pin' && hit.pin.key !== d.drag.from.key ? hit.pin : undefined;
        d.drag.target = target;
        d.drag.valid = !!target && target.role !== d.drag.from.role && target.width === d.drag.from.width;
        this.dirty = true;
        return;
      }
      case 'move': {
        if (this.opts.readOnly) return;
        const dx = snap(p.x - d.start.x) - d.applied.x;
        const dy = snap(p.y - d.start.y) - d.applied.y;
        if (dx || dy) {
          if (!d.moved) {
            this.history.record(this.doc);
            d.moved = true;
          }
          moveSelection(this.doc, this.sel, dx, dy);
          d.applied.x += dx;
          d.applied.y += dy;
          this.pins = layoutPins(this.doc, this.lib);
          this.dirty = true;
        }
        return;
      }
      case 'box':
        d.rect = normRect(d.start, p);
        this.dirty = true;
        return;
      case 'none': {
        const hit = hitTest(this.doc, this.lib, p, this.tol());
        const hp = hit?.kind === 'pin' ? hit.pin.key : undefined;
        const hw = hit?.kind === 'wire' ? hit.id : undefined;
        if (hp !== this.hoverPin || hw !== this.hoverWire) {
          this.hoverPin = hp;
          this.hoverWire = hw;
          this.dirty = true;
        }
        this.updateCursor(hit?.kind);
      }
    }
  }

  private onUp(e: PointerEvent): void {
    const d = this.drag;
    this.drag = { kind: 'none' };
    this.dirty = true;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    switch (d.kind) {
      case 'pan':
        this.updateCursor();
        return;
      case 'wire': {
        const t = d.drag.target;
        if (!t) return;
        this.history.record(this.doc);
        const r = connect(this.doc, this.lib, d.drag.from.ref, t.ref);
        if (r.ok) this.commit();
        else {
          this.history.discardLast();
          this.opts.onToast?.(this.opts.messages.connect(r.reason, r.widths), 'error');
        }
        return;
      }
      case 'move':
        if (d.moved) {
          this.emit('layout');
          this.emit('history');
        } else if (d.deselectOnClick) {
          const [set, id] = d.deselectOnClick.split(':') as ['instances' | 'io', string];
          const sel = cloneSel(this.sel);
          sel[set].delete(id);
          this.setSelection(sel);
        } else if (d.toggleInput) this.toggleInput(d.toggleInput);
        return;
      case 'box': {
        if (d.rect.w < 2 && d.rect.h < 2) return;
        const found = selectInRect(this.doc, this.lib, d.rect);
        if (d.additive) {
          for (const k of ['instances', 'io', 'wires'] as const) for (const v of this.sel[k]) found[k].add(v);
        }
        this.setSelection(found);
      }
    }
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const sp = this.local(e);
    if (e.ctrlKey || e.metaKey) this.camera.zoomAt(sp.x, sp.y, Math.exp(-e.deltaY * 0.01));
    else this.camera.panBy(-e.deltaX, -e.deltaY);
    this.dirty = true;
  }

  private onKey(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    // 모달이 떠 있으면 그 모달 안의 편집기만 키보드를 받는다 (뒤 화면에서 Delete 등이 실행되지 않게)
    const modals = document.querySelectorAll('.modal-backdrop');
    const top = modals[modals.length - 1];
    if (top && !top.contains(this.canvas)) return;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();

    if (e.code === 'Space') {
      this.spaceDown = true;
      this.updateCursor();
      e.preventDefault();
      return;
    }
    if (this.opts.readOnly) {
      if (!mod && key === 'f') this.fit();
      return;
    }
    if (mod && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (mod && key === 'y') {
      e.preventDefault();
      this.redo();
      return;
    }
    if (mod && key === 'a') {
      e.preventDefault();
      this.setSelection(selectAll(this.doc));
      return;
    }
    if (mod && key === 'c') {
      this.clipboard = copySelection(this.doc, this.sel);
      this.pasteCount = 0;
      return;
    }
    if (mod && (key === 'v' || key === 'd')) {
      e.preventDefault();
      const clip = key === 'd' ? copySelection(this.doc, this.sel) : this.clipboard;
      if (!clip) return;
      const n = key === 'd' ? 1 : ++this.pasteCount;
      this.history.record(this.doc);
      const sel = paste(this.doc, clip, 2 * GRID * n, 2 * GRID * n);
      this.commit();
      this.setSelection(sel);
      return;
    }
    if (key === 'delete' || key === 'backspace') {
      const target = this.opts.lockIO ? { ...this.sel, io: new Set<string>() } : this.sel;
      if (!selectionSize(target)) return;
      e.preventDefault();
      this.mutate(() => removeSelection(this.doc, target));
      this.setSelection(emptySelection());
      return;
    }
    if (key === 'escape') {
      this.drag = { kind: 'none' };
      this.setSelection(emptySelection());
      return;
    }
    if (!mod && key === 'f') this.fit();
  }

  private updateCursor(hover?: string): void {
    const c = this.canvas.style;
    if (this.drag.kind === 'pan') c.cursor = 'grabbing';
    else if (this.spaceDown) c.cursor = 'grab';
    else if (hover === 'pin') c.cursor = 'crosshair';
    else if (hover === 'instance' || hover === 'io') c.cursor = 'move';
    else if (hover === 'wire') c.cursor = 'pointer';
    else c.cursor = 'default';
  }
}

function cloneSel(s: Selection): Selection {
  return { instances: new Set(s.instances), io: new Set(s.io), wires: new Set(s.wires) };
}
