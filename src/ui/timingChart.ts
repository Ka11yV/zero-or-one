import type { Editor } from '../editor/editor';
import { t } from '../i18n';
import { h } from './dom';

const MAX_SAMPLES = 40;
const LABEL_W = 44;
const ROW_H = 22;
const SVG_NS = 'http://www.w3.org/2000/svg';

type Sample = Map<string, number | undefined>;

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/**
 * 타이밍 차트(로직 분석기): 입출력 핀 값이 바뀔 때마다 한 칸씩 기록한다.
 * 칸 하나 = "무언가 바뀐 순간" 이므로 시간 축은 균일하지 않지만, 원인 → 결과의 순서를 보기 좋다.
 */
export function timingChart(editor: Editor): { el: HTMLElement; sample(): void; reset(): void; render(): void } {
  const el = h('section', { class: 'card timing' });
  const box = h('div', { class: 'timing-box' });
  const clearBtn = h('button', { type: 'button', class: 'btn mini ghost' });
  const title = h('h2', {});
  el.append(h('div', { class: 'card-head' }, title, clearBtn), box);
  let samples: Sample[] = [];

  clearBtn.onclick = () => {
    samples = [];
    sample();
  };

  const sample = () => {
    const now: Sample = new Map(editor.ioValues().map((p) => [p.name, p.value]));
    const last = samples[samples.length - 1];
    if (last && [...now].every(([k, v]) => last.get(k) === v) && last.size === now.size) return;
    samples.push(now);
    if (samples.length > MAX_SAMPLES) samples.shift();
    draw();
  };

  const draw = () => {
    box.textContent = '';
    const pins = editor.ioValues();
    if (!pins.length) return;
    const width = Math.max(180, box.clientWidth || 230);
    // 기록이 적을 때는 칸을 넓게(최소 16칸 기준), 가득 차면 40칸에 맞춘다
    const step = (width - LABEL_W) / Math.max(samples.length, 16);
    const height = pins.length * ROW_H + 4;
    const root = svg('svg', { width, height, viewBox: `0 0 ${width} ${height}`, class: 'timing-svg', role: 'img' });

    pins.forEach((p, row) => {
      const top = row * ROW_H + 3;
      const hi = top + 3;
      const lo = top + ROW_H - 7;
      const label = svg('text', { x: 0, y: top + ROW_H / 2 + 1, class: `t-label ${p.kind}` });
      label.textContent = p.width > 1 ? `${p.name}[${p.width}]` : p.name;
      root.append(label, svg('line', { x1: LABEL_W, x2: width, y1: lo + 2, y2: lo + 2, class: 't-base' }));
      const xs = (i: number) => LABEL_W + i * step;

      if (p.width === 1) {
        let d = '';
        samples.forEach((s, i) => {
          const v = s.get(p.name);
          const y = v ? hi : lo;
          d += i === 0 ? `M${xs(i)},${y}` : `L${xs(i)},${y}`;
          d += `L${xs(i + 1)},${y}`;
        });
        if (d) root.append(svg('path', { d, class: 't-wave' }));
      } else {
        // 같은 값이 이어지는 구간을 상자 하나로
        let start = 0;
        for (let i = 1; i <= samples.length; i++) {
          const prev = samples[start]?.get(p.name);
          if (i < samples.length && samples[i]!.get(p.name) === prev) continue;
          const x0 = xs(start) + 1;
          const x1 = xs(i) - 1;
          const mid = (hi + lo) / 2;
          root.append(
            svg('path', {
              d: `M${x0},${mid}L${x0 + 3},${hi}L${x1 - 3},${hi}L${x1},${mid}L${x1 - 3},${lo}L${x0 + 3},${lo}Z`,
              class: `t-bus ${prev ? 'on' : ''}`,
            }),
          );
          if (x1 - x0 > 14 && prev !== undefined) {
            const txt = svg('text', { x: (x0 + x1) / 2, y: mid + 3.5, class: 't-val' });
            txt.textContent = String(prev);
            root.append(txt);
          }
          start = i;
        }
      }
    });
    box.append(root);
  };

  const render = () => {
    title.textContent = t('panel.timing');
    clearBtn.textContent = t('panel.timingClear');
    clearBtn.title = t('panel.timingHint');
    draw();
  };

  return {
    el,
    sample,
    reset() {
      samples = [];
      sample();
    },
    render,
  };
}
