import { describe, expect, it } from 'vitest';
import { choseong, matchRange, normalize, scoreEntry, searchEntries, type SearchEntry } from '../../src/ui/paletteSearch';

const E = (id: string, label = id, keywords: string[] = []): SearchEntry => ({ id, label, keywords });

describe('paletteSearch', () => {
  it('정규화·초성', () => {
    expect(normalize('  Full-Adder_8 ')).toBe('fulladder8');
    expect(choseong('더하기 ADD')).toBe('ㄷㅎㄱ ADD');
  });

  it('점수: 정확 < 앞부분 < 포함 < 별칭 < 초성', () => {
    const add = E('ADD8', 'ADD8', ['8비트 가산기', 'adds two bytes']);
    expect(scoreEntry('add8', add)).toBe(0);
    expect(scoreEntry('ad', add)).toBe(1);
    expect(scoreEntry('d8', add)).toBe(2);
    expect(scoreEntry('가산', add)).toBe(3);
    expect(scoreEntry('ㄱㅅㄱ', add)).toBe(4);
    expect(scoreEntry('xor', add)).toBeNull();
    expect(scoreEntry('  ', add)).toBe(0);
  });

  it('정렬: 더 잘 맞는 것 먼저, 같으면 원래 순서', () => {
    const list = [E('NOT'), E('NOR'), E('XNOR'), E('AND', 'AND', ['둘 다 1이어야 1, not 아님'])];
    expect(searchEntries('no', list).map((e) => e.id)).toEqual(['NOT', 'NOR', 'XNOR', 'AND']);
    expect(searchEntries('nor', list).map((e) => e.id)).toEqual(['NOR', 'XNOR']);
    expect(searchEntries('', list)).toHaveLength(4);
  });

  it('한국어 이름·레벨 제목으로 찾기', () => {
    const parts = [E('INPUT', '입력 스위치', ['input', 'switch']), E('MUX', 'MUX', ['MUX — 골라 보내기']), E('NAND', 'NAND', ['낸드'])];
    expect(searchEntries('입력', parts).map((e) => e.id)).toEqual(['INPUT']);
    expect(searchEntries('골라', parts).map((e) => e.id)).toEqual(['MUX']);
    expect(searchEntries('ㄴㄷ', parts).map((e) => e.id)).toEqual(['NAND']);
  });

  it('강조 범위', () => {
    expect(matchRange('입력 스위치', '스위')).toEqual([3, 5]);
    expect(matchRange('ADD8', 'd8')).toEqual([2, 4]);
    expect(matchRange('ADD8', '가산')).toBeNull();
  });
});
