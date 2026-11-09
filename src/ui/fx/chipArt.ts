// 칩 정의(핀 목록)로 SVG 칩 그림을 만든다. 해금 세리머니와 엔딩에서 쓴다.
import type { PinDef } from '../../sim';

export interface ChipArtSpec {
  id: string;
  inputs: PinDef[];
  outputs: PinDef[];
}

export interface ChipArtLayout {
  width: number;
  height: number;
  body: { x: number; y: number; w: number; h: number };
  pins: { side: 'in' | 'out'; label: string; y: number }[];
}

const ROW = 22;
const PIN_LEN = 18;

const pinLabel = (p: PinDef) => (p.width > 1 ? `${p.name}[${p.width}]` : p.name);

/** 크기와 핀 위치 계산 (순수 함수) */
export function chipArtLayout(spec: ChipArtSpec): ChipArtLayout {
  const rows = Math.max(spec.inputs.length, spec.outputs.length, 1);
  const longest = (ps: PinDef[]) => Math.max(0, ...ps.map((p) => pinLabel(p).length));
  const labelW = (longest(spec.inputs) + longest(spec.outputs)) * 6.6;
  const w = Math.max(120, Math.round(spec.id.length * 15 + labelW + 48));
  const h = (rows + 1) * ROW;
  const body = { x: PIN_LEN, y: 6, w, h };
  const ys = (n: number) => Array.from({ length: n }, (_, i) => body.y + ((rows - n) * ROW) / 2 + (i + 1) * ROW);
  const pins = [
    ...ys(spec.inputs.length).map((y, i) => ({ side: 'in' as const, label: pinLabel(spec.inputs[i]!), y })),
    ...ys(spec.outputs.length).map((y, i) => ({ side: 'out' as const, label: pinLabel(spec.outputs[i]!), y })),
  ];
  return { width: w + PIN_LEN * 2, height: h + 12, body, pins };
}

const NS = 'http://www.w3.org/2000/svg';
function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, text?: string): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

/** 애니메이션용 class: .chip-outline(그려짐), .chip-pin(i)(미끄러져 들어옴), .chip-name(타이핑) */
export function chipArt(spec: ChipArtSpec): SVGSVGElement {
  const L = chipArtLayout(spec);
  const svg = el('svg', { viewBox: `0 0 ${L.width} ${L.height}`, class: 'chip-art', role: 'img', 'aria-label': spec.id });
  const defs = el('defs', {});
  const grad = el('linearGradient', { id: `chipfill-${spec.id}`, x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.append(el('stop', { offset: '0%', 'stop-color': '#2b3140' }), el('stop', { offset: '100%', 'stop-color': '#171a22' }));
  defs.append(grad);
  svg.append(defs);

  L.pins.forEach((p, i) => {
    const g = el('g', { class: `chip-pin ${p.side}`, style: `--i:${i}` });
    const x1 = p.side === 'in' ? 0 : L.body.x + L.body.w;
    g.append(el('line', { x1, y1: p.y, x2: x1 + PIN_LEN, y2: p.y }));
    g.append(el('circle', { cx: p.side === 'in' ? 2 : L.width - 2, cy: p.y, r: 3 }));
    const tx = p.side === 'in' ? L.body.x + 8 : L.body.x + L.body.w - 8;
    g.append(el('text', { x: tx, y: p.y + 4, 'text-anchor': p.side === 'in' ? 'start' : 'end', class: 'chip-pin-label' }, p.label));
    svg.append(g);
  });

  const { x, y, w, h } = L.body;
  svg.append(el('rect', { x, y, width: w, height: h, rx: 10, class: 'chip-body', fill: `url(#chipfill-${spec.id})` }));
  svg.append(el('rect', { x, y, width: w, height: h, rx: 10, class: 'chip-outline', pathLength: 100 }));
  // 홈(칩 표식)
  svg.append(el('path', { d: `M ${x + w / 2 - 8} ${y} a 8 8 0 0 0 16 0`, class: 'chip-notch' }));
  svg.append(el('text', { x: x + w / 2, y: y + h / 2 + 7, 'text-anchor': 'middle', class: 'chip-name' }, spec.id));
  // 몸체에 들어갈 핀 라벨이 위에 오도록 다시 붙인다
  svg.querySelectorAll('.chip-pin-label').forEach((t) => svg.append(t));
  return svg;
}
