import type { ChipLibrary } from '../sim';
import type { Camera } from './camera';
import type { EditorDoc, Selection } from './doc';
import {
  chipLabel,
  GRID,
  instancePins,
  instanceRect,
  IO_H,
  IO_W,
  ioRect,
  pinKey,
  showPinLabels,
  wirePath,
  type PinGeom,
  type Pt,
  type Rect,
} from './geometry';

export const COLORS = {
  bg: '#12151a',
  gridDot: '#262b34',
  chipFill: '#1f242c',
  chipStroke: '#4a5361',
  chipText: '#d7dde6',
  pinLabel: '#8b95a5',
  off: '#3d4552',
  on: '#3ddc84',
  busOff: '#4b5a78',
  busOn: '#5aa9ff',
  unknown: '#5b6270',
  select: '#ffb547',
  selectFill: 'rgba(255,181,71,0.08)',
  invalid: '#ff5c5c',
  ghost: 'rgba(255,255,255,0.25)',
  labelBg: 'rgba(18,21,26,0.85)',
};

export interface WireDrag {
  from: PinGeom;
  to: Pt;
  target?: PinGeom;
  valid: boolean;
}

export interface RenderState {
  doc: EditorDoc;
  lib: ChipLibrary;
  camera: Camera;
  width: number;
  height: number;
  dpr: number;
  pins: Map<string, PinGeom>;
  /** 핀 값 (컴파일 실패 시 undefined) */
  value: (pinKey: string) => number | undefined;
  sel: Selection;
  hoverPin?: string;
  hoverWire?: string;
  wireDrag?: WireDrag;
  ghost?: { kind: 'chip'; chip: string; x: number; y: number } | { kind: 'input' | 'output'; x: number; y: number };
  box?: Rect;
}

const FONT = '"Pretendard", "Apple SD Gothic Neo", system-ui, sans-serif';
const MONO = '"JetBrains Mono", "SF Mono", ui-monospace, monospace';

export function render(ctx: CanvasRenderingContext2D, s: RenderState): void {
  const { camera: cam, dpr } = s;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, s.width, s.height);

  // 월드 좌표계로 전환
  ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, -cam.x * cam.zoom * dpr, -cam.y * cam.zoom * dpr);
  const view = { x: cam.x, y: cam.y, w: s.width / cam.zoom, h: s.height / cam.zoom };

  drawGrid(ctx, view, cam.zoom);
  drawWires(ctx, s);
  for (const inst of s.doc.instances) drawInstance(ctx, s, inst);
  for (const n of s.doc.inputs) drawInput(ctx, s, n);
  for (const n of s.doc.outputs) drawOutput(ctx, s, n);
  drawPins(ctx, s);
  drawOverlays(ctx, s);
}

function drawGrid(ctx: CanvasRenderingContext2D, v: Rect, zoom: number): void {
  if (zoom < 0.45) return;
  ctx.fillStyle = COLORS.gridDot;
  const r = 1.2 / zoom;
  const x0 = Math.floor(v.x / GRID) * GRID;
  const y0 = Math.floor(v.y / GRID) * GRID;
  for (let x = x0; x <= v.x + v.w; x += GRID) {
    for (let y = y0; y <= v.y + v.h; y += GRID) ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
}

function signalColor(v: number | undefined, width: number): string {
  if (v === undefined) return COLORS.unknown;
  if (width > 1) return v ? COLORS.busOn : COLORS.busOff;
  return v ? COLORS.on : COLORS.off;
}

function strokePath(ctx: CanvasRenderingContext2D, path: Pt[]): void {
  ctx.beginPath();
  ctx.moveTo(path[0]!.x, path[0]!.y);
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i]!.x, path[i]!.y);
  ctx.stroke();
}

function drawWires(ctx: CanvasRenderingContext2D, s: RenderState): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const w of s.doc.wires) {
    const a = s.pins.get(pinKey(w.from));
    const b = s.pins.get(pinKey(w.to));
    if (!a || !b) continue;
    const path = wirePath(a, b);
    const v = s.value(a.key);
    const selected = s.sel.wires.has(w.id);
    const hover = s.hoverWire === w.id;
    if (selected || hover) {
      ctx.strokeStyle = selected ? COLORS.select : 'rgba(255,255,255,0.18)';
      ctx.lineWidth = (a.width > 1 ? 5 : 3) + 4;
      strokePath(ctx, path);
    }
    ctx.strokeStyle = signalColor(v, a.width);
    ctx.lineWidth = a.width > 1 ? 5 : v ? 3 : 2.5;
    // 0과 1을 색뿐 아니라 굵기로도 구분 (색약 배려)
    strokePath(ctx, path);
    if (a.width > 1 && v !== undefined) {
      const mid = path[Math.floor(path.length / 2)]!;
      const prev = path[Math.floor(path.length / 2) - 1] ?? mid;
      drawValueLabel(ctx, (mid.x + prev.x) / 2, (mid.y + prev.y) / 2, String(v));
    }
  }
}

function drawValueLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string): void {
  ctx.font = `600 10px ${MONO}`;
  const w = ctx.measureText(text).width + 8;
  ctx.fillStyle = COLORS.labelBg;
  roundRect(ctx, x - w / 2, y - 8, w, 16, 4);
  ctx.fill();
  ctx.fillStyle = COLORS.chipText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawInstance(ctx: CanvasRenderingContext2D, s: RenderState, inst: EditorDoc['instances'][number]): void {
  const def = s.lib.get(inst.chip);
  if (!def) return;
  const r = instanceRect(inst, def);
  const selected = s.sel.instances.has(inst.uid);
  roundRect(ctx, r.x, r.y, r.w, r.h, 6);
  ctx.fillStyle = COLORS.chipFill;
  ctx.fill();
  ctx.lineWidth = selected ? 2.5 : 1.5;
  ctx.strokeStyle = selected ? COLORS.select : COLORS.chipStroke;
  ctx.stroke();

  ctx.fillStyle = COLORS.chipText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 12px ${FONT}`;
  ctx.fillText(chipLabel(def), r.x + r.w / 2, r.y + r.h / 2);

  if (showPinLabels(def)) {
    ctx.font = `500 9px ${MONO}`;
    ctx.fillStyle = COLORS.pinLabel;
    for (const p of instancePins(inst, def)) {
      ctx.textAlign = p.side === 'left' ? 'left' : 'right';
      ctx.fillText(p.label, p.x + (p.side === 'left' ? 6 : -6), p.y);
    }
  }
}

function ioName(ctx: CanvasRenderingContext2D, x: number, y: number, name: string, width: number): void {
  ctx.font = `600 11px ${MONO}`;
  ctx.fillStyle = COLORS.pinLabel;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(width > 1 ? `${name}[${width}]` : name, x, y - 6);
}

function drawInput(ctx: CanvasRenderingContext2D, s: RenderState, n: EditorDoc['inputs'][number]): void {
  const r = ioRect(n);
  const v = s.value(`self.${n.name}`) ?? 0;
  const selected = s.sel.io.has(n.id);
  roundRect(ctx, r.x, r.y, r.w, r.h, 8);
  ctx.fillStyle = v ? (n.width > 1 ? '#1d3a5c' : '#16432c') : '#1c2027';
  ctx.fill();
  ctx.lineWidth = selected ? 2.5 : 2;
  ctx.strokeStyle = selected ? COLORS.select : signalColor(v, n.width);
  ctx.stroke();
  ctx.fillStyle = v ? signalColor(v, n.width) : COLORS.chipText;
  ctx.font = `700 ${n.width > 1 && v > 99 ? 11 : 15}px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(v), r.x + IO_W / 2, r.y + IO_H / 2 + 1);
  ioName(ctx, r.x + IO_W / 2, r.y, n.name, n.width);
}

function drawOutput(ctx: CanvasRenderingContext2D, s: RenderState, n: EditorDoc['outputs'][number]): void {
  const r = ioRect(n);
  const v = s.value(`self.${n.name}`);
  const selected = s.sel.io.has(n.id);
  const cx = r.x + IO_W / 2;
  const cy = r.y + IO_H / 2;
  ctx.beginPath();
  if (n.width === 1) ctx.arc(cx, cy, IO_W / 2 - 2, 0, Math.PI * 2);
  else ctx.roundRect(r.x, r.y, r.w, r.h, 8);
  if (v) {
    ctx.shadowColor = signalColor(v, n.width);
    ctx.shadowBlur = 18;
  }
  ctx.fillStyle = v ? signalColor(v, n.width) : '#1c2027';
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = selected ? 2.5 : 2;
  ctx.strokeStyle = selected ? COLORS.select : v ? '#b8ffd6' : COLORS.off;
  ctx.stroke();
  ctx.fillStyle = v ? '#0b1f14' : COLORS.pinLabel;
  ctx.font = `700 ${n.width > 1 && (v ?? 0) > 99 ? 11 : 14}px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(v === undefined ? '?' : String(v), cx, cy + 1);
  ioName(ctx, cx, r.y, n.name, n.width);
}

function drawPins(ctx: CanvasRenderingContext2D, s: RenderState): void {
  for (const p of s.pins.values()) {
    const v = s.value(p.key);
    const hover = s.hoverPin === p.key || s.wireDrag?.target?.key === p.key;
    ctx.beginPath();
    ctx.arc(p.x, p.y, hover ? 6 : 4, 0, Math.PI * 2);
    ctx.fillStyle = signalColor(v, p.width);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = hover ? (s.wireDrag && !s.wireDrag.valid ? COLORS.invalid : '#ffffff') : COLORS.bg;
    ctx.stroke();
  }
}

function drawOverlays(ctx: CanvasRenderingContext2D, s: RenderState): void {
  const d = s.wireDrag;
  if (d) {
    const [a, b] = d.from.role === 'source' ? [d.from, d.target ?? d.to] : [d.target ?? d.to, d.from];
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = d.target && !d.valid ? COLORS.invalid : '#ffffff';
    ctx.lineWidth = 2;
    strokePath(ctx, wirePath(a, b));
    ctx.setLineDash([]);
  }
  if (s.box) {
    ctx.fillStyle = COLORS.selectFill;
    ctx.fillRect(s.box.x, s.box.y, s.box.w, s.box.h);
    ctx.strokeStyle = COLORS.select;
    ctx.lineWidth = 1 / s.camera.zoom;
    ctx.strokeRect(s.box.x, s.box.y, s.box.w, s.box.h);
  }
  const g = s.ghost;
  if (g) {
    ctx.globalAlpha = 0.55;
    if (g.kind === 'chip') {
      const def = s.lib.get(g.chip);
      if (def) {
        const r = instanceRect(g, def);
        roundRect(ctx, r.x, r.y, r.w, r.h, 6);
        ctx.fillStyle = COLORS.chipFill;
        ctx.fill();
        ctx.strokeStyle = COLORS.select;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    } else {
      roundRect(ctx, g.x, g.y, IO_W, IO_H, 8);
      ctx.strokeStyle = COLORS.select;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
