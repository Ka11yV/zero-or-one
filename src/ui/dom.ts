/** DOM 생성 도우미 (innerHTML을 쓰지 않아 텍스트가 항상 안전하게 들어간다) */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function button(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = h('button', { type: 'button', class: `btn ${cls}`.trim() }, label);
  b.onclick = onClick;
  return b;
}

/** 아주 작은 마크다운: 빈 줄 = 단락, 줄바꿈 유지, **굵게** */
export function rich(text: string, cls = 'rich'): HTMLElement {
  const wrap = h('div', { class: cls });
  for (const para of text.split(/\n{2,}/)) {
    const p = h('p');
    para.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).forEach((part) => {
      if (part.startsWith('**') && part.endsWith('**')) p.append(h('strong', {}, part.slice(2, -2)));
      else if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) p.append(h('code', { class: 'inline' }, part.slice(1, -1)));
      else if (part) p.append(part);
    });
    wrap.append(p);
  }
  return wrap;
}

export function stars(n: number, max = 3): HTMLElement {
  return h('span', { class: 'stars', 'aria-label': `${n}/${max}` }, '★'.repeat(n), h('span', { class: 'dim' }, '★'.repeat(max - n)));
}
