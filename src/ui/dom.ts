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

/** 인라인: **굵게**, `코드`(줄바꿈 안 됨) */
function inline(el: HTMLElement, text: string): void {
  text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).forEach((part) => {
    if (part.startsWith('**') && part.endsWith('**')) el.append(h('strong', {}, part.slice(2, -2)));
    else if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) el.append(h('code', { class: 'inline' }, part.slice(1, -1)));
    else if (part) el.append(part);
  });
}

/** 아주 작은 마크다운: 빈 줄 = 단락, 줄바꿈 유지, "- " 줄 = 목록, 단락 첫 줄 **굵게**만 = 작은 제목, **굵게**, `코드` */
export function rich(text: string, cls = 'rich'): HTMLElement {
  const wrap = h('div', { class: cls });
  for (const para of text.split(/\n{2,}/)) {
    // 단락 안에서 "- "로 시작하는 줄이 이어지면 목록으로
    let p: HTMLElement | null = null;
    let ul: HTMLElement | null = null;
    for (const line of para.split('\n')) {
      const item = /^\s*-\s+(.*)$/.exec(line);
      const head = /^\*\*([^*]+)\*\*$/.exec(line.trim());
      // 단락 첫 줄이 통째로 굵은 글씨면 작은 제목
      if (head && !p && !ul) {
        wrap.append(h('h4', { class: 'rich-head' }, head[1]!));
        continue;
      }
      if (item) {
        p = null;
        if (!ul) wrap.append((ul = h('ul', { class: 'rich-list' })));
        const li = h('li');
        inline(li, item[1]!);
        ul.append(li);
      } else {
        ul = null;
        if (p) p.append('\n');
        else wrap.append((p = h('p')));
        inline(p, line);
      }
    }
  }
  return wrap;
}

export function stars(n: number, max = 3): HTMLElement {
  return h('span', { class: 'stars', 'aria-label': `${n}/${max}` }, '★'.repeat(n), h('span', { class: 'dim' }, '★'.repeat(max - n)));
}
