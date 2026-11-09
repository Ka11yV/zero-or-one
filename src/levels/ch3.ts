import { autoTest, pin } from '../sim';
import { bus, GATES } from './common';
import type { Chapter } from './types';

const CH2 = ['MUX', 'DMUX', 'MUX4', 'DEC2', 'DEC3', 'ENC4'];
const BUS = bus(2, 3, 4, 8);
const CONST = ['CONST0', 'CONST1'];
const A4B4 = [pin('a:4'), pin('b:4')];

export const chapter3: Chapter = {
  id: 3,
  title: { ko: '1+1=10', en: '1+1=10' },
  subtitle: { ko: '2진 덧셈과 뺄셈', en: 'Binary addition and subtraction' },
  levels: [
    {
      id: '3-1',
      chapter: 3,
      inputs: [pin('a'), pin('b')],
      outputs: [pin('sum'), pin('carry')],
      allowedChips: [...GATES, ...CH2, ...BUS],
      test: autoTest([pin('a'), pin('b')], (a, b) => [(a + b) & 1, (a + b) >> 1]),
      unlocks: { chipId: 'HALF_ADDER' },
      stars: { maxNand: 5 },
      devices: { columnAdd: { a: 'a', b: 'b', sum: 'sum', cout: 'carry' } },
      text: {
        ko: {
          title: '반가산기',
          why:
            '🧮 계산기, 💰 계좌 잔액, 🎮 점수판 — 컴퓨터가 하는 계산은 전부 **덧셈** 에서 시작해요.\n' +
            '그 덧셈의 가장 작은 조각, **한 자리 더하기** 를 만들 차례예요.',
          briefing:
            '**질문**\n' +
            '지금까지 만든 건 "참/거짓" 게이트뿐이에요. 이걸로 **숫자를 더할** 수 있을까요?\n' +
            '\n' +
            '**2진수**\n' +
            '자리값이 오른쪽부터 1, 2, 4, 8, … 로 두 배씩 커져요. 예: `1011` = 8 + 2 + 1 = 11\n' +
            '\n' +
            '**한 자리 덧셈**\n' +
            '- `0 + 0 = 0`\n' +
            '- `0 + 1 = 1`, `1 + 0 = 1`\n' +
            '- `1 + 1 = 10` (2) → 이 자리는 **0**, 윗자리로 **1을 올림**\n' +
            '\n' +
            '**할 일**\n' +
            '두 비트 a, b를 더해 내보내세요.\n' +
            '- **sum** = 이 자리 값\n' +
            '- **carry** = 올림',
          coach: {
            swapped: '**sum** 과 **carry** 가 서로 바뀌었어요. 1 + 1일 때 이 자리(sum)는 0, 올림(carry)이 1이에요.',
            'inverted@carry': 'carry가 정반대예요. 올림은 **둘 다 1일 때만** 생겨요 — NAND가 아니라 AND!',
            'inverted@sum': 'sum이 정반대예요. sum은 **둘이 다를 때** 1이에요.',
          },
          hints: [
            'sum과 carry의 진리표를 따로 적어 보세요. 1장에서 본 표와 똑같이 생기지 않았나요?',
            'sum은 "둘이 다를 때 1" — XOR. carry는 "둘 다 1일 때" — AND.',
            'XOR 하나, AND 하나. (★★★: XOR를 NAND 4개로 만들 때 첫 NAND(a,b)를 뒤집으면 바로 carry입니다 → NAND 5개.)',
          ],
          principle: {
            title: '덧셈 = XOR + AND',
            body:
              '1장 XOR 카드의 예고가 이루어졌습니다. 한 자리 덧셈의 결과는 정확히 **sum = XOR, carry = AND** 입니다.\n\n' +
              '"반" 가산기인 이유: 아랫자리에서 올라온 올림을 받지 못하기 때문입니다. 여러 자리 덧셈을 하려면 입력이 하나 더 필요합니다 — 다음 레벨!',
            formula: 'sum = a ⊕ b,  carry = a ∧ b',
            usage: '모든 산술 회로의 가장 작은 부품. 카운터(+1)에도 쓰입니다.',
          },
        },
        en: {
          title: 'Half Adder',
          why:
            '🧮 Calculators, 💰 bank balances, 🎮 scoreboards — every calculation a computer does starts with **addition**.\n' +
            'Time to build its smallest piece: **adding one digit**.',
          briefing:
            '**The question**\n' +
            'So far you have only true/false gates. Can they **add numbers**?\n' +
            '\n' +
            '**Binary**\n' +
            'Place values double from the right: 1, 2, 4, 8, … Example: `1011` = 8 + 2 + 1 = 11\n' +
            '\n' +
            '**One-digit addition**\n' +
            '- `0 + 0 = 0`\n' +
            '- `0 + 1 = 1`, `1 + 0 = 1`\n' +
            '- `1 + 1 = 10` (two) → this digit is **0**, **carry 1** up\n' +
            '\n' +
            '**Your job**\n' +
            'Add bits a and b and output:\n' +
            '- **sum** = this digit\n' +
            '- **carry** = the carry',
          coach: {
            swapped: '**sum** and **carry** are swapped. For 1 + 1 this digit (sum) is 0 and the carry is 1.',
            'inverted@carry': 'carry is the exact opposite. A carry only happens **when both are 1** — AND, not NAND!',
            'inverted@sum': 'sum is the exact opposite. sum is 1 **when the bits differ**.',
          },
          hints: [
            'Write the truth tables for sum and carry separately. Don’t they look like tables from Chapter 1?',
            'sum is "1 when they differ" — XOR. carry is "1 when both are 1" — AND.',
            'One XOR and one AND. (★★★: when you build XOR from 4 NANDs, inverting the first NAND(a,b) gives carry directly → 5 NANDs.)',
          ],
          principle: {
            title: 'Addition = XOR + AND',
            body:
              'The XOR card’s promise from Chapter 1 comes true: one-digit addition is exactly **sum = XOR, carry = AND**.\n\n' +
              'Why "half"? It cannot accept a carry coming up from the digit below. Multi-digit addition needs one more input — next level!',
            formula: 'sum = a ⊕ b,  carry = a ∧ b',
            usage: 'The smallest arithmetic building block; also used in counters (+1).',
          },
        },
      },
      solution: (b) => {
        const [n1, n2, n3, n4] = [b.add('NAND'), b.add('NAND'), b.add('NAND'), b.add('NAND')];
        const inv = b.add('NOT');
        b.fan('a', `${n1}.a`, `${n2}.a`)
          .fan('b', `${n1}.b`, `${n3}.b`)
          .fan(`${n1}.out`, `${n2}.b`, `${n3}.a`, `${inv}.in`)
          .wire(`${n2}.out`, `${n4}.a`)
          .wire(`${n3}.out`, `${n4}.b`)
          .wire(`${n4}.out`, 'sum')
          .wire(`${inv}.out`, 'carry');
      },
    },
    {
      id: '3-2',
      chapter: 3,
      inputs: [pin('a'), pin('b'), pin('cin')],
      outputs: [pin('sum'), pin('cout')],
      allowedChips: [...GATES, ...CH2, 'HALF_ADDER', ...BUS],
      test: autoTest([pin('a'), pin('b'), pin('cin')], (a, b, c) => [(a + b + c) & 1, (a + b + c) >> 1]),
      unlocks: { chipId: 'FULL_ADDER' },
      stars: { maxNand: 13 },
      devices: { columnAdd: { a: 'a', b: 'b', cin: 'cin', sum: 'sum', cout: 'cout' } },
      text: {
        ko: {
          title: '전가산기',
          why:
            '✏️ 종이에 `27 + 15` 를 계산할 때, 일의 자리에서 올린 1을 십의 자리에서 **같이** 더하죠?\n' +
            '2진수도 똑같아요. 아랫자리에서 올라온 올림까지 더하는 **한 자리 계산기** 가 필요해요.',
          briefing:
            '**곤란한 상황**\n' +
            '반가산기는 두 비트만 더해요. 그런데 여러 자리 덧셈에서는 **아랫자리에서 올라온 올림** 도 같이 더해야 해요.\n' +
            '\n' +
            '**할 일**\n' +
            '세 비트 a, b, **cin**(올라온 올림)을 더하세요. 결과는 0~3이라 두 비트로 나타내요.\n' +
            '- **sum** = 이 자리 값\n' +
            '- **cout** = 윗자리로 보낼 올림\n' +
            '\n' +
            '예: `1 + 1 + 1 = 3 = 11` → sum 1, cout 1',
          coach: {
            'condition:cin=1': '**cin = 1일 때만** 틀려요. 올라온 올림(cin)을 더하는 단계가 빠지지 않았나요?',
            swapped: '**sum** 과 **cout** 이 바뀐 것 같아요. 두 출력 선을 바꿔 보세요.',
          },
          hints: [
            '세 수를 더하는 건 "두 수를 더하고, 그 결과에 세 번째를 더하는 것" 과 같습니다.',
            '반가산기 2개를 이어 보세요: HA1(a, b) → HA2(HA1.sum, cin). 최종 sum은 HA2.sum.',
            '올림은 HA1.carry 와 HA2.carry 중 하나라도 1이면 1입니다(둘이 동시에 1이 될 수는 없음). → OR.',
          ],
          principle: {
            title: '덧셈을 쪼개기',
            body:
              'a + b + cin = (a + b) + cin. 반가산기 두 개를 이어서 계산하고, 두 단계에서 생긴 올림을 OR로 모읍니다.\n\n' +
              '흥미롭게도 cout은 "세 입력 중 2개 이상이 1인가?" — 1장 보스의 **다수결** 과 같은 함수입니다!',
            formula: 'sum = a ⊕ b ⊕ cin,  cout = MAJ(a, b, cin)',
            usage: '여러 자리 가산기의 한 자리를 담당하는 기본 단위.',
          },
        },
        en: {
          title: 'Full Adder',
          why:
            '✏️ When you add `27 + 15` on paper, you add the carried 1 **together** with the tens digit, right?\n' +
            'Binary works the same. You need a **one-digit adder** that also adds the carry coming up from below.',
          briefing:
            '**The problem**\n' +
            'A half adder adds only two bits. But multi-digit addition also has to add **the carry coming up from the digit below**.\n' +
            '\n' +
            '**Your job**\n' +
            'Add three bits a, b and **cin** (the incoming carry). The result is 0–3, so it takes two bits:\n' +
            '- **sum** = this digit\n' +
            '- **cout** = the carry to send up\n' +
            '\n' +
            'Example: `1 + 1 + 1 = 3 = 11` → sum 1, cout 1',
          coach: {
            'condition:cin=1': 'Wrong **only when cin = 1**. Is the step that adds the incoming carry (cin) missing?',
            swapped: '**sum** and **cout** look swapped. Try exchanging the two output wires.',
          },
          hints: [
            'Adding three numbers is the same as "add two, then add the third to the result".',
            'Chain two half adders: HA1(a, b) → HA2(HA1.sum, cin). The final sum is HA2.sum.',
            'The carry is 1 if HA1.carry or HA2.carry is 1 (they can never both be 1). → OR.',
          ],
          principle: {
            title: 'Splitting addition into steps',
            body:
              'a + b + cin = (a + b) + cin. Chain two half adders and OR together the carries from the two steps.\n\n' +
              'Interestingly, cout is "are at least 2 of the 3 inputs 1?" — the same function as the **majority vote** boss from Chapter 1!',
            formula: 'sum = a ⊕ b ⊕ cin,  cout = MAJ(a, b, cin)',
            usage: 'The one-digit building block of every multi-digit adder.',
          },
        },
      },
      solution: (b) => {
        const h1 = b.add('HALF_ADDER');
        const h2 = b.add('HALF_ADDER');
        const o = b.add('OR');
        b.wire('a', `${h1}.a`)
          .wire('b', `${h1}.b`)
          .wire(`${h1}.sum`, `${h2}.a`)
          .wire('cin', `${h2}.b`)
          .wire(`${h2}.sum`, 'sum')
          .wire(`${h1}.carry`, `${o}.a`)
          .wire(`${h2}.carry`, `${o}.b`)
          .wire(`${o}.out`, 'cout');
      },
    },
    {
      id: '3-3',
      chapter: 3,
      inputs: [pin('a:4'), pin('b:4'), pin('cin')],
      outputs: [pin('sum:4'), pin('cout')],
      allowedChips: [...GATES, ...CH2, 'HALF_ADDER', 'FULL_ADDER', ...BUS],
      test: autoTest([pin('a:4'), pin('b:4'), pin('cin')], (a, b, c) => [(a + b + c) & 15, (a + b + c) >> 4]),
      unlocks: { chipId: 'ADD4' },
      stars: { maxNand: 52 },
      devices: { columnAdd: { a: 'a', b: 'b', cin: 'cin', sum: 'sum', cout: 'cout' } },
      text: {
        ko: {
          title: '4비트 가산기',
          why:
            '🔢 `9 + 5 = 14` 같은 진짜 숫자 덧셈은 한 자리로는 못 해요.\n' +
            '전가산기를 줄줄이 이으면 몇 자리든 더할 수 있어요 — CPU의 덧셈, 주소 계산, "다음 명령으로 +1" 이 전부 이 회로예요.',
          briefing:
            '**할 일**\n' +
            '0~15 사이의 두 수를 더하세요.\n' +
            '- **a, b** = 4비트 버스\n' +
            '- **sum** = 4비트 결과\n' +
            '- **cout** = 16 이상이 되어 넘친 자리\n' +
            '\n' +
            '**아이디어**\n' +
            '종이에 덧셈하듯 **일의 자리부터**, 올림을 다음 자리로 넘겨요.\n' +
            '\n' +
            '입력값은 오른쪽 패널의 숫자 칸에서 바꿀 수 있어요.',
          coach: {
            'condition:cin=1': '**cin = 1일 때만** 틀려요. 맨 아랫자리 전가산기의 cin에 회로의 **cin** 을 이었나요?',
            'constant@cout': 'cout이 늘 같아요. **맨 윗자리(4번째) 전가산기의 cout** 을 회로의 cout으로 내보내세요.',
          },
          hints: [
            '각 자리(비트)마다 전가산기 하나. 자리 i의 올림은 자리 i+1의 cin으로 갑니다.',
            '버스 분리 4로 a, b를 비트로 나누고, 전가산기 4개의 sum을 버스 합치기 4로 모으세요.',
            'FA0.cin = cin, FA0.cout → FA1.cin → … → FA3.cout = cout. a.b0, b.b0 → FA0, a.b1, b.b1 → FA1, …',
          ],
          principle: {
            title: '리플 캐리 가산기',
            body:
              '전가산기를 사슬처럼 이으면 몇 비트든 더할 수 있습니다. 올림이 물결(ripple)처럼 아랫자리에서 윗자리로 전해져서 **리플 캐리 가산기** 라고 부릅니다.\n\n' +
              '**속도를 체험해 보세요:** 속도를 "아주 느리게" 로 두고 a=15, b=0인 상태에서 cin을 1로 바꿔 보세요. 올림이 한 자리씩 퍼져 나가는 것이 보입니다. 비트 수가 늘수록 느려지기 때문에, 실제 CPU는 올림을 미리 계산하는 더 빠른 가산기(캐리 예측)를 씁니다.',
            formula: 'cᵢ₊₁ = MAJ(aᵢ, bᵢ, cᵢ),  sᵢ = aᵢ ⊕ bᵢ ⊕ cᵢ',
            usage: 'CPU의 덧셈, 주소 계산, 프로그램 카운터 증가 — 컴퓨터에서 가장 많이 쓰이는 회로 중 하나.',
          },
        },
        en: {
          title: '4-bit Adder',
          why:
            '🔢 Real sums like `9 + 5 = 14` need more than one digit.\n' +
            'Chain full adders and you can add any number of digits — CPU addition, address math and "+1 to the next instruction" all use this circuit.',
          briefing:
            '**Your job**\n' +
            'Add two numbers from 0 to 15.\n' +
            '- **a, b** = 4-bit buses\n' +
            '- **sum** = the 4-bit result\n' +
            '- **cout** = the overflow when the total reaches 16 or more\n' +
            '\n' +
            '**The idea**\n' +
            'Like adding on paper: **start at the ones place** and pass each carry to the next.\n' +
            '\n' +
            'Change input values with the number fields in the right panel.',
          coach: {
            'condition:cin=1': 'Wrong **only when cin = 1**. Is the circuit’s **cin** wired to the lowest full adder’s cin?',
            'constant@cout': 'cout never changes. Send the **top (4th) full adder’s cout** out as the circuit’s cout.',
          },
          hints: [
            'One full adder per place (bit). The carry from place i goes into cin of place i+1.',
            'Split a and b into bits with Split 4, and gather the four sums with Merge 4.',
            'FA0.cin = cin, FA0.cout → FA1.cin → … → FA3.cout = cout. a.b0, b.b0 → FA0; a.b1, b.b1 → FA1; …',
          ],
          principle: {
            title: 'Ripple-carry adder',
            body:
              'Chain full adders and you can add any number of bits. The carry ripples from low digits to high ones, hence the name **ripple-carry adder**.\n\n' +
              '**Feel the delay:** set the speed to "Very slow", set a=15, b=0, then flip cin to 1. You can watch the carry spread one digit at a time. Since this gets slower with more bits, real CPUs use faster adders that predict carries in advance (carry-lookahead).',
            formula: 'cᵢ₊₁ = MAJ(aᵢ, bᵢ, cᵢ),  sᵢ = aᵢ ⊕ bᵢ ⊕ cᵢ',
            usage: 'CPU addition, address calculation, incrementing the program counter — one of the most-used circuits in a computer.',
          },
        },
      },
      solution: (b) => {
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
        b.wire(carry, 'cout');
      },
    },
    {
      id: '3-3b',
      chapter: 3,
      inputs: [pin('in:4')],
      outputs: [pin('out:4')],
      // 게이트는 없음: 덧셈 회로만으로 빼기를 "발견" 하는 레벨
      allowedChips: ['ADD4', ...CONST, ...BUS],
      test: autoTest([pin('in:4')], (x) => [(x + 15) & 15]),
      stars: { maxNand: 52 },
      devices: { wheel: ['in', 'out'] },
      text: {
        ko: {
          title: '시계 산수: 덧셈으로 1 빼기',
          why:
            '⏰ 시계에서 **1시간 전** 은 **11시간 후** 와 같아요.\n' +
            '🚗 자동차 주행거리계가 `0000` 에서 거꾸로 돌면 `9999` 가 돼요.\n' +
            '4비트 수도 똑같이 빙글 돌아요. 이 성질이 다음 레벨 **음수** 의 비밀이에요.',
          briefing:
            '**곤란한 상황**\n' +
            '숫자를 1 줄이는 버튼이 필요해요. 그런데 손에 있는 건 **덧셈 회로(ADD4)와 상수** 뿐이에요. 게이트도 없어요!\n' +
            '\n' +
            '**질문**\n' +
            '덧셈만으로 1을 뺄 수 있을까요?\n' +
            '\n' +
            '**알고 있는 사실**\n' +
            '- 4비트 수는 `15` 다음에 `0` 으로 돌아가요: `1111 + 1 = 0000`\n' +
            '- 아래 **숫자 다이얼** 을 보세요. 시계와 똑같이 생겼죠?\n' +
            '\n' +
            '**할 일**\n' +
            'in을 받아 **in − 1** 을 내보내세요. (in = 0이면 15)',
          coach: {
            passthrough: '입력이 그대로 나와요. **ADD4의 b** 에 어떤 수를 더할지 정해야 해요. (b = `1111` 이면서 cin = 1이면 16을 더해 제자리예요!)',
            'offset+1': '1을 빼야 하는데 오히려 **1을 더하고** 있어요. 다이얼에서 바늘을 **거꾸로** 한 칸 돌리려면 앞으로 몇 칸 돌려야 할까요?',
            'offset+2': '2를 더하고 있어요. 앞으로 **15칸** 돌리면 거꾸로 1칸이에요.',
          },
          hints: [
            '시계는 12시간을 돌면 제자리예요. 4비트 다이얼은 몇 칸을 돌면 제자리일까요?',
            '16칸 돌면 제자리 → **15칸 돌면 한 칸 뒤**. 즉 15를 더하면 1을 뺀 것과 같아요!',
            'ADD4.a = in, ADD4.b = 상수 1 네 개를 버스 합치기 4로 묶은 `1111`, ADD4.cin = 상수 0, sum → out.',
          ],
          principle: {
            title: '더하기로 빼기',
            body:
              '4비트 세계에서는 **16 = 0** 이에요(16칸 돌면 제자리). 그래서 15를 더하면 16 − 1, 즉 **1을 빼는 것** 과 같아요.\n\n' +
              '일반적으로 **x를 빼고 싶으면 16 − x를 더하면** 돼요. 이 "16 − x" 가 바로 다음 레벨에서 만들 **−x(2의 보수)** 예요.',
            formula: 'a − 1 ≡ a + 15 (mod 16)',
            usage: 'CPU의 감소(DEC) 명령, 반복문의 카운트다운, 그리고 모든 뺄셈의 출발점.',
          },
        },
        en: {
          title: 'Clock Math: Subtract 1 by Adding',
          why:
            '⏰ On a clock, **1 hour ago** is the same as **11 hours later**.\n' +
            '🚗 A car odometer rolling back from `0000` shows `9999`.\n' +
            '4-bit numbers wrap around the same way. This is the secret behind **negative numbers** in the next level.',
          briefing:
            '**The problem**\n' +
            'You need a button that decreases a number by 1. But all you have is **an adder (ADD4) and constants**. No gates!\n' +
            '\n' +
            '**The question**\n' +
            'Can you subtract 1 using only addition?\n' +
            '\n' +
            '**What you know**\n' +
            '- 4-bit numbers wrap from `15` back to `0`: `1111 + 1 = 0000`\n' +
            '- Look at the **number dial** below. Doesn’t it look like a clock?\n' +
            '\n' +
            '**Your job**\n' +
            'Take in and output **in − 1**. (When in = 0, output 15.)',
          coach: {
            passthrough: 'The input comes straight out. Decide what number to add on **ADD4’s b**. (b = `1111` with cin = 1 adds 16 — right back where you started!)',
            'offset+1': 'You are **adding 1** instead of subtracting. To turn the dial **back** one step, how many steps forward do you need?',
            'offset+2': 'You are adding 2. Turning **15 steps forward** is one step back.',
          },
          hints: [
            'A clock is back where it started after 12 hours. How many steps bring the 4-bit dial back around?',
            '16 steps = back to start → **15 steps = one step back**. Adding 15 is the same as subtracting 1!',
            'ADD4.a = in, ADD4.b = four Const 1s merged into `1111` with Merge 4, ADD4.cin = Const 0, sum → out.',
          ],
          principle: {
            title: 'Subtracting by adding',
            body:
              'In the 4-bit world **16 = 0** (16 steps around is back to start). So adding 15 is adding 16 − 1, which is the same as **subtracting 1**.\n\n' +
              'In general, **to subtract x, add 16 − x**. That "16 − x" is exactly the **−x (two’s complement)** you will build next level.',
            formula: 'a − 1 ≡ a + 15 (mod 16)',
            usage: 'The CPU’s decrement (DEC), loop countdowns — and the starting point of all subtraction.',
          },
        },
      },
      solution: (b) => {
        const add = b.add('ADD4');
        const m = b.add('MERGE4');
        const one = b.add('CONST1');
        const zero = b.add('CONST0');
        for (let i = 0; i < 4; i++) b.wire(`${one}.out`, `${m}.b${i}`);
        b.wire('in', `${add}.a`).wire(`${m}.out`, `${add}.b`).wire(`${zero}.out`, `${add}.cin`).wire(`${add}.sum`, 'out');
      },
    },
    {
      id: '3-4',
      chapter: 3,
      inputs: [pin('in:4')],
      outputs: [pin('out:4')],
      allowedChips: [...GATES, ...CH2, 'HALF_ADDER', 'FULL_ADDER', 'ADD4', ...CONST, ...BUS],
      test: autoTest([pin('in:4')], (x) => [(16 - x) & 15]),
      unlocks: { chipId: 'NEG4' },
      stars: { maxNand: 56 },
      signedPins: ['out'],
      devices: { wheel: ['in', 'out'] },
      text: {
        ko: {
          title: '음수 만들기 (2의 보수)',
          why:
            '🛗 엘리베이터 **B1** = −1층 · 🌡 **−5°C** · 💳 **−3,000원**\n' +
            '컴퓨터도 음수가 필요한데, 비트에는 "−" 기호가 없어요.\n' +
            '\n' +
            '이번 레벨: **0과 1만으로 음수 쓰기**\n' +
            '다음 레벨: 이걸로 **덧셈 회로가 뺄셈** 까지 해요',
          briefing:
            '**곤란한 상황**\n' +
            '계산기에 뺄셈 버튼을 달아야 하는데, 손에 있는 건 **덧셈 회로(ADD4)** 뿐이에요.\n' +
            '\n' +
            '**아이디어**\n' +
            '음수를 더하면 빼기가 돼요: `a − b = a + (−b)`\n' +
            '방금 **15를 더해서 1을 뺐죠?** 그러니 −1은 `1111` (15). 마찬가지로 **x에 더해 0(=16)이 되는 수** 가 −x예요.\n' +
            '\n' +
            '**요령: 뒤집고 +1 (2의 보수)**\n' +
            '- 3 = `0011`\n' +
            '- 뒤집기 → `1100`\n' +
            '- 1 더하기 → `1101` = **−3**\n' +
            '- 확인: `0011 + 1101 = 0000` ✓ (넘친 1은 버려요)\n' +
            '\n' +
            '**할 일**\n' +
            'in을 받아 −in(4비트)을 내보내세요. **상수 0 / 상수 1** 을 쓸 수 있어요.',
          coach: {
            'offset-1':
              '거의 다 왔어요! 지금은 **뒤집기만** 한 상태예요 (뒤집은 x는 −x보다 딱 1 작아요). 마지막에 **1을 더해** 보세요. ADD4의 **cin** 을 상수 1에 이으면 돼요.',
            'offset+1': '1을 **두 번** 더한 것 같아요. ADD4의 b에 1을 넣고 cin도 1이면 +2가 돼요. **둘 중 하나만** 1로!',
            passthrough: '입력이 그대로 나오고 있어요. 먼저 **비트를 모두 뒤집어** 보세요: 버스 분리 → NOT 4개 → 버스 합치기.',
          },
          hints: [
            '두 단계입니다: ① 비트를 모두 뒤집는다, ② 1을 더한다.',
            '뒤집기: 버스 분리 → NOT 4개 → 버스 합치기. 1 더하기: ADD4를 쓰되, 더할 수(b)는 0으로 두고 cin을 1로!',
            'ADD4.a = 뒤집은 값, ADD4.b = 상수 0을 버스 합치기 4로 묶은 0000, ADD4.cin = 상수 1.',
          ],
          principle: {
            title: '왜 뒤집고 1을 더할까?',
            body:
              '4비트 수는 16에서 다시 0으로 돌아갑니다(시계처럼). 그래서 **x + (-x) = 16 = 0** 이 되는 수를 -x로 쓰면 됩니다.\n\n' +
              'x + (뒤집은 x) = 1111 = 15 이므로, 거기에 1을 더하면 16 = 0. 따라서 **-x = 뒤집은 x + 1**.\n\n' +
              '최상위 비트가 1이면 음수로 읽습니다. 4비트로는 -8 ~ 7을 나타낼 수 있습니다. 가장 큰 장점: **덧셈 회로를 그대로 써서 뺄셈을 할 수 있다** 는 것!',
            formula: '−x = ¬x + 1',
            usage: '거의 모든 컴퓨터가 음수를 2의 보수로 저장합니다. 정수 오버플로(127 + 1 = -128) 현상의 원인이기도 합니다.',
          },
        },
        en: {
          title: 'Making Negatives (Two’s Complement)',
          why:
            '🛗 Floor **B1** = −1 · 🌡 **−5°C** · 💳 **−$30**\n' +
            'Computers need negatives too — but bits have no "−" sign.\n' +
            '\n' +
            'This level: **negatives from just 0s and 1s**\n' +
            'Next level: with it, **the adder can subtract**',
          briefing:
            '**The problem**\n' +
            'The calculator needs a minus button, but all you have is an **adder (ADD4)**.\n' +
            '\n' +
            '**The idea**\n' +
            'Adding a negative is subtracting: `a − b = a + (−b)`\n' +
            'You just **subtracted 1 by adding 15**, so −1 is `1111` (15). Likewise **the number that adds to x to give 0 (=16)** is −x.\n' +
            '\n' +
            '**The recipe: flip, then +1 (two’s complement)**\n' +
            '- 3 = `0011`\n' +
            '- flip → `1100`\n' +
            '- add 1 → `1101` = **−3**\n' +
            '- check: `0011 + 1101 = 0000` ✓ (the overflow 1 is dropped)\n' +
            '\n' +
            '**Your job**\n' +
            'Take in and output −in (4 bits). **Const 0 / Const 1** are available.',
          coach: {
            'offset-1':
              'So close! Right now you have **only flipped** the bits (flipped x is exactly 1 less than −x). **Add 1** at the end — wire ADD4’s **cin** to Const 1.',
            'offset+1': 'Looks like you add 1 **twice**. With 1 on ADD4’s b and cin = 1 you get +2. Make **only one** of them 1!',
            passthrough: 'The input comes straight out. First **flip every bit**: split → 4 NOTs → merge.',
          },
          hints: [
            'Two steps: ① flip every bit, ② add 1.',
            'Flip: split → 4 NOTs → merge. Add 1: use ADD4 with b set to 0 and cin set to 1!',
            'ADD4.a = flipped value, ADD4.b = Const 0 merged into 0000 with Merge 4, ADD4.cin = Const 1.',
          ],
          principle: {
            title: 'Why flip and add 1?',
            body:
              '4-bit numbers wrap from 16 back to 0 (like a clock). So we just need the number where **x + (-x) = 16 = 0**.\n\n' +
              'x + (flipped x) = 1111 = 15, and adding 1 gives 16 = 0. Therefore **-x = flipped x + 1**.\n\n' +
              'A top bit of 1 is read as negative, so 4 bits cover -8 to 7. The big win: **subtraction can reuse the adder circuit unchanged**!',
            formula: '−x = ¬x + 1',
            usage: 'Almost every computer stores negative integers in two’s complement — it is also why integers overflow (127 + 1 = -128).',
          },
        },
      },
      solution: (b) => {
        const sp = b.add('SPLIT4');
        const inv = b.add('MERGE4');
        const zero = b.add('CONST0');
        const one = b.add('CONST1');
        const zb = b.add('MERGE4');
        const add = b.add('ADD4');
        b.wire('in', `${sp}.in`);
        for (let i = 0; i < 4; i++) {
          const n = b.add('NOT');
          b.wire(`${sp}.b${i}`, `${n}.in`).wire(`${n}.out`, `${inv}.b${i}`).wire(`${zero}.out`, `${zb}.b${i}`);
        }
        b.wire(`${inv}.out`, `${add}.a`).wire(`${zb}.out`, `${add}.b`).wire(`${one}.out`, `${add}.cin`).wire(`${add}.sum`, 'out');
      },
    },
    {
      id: '3-5',
      chapter: 3,
      inputs: A4B4,
      outputs: [pin('diff:4'), pin('cout')],
      allowedChips: [...GATES, ...CH2, 'HALF_ADDER', 'FULL_ADDER', 'ADD4', 'NEG4', ...CONST, ...BUS],
      test: autoTest(A4B4, (a, b) => [(a - b) & 15, a >= b ? 1 : 0]),
      unlocks: { chipId: 'SUB4' },
      stars: { maxNand: 56 },
      devices: { wheel: ['a', 'b', 'diff'] },
      text: {
        ko: {
          title: '4비트 감산기',
          why:
            '💳 잔액 · ⏱ 남은 시간 · 🎮 HP 깎기 — 빼기는 어디에나 있어요.\n' +
            '그런데 실제 CPU에는 **뺄셈 전용 회로가 거의 없어요.**\n' +
            '이번 레벨에서 이유를 확인해요: 가산기에 선 몇 개만 바꾸면 끝!',
          briefing:
            '**아이디어**\n' +
            '방금 만든 요령이면 덧셈 회로가 그대로 뺄셈 회로가 돼요.\n' +
            '`a − b = a + (−b) = a + ¬b + 1`\n' +
            '\n' +
            '**할 일**\n' +
            '- **diff** = a − b (4비트, 넘치면 16을 돌아 감기)\n' +
            '- **cout** = 가산기의 올림을 그대로\n' +
            '\n' +
            'a ≥ b이면 cout = 1이 돼요. 이 성질은 다음 레벨의 **비교** 에 쓰여요.',
          coach: {
            'offset+1@diff':
              '1을 **두 번** 더했어요! **NEG4 안에 이미 +1이 들어 있어요.** NEG4를 쓴다면 cin은 0으로, b를 직접 뒤집는다면 cin을 1로 — 둘 중 하나만.',
            'offset-1@diff': '**a + ¬b** 까지만 했어요. 2의 보수는 "뒤집고 **+1**" — ADD4의 **cin** 을 상수 1에 이어 보세요.',
            'condition:b=0':
              'diff는 맞는데 **b = 0일 때만** cout이 틀려요! NEG4로 −0을 만들면 0000이라 올림이 생기지 않거든요. NEG4 대신 **b를 직접 뒤집고 cin = 1** 로 해 보세요. 그러면 cout이 "a ≥ b"와 딱 맞아요.',
            'inverted@cout': 'cout이 정반대예요. 가산기의 **cout을 그대로** 내보내면 돼요 (a ≥ b일 때 1).',
          },
          hints: [
            'NEG4로 −b를 만들어 ADD4로 더해도 결과는 맞습니다. 하지만 cout이 달라질 수 있어요. 더 직접적인 방법은?',
            '"+1" 을 따로 하지 말고 가산기의 cin에 1을 넣으면 한 번에 끝납니다.',
            'b → 버스 분리 → NOT 4개 → 버스 합치기 → ADD4.b, a → ADD4.a, 상수 1 → ADD4.cin. sum → diff, cout → cout.',
          ],
          principle: {
            title: '뺄셈기는 따로 없다',
            body:
              'b를 뒤집고 cin=1을 주면 가산기가 곧 감산기가 됩니다. 실제 CPU에도 "뺄셈 전용 회로" 는 거의 없습니다.\n\n' +
              '**cout의 비밀:** a + ¬b + 1 에서 올림이 생긴다는 것은 a ≥ b 라는 뜻입니다. 올림이 없으면 "빌려 와야 했다(borrow)", 즉 a < b. 이 사실로 다음 레벨에서 **비교기** 를 만듭니다.',
            formula: 'a − b = a + ¬b + 1,  cout = (a ≥ b)',
            usage: 'ALU의 SUB 연산, 비교 명령(CMP), 조건 분기의 근거.',
          },
        },
        en: {
          title: '4-bit Subtractor',
          why:
            '💳 Balances · ⏱ time left · 🎮 losing HP — subtraction is everywhere.\n' +
            'Yet real CPUs **barely have a subtraction circuit.**\n' +
            'This level shows why: rewire a few lines of the adder and you are done!',
          briefing:
            '**The idea**\n' +
            'With the trick you just learned, the adder becomes a subtractor.\n' +
            '`a − b = a + (−b) = a + ¬b + 1`\n' +
            '\n' +
            '**Your job**\n' +
            '- **diff** = a − b (4 bits, wrapping past 16)\n' +
            '- **cout** = the adder’s carry, passed straight out\n' +
            '\n' +
            'cout becomes 1 when a ≥ b. The next level uses this to **compare**.',
          coach: {
            'offset+1@diff':
              'You add 1 **twice**! **NEG4 already contains the +1.** With NEG4 keep cin at 0; if you flip b yourself, set cin to 1 — only one of them.',
            'offset-1@diff': 'You only did **a + ¬b**. Two’s complement is "flip, then **+1**" — wire ADD4’s **cin** to Const 1.',
            'condition:b=0':
              'diff is right, but cout is wrong **only when b = 0**! NEG4 turns −0 into 0000, so no carry appears. Instead of NEG4, **flip b yourself and set cin = 1** — then cout matches "a ≥ b" exactly.',
            'inverted@cout': 'cout is the exact opposite. Pass the adder’s **cout straight out** (1 when a ≥ b).',
          },
          hints: [
            'Using NEG4 for −b and then ADD4 gives the right diff, but cout may differ. Is there a more direct way?',
            'Instead of a separate "+1", feed 1 into the adder’s cin and do it all at once.',
            'b → split → 4 NOTs → merge → ADD4.b, a → ADD4.a, Const 1 → ADD4.cin. sum → diff, cout → cout.',
          ],
          principle: {
            title: 'There is no separate subtractor',
            body:
              'Flip b and set cin=1, and the adder becomes a subtractor. Real CPUs rarely have a dedicated subtraction circuit.\n\n' +
              '**cout’s secret:** a carry out of a + ¬b + 1 means a ≥ b. No carry means "we had to borrow", i.e. a < b. Next level you will build a **comparator** from this fact.',
            formula: 'a − b = a + ¬b + 1,  cout = (a ≥ b)',
            usage: 'The ALU’s SUB operation, compare instructions (CMP), the basis of conditional branches.',
          },
        },
      },
      solution: (b) => {
        const sp = b.add('SPLIT4');
        const inv = b.add('MERGE4');
        const one = b.add('CONST1');
        const add = b.add('ADD4');
        b.wire('b', `${sp}.in`);
        for (let i = 0; i < 4; i++) {
          const n = b.add('NOT');
          b.wire(`${sp}.b${i}`, `${n}.in`).wire(`${n}.out`, `${inv}.b${i}`);
        }
        b.wire('a', `${add}.a`).wire(`${inv}.out`, `${add}.b`).wire(`${one}.out`, `${add}.cin`).wire(`${add}.sum`, 'diff').wire(`${add}.cout`, 'cout');
      },
    },
    {
      id: '3-6',
      chapter: 3,
      inputs: A4B4,
      outputs: [pin('eq'), pin('lt')],
      allowedChips: [...GATES, ...CH2, 'HALF_ADDER', 'FULL_ADDER', 'ADD4', 'NEG4', 'SUB4', ...CONST, ...BUS],
      test: autoTest(A4B4, (a, b) => [a === b ? 1 : 0, a < b ? 1 : 0]),
      unlocks: { chipId: 'CMP4' },
      stars: { maxNand: 67 },
      text: {
        ko: {
          title: '4비트 비교기',
          why:
            '🔐 비밀번호가 맞나? (같다)\n' +
            '🏆 최고 점수를 넘었나? (크다)\n' +
            '🔁 반복을 10번 다 했나?\n' +
            '프로그램의 모든 **판단(if)** 은 결국 두 수의 비교예요. 컴퓨터는 비교할 때 **실제로 빼 봐요.**',
          briefing:
            '**질문**\n' +
            '"**만약 a가 b보다 작으면…**" 을 하드웨어는 어떻게 판단할까요?\n' +
            '\n' +
            '**할 일**\n' +
            '두 수(0~15, 부호 없음)를 비교해 내보내세요.\n' +
            '- **eq** = a와 b가 같으면 1\n' +
            '- **lt** = a가 b보다 작으면 1\n' +
            '\n' +
            '방금 만든 감산기에 필요한 정보가 다 들어 있어요.',
          coach: {
            'inverted@lt': 'lt가 정반대예요. 감산기의 cout = 1은 **a ≥ b** 라는 뜻이에요. lt는 그 **반대** 니까 NOT을 하나 붙여 보세요.',
            'inverted@eq': 'eq가 정반대예요. "diff의 비트 중 **하나라도 1**" 을 구했다면, 그 **반대** 가 "모두 0 = 같다" 예요.',
          },
          hints: [
            'a − b 를 계산하면: 같을 때 결과는? a < b 일 때 cout은?',
            'eq: diff가 0000인가? = 네 비트가 모두 0인가. lt: cout의 반대.',
            'SUB4 → diff를 버스 분리, OR(d0,d1), OR(d2,d3), 두 결과를 NOR → eq. NOT(cout) → lt.',
          ],
          principle: {
            title: '비교 = 빼 보기',
            body:
              '컴퓨터는 두 수를 비교할 때 **실제로 빼 봅니다**. 결과가 0이면 같고, 빌림(borrow)이 생기면 작습니다.\n\n' +
              '이렇게 계산 결과에서 뽑아낸 정보를 **플래그** 라고 합니다: **Z**(Zero, 결과가 0), **C**(Carry, 올림). 챕터 7의 ALU가 이 플래그를 만들고, 챕터 8의 CPU는 플래그를 보고 "같으면 점프" 같은 **조건 분기** 를 합니다.',
            formula: 'eq = ¬(d₀ ∨ d₁ ∨ d₂ ∨ d₃),  lt = ¬cout',
            usage: 'if 문, 반복문의 종료 조건, 정렬 — 모든 "판단" 의 하드웨어적 기초.',
          },
        },
        en: {
          title: '4-bit Comparator',
          why:
            '🔐 Is the password right? (equal)\n' +
            '🏆 New high score? (greater)\n' +
            '🔁 Looped 10 times yet?\n' +
            'Every **decision (if)** in a program is a comparison of two numbers. To compare, a computer **actually subtracts.**',
          briefing:
            '**The question**\n' +
            'How does hardware decide "**if a is less than b…**"?\n' +
            '\n' +
            '**Your job**\n' +
            'Compare two numbers (0–15, unsigned) and output:\n' +
            '- **eq** = 1 when a equals b\n' +
            '- **lt** = 1 when a is less than b\n' +
            '\n' +
            'The subtractor you just built already holds everything you need.',
          coach: {
            'inverted@lt': 'lt is the exact opposite. The subtractor’s cout = 1 means **a ≥ b**. lt is the **opposite**, so add a NOT.',
            'inverted@eq': 'eq is the exact opposite. If you computed "**any** diff bit is 1", its **opposite** is "all 0 = equal".',
          },
          hints: [
            'Compute a − b: what is the result when they are equal? What is cout when a < b?',
            'eq: is diff 0000? = are all four bits 0? lt: the opposite of cout.',
            'SUB4 → split diff, OR(d0,d1), OR(d2,d3), NOR the two → eq. NOT(cout) → lt.',
          ],
          principle: {
            title: 'Compare = try subtracting',
            body:
              'To compare two numbers a computer **actually subtracts them**. A zero result means equal; a borrow means smaller.\n\n' +
              'Information extracted from a result like this is called a **flag**: **Z** (Zero) and **C** (Carry). The ALU in Chapter 7 produces these flags, and the CPU in Chapter 8 uses them for **conditional branches** like "jump if equal".',
            formula: 'eq = ¬(d₀ ∨ d₁ ∨ d₂ ∨ d₃),  lt = ¬cout',
            usage: 'if statements, loop exit conditions, sorting — the hardware basis of every "decision".',
          },
        },
      },
      solution: (b) => {
        const sub = b.add('SUB4');
        const sp = b.add('SPLIT4');
        const o1 = b.add('OR');
        const o2 = b.add('OR');
        const nor = b.add('NOR');
        const n = b.add('NOT');
        b.wire('a', `${sub}.a`)
          .wire('b', `${sub}.b`)
          .wire(`${sub}.diff`, `${sp}.in`)
          .wire(`${sp}.b0`, `${o1}.a`)
          .wire(`${sp}.b1`, `${o1}.b`)
          .wire(`${sp}.b2`, `${o2}.a`)
          .wire(`${sp}.b3`, `${o2}.b`)
          .wire(`${o1}.out`, `${nor}.a`)
          .wire(`${o2}.out`, `${nor}.b`)
          .wire(`${nor}.out`, 'eq')
          .wire(`${sub}.cout`, `${n}.in`)
          .wire(`${n}.out`, 'lt');
      },
    },
    {
      id: '3-B',
      chapter: 3,
      inputs: A4B4,
      outputs: [pin('sum:4'), pin('ovf')],
      allowedChips: [...GATES, ...CH2, 'HALF_ADDER', 'FULL_ADDER', 'ADD4', 'NEG4', 'SUB4', 'CMP4', ...CONST, ...BUS],
      test: autoTest(A4B4, (a, b) => {
        const s = (a + b) & 15;
        const sign = (x: number) => (x >> 3) & 1;
        return [s, sign(a) === sign(b) && sign(s) !== sign(a) ? 1 : 0];
      }),
      stars: { maxNand: 63 },
      signedPins: ['a', 'b', 'sum'],
      devices: { wheel: ['a', 'b', 'sum'] },
      text: {
        ko: {
          title: '보스: 오버플로 감지기',
          why:
            '📺 2014년 **강남스타일** 조회수가 32비트 정수의 한계(약 21억)에 다가가자, YouTube가 카운터를 64비트로 바꿨어요. 그대로 뒀다면 숫자가 넘쳐 **음수** 로 뒤집혔을 수도 있어요.\n' +
            '🚀 1996년 아리안 5 로켓도 숫자가 넘쳐서 폭발했어요.\n' +
            '넘침을 **알아채는 회로** 가 이번 보스예요.',
          briefing:
            '**사고 현장**\n' +
            '4비트 게임에서 공격력 7인 캐릭터가 +1 버프를 받았더니… 공격력이 **−8** 이 됐어요!\n' +
            '\n' +
            '**왜?**\n' +
            '부호 있는 4비트 수는 −8 ~ 7까지만 담을 수 있어요.\n' +
            '- `5 + 4 = 9` 인데 4비트로는 `1001` = **−7**\n' +
            '- 양수 + 양수가 음수가 됐으니 **오버플로**\n' +
            '\n' +
            '**할 일**\n' +
            'a, b를 부호 있는 4비트 수로 보고 더하세요.\n' +
            '- **sum** = a + b (4비트)\n' +
            '- **ovf** = 범위를 벗어나 부호가 틀려졌으면 1',
          coach: {
            'constant@ovf': 'ovf가 늘 같은 값이에요. 오버플로는 "**a와 b의 부호(최상위 비트)가 같은데, sum의 부호가 다를 때**" 생겨요. 세 개의 최상위 비트를 꺼내 보세요.',
            'inverted@ovf': 'ovf가 정반대예요. 부호가 **같은지** 볼 때는 XNOR, **다른지** 볼 때는 XOR — 바뀌지 않았나요?',
          },
          hints: [
            '언제 오버플로가 날 수 있을까요? 양수 + 음수는 절대 범위를 벗어나지 않습니다.',
            '오버플로 = "a와 b의 부호가 같은데, sum의 부호가 a와 다르다". 부호는 최상위 비트(b3)입니다.',
            'ADD4(cin=상수0)로 sum을 구하고, a.b3·b.b3·sum.b3를 꺼내서: ovf = AND( XNOR(a3, b3), XOR(a3, s3) ).',
          ],
          principle: {
            title: '올림(carry)과 오버플로는 다르다',
            body:
              '같은 비트 패턴도 **부호 없는 수** 로 읽느냐 **부호 있는 수** 로 읽느냐에 따라 뜻이 다릅니다. 1001은 9이기도 하고 -7이기도 합니다.\n\n' +
              '부호 없는 덧셈이 넘치면 **cout** 이 1이 되고, 부호 있는 덧셈이 넘치면 **오버플로(V)** 가 1이 됩니다. 덧셈 회로는 하나지만, 해석에 따라 서로 다른 플래그를 봐야 합니다.',
            formula: 'V = (a₃ ⊙ b₃) ∧ (a₃ ⊕ s₃)',
            usage: 'CPU의 오버플로 플래그(V). 1996년 아리안 5 로켓은 64비트 → 16비트 변환 오버플로로 발사 37초 만에 폭발했습니다.',
          },
        },
        en: {
          title: 'Boss: Overflow Detector',
          why:
            '📺 In 2014, **Gangnam Style** approached the 32-bit integer limit (about 2.1 billion views), so YouTube switched its counter to 64 bits. Left alone, the count could have overflowed into a **negative** number.\n' +
            '🚀 The Ariane 5 rocket exploded in 1996 because a number overflowed.\n' +
            'This boss is a **circuit that notices** overflow.',
          briefing:
            '**Incident report**\n' +
            'In a 4-bit game, a hero with attack 7 got a +1 buff… and attack became **−8**!\n' +
            '\n' +
            '**Why?**\n' +
            'Signed 4-bit numbers only hold −8 to 7.\n' +
            '- `5 + 4 = 9`, but in 4 bits that is `1001` = **−7**\n' +
            '- positive + positive became negative: **overflow**\n' +
            '\n' +
            '**Your job**\n' +
            'Treat a and b as signed 4-bit numbers and add them.\n' +
            '- **sum** = a + b (4 bits)\n' +
            '- **ovf** = 1 if the result left the range and its sign is wrong',
          coach: {
            'constant@ovf': 'ovf never changes. Overflow happens when "**a and b have the same sign (top bit), but sum’s sign differs**". Pull out the three top bits.',
            'inverted@ovf': 'ovf is the exact opposite. Use XNOR to check signs are **equal** and XOR to check they **differ** — are they swapped?',
          },
          hints: [
            'When can overflow happen at all? Positive + negative can never leave the range.',
            'Overflow = "a and b have the same sign, but sum’s sign differs from a". The sign is the top bit (b3).',
            'Get sum from ADD4 (cin = Const 0), extract a.b3, b.b3, sum.b3, then: ovf = AND( XNOR(a3, b3), XOR(a3, s3) ).',
          ],
          principle: {
            title: 'Carry and overflow are different',
            body:
              'The same bit pattern means different things read as **unsigned** or **signed**. 1001 is both 9 and -7.\n\n' +
              'When unsigned addition overflows, **cout** becomes 1; when signed addition overflows, **overflow (V)** becomes 1. There is one adder, but you must check a different flag depending on interpretation.',
            formula: 'V = (a₃ ⊙ b₃) ∧ (a₃ ⊕ s₃)',
            usage: 'The CPU’s overflow flag (V). In 1996 the Ariane 5 rocket exploded 37 seconds after launch due to a 64-bit → 16-bit conversion overflow.',
          },
        },
      },
      solution: (b) => {
        const add = b.add('ADD4');
        const zero = b.add('CONST0');
        const sa = b.add('SPLIT4');
        const sb = b.add('SPLIT4');
        const ss = b.add('SPLIT4');
        const xn = b.add('XNOR');
        const x = b.add('XOR');
        const g = b.add('AND');
        b.fan('a', `${add}.a`, `${sa}.in`)
          .fan('b', `${add}.b`, `${sb}.in`)
          .wire(`${zero}.out`, `${add}.cin`)
          .fan(`${add}.sum`, 'sum', `${ss}.in`)
          .wire(`${sa}.b3`, `${xn}.a`)
          .wire(`${sb}.b3`, `${xn}.b`)
          .wire(`${sa}.b3`, `${x}.a`)
          .wire(`${ss}.b3`, `${x}.b`)
          .wire(`${xn}.out`, `${g}.a`)
          .wire(`${x}.out`, `${g}.b`)
          .wire(`${g}.out`, 'ovf');
      },
    },
  ],
};
