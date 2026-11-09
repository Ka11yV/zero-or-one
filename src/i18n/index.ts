import { en } from './en';
import { ko, type MessageKey } from './ko';

export type Lang = 'ko' | 'en';
export type { MessageKey };

const dictionaries: Record<Lang, Record<MessageKey, string>> = { ko, en };
const STORAGE_KEY = 'logic-game:lang';

function detect(): Lang {
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (saved === 'ko' || saved === 'en') return saved;
  } catch {
    /* 저장소 접근 불가 */
  }
  const nav = globalThis.navigator?.language ?? 'ko';
  return nav.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

let current: Lang = detect();
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, lang);
  } catch {
    /* 무시 */
  }
  for (const fn of listeners) fn();
}

export function onLangChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 번역 문자열. {name} 자리표시자를 params로 치환한다. 키가 없으면 키 자체를 돌려준다. */
export function t(key: MessageKey | string, params: Record<string, string | number> = {}): string {
  const s = (dictionaries[current] as Record<string, string>)[key] ?? (ko as Record<string, string>)[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}
