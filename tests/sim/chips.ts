// 테스트용 참조 회로. 레벨 진행 순서대로 NAND에서부터 쌓아 올린다.
import { ChipBuilder, createLibrary, type ChipDef } from '../../src/sim';

export const NOT = (() => {
  const b = new ChipBuilder('NOT', ['in'], ['out']);
  const n = b.add('NAND');
  return b.fan('in', `${n}.a`, `${n}.b`).wire(`${n}.out`, 'out').build();
})();

export const AND = (() => {
  const b = new ChipBuilder('AND', ['a', 'b'], ['out']);
  const n = b.add('NAND');
  const inv = b.add('NOT');
  return b.wire('a', `${n}.a`).wire('b', `${n}.b`).wire(`${n}.out`, `${inv}.in`).wire(`${inv}.out`, 'out').build();
})();

/** 드모르간: a OR b = NAND(NOT a, NOT b) */
export const OR = (() => {
  const b = new ChipBuilder('OR', ['a', 'b'], ['out']);
  const na = b.add('NOT');
  const nb = b.add('NOT');
  const n = b.add('NAND');
  return b
    .wire('a', `${na}.in`)
    .wire('b', `${nb}.in`)
    .wire(`${na}.out`, `${n}.a`)
    .wire(`${nb}.out`, `${n}.b`)
    .wire(`${n}.out`, 'out')
    .build();
})();

/** NAND 4개 XOR */
export const XOR = (() => {
  const b = new ChipBuilder('XOR', ['a', 'b'], ['out']);
  const [n1, n2, n3, n4] = [b.add('NAND'), b.add('NAND'), b.add('NAND'), b.add('NAND')];
  return b
    .fan('a', `${n1}.a`, `${n2}.a`)
    .fan('b', `${n1}.b`, `${n3}.b`)
    .fan(`${n1}.out`, `${n2}.b`, `${n3}.a`)
    .wire(`${n2}.out`, `${n4}.a`)
    .wire(`${n3}.out`, `${n4}.b`)
    .wire(`${n4}.out`, 'out')
    .build();
})();

/** MUX 2:1 — sel=0 → a, sel=1 → b */
export const MUX = (() => {
  const b = new ChipBuilder('MUX', ['a', 'b', 'sel'], ['out']);
  const ns = b.add('NOT');
  const [n1, n2, n3] = [b.add('NAND'), b.add('NAND'), b.add('NAND')];
  return b
    .wire('sel', `${ns}.in`)
    .wire('a', `${n1}.a`)
    .wire(`${ns}.out`, `${n1}.b`)
    .wire('b', `${n2}.a`)
    .wire('sel', `${n2}.b`)
    .wire(`${n1}.out`, `${n3}.a`)
    .wire(`${n2}.out`, `${n3}.b`)
    .wire(`${n3}.out`, 'out')
    .build();
})();

export const HALF_ADDER = (() => {
  const b = new ChipBuilder('HALF_ADDER', ['a', 'b'], ['sum', 'carry']);
  const x = b.add('XOR');
  const n = b.add('AND');
  return b
    .fan('a', `${x}.a`, `${n}.a`)
    .fan('b', `${x}.b`, `${n}.b`)
    .wire(`${x}.out`, 'sum')
    .wire(`${n}.out`, 'carry')
    .build();
})();

export const FULL_ADDER = (() => {
  const b = new ChipBuilder('FULL_ADDER', ['a', 'b', 'cin'], ['sum', 'cout']);
  const h1 = b.add('HALF_ADDER');
  const h2 = b.add('HALF_ADDER');
  const o = b.add('OR');
  return b
    .wire('a', `${h1}.a`)
    .wire('b', `${h1}.b`)
    .wire(`${h1}.sum`, `${h2}.a`)
    .wire('cin', `${h2}.b`)
    .wire(`${h2}.sum`, 'sum')
    .wire(`${h1}.carry`, `${o}.a`)
    .wire(`${h2}.carry`, `${o}.b`)
    .wire(`${o}.out`, 'cout')
    .build();
})();

/** 4비트 리플 캐리 가산기 (버스 분리/합치기 사용) */
export const ADD4 = (() => {
  const b = new ChipBuilder('ADD4', ['a:4', 'b:4', 'cin'], ['sum:4', 'cout']);
  const sa = b.add('SPLIT4');
  const sb = b.add('SPLIT4');
  const m = b.add('MERGE4');
  b.wire('a', `${sa}.in`).wire('b', `${sb}.in`).wire(`${m}.out`, 'sum');
  let carry = 'cin';
  for (let i = 0; i < 4; i++) {
    const fa = b.add('FULL_ADDER');
    b.wire(`${sa}.b${i}`, `${fa}.a`).wire(`${sb}.b${i}`, `${fa}.b`).wire(carry, `${fa}.cin`).wire(`${fa}.sum`, `${m}.b${i}`);
    carry = `${fa}.cout`;
  }
  return b.wire(carry, 'cout').build();
})();

/** SR 래치 (S, R 활성 High). 교차 결합 NAND 2개 + 입력 반전. */
export const SR_LATCH = (() => {
  const b = new ChipBuilder('SR_LATCH', ['s', 'r'], ['q', 'nq']);
  const ns = b.add('NOT');
  const nr = b.add('NOT');
  const g1 = b.add('NAND');
  const g2 = b.add('NAND');
  return b
    .wire('s', `${ns}.in`)
    .wire('r', `${nr}.in`)
    .wire(`${ns}.out`, `${g1}.a`)
    .wire(`${nr}.out`, `${g2}.a`)
    .fan(`${g1}.out`, `${g2}.b`, 'q')
    .fan(`${g2}.out`, `${g1}.b`, 'nq')
    .build();
})();

/** D 래치: e=1이면 q=d (투명), e=0이면 유지 */
export const D_LATCH = (() => {
  const b = new ChipBuilder('D_LATCH', ['d', 'e'], ['q']);
  const nd = b.add('NOT');
  const [sN, rN, g1, g2] = [b.add('NAND'), b.add('NAND'), b.add('NAND'), b.add('NAND')];
  return b
    .fan('d', `${sN}.a`, `${nd}.in`)
    .wire(`${nd}.out`, `${rN}.a`)
    .fan('e', `${sN}.b`, `${rN}.b`)
    .wire(`${sN}.out`, `${g1}.a`)
    .wire(`${rN}.out`, `${g2}.a`)
    .fan(`${g1}.out`, `${g2}.b`, 'q')
    .wire(`${g2}.out`, `${g1}.b`)
    .build();
})();

/** D 플립플롭 (상승 엣지): 마스터(clk=0일 때 투명) → 슬레이브(clk=1일 때 투명) */
export const DFF = (() => {
  const b = new ChipBuilder('DFF', ['d', 'clk'], ['q']);
  const nc = b.add('NOT');
  const master = b.add('D_LATCH');
  const slave = b.add('D_LATCH');
  return b
    .wire('clk', `${nc}.in`)
    .wire(`${nc}.out`, `${master}.e`)
    .wire('d', `${master}.d`)
    .wire(`${master}.q`, `${slave}.d`)
    .wire('clk', `${slave}.e`)
    .wire(`${slave}.q`, 'q')
    .build();
})();

/** 1비트 레지스터: load=1이면 클럭 상승 엣지에 d 저장 */
export const REG1 = (() => {
  const b = new ChipBuilder('REG1', ['d', 'load', 'clk'], ['q']);
  const m = b.add('MUX');
  const f = b.add('DFF');
  return b
    .wire(`${f}.q`, `${m}.a`)
    .wire('d', `${m}.b`)
    .wire('load', `${m}.sel`)
    .wire(`${m}.out`, `${f}.d`)
    .wire('clk', `${f}.clk`)
    .fan(`${f}.q`, 'q')
    .build();
})();

/** 4비트 카운터: 클럭마다 +1, reset=1이면 다음 클럭에 0 */
export const COUNTER4 = (() => {
  const b = new ChipBuilder('COUNTER4', ['reset', 'clk'], ['q:4']);
  const add = b.add('ADD4');
  const zero = b.add('CONST0');
  const one = b.add('CONST1');
  const zb = b.add('MERGE4');
  const sum = b.add('SPLIT4');
  const qm = b.add('MERGE4');
  const nr = b.add('NOT');
  b.wire('reset', `${nr}.in`);
  for (let i = 0; i < 4; i++) b.wire(`${zero}.out`, `${zb}.b${i}`);
  b.wire(`${zb}.out`, `${add}.b`).wire(`${one}.out`, `${add}.cin`).wire(`${add}.sum`, `${sum}.in`);
  for (let i = 0; i < 4; i++) {
    const g = b.add('AND');
    const f = b.add('DFF');
    b.wire(`${sum}.b${i}`, `${g}.a`)
      .wire(`${nr}.out`, `${g}.b`)
      .wire(`${g}.out`, `${f}.d`)
      .wire('clk', `${f}.clk`)
      .wire(`${f}.q`, `${qm}.b${i}`);
  }
  return b.fan(`${qm}.out`, `${add}.a`, 'q').build();
})();

export const ALL_CHIPS: ChipDef[] = [
  NOT,
  AND,
  OR,
  XOR,
  MUX,
  HALF_ADDER,
  FULL_ADDER,
  ADD4,
  SR_LATCH,
  D_LATCH,
  DFF,
  REG1,
  COUNTER4,
];

export const lib = () => createLibrary(ALL_CHIPS);
