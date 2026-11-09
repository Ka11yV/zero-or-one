import type { AliasBit, BuiltinChipDef, ChipDef, ChipId } from './types';

/** 유일한 원시 논리 게이트. 모든 상위 칩은 이것으로부터 만들어진다. */
export const NAND: BuiltinChipDef = {
  id: 'NAND',
  kind: 'builtin',
  inputs: [
    { name: 'a', width: 1 },
    { name: 'b', width: 1 },
  ],
  outputs: [{ name: 'out', width: 1 }],
  behavior: { type: 'nand' },
  nameKey: 'chip.nand',
};

export const CONST0: BuiltinChipDef = {
  id: 'CONST0',
  kind: 'builtin',
  inputs: [],
  outputs: [{ name: 'out', width: 1 }],
  behavior: { type: 'const', value: 0 },
  nameKey: 'chip.const0',
};

export const CONST1: BuiltinChipDef = {
  id: 'CONST1',
  kind: 'builtin',
  inputs: [],
  outputs: [{ name: 'out', width: 1 }],
  behavior: { type: 'const', value: 1 },
  nameKey: 'chip.const1',
};

/** 버스 분리기: in(width) → b0..b{width-1}. 게이트 비용 0. */
export function makeSplit(width: number): BuiltinChipDef {
  const map: AliasBit[] = [];
  for (let i = 0; i < width; i++) map.push({ from: { pin: 'in', bit: i }, to: { pin: `b${i}`, bit: 0 } });
  return {
    id: `SPLIT${width}`,
    kind: 'builtin',
    inputs: [{ name: 'in', width }],
    outputs: Array.from({ length: width }, (_, i) => ({ name: `b${i}`, width: 1 })),
    behavior: { type: 'alias', map },
    nameKey: 'chip.split',
  };
}

/** 버스 합치기: b0..b{width-1} → out(width). 게이트 비용 0. */
export function makeMerge(width: number): BuiltinChipDef {
  const map: AliasBit[] = [];
  for (let i = 0; i < width; i++) map.push({ from: { pin: `b${i}`, bit: 0 }, to: { pin: 'out', bit: i } });
  return {
    id: `MERGE${width}`,
    kind: 'builtin',
    inputs: Array.from({ length: width }, (_, i) => ({ name: `b${i}`, width: 1 })),
    outputs: [{ name: 'out', width }],
    behavior: { type: 'alias', map },
    nameKey: 'chip.merge',
  };
}

/** 팔레트에 보여주는 버스 폭 */
export const BUS_WIDTHS = [2, 3, 4, 8, 16] as const;
/** 라이브러리에 들어 있는 모든 버스 폭 (최적화 결과 등이 3, 5, 7비트 핀도 나눌 수 있게) */
export const ALL_BUS_WIDTHS: readonly number[] = Array.from({ length: 15 }, (_, i) => i + 2);

export const BUILTINS: BuiltinChipDef[] = [
  NAND,
  CONST0,
  CONST1,
  ...ALL_BUS_WIDTHS.map(makeSplit),
  ...ALL_BUS_WIDTHS.map(makeMerge),
];

/** 칩 정의 저장소. 내장 칩 + 플레이어가 만든 칩. */
export class ChipLibrary {
  private readonly chips = new Map<ChipId, ChipDef>();

  constructor(chips: Iterable<ChipDef> = []) {
    for (const b of BUILTINS) this.chips.set(b.id, b);
    for (const c of chips) this.add(c);
  }

  add(def: ChipDef): this {
    if (this.chips.get(def.id)?.kind === 'builtin') {
      throw new Error(`내장 칩 '${def.id}'은(는) 덮어쓸 수 없습니다`);
    }
    this.chips.set(def.id, def);
    return this;
  }

  get(id: ChipId): ChipDef | undefined {
    return this.chips.get(id);
  }

  has(id: ChipId): boolean {
    return this.chips.has(id);
  }

  ids(): ChipId[] {
    return [...this.chips.keys()];
  }
}

export function createLibrary(chips: Iterable<ChipDef> = []): ChipLibrary {
  return new ChipLibrary(chips);
}
