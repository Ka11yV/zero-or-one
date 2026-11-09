import { pin, truthTableFrom } from '../sim';
import type { Chapter } from './types';

const IN = [pin('in')];
const AB = [pin('a'), pin('b')];
const ABC = [pin('a'), pin('b'), pin('c')];
const OUT = [pin('out')];

export const chapter1: Chapter = {
  id: 1,
  title: { ko: '하나로 모든 것을', en: 'One Gate to Rule Them All' },
  subtitle: { ko: 'NAND로 기본 게이트 만들기', en: 'Building the basic gates from NAND' },
  levels: [
    {
      id: '1-1',
      chapter: 1,
      inputs: IN,
      outputs: OUT,
      allowedChips: ['NAND'],
      test: truthTableFrom(IN, (a) => [a ^ 1]),
      unlocks: { chipId: 'NOT' },
      stars: { maxNand: 1 },
      text: {
        ko: {
          title: 'NOT — 뒤집기',
          why:
            '🌙 어두워지면 켜지는 가로등은 "밝다"의 **반대** 로 불을 켜요.\n' +
            '🔁 프로그램의 `!` 나 "아니면(else)" 처럼, 뒤집는 일은 컴퓨터에서 아주 흔해요.',
          briefing:
            '**NOT** 게이트는 입력을 뒤집어요: `0 → 1`, `1 → 0`.\n' +
            '\n' +
            '**곤란한 상황**\n' +
            '가진 부품은 **NAND뿐** 이에요.\n' +
            '\n' +
            '**할 일**\n' +
            'NAND로 NOT을 만들어 보세요. 완성하면 **NOT 칩** 을 얻어요.',
          coach: {
            passthrough: '입력이 그대로 나오고 있어요. 신호가 **NAND를 거쳐서** 나가도록 연결해 보세요.',
            constant: 'out이 늘 같은 값이에요. NAND의 **두 입력 핀이 모두** 연결됐나요? 비어 있는 핀은 0으로 읽혀요.',
          },
          hints: [
            'NAND의 두 입력에 **같은 값** 을 넣으면 출력은 어떻게 될까요? 진리표의 0·0 줄과 1·1 줄을 보세요.',
            '입력 in을 NAND의 두 입력 모두에 연결해 보세요 (출력 하나는 여러 곳에 연결할 수 있습니다).',
            'in → NAND.a, in → NAND.b, NAND.out → out. NAND 1개면 충분합니다.',
          ],
          principle: {
            title: 'NOT = NAND(A, A)',
            body:
              'NAND의 두 입력을 묶으면 a = b 인 줄만 남습니다. 0·0 → 1, 1·1 → 0. 정확히 NOT입니다.\n\n' +
              '"같은 신호를 두 번 넣는다"는 단순한 아이디어로 새 기능이 생겼습니다. 앞으로 계속 이렇게 **작은 부품을 조합해 새 부품** 을 만듭니다.',
            formula: '¬A = ¬(A ∧ A)',
            usage: '뺄셈(2의 보수), 조건 반전, 메모리 회로 등 거의 모든 곳에 쓰입니다.',
          },
        },
        en: {
          title: 'NOT — Flip It',
          why:
            '🌙 A streetlight that turns on at dusk lights up on the **opposite** of "it is bright".\n' +
            '🔁 Like `!` or "else" in a program, flipping things is everywhere in computing.',
          briefing:
            'A **NOT** gate inverts its input: `0 → 1`, `1 → 0`.\n' +
            '\n' +
            '**The problem**\n' +
            'All you have is **NAND**.\n' +
            '\n' +
            '**Your job**\n' +
            'Build NOT from NAND. When you finish, you earn the **NOT chip**.',
          coach: {
            passthrough: 'The input comes straight out. Route the signal **through the NAND**.',
            constant: 'out never changes. Are **both** NAND input pins connected? An empty pin reads as 0.',
          },
          hints: [
            'What does NAND output when both inputs get the **same value**? Look at the 0·0 and 1·1 rows.',
            'Connect input in to both NAND inputs (one output can feed several places).',
            'in → NAND.a, in → NAND.b, NAND.out → out. One NAND is enough.',
          ],
          principle: {
            title: 'NOT = NAND(A, A)',
            body:
              'Tie the two NAND inputs together and only the rows where a = b remain: 0·0 → 1, 1·1 → 0. Exactly NOT.\n\n' +
              'A simple idea — feed the same signal twice — produced a new function. From now on you will keep **combining small parts into new parts**.',
            formula: '¬A = ¬(A ∧ A)',
            usage: 'Used almost everywhere: subtraction (two’s complement), condition inversion, memory circuits.',
          },
        },
      },
      solution: (b) => {
        const n = b.add('NAND');
        b.fan('in', `${n}.a`, `${n}.b`).wire(`${n}.out`, 'out');
      },
    },
    {
      id: '1-2',
      chapter: 1,
      inputs: AB,
      outputs: OUT,
      allowedChips: ['NAND', 'NOT'],
      test: truthTableFrom(AB, (a, b) => [a & b]),
      unlocks: { chipId: 'AND' },
      stars: { maxNand: 2 },
      text: {
        ko: {
          title: 'AND — 둘 다',
          why:
            '🔐 금고: 열쇠 **그리고** 비밀번호가 둘 다 맞아야 열려요.\n' +
            '🖨 프린터: 종이가 있고 **그리고** 잉크가 있어야 인쇄해요.',
          briefing:
            '**AND** 는 두 입력이 **모두 1일 때만 1** 이에요. "a 그리고 b".\n' +
            '\n' +
            '**할 일**\n' +
            'AND를 만드세요. 방금 만든 **NOT 칩** 을 이제 부품 목록에서 쓸 수 있어요.',
          coach: {
            inverted: 'out이 정답과 **정반대** 예요. 지금은 NAND 그대로네요 — NAND는 "AND의 반대"니까, 한 번 더 **뒤집으면** AND가 돼요.',
          },
          hints: [
            'AND와 NAND의 진리표를 나란히 놓고 비교해 보세요. 무슨 관계인가요?',
            'NAND는 AND를 뒤집은 것입니다. 그렇다면 NAND를 한 번 더 뒤집으면?',
            'a, b → NAND → NOT → out.',
          ],
          principle: {
            title: 'AND = NOT(NAND)',
            body:
              '두 번 뒤집으면 원래대로 돌아옵니다. NAND = ¬AND 이므로 ¬NAND = AND.\n\n' +
              '방금 쓴 NOT은 여러분이 만든 칩입니다. 칩 안에는 NAND가 들어 있지만, 이제 그 내부를 신경 쓰지 않고 "뒤집는 부품"으로 씁니다. 이것이 **추상화** — 복잡함을 상자 안에 숨기고 기능만 쓰는 것입니다.',
            formula: 'A ∧ B = ¬(¬(A ∧ B))',
            usage: '"두 조건이 모두 참일 때", 특정 비트만 골라내는 마스킹, 덧셈의 올림(carry) 계산.',
          },
        },
        en: {
          title: 'AND — Both',
          why:
            '🔐 A safe opens only with the key **and** the code.\n' +
            '🖨 A printer prints only with paper **and** ink.',
          briefing:
            '**AND** is 1 **only when both inputs are 1**: "a and b".\n' +
            '\n' +
            '**Your job**\n' +
            'Build AND. The **NOT chip** you just made is now in the parts list.',
          coach: {
            inverted: 'out is the exact **opposite**. That is plain NAND — NAND means "not AND", so **flip it once more** to get AND.',
          },
          hints: [
            'Put the AND and NAND truth tables side by side. How are they related?',
            'NAND is AND flipped. So what happens if you flip NAND once more?',
            'a, b → NAND → NOT → out.',
          ],
          principle: {
            title: 'AND = NOT(NAND)',
            body:
              'Flipping twice gets you back where you started. NAND = ¬AND, so ¬NAND = AND.\n\n' +
              'The NOT you used is a chip you built. It has a NAND inside, but you now use it as "the flipping part" without thinking about its insides. That is **abstraction**: hiding complexity in a box and using only its function.',
            formula: 'A ∧ B = ¬(¬(A ∧ B))',
            usage: '"Both conditions true", masking out specific bits, and the carry in addition.',
          },
        },
      },
      solution: (b) => {
        const n = b.add('NAND');
        const inv = b.add('NOT');
        b.wire('a', `${n}.a`).wire('b', `${n}.b`).wire(`${n}.out`, `${inv}.in`).wire(`${inv}.out`, 'out');
      },
    },
    {
      id: '1-3',
      chapter: 1,
      inputs: AB,
      outputs: OUT,
      allowedChips: ['NAND', 'NOT', 'AND'],
      test: truthTableFrom(AB, (a, b) => [a | b]),
      unlocks: { chipId: 'OR' },
      stars: { maxNand: 3 },
      text: {
        ko: {
          title: 'OR — 하나라도',
          why:
            '🚪 자동문: 안쪽 센서 **또는** 바깥쪽 센서가 사람을 보면 열려요.\n' +
            '🔔 버스 하차 벨: 어느 버튼을 눌러도 같은 벨이 울려요.',
          briefing:
            '**OR** 는 입력 중 **하나라도 1이면 1** 이에요. 둘 다 0일 때만 0.\n' +
            '\n' +
            '**질문**\n' +
            'NAND는 "둘 다 1일 때만 0"이고, OR는 "둘 다 0일 때만 0"이에요. 무엇을 뒤집으면 둘이 같아질까요?\n' +
            '\n' +
            '**할 일**\n' +
            'OR를 만드세요. 이번엔 조금 생각이 필요해요 — 진리표를 잘 보세요.',
          coach: {
            inverted: 'out이 정반대예요 — 지금은 **NOR**(OR의 반대)가 됐어요. 마지막에 하나를 더 뒤집거나, 뒤집는 위치를 바꿔 보세요.',
          },
          hints: [
            'OR가 0이 되는 경우는 딱 하나, a=0 **그리고** b=0 입니다. "둘 다 0이다"를 AND로 표현할 수 있을까요?',
            '"a가 0이다"는 NOT a가 1이라는 뜻입니다. (¬a ∧ ¬b)는 "둘 다 0"이고, OR는 그 반대입니다.',
            'a → NOT, b → NOT, 두 결과를 NAND에 넣으세요. NAND(¬a, ¬b) = ¬(¬a ∧ ¬b) = a ∨ b.',
          ],
          principle: {
            title: '드모르간의 법칙',
            body:
              '"둘 중 하나라도 1" 은 "둘 다 0은 아니다" 와 같은 말입니다.\n\n' +
              '이처럼 OR와 AND는 **뒤집기를 통해 서로 바꿀 수 있습니다.** 이것을 **드모르간의 법칙** 이라고 하며, 논리 회로 설계에서 가장 자주 쓰는 도구입니다.\n\n' +
              'NOT 두 개 + NAND 하나 = NAND 3개로 OR를 만들 수 있습니다.',
            formula: 'A ∨ B = ¬(¬A ∧ ¬B)',
            usage: '"조건 중 하나라도 참이면", 여러 신호 합치기, 인터럽트(여러 장치 중 하나라도 요청하면).',
          },
        },
        en: {
          title: 'OR — Either',
          why:
            '🚪 An automatic door opens when the inside sensor **or** the outside sensor sees someone.\n' +
            '🔔 On a bus, any stop button rings the same bell.',
          briefing:
            '**OR** is 1 if **at least one input is 1**. It is 0 only when both are 0.\n' +
            '\n' +
            '**The question**\n' +
            'NAND is "0 only when both are 1"; OR is "0 only when both are 0". What could you flip to make them match?\n' +
            '\n' +
            '**Your job**\n' +
            'Build OR. This one takes some thought — study the truth table.',
          coach: {
            inverted: 'out is the exact opposite — you built **NOR** (inverted OR). Flip once more at the end, or move where you flip.',
          },
          hints: [
            'OR is 0 in exactly one case: a=0 **and** b=0. Can you express "both are 0" with AND?',
            '"a is 0" means NOT a is 1. (¬a ∧ ¬b) means "both 0", and OR is the opposite of that.',
            'a → NOT, b → NOT, feed both into a NAND. NAND(¬a, ¬b) = ¬(¬a ∧ ¬b) = a ∨ b.',
          ],
          principle: {
            title: "De Morgan's law",
            body:
              '"At least one is 1" says the same thing as "they are not both 0".\n\n' +
              "So OR and AND **can be turned into each other by inverting.** This is **De Morgan's law**, the most-used tool in logic design.\n\n" +
              'Two NOTs + one NAND = OR in 3 NANDs.',
            formula: 'A ∨ B = ¬(¬A ∧ ¬B)',
            usage: '"If any condition holds", merging signals, interrupts (any device requesting attention).',
          },
        },
      },
      solution: (b) => {
        const na = b.add('NOT');
        const nb = b.add('NOT');
        const n = b.add('NAND');
        b.wire('a', `${na}.in`).wire('b', `${nb}.in`).wire(`${na}.out`, `${n}.a`).wire(`${nb}.out`, `${n}.b`).wire(`${n}.out`, 'out');
      },
    },
    {
      id: '1-4',
      chapter: 1,
      inputs: AB,
      outputs: OUT,
      allowedChips: ['NAND', 'NOT', 'AND', 'OR'],
      test: truthTableFrom(AB, (a, b) => [(a | b) ^ 1]),
      unlocks: { chipId: 'NOR' },
      stars: { maxNand: 4 },
      text: {
        ko: {
          title: 'NOR — 둘 다 아님',
          why:
            '🚀 아폴로 우주선을 달까지 안내한 컴퓨터는 거의 **NOR 게이트만으로** 만들어졌어요. NOR도 NAND처럼 무엇이든 만들 수 있는 만능 게이트거든요.',
          briefing:
            '**NOR** 는 OR를 뒤집은 것이에요. **둘 다 0일 때만 1**.',
          coach: {
            inverted: 'out이 정반대예요 — 지금은 **OR** 그대로예요. 결과를 한 번 **뒤집어** 보세요.',
          },
          hints: ['NAND가 AND의 반대였듯, NOR는 무엇의 반대일까요?', 'OR 칩과 NOT 칩을 이어 보세요.', 'a, b → OR → NOT → out.'],
          principle: {
            title: 'NOR — 또 하나의 만능 게이트',
            body:
              'NOR = ¬(A ∨ B). 드모르간으로 바꾸면 ¬A ∧ ¬B, 즉 "둘 다 0".\n\n' +
              'NOR도 NAND처럼 **혼자서 모든 회로를 만들 수 있는 만능 게이트** 입니다. 실제로 아폴로 우주선의 유도 컴퓨터는 NOR 게이트만으로 만들어졌습니다.',
            formula: '¬(A ∨ B) = ¬A ∧ ¬B',
            usage: '"아무 것도 켜져 있지 않은가?" 검사 — 예: 계산 결과가 0인지 확인하는 Zero 플래그.',
          },
        },
        en: {
          title: 'NOR — Neither',
          why:
            '🚀 The computer that guided Apollo to the Moon was built almost entirely from **NOR gates**. Like NAND, NOR is universal — it can build anything.',
          briefing:
            '**NOR** is OR inverted: **1 only when both are 0**.',
          coach: {
            inverted: 'out is the exact opposite — that is plain **OR**. **Flip** the result once.',
          },
          hints: ['Just as NAND is the opposite of AND, what is NOR the opposite of?', 'Chain your OR chip and NOT chip.', 'a, b → OR → NOT → out.'],
          principle: {
            title: 'NOR — another universal gate',
            body:
              "NOR = ¬(A ∨ B). By De Morgan, that is ¬A ∧ ¬B: \"both are 0\".\n\n" +
              'Like NAND, NOR is **universal on its own**. The Apollo Guidance Computer was built entirely from NOR gates.',
            formula: '¬(A ∨ B) = ¬A ∧ ¬B',
            usage: '"Is nothing on?" checks — e.g. the Zero flag that tells whether a result is 0.',
          },
        },
      },
      solution: (b) => {
        const o = b.add('OR');
        const n = b.add('NOT');
        b.wire('a', `${o}.a`).wire('b', `${o}.b`).wire(`${o}.out`, `${n}.in`).wire(`${n}.out`, 'out');
      },
    },
    {
      id: '1-5',
      chapter: 1,
      inputs: AB,
      outputs: OUT,
      allowedChips: ['NAND', 'NOT', 'AND', 'OR', 'NOR'],
      test: truthTableFrom(AB, (a, b) => [a ^ b]),
      unlocks: { chipId: 'XOR' },
      stars: { maxNand: 4 },
      text: {
        ko: {
          title: 'XOR — 서로 다를 때',
          why:
            '💡 계단 스위치: 아래층·위층 어느 쪽 스위치를 눌러도 불이 바뀌어요. 바로 XOR 동작이에요.\n' +
            '➕ 2진수 덧셈 `1 + 1 = 10` 에서 일의 자리(0)가 XOR예요. 3장에서 **가산기** 가 돼요.',
          briefing:
            '**XOR**(배타적 OR)는 두 입력이 **서로 다를 때만 1** 이에요.\n' +
            '\n' +
            '**아이디어**\n' +
            '"서로 다르다" = "**하나라도 1** 이면서 **둘 다 1은 아니다**".\n' +
            '\n' +
            '**할 일**\n' +
            '지금까지 만든 칩을 자유롭게 쓰세요. 더 도전하고 싶다면 **NAND 4개** 로 만들어 ★★★ 을 노려 보세요.',
          coach: {
            inverted: 'out이 정반대예요 — 지금은 **XNOR**(같을 때 1)가 됐어요. 마지막 부분을 뒤집어 보세요.',
          },
          hints: [
            'XOR는 "하나라도 1" 이면서 "둘 다 1은 아님" 입니다. 이 두 조건을 각각 어떤 칩으로 만들 수 있을까요?',
            '"하나라도 1" = OR, "둘 다 1은 아님" = NAND. 두 조건이 동시에 참이어야 하니…',
            'OR(a,b) 와 NAND(a,b) 를 AND로 합치세요. (★★★ 힌트: NAND(a,b)의 결과를 a, b 각각과 다시 NAND 해 보세요.)',
          ],
          principle: {
            title: 'XOR — 덧셈의 씨앗',
            body:
              'XOR = (A ∨ B) ∧ ¬(A ∧ B): "하나라도 1, 하지만 둘 다는 아님".\n\n' +
              '2진수 한 자리 덧셈을 생각해 보세요. 0+0=0, 0+1=1, 1+0=1, 1+1=**10**(2). 일의 자리만 보면 0, 1, 1, 0 — **정확히 XOR의 진리표** 입니다! 다음 챕터에서 이 사실로 덧셈기를 만듭니다.\n\n' +
              'NAND 4개 해법: n = NAND(a,b) 를 만들고, NAND(NAND(a,n), NAND(b,n)).',
            formula: 'A ⊕ B = (A ∨ B) ∧ ¬(A ∧ B)',
            usage: '덧셈기의 합(sum) 비트, 두 값 비교, 암호화, 패리티(오류 검출).',
          },
        },
        en: {
          title: 'XOR — When They Differ',
          why:
            '💡 Stairway light switches: flipping either the upstairs or downstairs switch toggles the light. That is XOR.\n' +
            '➕ In binary `1 + 1 = 10`, the ones digit (0) is XOR. In Chapter 3 it becomes an **adder**.',
          briefing:
            '**XOR** (exclusive OR) is 1 **only when the inputs differ**.\n' +
            '\n' +
            '**The idea**\n' +
            '"Different" = "**at least one is 1**" and "**not both are 1**".\n' +
            '\n' +
            '**Your job**\n' +
            'Use any chip you have built. For a challenge, aim for ★★★ with **4 NANDs**.',
          coach: {
            inverted: 'out is the exact opposite — you built **XNOR** (1 when equal). Flip the last step.',
          },
          hints: [
            'XOR is "at least one is 1" and "not both are 1". Which chips express each condition?',
            '"At least one" = OR, "not both" = NAND. Both conditions must hold at once, so…',
            'Combine OR(a,b) and NAND(a,b) with an AND. (★★★ hint: NAND the result of NAND(a,b) with a and with b separately.)',
          ],
          principle: {
            title: 'XOR — the seed of addition',
            body:
              'XOR = (A ∨ B) ∧ ¬(A ∧ B): "at least one, but not both".\n\n' +
              'Think about adding one binary digit: 0+0=0, 0+1=1, 1+0=1, 1+1=**10** (two). The ones digit goes 0, 1, 1, 0 — **exactly the XOR truth table!** Next chapter you will build an adder from this fact.\n\n' +
              '4-NAND solution: make n = NAND(a,b), then NAND(NAND(a,n), NAND(b,n)).',
            formula: 'A ⊕ B = (A ∨ B) ∧ ¬(A ∧ B)',
            usage: 'The sum bit of adders, comparing values, encryption, parity (error detection).',
          },
        },
      },
      solution: (b) => {
        const [n1, n2, n3, n4] = [b.add('NAND'), b.add('NAND'), b.add('NAND'), b.add('NAND')];
        b.fan('a', `${n1}.a`, `${n2}.a`)
          .fan('b', `${n1}.b`, `${n3}.b`)
          .fan(`${n1}.out`, `${n2}.b`, `${n3}.a`)
          .wire(`${n2}.out`, `${n4}.a`)
          .wire(`${n3}.out`, `${n4}.b`)
          .wire(`${n4}.out`, 'out');
      },
    },
    {
      id: '1-6',
      chapter: 1,
      inputs: AB,
      outputs: OUT,
      allowedChips: ['NAND', 'NOT', 'AND', 'OR', 'NOR', 'XOR'],
      test: truthTableFrom(AB, (a, b) => [(a ^ b) ^ 1]),
      unlocks: { chipId: 'XNOR' },
      stars: { maxNand: 5 },
      text: {
        ko: {
          title: 'XNOR — 같은가?',
          why:
            '🔑 두 값이 **같은지** 비트 하나씩 비교할 때 쓰는 기본 부품이에요.\n' +
            '🔍 "비밀번호가 맞나?", "같으면 점프" 같은 판단의 바탕이 돼요.',
          briefing:
            '**XNOR** 는 두 입력이 **같을 때 1** 이에요. 두 신호가 일치하는지 검사하는 부품이죠.',
          coach: {
            inverted: 'out이 정반대예요 — 지금은 **XOR**(다를 때 1) 그대로예요. 한 번 뒤집으면 돼요.',
          },
          hints: ['XOR는 "다른가?" 였습니다. "같은가?" 는?', 'XOR의 결과를 뒤집으면 됩니다.', 'a, b → XOR → NOT → out.'],
          principle: {
            title: '같음 비교기',
            body:
              'XNOR = ¬(A ⊕ B). 같으면 1, 다르면 0.\n\n' +
              '여러 비트를 비교하고 싶다면? 각 자리를 XNOR한 뒤 결과를 모두 AND하면 "두 수가 완전히 같은가"를 알 수 있습니다.',
            formula: 'A ⊙ B = ¬(A ⊕ B)',
            usage: '비교기(A = B?), 메모리 주소 일치 검사, 캐시의 태그 비교.',
          },
        },
        en: {
          title: 'XNOR — Are They Equal?',
          why:
            '🔑 The basic part for checking whether two values are **equal**, bit by bit.\n' +
            '🔍 It underlies decisions like "is the password right?" and "jump if equal".',
          briefing:
            '**XNOR** is 1 **when the inputs are equal**. It checks whether two signals match.',
          coach: {
            inverted: 'out is the exact opposite — that is plain **XOR** (1 when different). Flip it once.',
          },
          hints: ['XOR asked "are they different?". What about "are they the same?"', 'Invert the XOR result.', 'a, b → XOR → NOT → out.'],
          principle: {
            title: 'The equality checker',
            body:
              'XNOR = ¬(A ⊕ B): 1 if equal, 0 if different.\n\n' +
              'Comparing several bits? XNOR each position and AND all the results to learn whether two numbers are exactly equal.',
            formula: 'A ⊙ B = ¬(A ⊕ B)',
            usage: 'Comparators (A = B?), address matching, cache tag comparison.',
          },
        },
      },
      solution: (b) => {
        const x = b.add('XOR');
        const n = b.add('NOT');
        b.wire('a', `${x}.a`).wire('b', `${x}.b`).wire(`${x}.out`, `${n}.in`).wire(`${n}.out`, 'out');
      },
    },
    {
      id: '1-B',
      chapter: 1,
      inputs: ABC,
      outputs: OUT,
      allowedChips: ['NAND', 'NOT', 'AND', 'OR', 'NOR', 'XOR', 'XNOR'],
      test: truthTableFrom(ABC, (a, b, c) => [a + b + c >= 2 ? 1 : 0]),
      stars: { maxNand: 6 },
      text: {
        ko: {
          title: '보스: 다수결 투표기',
          why:
            '🛰 우주선·비행기처럼 고장이 치명적인 곳은 같은 계산을 컴퓨터 **3대** 가 하고, **2대 이상이 같은 답** 을 믿어요 (삼중 모듈 중복). 한 대가 고장 나도 안전하죠.\n' +
            '➕ 이 다수결 식은 3장 **전가산기의 올림(carry)** 과 똑같아요!',
          briefing:
            '**곤란한 상황**\n' +
            '세 명의 심사위원 a, b, c가 투표해요. 한 명이 실수해도 결과가 흔들리지 않게 하고 싶어요.\n' +
            '\n' +
            '**할 일**\n' +
            '**2명 이상이 찬성(1)** 하면 out이 1이 되는 회로를 만드세요.\n' +
            '\n' +
            '**요령**\n' +
            '입력이 3개라 진리표는 8줄이에요. `진리표 → 논리식 → 회로`, 이것이 논리 설계의 기본 순서예요.',
          hints: [
            '진리표에서 out이 1인 줄을 모두 찾아보세요. 어떤 공통점이 있나요?',
            '"2명 이상 찬성" = (a와 b가 찬성) 또는 (b와 c가 찬성) 또는 (c와 a가 찬성).',
            'AND 3개로 ab, bc, ca를 만들고, OR 2개로 합치세요. (★★★: AND-OR 구조를 드모르간으로 NAND-NAND로 바꿔 보세요.)',
          ],
          principle: {
            title: '진리표에서 회로로',
            body:
              '어떤 진리표든 회로로 만들 수 있습니다. out이 1인 경우들을 AND로 표현하고, 그것들을 OR로 모으면 됩니다(**곱의 합** 형태).\n\n' +
              '이 회로는 다음 챕터에서 다시 만납니다: 전가산기의 **올림(carry)** 은 "세 입력 중 2개 이상이 1인가?" — 바로 다수결입니다!\n\n' +
              '드모르간을 쓰면 AND-OR 는 NAND-NAND 로 바뀌어 더 적은 게이트로 만들 수 있습니다.',
            formula: 'MAJ(A,B,C) = AB ∨ BC ∨ CA',
            usage: '덧셈의 올림 계산, 우주선·비행기의 3중 안전 장치(3개 컴퓨터 중 다수의 결과를 채택).',
          },
        },
        en: {
          title: 'Boss: Majority Vote',
          why:
            '🛰 Where failure is fatal — spacecraft, airplanes — **three** computers run the same calculation and the answer **at least two agree on** wins (triple modular redundancy). One can fail safely.\n' +
            '➕ This majority formula is exactly the **carry of the full adder** in Chapter 3!',
          briefing:
            '**The problem**\n' +
            'Three judges a, b, c vote. One judge\'s mistake should not change the result.\n' +
            '\n' +
            '**Your job**\n' +
            'Build a circuit whose out is 1 when **two or more vote yes (1)**.\n' +
            '\n' +
            '**The recipe**\n' +
            'Three inputs means 8 rows. `truth table → formula → circuit` is the basic recipe of logic design.',
          hints: [
            'Find every row where out is 1. What do they have in common?',
            '"Two or more yes" = (a and b) or (b and c) or (c and a).',
            'Make ab, bc, ca with three ANDs and merge with two ORs. (★★★: turn the AND-OR structure into NAND-NAND with De Morgan.)',
          ],
          principle: {
            title: 'From truth table to circuit',
            body:
              'Any truth table can become a circuit: express each case where out is 1 with AND, then gather them with OR (the **sum of products** form).\n\n' +
              'You will meet this circuit again next chapter: the **carry** of a full adder is "are at least two of three inputs 1?" — a majority vote!\n\n' +
              'With De Morgan, AND-OR becomes NAND-NAND, using fewer gates.',
            formula: 'MAJ(A,B,C) = AB ∨ BC ∨ CA',
            usage: 'Carry in addition, and triple-redundant spacecraft and aircraft computers (take the majority answer of three).',
          },
        },
      },
      solution: (b) => {
        // NAND-NAND: out = NAND(AND(n1, n2), n3) where n1..n3 = NAND(ab), NAND(bc), NAND(ca)
        const [n1, n2, n3, n4] = [b.add('NAND'), b.add('NAND'), b.add('NAND'), b.add('NAND')];
        const and = b.add('AND');
        b.fan('a', `${n1}.a`, `${n3}.b`)
          .fan('b', `${n1}.b`, `${n2}.a`)
          .fan('c', `${n2}.b`, `${n3}.a`)
          .wire(`${n1}.out`, `${and}.a`)
          .wire(`${n2}.out`, `${and}.b`)
          .wire(`${and}.out`, `${n4}.a`)
          .wire(`${n3}.out`, `${n4}.b`)
          .wire(`${n4}.out`, 'out');
      },
    },
  ],
};
