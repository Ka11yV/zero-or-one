import type { ChipBuilder, PinDef } from '../sim';
import { autoTest, pin } from '../sim';
import { bus, GATES } from './common';
import type { Chapter, Level, LevelText } from './types';

const BEFORE = [
  ...GATES,
  'MUX', 'DMUX', 'MUX4', 'DEC2', 'DEC3', 'ENC4',
  'HALF_ADDER', 'FULL_ADDER', 'ADD4', 'NEG4', 'SUB4', 'CMP4',
  'CONST0', 'CONST1',
  ...bus(2, 3, 4, 8, 16),
];
const A8B8 = [pin('a:8'), pin('b:8')];

/** 비트별 8비트 게이트 레벨 (NOT8/AND8/OR8/XOR8) */
function bitwise(
  id: string,
  chipId: string,
  gate: string,
  unary: boolean,
  fn: (a: number, b: number) => number,
  allowed: string[],
  maxNand: number,
  text: Record<'ko' | 'en', LevelText>,
): Level {
  const inputs: PinDef[] = unary ? [pin('in:8')] : A8B8;
  return {
    id,
    chapter: 4,
    inputs,
    outputs: [pin('out:8')],
    allowedChips: allowed,
    test: autoTest(inputs, (a, b) => [fn(a, b ?? 0) & 255]),
    unlocks: { chipId },
    stars: { maxNand },
    text,
    solution: (b: ChipBuilder) => {
      const sa = b.add('SPLIT8');
      const sb = unary ? '' : b.add('SPLIT8');
      const m = b.add('MERGE8');
      b.wire(unary ? 'in' : 'a', `${sa}.in`).wire(`${m}.out`, 'out');
      if (!unary) b.wire('b', `${sb}.in`);
      for (let i = 0; i < 8; i++) {
        const g = b.add(gate);
        if (unary) b.wire(`${sa}.b${i}`, `${g}.in`);
        else b.wire(`${sa}.b${i}`, `${g}.a`).wire(`${sb}.b${i}`, `${g}.b`);
        b.wire(`${g}.out`, `${m}.b${i}`);
      }
    },
  };
}

const card = (ko: LevelText, en: LevelText) => ({ ko, en });

export const chapter4: Chapter = {
  id: 4,
  title: { ko: '버스를 타고', en: 'Riding the Bus' },
  subtitle: { ko: '8비트 워드 다루기', en: 'Working with 8-bit words' },
  levels: [
    bitwise('4-1', 'NOT8', 'NOT', true, (a) => ~a, BEFORE, 8,
      card(
        {
          title: '8비트 NOT',
          briefing:
            '지금부터는 **8비트** 를 한 덩어리로 다룹니다. 이런 비트 묶음을 **워드(word)** 라고 하며, 8비트는 0~255(부호 있으면 -128~127)를 나타냅니다.\n\n' +
            '8비트 입력의 **모든 비트를 뒤집는** 칩을 만드세요. 같은 구조를 반복할 때는 **⌘C / ⌘V(복사/붙여넣기)** 와 **⌘D(복제)** 가 큰 도움이 됩니다.',
          hints: [
            '버스는 여러 가닥의 선을 한 줄로 묶어 그린 것뿐입니다. 비트 하나하나는 서로 독립적이에요.',
            '버스 분리 8 → NOT 8개 → 버스 합치기 8.',
            'NOT 하나를 놓고 ⌘D를 7번 누르면 8개가 됩니다. 분리기의 b0 → NOT → 합치기의 b0, b1 → … 순서대로.',
          ],
          principle: {
            title: '버스와 워드',
            body:
              '**버스** 는 같은 일을 하는 선 여러 가닥을 묶은 것입니다. 회로도에서 굵은 선 하나로 그리면 훨씬 읽기 쉬워집니다.\n\n' +
              '**비트별(bitwise) 연산** 은 각 자리를 독립적으로 계산합니다. 자리 사이에 아무 연결이 없으니 8비트든 64비트든 속도가 같습니다 — 올림이 퍼져야 하는 덧셈과 다른 점이죠.',
            formula: 'out[i] = ¬in[i]  (i = 0…7)',
            usage: '프로그래밍의 ~x 연산자, 2의 보수 계산, 그래픽 색 반전.',
          },
        },
        {
          title: '8-bit NOT',
          briefing:
            'From now on you handle **8 bits** as one unit. A bundle of bits like this is a **word**; 8 bits represent 0–255 (or -128–127 signed).\n\n' +
            'Build a chip that **flips every bit** of an 8-bit input. When repeating a structure, **⌘C / ⌘V (copy/paste)** and **⌘D (duplicate)** help a lot.',
          hints: [
            'A bus is just several wires drawn as one line. Each bit is independent.',
            'Split 8 → 8 NOTs → Merge 8.',
            'Place one NOT and press ⌘D seven times for 8. Splitter b0 → NOT → merger b0, b1 → …, in order.',
          ],
          principle: {
            title: 'Buses and words',
            body:
              'A **bus** bundles several wires that do the same job. Drawing it as one thick line makes diagrams far easier to read.\n\n' +
              '**Bitwise** operations compute each place independently. With no links between places, 8 bits or 64 bits run at the same speed — unlike addition, where carries must ripple.',
            formula: 'out[i] = ¬in[i]  (i = 0…7)',
            usage: 'The ~x operator in programming, two’s complement, inverting colors in graphics.',
          },
        },
      )),
    bitwise('4-2', 'AND8', 'AND', false, (a, b) => a & b, [...BEFORE, 'NOT8'], 16,
      card(
        {
          title: '8비트 AND',
          briefing: '두 8비트 값의 **같은 자리끼리 AND** 하세요. out의 i번 비트 = a의 i번 비트 AND b의 i번 비트.',
          hints: ['NOT8과 같은 구조인데 입력이 둘입니다.', '버스 분리 8 두 개, AND 8개, 버스 합치기 8 하나.', 'a.bi, b.bi → AND → merge.bi (i = 0…7).'],
          principle: {
            title: '마스크로 비트 골라내기',
            body:
              'AND8의 한쪽 입력을 **마스크** 로 쓰면 원하는 비트만 남길 수 있습니다. 예: x AND 00001111 은 x의 아래 4비트만 남기고 위 4비트를 0으로 만듭니다.\n\n' +
              '마스크 비트가 1인 자리는 "문이 열리고", 0인 자리는 "문이 닫힌다" — 2장 MUX에서 본 그 문입니다.',
            formula: 'out[i] = a[i] ∧ b[i]',
            usage: '비트 마스킹(x & 0xFF), 권한 플래그 검사, 네트워크 주소 계산(IP & 서브넷 마스크).',
          },
        },
        {
          title: '8-bit AND',
          briefing: 'AND two 8-bit values **place by place**. Bit i of out = bit i of a AND bit i of b.',
          hints: ['Same structure as NOT8, but with two inputs.', 'Two Split 8s, eight ANDs, one Merge 8.', 'a.bi, b.bi → AND → merge.bi (i = 0…7).'],
          principle: {
            title: 'Masking bits',
            body:
              'Use one AND8 input as a **mask** to keep only the bits you want. For example x AND 00001111 keeps x’s low 4 bits and zeroes the top 4.\n\n' +
              'Where the mask bit is 1 "the gate is open", where 0 "the gate is closed" — the same gate you saw in the Chapter 2 MUX.',
            formula: 'out[i] = a[i] ∧ b[i]',
            usage: 'Bit masking (x & 0xFF), checking permission flags, network address math (IP & subnet mask).',
          },
        },
      )),
    bitwise('4-3', 'OR8', 'OR', false, (a, b) => a | b, [...BEFORE, 'NOT8', 'AND8'], 24,
      card(
        {
          title: '8비트 OR',
          briefing: '같은 자리끼리 **OR** 하는 8비트 칩입니다. AND8을 만들 때 쓴 구조를 그대로 복사해서 게이트만 바꿔도 됩니다.',
          hints: ['AND8과 무엇이 다를까요? 게이트 종류뿐입니다.', '버스 분리 8 ×2, OR ×8, 버스 합치기 8.', 'a.bi, b.bi → OR → merge.bi.'],
          principle: {
            title: '비트 켜기',
            body: 'OR8의 한쪽을 마스크로 쓰면 원하는 비트를 **강제로 1로 켤** 수 있습니다. x OR 10000000 은 최상위 비트만 켭니다. AND가 "끄기" 라면 OR는 "켜기" 입니다.',
            formula: 'out[i] = a[i] ∨ b[i]',
            usage: '플래그 설정(flags | READ), 여러 신호 합치기.',
          },
        },
        {
          title: '8-bit OR',
          briefing: 'An 8-bit chip that ORs **place by place**. You can copy your AND8 structure and just swap the gates.',
          hints: ['How does this differ from AND8? Only the gate type.', 'Split 8 ×2, OR ×8, Merge 8.', 'a.bi, b.bi → OR → merge.bi.'],
          principle: {
            title: 'Turning bits on',
            body: 'Use one side of OR8 as a mask to **force chosen bits to 1**. x OR 10000000 turns on only the top bit. If AND is "turn off", OR is "turn on".',
            formula: 'out[i] = a[i] ∨ b[i]',
            usage: 'Setting flags (flags | READ), merging signals.',
          },
        },
      )),
    bitwise('4-4', 'XOR8', 'XOR', false, (a, b) => a ^ b, [...BEFORE, 'NOT8', 'AND8', 'OR8'], 32,
      card(
        {
          title: '8비트 XOR',
          briefing: '같은 자리끼리 **XOR** 하는 8비트 칩입니다. 이 칩은 이 장의 보스에서 핵심 역할을 합니다.',
          hints: ['AND8, OR8과 같은 구조입니다.', '버스 분리 8 ×2, XOR ×8, 버스 합치기 8.', 'a.bi, b.bi → XOR → merge.bi.'],
          principle: {
            title: '조건부 뒤집기',
            body:
              'XOR에는 특별한 성질이 있습니다: **x ⊕ 0 = x, x ⊕ 1 = ¬x**. 즉 한쪽 입력이 "뒤집을지 말지" 를 정하는 스위치가 됩니다.\n\n' +
              '또 x ⊕ k ⊕ k = x — 같은 값으로 두 번 XOR하면 원래대로 돌아옵니다. 가장 단순한 암호화의 원리입니다.',
            formula: 'x ⊕ 0 = x,  x ⊕ 1 = ¬x,  x ⊕ k ⊕ k = x',
            usage: '조건부 반전(다음 보스!), 암호화, 오류 검출(패리티), 그래픽 커서 그리기.',
          },
        },
        {
          title: '8-bit XOR',
          briefing: 'An 8-bit chip that XORs **place by place**. It plays the key role in this chapter’s boss.',
          hints: ['Same structure as AND8 and OR8.', 'Split 8 ×2, XOR ×8, Merge 8.', 'a.bi, b.bi → XOR → merge.bi.'],
          principle: {
            title: 'Conditional flipping',
            body:
              'XOR has a special property: **x ⊕ 0 = x, x ⊕ 1 = ¬x**. One input becomes a switch deciding "flip or not".\n\n' +
              'Also x ⊕ k ⊕ k = x — XOR with the same value twice and you are back where you started. That is the simplest form of encryption.',
            formula: 'x ⊕ 0 = x,  x ⊕ 1 = ¬x,  x ⊕ k ⊕ k = x',
            usage: 'Conditional inversion (the next boss!), encryption, error detection (parity), drawing cursors in graphics.',
          },
        },
      )),
    {
      id: '4-5',
      chapter: 4,
      inputs: [pin('a:8'), pin('b:8'), pin('sel')],
      outputs: [pin('out:8')],
      allowedChips: [...BEFORE, 'NOT8', 'AND8', 'OR8', 'XOR8'],
      test: autoTest([pin('a:8'), pin('b:8'), pin('sel')], (a, b, s) => [s ? b : a]),
      unlocks: { chipId: 'MUX8' },
      stars: { maxNand: 32 },
      text: {
        ko: {
          title: '8비트 MUX',
          briefing: 'sel 하나로 **8비트 값 a 또는 b 전체** 를 고르는 MUX입니다. sel = 0 → a, sel = 1 → b.',
          hints: [
            '비트마다 MUX가 하나씩 필요합니다. 그런데 sel은 몇 개 필요할까요?',
            'MUX 8개의 sel 핀에 모두 같은 sel 신호를 연결하세요 (팬아웃).',
            '버스 분리 8 ×2 → MUX ×8(a.bi, b.bi, sel) → 버스 합치기 8.',
          ],
          principle: {
            title: '제어 신호 하나, 데이터 여러 가닥',
            body:
              '데이터는 8가닥이지만, "어느 쪽을 고를까" 라는 결정은 하나뿐입니다. 그래서 **제어 신호** 하나를 모든 비트에 팬아웃합니다.\n\n' +
              '회로를 **데이터 경로(datapath)** 와 **제어(control)** 로 나눠 보는 이 관점은 CPU를 이해하는 열쇠입니다.',
            formula: 'out[i] = MUX(a[i], b[i], sel)',
            usage: 'CPU 데이터 경로의 모든 갈림길: "ALU 결과를 쓸까, 메모리 값을 쓸까?"',
          },
        },
        en: {
          title: '8-bit MUX',
          briefing: 'A MUX that picks **the whole 8-bit value a or b** with one sel. sel = 0 → a, sel = 1 → b.',
          hints: [
            'You need one MUX per bit. But how many sel signals do you need?',
            'Connect the same sel to the sel pin of all 8 MUXes (fan-out).',
            'Split 8 ×2 → MUX ×8 (a.bi, b.bi, sel) → Merge 8.',
          ],
          principle: {
            title: 'One control signal, many data wires',
            body:
              'The data is 8 wires, but the decision "which one?" is a single bit. So one **control signal** fans out to every bit.\n\n' +
              'Seeing a circuit as **datapath** plus **control** is the key to understanding CPUs.',
            formula: 'out[i] = MUX(a[i], b[i], sel)',
            usage: 'Every fork in a CPU datapath: "use the ALU result or the memory value?"',
          },
        },
      },
      solution: (b) => {
        const sa = b.add('SPLIT8');
        const sb = b.add('SPLIT8');
        const m = b.add('MERGE8');
        b.wire('a', `${sa}.in`).wire('b', `${sb}.in`).wire(`${m}.out`, 'out');
        for (let i = 0; i < 8; i++) {
          const x = b.add('MUX');
          b.wire(`${sa}.b${i}`, `${x}.a`).wire(`${sb}.b${i}`, `${x}.b`).wire('sel', `${x}.sel`).wire(`${x}.out`, `${m}.b${i}`);
        }
      },
    },
    {
      id: '4-6',
      chapter: 4,
      inputs: [pin('a:8'), pin('b:8'), pin('cin')],
      outputs: [pin('sum:8'), pin('cout')],
      allowedChips: [...BEFORE, 'NOT8', 'AND8', 'OR8', 'XOR8', 'MUX8'],
      test: autoTest([pin('a:8'), pin('b:8'), pin('cin')], (a, b, c) => [(a + b + c) & 255, (a + b + c) >> 8]),
      unlocks: { chipId: 'ADD8' },
      stars: { maxNand: 104 },
      text: {
        ko: {
          title: '8비트 가산기',
          briefing:
            '0~255의 두 수를 더하는 8비트 가산기입니다. 결과가 255를 넘으면 cout이 1입니다.\n\n' +
            '이번엔 너무 커서 모든 조합(13만 개 이상)을 시험하지 않고, **경계값과 무작위 값 48개** 로 테스트합니다.',
          hints: [
            '전가산기 8개를 이어도 되고, 4비트 가산기 2개를 이어도 됩니다. 어느 쪽이 배선이 적을까요?',
            'ADD4 두 개: 아래 4비트용, 위 4비트용. 아래쪽의 cout이 위쪽의 cin이 됩니다.',
            '8비트 버스를 4비트 두 개로 나누려면: 버스 분리 8 → 버스 합치기 4 두 개(b0~b3, b4~b7). 결과는 반대로 분리 4 ×2 → 합치기 8.',
          ],
          principle: {
            title: '칩을 이어 붙이는 확장',
            body:
              '가산기는 **cin/cout** 덕분에 이어 붙일 수 있습니다. 4비트 가산기 두 개 = 8비트, 여덟 개 = 32비트.\n\n' +
              '이것이 4장 내내 반복한 아이디어입니다: 경계가 깔끔한 부품(입력·출력이 명확한 칩)은 **레고처럼 조립** 할 수 있습니다. 이렇게 만든 큰 칩도 다시 하나의 부품이 됩니다.',
            formula: 'ADD8 = ADD4(lo) → cout → cin → ADD4(hi)',
            usage: '8비트 CPU(1970~80년대 가정용 컴퓨터·게임기)의 핵심 연산 장치.',
          },
        },
        en: {
          title: '8-bit Adder',
          briefing:
            'An 8-bit adder for two numbers 0–255. If the result exceeds 255, cout is 1.\n\n' +
            'This one is too large to try every combination (over 130,000), so it is tested with **48 edge-case and random values**.',
          hints: [
            'You could chain 8 full adders or 2 four-bit adders. Which needs fewer wires?',
            'Two ADD4s: one for the low 4 bits, one for the high 4 bits. The low cout becomes the high cin.',
            'To split an 8-bit bus into two 4-bit buses: Split 8 → two Merge 4s (b0–b3, b4–b7). For the result, the reverse: Split 4 ×2 → Merge 8.',
          ],
          principle: {
            title: 'Growing by chaining chips',
            body:
              'Adders chain thanks to **cin/cout**. Two 4-bit adders = 8 bits; eight = 32 bits.\n\n' +
              'This is the idea of the whole chapter: parts with clean boundaries (chips with clear inputs and outputs) **snap together like LEGO**, and the big chip you build becomes a single part again.',
            formula: 'ADD8 = ADD4(lo) → cout → cin → ADD4(hi)',
            usage: 'The heart of 8-bit CPUs (1970s–80s home computers and game consoles).',
          },
        },
      },
      solution: (b) => {
        const sa = b.add('SPLIT8');
        const sb = b.add('SPLIT8');
        const [alo, ahi, blo, bhi] = [b.add('MERGE4'), b.add('MERGE4'), b.add('MERGE4'), b.add('MERGE4')];
        const lo = b.add('ADD4');
        const hi = b.add('ADD4');
        const slo = b.add('SPLIT4');
        const shi = b.add('SPLIT4');
        const m = b.add('MERGE8');
        b.wire('a', `${sa}.in`).wire('b', `${sb}.in`);
        for (let i = 0; i < 4; i++) {
          b.wire(`${sa}.b${i}`, `${alo}.b${i}`)
            .wire(`${sa}.b${i + 4}`, `${ahi}.b${i}`)
            .wire(`${sb}.b${i}`, `${blo}.b${i}`)
            .wire(`${sb}.b${i + 4}`, `${bhi}.b${i}`)
            .wire(`${slo}.b${i}`, `${m}.b${i}`)
            .wire(`${shi}.b${i}`, `${m}.b${i + 4}`);
        }
        b.wire(`${alo}.out`, `${lo}.a`)
          .wire(`${blo}.out`, `${lo}.b`)
          .wire('cin', `${lo}.cin`)
          .wire(`${ahi}.out`, `${hi}.a`)
          .wire(`${bhi}.out`, `${hi}.b`)
          .wire(`${lo}.cout`, `${hi}.cin`)
          .wire(`${lo}.sum`, `${slo}.in`)
          .wire(`${hi}.sum`, `${shi}.in`)
          .wire(`${m}.out`, 'sum')
          .wire(`${hi}.cout`, 'cout');
      },
    },
    {
      id: '4-7',
      chapter: 4,
      inputs: [pin('a:8'), pin('b:8'), pin('c:8'), pin('d:8'), pin('sel:2')],
      outputs: [pin('out:8')],
      allowedChips: [...BEFORE, 'NOT8', 'AND8', 'OR8', 'XOR8', 'MUX8', 'ADD8'],
      test: autoTest([pin('a:8'), pin('b:8'), pin('c:8'), pin('d:8'), pin('sel:2')], (a, b, c, d, s) => [[a, b, c, d][s]!]),
      unlocks: { chipId: 'MUX4_8' },
      stars: { maxNand: 96 },
      text: {
        ko: {
          title: '8비트 MUX4',
          briefing: '8비트 값 네 개 중 하나를 고릅니다. sel(2비트) = 0 → a, 1 → b, 2 → c, 3 → d. 칩 이름은 **MUX4_8** (4:1, 8비트) 입니다.',
          hints: [
            '2-3에서 MUX4를 만든 방법을 기억하나요? 토너먼트.',
            '이번엔 선수가 8비트 값이니, MUX 대신 MUX8을 씁니다.',
            'MUX8(a, b, s0), MUX8(c, d, s0) → MUX8(앞 결과, 뒤 결과, s1). sel은 버스 분리 2로.',
          ],
          principle: {
            title: '같은 설계, 다른 폭',
            body:
              'MUX4의 설계(토너먼트)는 1비트에서도 8비트에서도 똑같습니다. 부품만 MUX → MUX8로 바꿨을 뿐이죠.\n\n' +
              '좋은 설계는 이렇게 **폭(width)과 무관** 합니다. 실제 하드웨어 설계 언어(Verilog 등)에서는 비트 폭을 매개변수로 두고 한 번만 설계합니다.',
            formula: 'MUX4_8 = MUX8( MUX8(a,b,s0), MUX8(c,d,s0), s1 )',
            usage: '레지스터 여러 개 중 하나를 읽기, ALU 연산 결과 중 하나 고르기(챕터 7).',
          },
        },
        en: {
          title: '8-bit MUX4',
          briefing: 'Pick one of four 8-bit values. sel (2 bits) = 0 → a, 1 → b, 2 → c, 3 → d. The chip is named **MUX4_8** (4:1, 8 bits).',
          hints: [
            'Remember how you built MUX4 in 2-3? A tournament.',
            'This time the players are 8-bit values, so use MUX8 instead of MUX.',
            'MUX8(a, b, s0), MUX8(c, d, s0) → MUX8(first result, second result, s1). Split sel with Split 2.',
          ],
          principle: {
            title: 'Same design, different width',
            body:
              'The MUX4 design (a tournament) is identical at 1 bit and at 8 bits. Only the part changed: MUX → MUX8.\n\n' +
              'Good designs are **width-independent** like this. Real hardware languages (Verilog, etc.) make bit width a parameter and design it once.',
            formula: 'MUX4_8 = MUX8( MUX8(a,b,s0), MUX8(c,d,s0), s1 )',
            usage: 'Reading one of several registers, choosing among ALU results (Chapter 7).',
          },
        },
      },
      solution: (b) => {
        const sp = b.add('SPLIT2');
        const [m1, m2, m3] = [b.add('MUX8'), b.add('MUX8'), b.add('MUX8')];
        b.wire('sel', `${sp}.in`)
          .wire('a', `${m1}.a`)
          .wire('b', `${m1}.b`)
          .wire('c', `${m2}.a`)
          .wire('d', `${m2}.b`)
          .fan(`${sp}.b0`, `${m1}.sel`, `${m2}.sel`)
          .wire(`${m1}.out`, `${m3}.a`)
          .wire(`${m2}.out`, `${m3}.b`)
          .wire(`${sp}.b1`, `${m3}.sel`)
          .wire(`${m3}.out`, 'out');
      },
    },
    {
      id: '4-8',
      chapter: 4,
      inputs: [pin('in:4')],
      outputs: [pin('y:16')],
      allowedChips: [...BEFORE, 'NOT8', 'AND8', 'OR8', 'XOR8', 'MUX8', 'ADD8', 'MUX4_8'],
      test: autoTest([pin('in:4')], (x) => [1 << x]),
      unlocks: { chipId: 'DEC4' },
      stars: { maxNand: 52 },
      binaryPins: ['y'],
      text: {
        ko: {
          title: '디코더 4→16',
          briefing:
            '4비트 번호(0~15)로 16줄 중 하나를 켜는 디코더입니다. 출력 y는 16비트 버스입니다.\n\n' +
            '챕터 6에서 16칸짜리 RAM의 "어느 칸에 쓸지" 를 고르는 데 이 칩을 씁니다.',
          hints: [
            '16칸을 4×4 격자로 생각해 보세요. 위 2비트는 "몇 번째 줄", 아래 2비트는 "몇 번째 칸".',
            'DEC2 두 개: 하나는 아래 2비트(열), 하나는 위 2비트(행). 행 h, 열 l 이 동시에 켜진 곳이 번호 4h + l 입니다.',
            'AND 16개: y[4h + l] = AND(행DEC.y[h], 열DEC.y[l]). 버스 분리 4로 DEC2 출력을 나누고, 결과를 버스 합치기 16으로.',
          ],
          principle: {
            title: '행과 열 — 격자 주소',
            body:
              '큰 디코더를 한 번에 만들면 게이트가 매우 커집니다. 대신 주소를 **행(위 비트)** 과 **열(아래 비트)** 로 나눠 각각 작은 디코더로 풀고, 교차점을 AND로 고르면 훨씬 효율적입니다.\n\n' +
              '실제 메모리 칩 안의 셀도 이렇게 **격자** 로 배치되어 있고, 행 디코더와 열 디코더가 따로 있습니다.',
            formula: 'y[4h + l] = rowₕ ∧ colₗ',
            usage: 'DRAM의 행/열 주소(RAS/CAS), LED 매트릭스, 키보드 스캔.',
          },
        },
        en: {
          title: 'Decoder 4→16',
          briefing:
            'A decoder that lights one of 16 lines from a 4-bit number (0–15). Output y is a 16-bit bus.\n\n' +
            'In Chapter 6 this chip picks "which cell to write" in a 16-cell RAM.',
          hints: [
            'Picture the 16 lines as a 4×4 grid. The top 2 bits say "which row", the bottom 2 bits "which column".',
            'Two DEC2s: one for the low 2 bits (column), one for the high 2 bits (row). Where row h and column l are both on is number 4h + l.',
            '16 ANDs: y[4h + l] = AND(rowDEC.y[h], colDEC.y[l]). Split each DEC2 output with Split 4, and gather results with Merge 16.',
          ],
          principle: {
            title: 'Rows and columns — grid addressing',
            body:
              'Building a big decoder in one go makes the gates huge. Instead, split the address into a **row (high bits)** and **column (low bits)**, decode each with a small decoder, and pick the crossing with AND.\n\n' +
              'Real memory chips lay out their cells in a **grid** like this, with separate row and column decoders.',
            formula: 'y[4h + l] = rowₕ ∧ colₗ',
            usage: 'DRAM row/column addressing (RAS/CAS), LED matrices, keyboard scanning.',
          },
        },
      },
      solution: (b) => {
        const sp = b.add('SPLIT4');
        const lo = b.add('MERGE2');
        const hi = b.add('MERGE2');
        const dl = b.add('DEC2');
        const dh = b.add('DEC2');
        const sl = b.add('SPLIT4');
        const sh = b.add('SPLIT4');
        const m = b.add('MERGE16');
        b.wire('in', `${sp}.in`)
          .wire(`${sp}.b0`, `${lo}.b0`)
          .wire(`${sp}.b1`, `${lo}.b1`)
          .wire(`${sp}.b2`, `${hi}.b0`)
          .wire(`${sp}.b3`, `${hi}.b1`)
          .wire(`${lo}.out`, `${dl}.in`)
          .wire(`${hi}.out`, `${dh}.in`)
          .wire(`${dl}.y`, `${sl}.in`)
          .wire(`${dh}.y`, `${sh}.in`)
          .wire(`${m}.out`, 'y');
        for (let h = 0; h < 4; h++) {
          for (let l = 0; l < 4; l++) {
            const g = b.add('AND');
            b.wire(`${sh}.b${h}`, `${g}.a`).wire(`${sl}.b${l}`, `${g}.b`).wire(`${g}.out`, `${m}.b${4 * h + l}`);
          }
        }
      },
    },
    {
      id: '4-B',
      chapter: 4,
      inputs: [pin('a:8'), pin('b:8'), pin('sub')],
      outputs: [pin('out:8'), pin('cout')],
      allowedChips: [...BEFORE, 'NOT8', 'AND8', 'OR8', 'XOR8', 'MUX8', 'ADD8', 'MUX4_8', 'DEC4'],
      test: autoTest([pin('a:8'), pin('b:8'), pin('sub')], (a, b, s) => {
        const r = s ? a + ((~b) & 255) + 1 : a + b;
        return [r & 255, r >> 8];
      }),
      unlocks: { chipId: 'ADDSUB8' },
      stars: { maxNand: 136 },
      text: {
        ko: {
          title: '보스: 8비트 덧셈/뺄셈기',
          briefing:
            '신호 **sub** 하나로 모드를 바꾸는 계산 장치를 만드세요.\n\n' +
            '**sub = 0 → out = a + b**, **sub = 1 → out = a − b**. cout은 내부 가산기의 올림을 그대로 내보냅니다. 이 칩은 챕터 7 ALU의 심장이 됩니다.',
          hints: [
            '3장에서 뺄셈 = a + ¬b + 1 이었습니다. 덧셈과 무엇이 다른가요? "b를 뒤집느냐", "cin이 1이냐" 두 가지뿐.',
            '"sub가 1일 때만 b를 뒤집기" — XOR의 조건부 반전(x ⊕ 1 = ¬x)을 떠올리세요. 그리고 cin에는 sub를 그대로!',
            'sub를 버스 합치기 8의 모든 비트에 연결해 11111111 또는 00000000을 만들고, XOR8(b, 그것) → ADD8.b, ADD8.cin = sub.',
          ],
          principle: {
            title: '하나의 회로, 두 가지 연산',
            body:
              'XOR8로 b를 조건부 반전하고, 같은 sub 신호를 cin에 넣으면 덧셈기와 감산기가 **한 회로** 가 됩니다. 별도의 감산기를 만들 필요가 없고, MUX로 두 결과를 고를 필요도 없습니다.\n\n' +
              '여기서 sub는 **연산 코드(opcode)** 의 씨앗입니다. 비트 몇 개로 "무엇을 계산할지" 를 고르는 것 — 이것이 프로그램이 하드웨어를 움직이는 방식입니다.',
            formula: 'out = a + (b ⊕ sub…sub) + sub',
            usage: '실제 CPU의 ALU는 정확히 이 구조로 ADD와 SUB를 처리합니다.',
          },
        },
        en: {
          title: 'Boss: 8-bit Add/Subtract Unit',
          briefing:
            'Build a calculating unit whose mode is switched by one signal, **sub**.\n\n' +
            '**sub = 0 → out = a + b**, **sub = 1 → out = a − b**. cout passes out the internal adder’s carry. This chip becomes the heart of the Chapter 7 ALU.',
          hints: [
            'In Chapter 3, subtraction = a + ¬b + 1. How does that differ from addition? Only two things: "is b flipped?" and "is cin 1?".',
            '"Flip b only when sub is 1" — recall XOR’s conditional inversion (x ⊕ 1 = ¬x). And feed sub straight into cin!',
            'Connect sub to every bit of a Merge 8 to make 11111111 or 00000000, then XOR8(b, that) → ADD8.b, ADD8.cin = sub.',
          ],
          principle: {
            title: 'One circuit, two operations',
            body:
              'Conditionally invert b with XOR8 and feed the same sub into cin, and adder and subtractor become **one circuit**. No separate subtractor, no MUX to choose between results.\n\n' +
              'Here sub is the seed of an **opcode**: a few bits that choose "what to compute". That is how programs drive hardware.',
            formula: 'out = a + (b ⊕ sub…sub) + sub',
            usage: 'Real CPU ALUs handle ADD and SUB with exactly this structure.',
          },
        },
      },
      solution: (b) => {
        const m = b.add('MERGE8');
        const x = b.add('XOR8');
        const add = b.add('ADD8');
        for (let i = 0; i < 8; i++) b.wire('sub', `${m}.b${i}`);
        b.wire('b', `${x}.a`)
          .wire(`${m}.out`, `${x}.b`)
          .wire('a', `${add}.a`)
          .wire(`${x}.out`, `${add}.b`)
          .wire('sub', `${add}.cin`)
          .wire(`${add}.sum`, 'out')
          .wire(`${add}.cout`, 'cout');
      },
    },
  ],
};
