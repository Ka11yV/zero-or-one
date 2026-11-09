import { autoTest, pin, truthTableFrom, type SequenceStep, type TruthRow } from '../sim';
import { Wiring } from './build';
import { bus, GATES } from './common';
import type { Chapter } from './types';

export const CH7_BEFORE = [
  ...GATES,
  'MUX', 'DMUX', 'MUX4', 'DEC2', 'DEC3', 'ENC4',
  'HALF_ADDER', 'FULL_ADDER', 'ADD4', 'NEG4', 'SUB4', 'CMP4',
  'NOT8', 'AND8', 'OR8', 'XOR8', 'MUX8', 'ADD8', 'MUX4_8', 'DEC4', 'ADDSUB8',
  'SR_LATCH', 'D_LATCH', 'DFF', 'REG1', 'REG8', 'COUNTER4',
  'RAM4', 'RAM16', 'RAM256',
  'CONST0', 'CONST1',
  ...bus(2, 3, 4, 7, 8, 16),
];

/** 7세그먼트 모양: 비트 0 = a(위) … 비트 6 = g(가운데). 0–9, A, b, C, d, E, F */
export const SEG7 = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f, 0x77, 0x7c, 0x39, 0x5e, 0x79, 0x71];

/** ALU 연산 (7-2 / CPU 공통): 결과와 자리올림 */
export function alu8(a: number, b: number, op: number): { out: number; c: number } {
  switch (op & 7) {
    case 0: return { out: (a + b) & 255, c: a + b > 255 ? 1 : 0 };
    case 1: return { out: (a - b) & 255, c: a >= b ? 1 : 0 };
    case 2: return { out: a & b, c: 0 };
    case 3: return { out: a | b, c: 0 };
    case 4: return { out: a ^ b, c: 0 };
    case 5: return { out: ~a & 255, c: 0 };
    case 6: return { out: a, c: 0 };
    default: return { out: b, c: 0 };
  }
}

function alu8Rows(): TruthRow[] {
  const pairs = [[0, 0], [1, 1], [5, 3], [3, 5], [200, 100], [100, 200], [255, 1], [0xf0, 0x3c], [0xaa, 0x55], [128, 128], [77, 77], [9, 250]];
  const rows: TruthRow[] = [];
  for (let op = 0; op < 8; op++) {
    for (const [a, b] of pairs) {
      const { out, c } = alu8(a!, b!, op);
      rows.push({ in: [a!, b!, op], out: [out, out === 0 ? 1 : 0, out >> 7, c] });
    }
  }
  return rows;
}

// ---------- 계산기 ----------

const KEY = { plus: 10, minus: 11, eq: 12 } as const;

/** 계산기의 기준 동작: 키 입력 순서 → 단계마다 화면 값 */
export function calcSteps(keys: (number | '+' | '-' | '=')[]): SequenceStep[] {
  let entry = 0;
  let acc = 0;
  let sub = 0;
  let shown = 0;
  return keys.map((k) => {
    const code = k === '+' ? KEY.plus : k === '-' ? KEY.minus : k === '=' ? KEY.eq : k;
    if (code <= 9) {
      entry = code;
      shown = code;
    } else if (code === KEY.plus || code === KEY.minus) {
      acc = entry;
      sub = code === KEY.minus ? 1 : 0;
    } else if (code === KEY.eq) shown = (sub ? acc - entry : acc + entry) & 255;
    return { set: { key: code }, clock: true, expect: { tens: SEG7[Math.floor(shown / 10) % 10]!, ones: SEG7[shown % 10]! } };
  });
}

// ---------- 참조 정답용 부품 ----------

/** double dabble의 한 칸: 4비트 값이 5 이상이면 3을 더한다 */
function add3(w: Wiring, bits: string[]): string[] {
  const x = w.merge(bits);
  const cmp = w.chip('CMP4', { a: x, b: w.constant(5, 4) });
  const ge5 = w.not(cmp('lt'));
  const add = w.chip('ADD4', { a: x, b: w.merge([ge5, ge5, w.zero(), w.zero()]), cin: w.zero() });
  return w.split(add('sum'), 4);
}

/** 8비트(0–99) → 십의 자리, 일의 자리 (각 4비트 참조 비트들) */
export function bcdCircuit(w: Wiring, src: string): { tens: string[]; ones: string[] } {
  const bits = w.split(src, 8);
  let ones = [w.zero(), w.zero(), w.zero(), w.zero()];
  let tens = [w.zero(), w.zero(), w.zero(), w.zero()];
  for (let i = 6; i >= 0; i--) {
    // 앞의 두 번은 값이 3 이하라 더할 일이 없다. 십의 자리는 99까지면 밀기 전에 4를 넘지 않는다
    if (i <= 4) ones = add3(w, ones);
    tens = [ones[3]!, tens[0]!, tens[1]!, tens[2]!];
    ones = [bits[i]!, ones[0]!, ones[1]!, ones[2]!];
  }
  return { tens, ones };
}

export const chapter7: Chapter = {
  id: 7,
  title: { ko: '계산하는 기계', en: 'The Calculating Machine' },
  subtitle: { ko: 'ALU와 계산기', en: 'ALU and calculator' },
  levels: [
    {
      id: '7-1',
      chapter: 7,
      inputs: [pin('a:8'), pin('b:8'), pin('op:2')],
      outputs: [pin('out:8')],
      allowedChips: CH7_BEFORE,
      test: autoTest([pin('a:8'), pin('b:8'), pin('op:2')], (a, b, op) => [alu8(a!, b!, op!).out], 64),
      unlocks: { chipId: 'ALU' },
      stars: { maxNand: 272 },
      text: {
        ko: {
          title: 'ALU — 연산을 고르는 칩',
          briefing:
            '지금까지는 덧셈기, AND, OR가 **따로** 있었습니다. 계산기나 CPU는 "지금 무슨 연산을 할지"를 **신호로 골라야** 합니다.\n\n' +
            '**op** 값에 따라 a와 b로 다른 계산을 해서 out으로 내보내세요.\n\n' +
            '- op = 0 → **a + b**\n- op = 1 → **a − b**\n- op = 2 → **a AND b** (비트마다)\n- op = 3 → **a OR b** (비트마다)\n\n' +
            '이런 칩을 **ALU(산술 논리 장치)**라고 부릅니다. CPU의 계산 담당입니다.',
          hints: [
            '"op를 보고 계산 방법을 바꾸는" 회로를 만들기는 어렵습니다. 반대로 생각해 보세요. **네 가지를 모두 계산해 두고** 하나만 고르면?',
            '넷 중 하나를 고르는 8비트 부품이 있습니다: **MUX4_8**. sel에 op를 연결하세요.',
            '덧셈과 뺄셈은 **ADDSUB8** 하나로 됩니다: sub에 op의 0번 비트를 넣으면 op = 0일 때 더하기, 1일 때 빼기. 그 출력을 MUX4_8의 a와 b 모두에, AND8과 OR8 출력을 c와 d에.',
          ],
          principle: {
            title: '다 계산하고 고른다',
            body:
              'ALU 안에서는 덧셈, 뺄셈, AND, OR가 **항상 동시에** 계산되고 있습니다. op는 계산 방법을 바꾸는 것이 아니라, **결과 중 하나를 고르는 MUX의 선택 신호**일 뿐입니다.\n\n' +
              '하드웨어는 "필요할 때만 계산"하는 것보다 "다 계산하고 고르는" 쪽이 더 빠르고 단순합니다. 게이트는 어차피 항상 켜져 있으니까요.\n\n' +
              '이 op 값이 나중에 CPU에서 **명령어(opcode)**의 일부가 됩니다. "ADD"라는 명령은 결국 ALU의 op 선을 0으로 만드는 일입니다.',
            formula: 'out = MUX4( a+b, a−b, a∧b, a∨b ; op )',
            usage: '모든 CPU의 핵심. 휴대폰 프로세서에도 이런 ALU가 여러 개 들어 있어 1초에 수십억 번 연산합니다.',
          },
        },
        en: {
          title: 'ALU — The Chip That Picks an Operation',
          briefing:
            'So far the adder, AND and OR have been **separate** parts. A calculator or a CPU needs to **choose an operation with a signal**.\n\n' +
            'Depending on **op**, compute something different from a and b and send it to out.\n\n' +
            '- op = 0 → **a + b**\n- op = 1 → **a − b**\n- op = 2 → **a AND b** (bitwise)\n- op = 3 → **a OR b** (bitwise)\n\n' +
            'Such a chip is called an **ALU (Arithmetic Logic Unit)** — the part of a CPU that does the math.',
          hints: [
            'Building a circuit that "changes how it calculates" based on op is hard. Flip it around: what if you **compute all four** and just pick one?',
            'There is an 8-bit part that picks one of four: **MUX4_8**. Connect op to its sel.',
            '**ADDSUB8** does both add and subtract: wire op bit 0 to sub (0 → add, 1 → subtract). Feed its output to both a and b of the MUX4_8, and AND8 / OR8 outputs to c and d.',
          ],
          principle: {
            title: 'Compute Everything, Then Choose',
            body:
              'Inside an ALU, addition, subtraction, AND and OR are **always computed at the same time**. op does not change how anything is computed — it is just the **select signal of a MUX** that picks one result.\n\n' +
              'In hardware, "compute everything and choose" is simpler and faster than "compute only what is needed". The gates are powered all the time anyway.\n\n' +
              'Later this op value becomes part of a CPU **instruction (opcode)**. An "ADD" instruction is, in the end, just setting the ALU op lines to 0.',
            formula: 'out = MUX4( a+b, a−b, a∧b, a∨b ; op )',
            usage: 'The heart of every CPU. A phone processor contains several ALUs doing billions of operations per second.',
          },
        },
      },
      solution: (b) => {
        const w = new Wiring(b);
        const ops = w.split('op', 2);
        const as = w.chip('ADDSUB8', { a: 'a', b: 'b', sub: ops[0]! });
        const and = w.chip('AND8', { a: 'a', b: 'b' });
        const or = w.chip('OR8', { a: 'a', b: 'b' });
        const m = w.chip('MUX4_8', { a: as('out'), b: as('out'), c: and('out'), d: or('out'), sel: 'op' });
        b.wire(m('out'), 'out');
      },
    },
    {
      id: '7-2',
      chapter: 7,
      inputs: [pin('a:8'), pin('b:8'), pin('op:3')],
      outputs: [pin('out:8'), pin('z'), pin('n'), pin('c')],
      allowedChips: [...CH7_BEFORE, 'ALU'],
      test: { kind: 'truth', rows: alu8Rows() },
      unlocks: { chipId: 'ALU8' },
      stars: { maxNand: 604 },
      text: {
        ko: {
          title: 'ALU8 — 플래그가 달린 ALU',
          briefing:
            'CPU가 쓸 완전한 ALU입니다. 연산이 8가지로 늘고(op 3비트), 결과에 대한 **플래그** 3개를 함께 냅니다.\n\n' +
            '- 0 → a + b,  1 → a − b,  2 → a AND b,  3 → a OR b\n' +
            '- 4 → a XOR b,  5 → NOT a,  6 → a 그대로,  7 → b 그대로\n\n' +
            '**플래그**\n' +
            '- **z** (zero): out이 0이면 1\n' +
            '- **n** (negative): out의 맨 위 비트(7번). 2의 보수로 보면 "음수인가?"\n' +
            '- **c** (carry): 덧셈(op 0)·뺄셈(op 1)일 때 ADDSUB8의 cout, 나머지 연산에서는 0',
          hints: [
            '7-1에서 만든 **ALU**가 op 0~3을 이미 해 줍니다. 4~7을 하는 쪽을 하나 더 만들고, op의 2번 비트로 둘 중 하나를 고르면 됩니다.',
            'op 4~7: XOR8(a, b), NOT8(a), a, b를 MUX4_8에 넣고 sel = op의 아래 2비트. 두 결과는 MUX8로 고릅니다 (sel = op의 2번 비트). z는 out의 8비트를 모두 OR한 뒤 NOT, n은 out의 7번 비트.',
            'c: ALU 칩은 cout을 내지 않으므로 ADDSUB8을 따로 하나 더 놓고(sub = op의 0번 비트) 그 cout을 씁니다. 단, op가 0이나 1일 때만: c = cout AND NOT(op2) AND NOT(op1).',
          ],
          principle: {
            title: '플래그 = 다음 판단의 근거',
            body:
              '플래그는 "방금 계산한 결과가 어땠는지" 를 1비트로 요약한 것입니다. 결과가 0이었나? 음수였나? 자리 넘침이 있었나?\n\n' +
              'CPU는 이 플래그를 보고 **다음에 어디로 갈지**를 정합니다. "카운터가 0이 되면 반복을 끝내라" 는 프로그램은 뺄셈 → z 플래그 확인 → 점프, 이렇게 실행됩니다.\n\n' +
              '뺄셈 a − b의 c는 "a ≥ b였다(빌려 오지 않았다)" 는 뜻이 되어 크기 비교에도 쓰입니다.',
            formula: 'z = ¬(out₀ ∨ … ∨ out₇),  n = out₇,  c = cout ∧ (op < 2)',
            usage: 'x86 CPU의 ZF/SF/CF, ARM의 Z/N/C 플래그가 바로 이것입니다. 모든 if문과 반복문이 결국 플래그 검사로 바뀝니다.',
          },
        },
        en: {
          title: 'ALU8 — An ALU with Flags',
          briefing:
            'The full ALU your CPU will use. It now has 8 operations (3-bit op) and also produces 3 **flags** about the result.\n\n' +
            '- 0 → a + b,  1 → a − b,  2 → a AND b,  3 → a OR b\n' +
            '- 4 → a XOR b,  5 → NOT a,  6 → a unchanged,  7 → b unchanged\n\n' +
            '**Flags**\n' +
            '- **z** (zero): 1 when out is 0\n' +
            '- **n** (negative): the top bit of out (bit 7) — "is it negative?" in two’s complement\n' +
            '- **c** (carry): for add (op 0) and subtract (op 1) the cout of ADDSUB8; 0 for every other operation',
          hints: [
            'Your **ALU** from 7-1 already handles op 0–3. Build another block for 4–7 and pick between them with op bit 2.',
            'op 4–7: put XOR8(a, b), NOT8(a), a and b into a MUX4_8 with sel = the low 2 bits of op. Choose between the two halves with a MUX8 (sel = op bit 2). z = NOT(OR of all 8 out bits), n = out bit 7.',
            'c: the ALU chip has no cout, so add a separate ADDSUB8 (sub = op bit 0) and use its cout — but only for op 0 or 1: c = cout AND NOT(op2) AND NOT(op1).',
          ],
          principle: {
            title: 'Flags Drive the Next Decision',
            body:
              'Flags summarise "how did that last result turn out?" in single bits: was it zero? negative? did it carry?\n\n' +
              'A CPU looks at these flags to decide **where to go next**. A program like "stop looping when the counter hits 0" runs as: subtract → check z → jump.\n\n' +
              'For a − b, c means "a ≥ b (no borrow)", so it doubles as a size comparison.',
            formula: 'z = ¬(out₀ ∨ … ∨ out₇),  n = out₇,  c = cout ∧ (op < 2)',
            usage: 'These are the ZF/SF/CF flags of x86 and the Z/N/C flags of ARM. Every if and every loop ends up as a flag test.',
          },
        },
      },
      solution: (b) => {
        const w = new Wiring(b);
        const op = w.split('op', 3);
        const lo = w.merge([op[0]!, op[1]!]);
        const alu = w.chip('ALU', { a: 'a', b: 'b', op: lo });
        const xor = w.chip('XOR8', { a: 'a', b: 'b' });
        const not = w.chip('NOT8', { in: 'a' });
        const hi = w.chip('MUX4_8', { a: xor('out'), b: not('out'), c: 'a', d: 'b', sel: lo });
        const m = w.chip('MUX8', { a: alu('out'), b: hi('out'), sel: op[2]! });
        const outBits = w.split(m('out'), 8);
        b.wire(m('out'), 'out');
        b.wire(w.not(w.or(...outBits)), 'z');
        b.wire(outBits[7]!, 'n');
        const as = w.chip('ADDSUB8', { a: 'a', b: 'b', sub: op[0]! });
        b.wire(w.and(as('cout'), w.not(op[2]!), w.not(op[1]!)), 'c');
      },
    },
    {
      id: '7-3',
      chapter: 7,
      inputs: [pin('in:4')],
      outputs: [pin('seg:7')],
      allowedChips: [...CH7_BEFORE, 'ALU', 'ALU8'],
      test: truthTableFrom([pin('in:4')], (x) => [SEG7[x!]!]),
      unlocks: { chipId: 'SEG7' },
      stars: { maxNand: 140 },
      binaryPins: ['seg'],
      devices: { seg7: ['seg'] },
      text: {
        ko: {
          title: '7세그먼트 디코더',
          briefing:
            '전자시계의 숫자는 막대 7개(**세그먼트**)로 그립니다. 맨 위가 **a**, 시계 방향으로 오른쪽 위 **b**, 오른쪽 아래 **c**, 맨 아래 **d**, 왼쪽 아래 **e**, 왼쪽 위 **f**, 가운데가 **g**입니다.\n\n' +
            '4비트 숫자 in(0~15)을 받아 켜야 할 막대를 seg로 내보내세요. **seg의 0번 비트 = a, 1번 = b, … 6번 = g**입니다. 10~15는 A, b, C, d, E, F로 표시합니다.\n\n' +
            '오른쪽 **진리표** 탭의 목표 값(2진수)이 정답 모양입니다. 오른쪽 아래 표시기에서 지금 회로가 그리는 숫자를 볼 수 있습니다.',
          hints: [
            '출력이 7개인 진리표입니다. 막대 하나씩 따로 생각하세요: "a는 어떤 숫자에서 켜지나?"',
            '**DEC4**로 in을 16개의 줄(그 숫자일 때만 1)로 바꾼 뒤, 막대마다 "켜지는 숫자의 줄들"을 OR로 모으면 됩니다. 예: b는 0,1,2,3,4,7,8,9,A,d에서 켜집니다.',
            '켜지는 숫자가 많은 막대는 반대로 "꺼지는 숫자"를 OR한 뒤 NOT 하면 더 짧습니다. 예: b = NOT(5 ∨ 6 ∨ b ∨ C ∨ E ∨ F). 마지막에 막대 7개를 **MERGE7**(버스 합치기 7)로 모아 seg에 연결하세요.',
          ],
          principle: {
            title: '진리표 → 회로',
            body:
              '7세그먼트 디코더는 "규칙"이 아니라 **모양표**입니다. 이런 회로는 진리표에서 바로 만들 수 있습니다: 출력마다 **1이 되는 행들을 OR**하면 끝입니다(곱의 합).\n\n' +
              '디코더는 "이 숫자인가?"를 미리 다 계산해 주므로, 남은 일은 OR 묶기뿐입니다. 1이 많은 출력은 0인 행을 OR해서 뒤집으면 더 작아집니다.\n\n' +
              '사람은 숫자 모양을 보지만 회로는 그냥 7개의 스위치를 켜고 끌 뿐입니다. **표현(그림)과 값(2진수)은 다른 것**이고, 그 사이를 잇는 것이 디코더입니다.',
            formula: 'seg[k] = ∨ { DEC4(in)[x]  |  숫자 x의 모양에 막대 k가 있음 }',
            usage: '전자레인지, 엘리베이터, 계산기, 주유기 숫자판. 지금도 가장 흔한 숫자 표시 방법입니다.',
          },
        },
        en: {
          title: '7-Segment Decoder',
          briefing:
            'Digital clock digits are drawn with 7 bars (**segments**): **a** on top, then clockwise **b** (upper right), **c** (lower right), **d** (bottom), **e** (lower left), **f** (upper left), and **g** in the middle.\n\n' +
            'Take a 4-bit number in (0–15) and output which bars to light on seg: **seg bit 0 = a, bit 1 = b, … bit 6 = g**. 10–15 are shown as A, b, C, d, E, F.\n\n' +
            'The goal values (binary) in the **truth table** tab are the target shapes. The display at the bottom right shows what your circuit draws.',
          hints: [
            'A truth table with 7 outputs. Think about one bar at a time: "for which digits is bar a on?"',
            'Use **DEC4** to turn in into 16 lines (1 only for that number), then for each bar OR together the lines of the digits where it is on. Example: b is on for 0,1,2,3,4,7,8,9,A,d.',
            'For bars that are on most of the time, OR the digits where they are **off** and invert: b = NOT(5 ∨ 6 ∨ b ∨ C ∨ E ∨ F). Combine the seven bars with a MERGE7.',
          ],
          principle: {
            title: 'From Truth Table to Circuit',
            body:
              'A 7-segment decoder is not a "rule", it is a **table of shapes**. Circuits like this come straight from the truth table: for each output, **OR together the rows where it is 1** (sum of products).\n\n' +
              'The decoder already answers "is it this number?", so all that is left is grouping with OR. For outputs that are mostly 1, OR the 0-rows and invert — it is smaller.\n\n' +
              'People see digit shapes; the circuit just switches 7 lights. **Representation (a picture) and value (binary) are different things**, and a decoder bridges them.',
            formula: 'seg[k] = ∨ { DEC4(in)[x]  |  the shape of digit x uses bar k }',
            usage: 'Microwaves, elevators, calculators, fuel pumps — still the most common way to show digits.',
          },
        },
      },
      solution: (b) => {
        const w = new Wiring(b);
        const y = w.split(w.chip('DEC4', { in: 'in' })('y'), 16);
        const segs: string[] = [];
        for (let k = 0; k < 7; k++) {
          const on = SEG7.map((s, x) => ((s >> k) & 1 ? x : -1)).filter((x) => x >= 0);
          const off = SEG7.map((s, x) => ((s >> k) & 1 ? -1 : x)).filter((x) => x >= 0);
          segs.push(on.length <= off.length ? w.or(...on.map((x) => y[x]!)) : w.not(w.or(...off.map((x) => y[x]!))));
        }
        b.wire(w.merge(segs), 'seg');
      },
    },
    {
      id: '7-4',
      chapter: 7,
      inputs: [pin('in:8')],
      outputs: [pin('tens:4'), pin('ones:4')],
      allowedChips: [...CH7_BEFORE, 'ALU', 'ALU8', 'SEG7'],
      test: { kind: 'truth', rows: Array.from({ length: 100 }, (_, v) => ({ in: [v], out: [Math.floor(v / 10), v % 10] })) },
      unlocks: { chipId: 'BCD8' },
      stars: { maxNand: 600 },
      text: {
        ko: {
          title: '2진수 → 10진수 (BCD)',
          briefing:
            '회로 안의 숫자는 2진수지만, 사람에게는 **10진수 자릿수**로 보여 줘야 합니다. 37(= 00100101)을 표시하려면 "3"과 "7"이 따로 필요하죠.\n\n' +
            '0~99 사이의 8비트 숫자 in을 받아 **tens**(십의 자리)와 **ones**(일의 자리)로 나누세요. 각각 0~9 (4비트)입니다. 100 이상은 테스트하지 않습니다.\n\n' +
            '이렇게 10진수 자리마다 4비트씩 쓰는 방식을 **BCD**(2진화 10진수)라고 합니다.',
          hints: [
            '"10으로 나누기"를 회로로 만들기는 어렵습니다. 대신 유명한 방법이 있습니다: **더블 대블**(shift-and-add-3). 2진수를 한 비트씩 왼쪽으로 밀어 넣으면서, 자릿수가 5 이상이 되면 3을 더합니다.',
            '왜 3일까요? 4비트 자릿수에서 5 이상인 수를 한 칸 밀면(×2) 10 이상이 됩니다. 미리 3을 더해 두면(5+3=8) 밀었을 때 16을 넘어 **윗자리로 정확히 1이 올라가고** 나머지가 맞게 남습니다.',
            '"5 이상이면 3 더하기" 칸: CMP4로 x < 5인지 보고, NOT해서 ge5. ADD4(x, b = [ge5, ge5, 0, 0]). in의 비트를 7번(0이므로 생략 가능)·6번부터 0번까지 차례로 밀어 넣으며 일의 자리·십의 자리에 이 칸을 적용하세요. 앞의 두 번은 값이 작아 생략할 수 있습니다.',
          ],
          principle: {
            title: '나눗셈 없이 10진수로',
            body:
              '2진수 → 10진수 변환은 원래 "10으로 나눈 몫과 나머지"입니다. 하지만 나눗셈 회로는 크고 느립니다.\n\n' +
              '**더블 대블**은 덧셈과 밀기만으로 해결합니다. 2진수를 왼쪽으로 한 칸 밀면 값이 2배가 되는데, 4비트 자릿수는 10이 아니라 16에서 넘칩니다. 그래서 "10에서 넘치도록" 미리 6의 절반인 **3을 더해** 보정하는 것입니다.\n\n' +
              '같은 수를 어떻게 **표현**하느냐(2진수, BCD, 7세그먼트)에 따라 필요한 회로가 달라집니다. 컴퓨터는 계산은 2진수로, 보여 줄 때만 10진수로 바꿉니다.',
            formula: '각 단계: (자릿수 ≥ 5 ? +3) → 전체를 왼쪽으로 1비트',
            usage: '계산기, 디지털 시계, 측정기 화면. 옛날 계산기 칩은 아예 BCD로 계산했습니다.',
          },
        },
        en: {
          title: 'Binary to Decimal (BCD)',
          briefing:
            'Numbers inside the circuit are binary, but people need **decimal digits**. To show 37 (= 00100101) you need a "3" and a "7" separately.\n\n' +
            'Take an 8-bit number in from 0 to 99 and split it into **tens** and **ones**, each 0–9 (4 bits). Values of 100 or more are not tested.\n\n' +
            'Using 4 bits per decimal digit like this is called **BCD** (binary-coded decimal).',
          hints: [
            'Building "divide by 10" is hard. There is a famous trick instead: **double dabble** (shift-and-add-3). Shift the binary number in one bit at a time, and whenever a digit is 5 or more, add 3 first.',
            'Why 3? Shifting a 4-bit digit of 5 or more (×2) gives 10 or more. Adding 3 first (5+3=8) makes it pass 16 when shifted, so **exactly 1 carries into the next digit** and the remainder is right.',
            'An "add 3 if ≥ 5" block: CMP4 tells you x < 5; invert it to get ge5. ADD4(x, b = [ge5, ge5, 0, 0]). Shift in the bits of in from bit 6 (bit 7 is always 0 here) down to bit 0, applying the block to ones and tens before each shift. The first two shifts can skip it since the values are still small.',
          ],
          principle: {
            title: 'Decimal Without Division',
            body:
              'Binary-to-decimal is really "quotient and remainder of dividing by 10". But division circuits are big and slow.\n\n' +
              '**Double dabble** uses only adds and shifts. Shifting left doubles the value, but a 4-bit digit overflows at 16, not 10. Adding **3** (half of 6) beforehand makes it overflow at 10 instead.\n\n' +
              'How you **represent** a number (binary, BCD, 7-segment) decides which circuit you need. Computers calculate in binary and convert to decimal only for display.',
            formula: 'each step: (digit ≥ 5 ? +3) → shift everything left by 1',
            usage: 'Calculators, digital clocks, meters. Early calculator chips even did all their math in BCD.',
          },
        },
      },
      solution: (b) => {
        const w = new Wiring(b);
        const { tens, ones } = bcdCircuit(w, 'in');
        b.wire(w.merge(tens), 'tens');
        b.wire(w.merge(ones), 'ones');
      },
    },
    {
      id: '7-B',
      chapter: 7,
      inputs: [pin('key:4'), pin('clk')],
      outputs: [pin('tens:7'), pin('ones:7')],
      allowedChips: [...CH7_BEFORE, 'ALU', 'ALU8', 'SEG7', 'BCD8'],
      test: {
        kind: 'sequence',
        clockPin: 'clk',
        steps: calcSteps([7, '+', 5, '=', 9, '-', 4, '=', 3, '+', 8, '=', 6, '-', 6, '=', 2, 9, '+', 9, '=', '=']),
      },
      stars: { maxNand: 1748 },
      binaryPins: ['tens', 'ones'],
      devices: { seg7: ['tens', 'ones'], keypad: { pin: 'key' } },
      text: {
        ko: {
          title: '보스: 계산기',
          briefing:
            '지금까지 만든 부품으로 **진짜 계산기**를 만듭니다. 오른쪽 **키패드**를 누르면 key에 키 값이 들어가고 clk이 한 번 뜁니다. 결과는 **7세그먼트 두 자리**(tens, ones)에 나옵니다.\n\n' +
            '키 값: 숫자 **0~9**, + → **10**, − → **11**, = → **12**\n\n' +
            '동작 (한 자리 수끼리 계산):\n' +
            '- **숫자**를 누르면: 그 숫자를 "지금 입력"으로 기억하고 화면에 보여 줍니다.\n' +
            '- **+ 또는 −**를 누르면: 지금 입력을 "앞의 수"로 옮겨 두고, 어떤 연산인지 기억합니다. 화면은 그대로.\n' +
            '- **=**를 누르면: 앞의 수 (+ 또는 −) 지금 입력을 계산해 화면에 보여 줍니다.\n\n' +
            '예: 7 + 5 = → **12**.  뺄셈은 결과가 0 이상인 경우만 테스트합니다. 화면은 0~18이므로 십의 자리가 0이어도 "0"을 표시합니다.',
          hints: [
            '기억해야 할 것을 적어 보세요: 지금 입력(숫자), 앞의 수, 연산 종류(+/−), 화면에 보이는 값. 각각 레지스터 하나입니다(REG8, REG1). 모든 레지스터의 clk은 같은 clk에.',
            '키 종류 알아내기: CMP4로 key < 10이면 "숫자 키". DEC4(key)의 10, 11, 12번 줄이 +, −, =. 이 신호들이 각 레지스터의 **load**가 됩니다. 예: 앞의 수 레지스터의 load = (+ 또는 −).',
            '화면 레지스터: load = 숫자 키 ∨ =. d = MUX8(key를 8비트로 늘린 값, 계산 결과, sel = =키). 계산 결과 = ADDSUB8(앞의 수, 지금 입력, sub = 연산 레지스터). 화면 값 → BCD8 → SEG7 두 개 → tens, ones.',
          ],
          principle: {
            title: '상태 기계 — 순서를 기억하는 회로',
            body:
              '계산기의 = 키는 "지금 무엇을 해야 하는지"가 **앞에서 누른 키들**에 달려 있습니다. 이렇게 입력의 순서에 따라 동작이 바뀌는 회로를 **상태 기계**라고 부릅니다.\n\n' +
              '여러분의 계산기는 레지스터 몇 개(상태) + 키를 보고 "어느 레지스터를 언제 바꿀지" 정하는 조합 회로(제어)로 이루어져 있습니다. 데이터가 흐르는 길(ALU, MUX)과 그 길을 지휘하는 **제어 신호(load)**가 분리되어 있다는 점이 중요합니다.\n\n' +
              '다음 챕터의 CPU는 이 생각을 끝까지 밀고 갑니다. 키 대신 **메모리에 적힌 명령**을 하나씩 읽어 제어 신호를 만듭니다.',
            formula: '다음 상태 = f(지금 상태, 입력),  load 신호 = 제어',
            usage: '자판기, 신호등, 엘리베이터, 통신 프로토콜 — 순서가 있는 모든 기계가 상태 기계입니다.',
          },
        },
        en: {
          title: 'Boss: Calculator',
          briefing:
            'Build a **real calculator** from everything you have made. Pressing the **keypad** on the right puts the key value on key and pulses clk once. The result appears on **two 7-segment digits** (tens, ones).\n\n' +
            'Key values: digits **0–9**, + → **10**, − → **11**, = → **12**\n\n' +
            'Behaviour (single-digit numbers):\n' +
            '- **A digit**: remember it as the "current entry" and show it.\n' +
            '- **+ or −**: move the current entry into "the first number" and remember which operation. The display does not change.\n' +
            '- **=**: compute first number (+ or −) current entry and show it.\n\n' +
            'Example: 7 + 5 = → **12**. Subtraction is only tested when the result is 0 or more. Results are 0–18, so show "0" in the tens digit too.',
          hints: [
            'List what must be remembered: the current entry, the first number, the operation (+/−) and the displayed value. Each is a register (REG8, REG1), all clocked by clk.',
            'Classify the key: CMP4 gives key < 10 → "digit key". Lines 10, 11, 12 of DEC4(key) are +, −, =. These signals drive each register’s **load**. For example, the first-number register loads on (+ or −).',
            'Display register: load = digit ∨ =. d = MUX8(key widened to 8 bits, the result, sel = the = key). Result = ADDSUB8(first number, current entry, sub = operation register). Display value → BCD8 → two SEG7 → tens, ones.',
          ],
          principle: {
            title: 'State Machines — Circuits That Remember Order',
            body:
              'What the = key does depends on **the keys pressed before it**. A circuit whose behaviour depends on the order of its inputs is called a **state machine**.\n\n' +
              'Your calculator is a few registers (the state) plus combinational logic that looks at the key and decides which register to update when (the control). The key idea is that the **data path** (ALU, MUX) is separate from the **control signals** (load) that direct it.\n\n' +
              'The CPU in the next chapter takes this all the way: instead of keys, it reads **instructions stored in memory** one by one and turns them into control signals.',
            formula: 'next state = f(current state, input),  load signals = control',
            usage: 'Vending machines, traffic lights, elevators, network protocols — every machine with a sequence is a state machine.',
          },
        },
      },
      solution: (b) => {
        const w = new Wiring(b);
        const keyBits = w.split('key', 4);
        const isDigit = w.chip('CMP4', { a: 'key', b: w.constant(10, 4) })('lt');
        const y = w.split(w.chip('DEC4', { in: 'key' })('y'), 16);
        const plus = y[10]!;
        const minus = y[11]!;
        const eq = y[12]!;
        const opKey = w.or(plus, minus);
        const key8 = w.merge([...keyBits, w.zero(), w.zero(), w.zero(), w.zero()]);
        const entry = w.chip('REG8', { d: key8, load: isDigit, clk: 'clk' });
        const acc = w.chip('REG8', { d: entry('q'), load: opKey, clk: 'clk' });
        const sub = w.chip('REG1', { d: minus, load: opKey, clk: 'clk' });
        const res = w.chip('ADDSUB8', { a: acc('q'), b: entry('q'), sub: sub('q') });
        const dIn = w.chip('MUX8', { a: key8, b: res('out'), sel: eq });
        const shown = w.chip('REG8', { d: dIn('out'), load: w.or(isDigit, eq), clk: 'clk' });
        const bcd = w.chip('BCD8', { in: shown('q') });
        b.wire(w.chip('SEG7', { in: bcd('tens') })('seg'), 'tens');
        b.wire(w.chip('SEG7', { in: bcd('ones') })('seg'), 'ones');
      },
    },
  ],
};
