// 부품 검색 (순수 함수): 칩 id·표시 이름·별칭(레벨 제목, 한 줄 설명)에서 찾는다. 한글 초성 검색도 지원.

export interface SearchEntry {
  id: string;
  /** 팔레트에 보이는 이름 */
  label: string;
  /** 추가로 찾을 말 (레벨 제목, 칩 설명, 구역 이름 등) */
  keywords: string[];
}

const CHOSEONG = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';

/** 비교용: 소문자, 공백·기호 제거 */
export function normalize(s: string): string {
  return s.normalize('NFC').toLowerCase().replace(/[\s\-_·—:()/.,]+/g, '');
}

/** "더하기" → "ㄷㅎㄱ" (한글이 아닌 글자는 그대로) */
export function choseong(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.charCodeAt(0) - 0xac00;
    out += c >= 0 && c < 11172 ? CHOSEONG[Math.floor(c / 588)] : ch;
  }
  return out;
}

const isChoseongQuery = (q: string) => q.length > 0 && [...q].every((c) => CHOSEONG.includes(c));

/**
 * 점수 (작을수록 위): 0 = id/이름과 정확히 같음, 1 = 앞부분 일치, 2 = 이름 안에 포함, 3 = 별칭에 포함, 4 = 초성 일치.
 * 맞지 않으면 null
 */
export function scoreEntry(query: string, e: SearchEntry): number | null {
  const q = normalize(query);
  if (!q) return 0;
  const names = [normalize(e.id), normalize(e.label)];
  if (names.includes(q)) return 0;
  if (names.some((n) => n.startsWith(q))) return 1;
  if (names.some((n) => n.includes(q))) return 2;
  const keys = e.keywords.map(normalize);
  if (keys.some((k) => k.includes(q))) return 3;
  if (isChoseongQuery(q) && [e.label, ...e.keywords].some((k) => choseong(normalize(k)).includes(q))) return 4;
  return null;
}

/** 맞는 항목만, 점수 → 원래 순서로 정렬 */
export function searchEntries<T extends SearchEntry>(query: string, entries: T[]): T[] {
  return entries
    .map((e, i) => ({ e, i, s: scoreEntry(query, e) }))
    .filter((x): x is { e: T; i: number; s: number } => x.s !== null)
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map((x) => x.e);
}

/** 이름에서 검색어가 나온 자리 (강조 표시용). 대소문자 무시, 공백은 무시하지 않음 */
export function matchRange(label: string, query: string): [number, number] | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const i = label.toLowerCase().indexOf(q);
  return i < 0 ? null : [i, i + q.length];
}
