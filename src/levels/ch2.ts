import { autoTest, pin } from '../sim';
import { bus, GATES } from './common';
import type { Chapter } from './types';

const ONE_HOT = (n: number, k: number) => (k >= 0 && k < n ? 1 << k : 0);

export const chapter2: Chapter = {
  id: 2,
  title: { ko: '선택과 분배', en: 'Choose and Route' },
  subtitle: { ko: 'MUX, 디코더, 인코더', en: 'MUX, decoders, encoders' },
  levels: [
    {
      id: '2-1',
      chapter: 2,
      inputs: [pin('a'), pin('b'), pin('sel')],
      outputs: [pin('out')],
      allowedChips: GATES,
      test: autoTest([pin('a'), pin('b'), pin('sel')], (a, b, s) => [s ? b : a]),
      unlocks: { chipId: 'MUX' },
      stars: { maxNand: 4 },
      text: {
        ko: {
          title: 'MUX — 골라 보내기',
          briefing:
            '**멀티플렉서(MUX)** 는 두 데이터 중 하나를 골라 내보내는 스위치입니다.\n\n' +
            '**sel = 0 이면 a**, **sel = 1 이면 b** 가 out으로 나가게 만드세요. CPU는 이런 선택을 1초에 수십억 번 합니다.',
          hints: [
            '"sel이 0이고 a가 1" 이거나 "sel이 1이고 b가 1" 이면 out은 1입니다. 각각을 어떤 게이트로 표현할까요?',
            'AND(a, NOT sel) 와 AND(b, sel) 를 만들어 보세요. 둘 중 하나만 a나 b를 통과시킵니다.',
            '두 AND의 결과를 OR로 합치세요. (★★★: AND-OR 를 드모르간으로 NAND-NAND로 바꾸면 NAND 4개.)',
          ],
          principle: {
            title: 'AND는 문, OR는 합류점',
            body:
              'AND(데이터, 허가) 는 **문** 처럼 동작합니다. 허가가 1이면 데이터가 그대로 통과하고, 0이면 막혀서 0이 됩니다.\n\n' +
              'MUX는 문 두 개에 서로 반대 허가(sel, ¬sel)를 주고 결과를 OR로 합칩니다. 항상 한쪽 문만 열리므로, 선택된 데이터만 나옵니다.',
            formula: 'out = (a ∧ ¬sel) ∨ (b ∧ sel)',
            usage: 'CPU가 연산 결과 중 하나를 고를 때, 레지스터에 "새 값을 쓸지, 기존 값을 유지할지" 정할 때 — 거의 모든 데이터 경로의 갈림길.',
          },
        },
        en: {
          title: 'MUX — Pick One',
          briefing:
            'A **multiplexer (MUX)** is a switch that picks one of two data inputs.\n\n' +
            'Make **sel = 0 send a** and **sel = 1 send b** to out. A CPU makes choices like this billions of times a second.',
          hints: [
            'out is 1 if "sel is 0 and a is 1" or "sel is 1 and b is 1". Which gates express each part?',
            'Build AND(a, NOT sel) and AND(b, sel). Only one of them lets its data through.',
            'Merge the two ANDs with OR. (★★★: turn AND-OR into NAND-NAND with De Morgan for 4 NANDs.)',
          ],
          principle: {
            title: 'AND is a gate, OR is a junction',
            body:
              'AND(data, enable) acts like a **gate**: if enable is 1 the data passes unchanged, if 0 it is blocked to 0.\n\n' +
              'A MUX gives two gates opposite enables (sel, ¬sel) and merges them with OR. Only one gate is ever open, so only the chosen data comes out.',
            formula: 'out = (a ∧ ¬sel) ∨ (b ∧ sel)',
            usage: 'Choosing among ALU results, deciding whether a register loads a new value or keeps the old one — the forks in every data path.',
          },
        },
      },
      solution: (b) => {
        const ns = b.add('NOT');
        const [n1, n2, n3] = [b.add('NAND'), b.add('NAND'), b.add('NAND')];
        b.wire('sel', `${ns}.in`)
          .wire('a', `${n1}.a`)
          .wire(`${ns}.out`, `${n1}.b`)
          .wire('b', `${n2}.a`)
          .wire('sel', `${n2}.b`)
          .wire(`${n1}.out`, `${n3}.a`)
          .wire(`${n2}.out`, `${n3}.b`)
          .wire(`${n3}.out`, 'out');
      },
    },
    {
      id: '2-2',
      chapter: 2,
      inputs: [pin('in'), pin('sel')],
      outputs: [pin('a'), pin('b')],
      allowedChips: [...GATES, 'MUX'],
      test: autoTest([pin('in'), pin('sel')], (x, s) => [s ? 0 : x, s ? x : 0]),
      unlocks: { chipId: 'DMUX' },
      stars: { maxNand: 5 },
      text: {
        ko: {
          title: 'DEMUX — 나눠 보내기',
          briefing:
            '**디멀티플렉서(DEMUX)** 는 MUX의 반대입니다. 입력 하나를 sel이 가리키는 곳으로 보냅니다.\n\n' +
            '**sel = 0 이면 in → a**, **sel = 1 이면 in → b**. 선택되지 않은 쪽은 0입니다.',
          hints: [
            'MUX에서 쓴 "문" 아이디어를 기억하세요. 각 출력에 문이 하나씩 필요합니다.',
            'a 쪽 문은 sel이 0일 때 열리고, b 쪽 문은 sel이 1일 때 열립니다.',
            'a = AND(in, NOT sel), b = AND(in, sel).',
          ],
          principle: {
            title: '한 곳으로만 보내기',
            body:
              'DEMUX는 문 두 개를 나란히 두고 같은 입력을 연결합니다. 열리는 문은 하나뿐이므로 신호는 선택된 곳에만 도착합니다.\n\n' +
              'MUX가 "여러 곳 → 한 곳" 이라면 DEMUX는 "한 곳 → 여러 곳" 입니다. 메모리에 값을 쓸 때 **어느 칸에 쓸지** 고르는 데 이 원리가 쓰입니다.',
            formula: 'a = in ∧ ¬sel,  b = in ∧ sel',
            usage: '메모리 쓰기(선택된 칸에만 저장), 신호 분배, 통신에서 여러 수신자 중 하나 고르기.',
          },
        },
        en: {
          title: 'DEMUX — Send One Way',
          briefing:
            'A **demultiplexer (DEMUX)** is the reverse of a MUX: it sends one input to the place sel points at.\n\n' +
            '**sel = 0: in → a**, **sel = 1: in → b**. The unselected output is 0.',
          hints: [
            'Remember the "gate" idea from the MUX. Each output needs its own gate.',
            'The gate for a opens when sel is 0; the gate for b opens when sel is 1.',
            'a = AND(in, NOT sel), b = AND(in, sel).',
          ],
          principle: {
            title: 'Deliver to exactly one place',
            body:
              'A DEMUX puts two gates side by side on the same input. Only one opens, so the signal arrives only where selected.\n\n' +
              'MUX is "many → one"; DEMUX is "one → many". Writing to memory uses this to choose **which cell** gets the value.',
            formula: 'a = in ∧ ¬sel,  b = in ∧ sel',
            usage: 'Memory writes (store only in the selected cell), signal routing, picking one receiver of many.',
          },
        },
      },
      solution: (b) => {
        const ns = b.add('NOT');
        const ga = b.add('AND');
        const gb = b.add('AND');
        b.wire('sel', `${ns}.in`)
          .fan('in', `${ga}.a`, `${gb}.a`)
          .wire(`${ns}.out`, `${ga}.b`)
          .wire('sel', `${gb}.b`)
          .wire(`${ga}.out`, 'a')
          .wire(`${gb}.out`, 'b');
      },
    },
    {
      id: '2-3',
      chapter: 2,
      inputs: [pin('a'), pin('b'), pin('c'), pin('d'), pin('sel:2')],
      outputs: [pin('out')],
      allowedChips: [...GATES, 'MUX', 'DMUX', ...bus(2)],
      test: autoTest([pin('a'), pin('b'), pin('c'), pin('d'), pin('sel:2')], (a, b, c, d, s) => [[a, b, c, d][s]!]),
      unlocks: { chipId: 'MUX4' },
      stars: { maxNand: 12 },
      text: {
        ko: {
          title: 'MUX4 — 넷 중 하나',
          briefing:
            '이번에는 네 개 중 하나를 고릅니다. 선택 신호 **sel** 은 **2비트 버스** 입니다 (0~3).\n\n' +
            'sel = 0 → a, 1 → b, 2 → c, 3 → d. 버스를 비트로 나누려면 **버스 분리 2** 를 쓰세요. 분리기의 b0이 일의 자리(가장 낮은 비트)입니다.',
          hints: [
            '이미 만든 MUX(둘 중 하나)를 여러 개 쓰면 어떨까요? 토너먼트처럼 생각해 보세요.',
            '1라운드: MUX로 (a, b) 중 하나, (c, d) 중 하나를 고릅니다. 이때 sel의 어느 비트를 써야 할까요?',
            '1라운드 두 MUX의 sel = sel.b0, 결승 MUX의 sel = sel.b1. MUX 3개면 됩니다.',
          ],
          principle: {
            title: '계층 설계 — 토너먼트',
            body:
              '2진수 sel의 각 비트는 질문 하나에 답합니다. b1은 "앞 절반(a,b)인가 뒤 절반(c,d)인가?", b0은 "그 안에서 앞인가 뒤인가?"\n\n' +
              '그래서 2:1 MUX를 **나무 모양** 으로 쌓으면 4:1, 8:1, … 로 얼마든지 키울 수 있습니다. 작은 부품을 반복해 큰 부품을 만드는 **계층 설계** 는 컴퓨터 설계의 핵심 기법입니다.',
            formula: 'MUX4 = MUX( MUX(a,b,s0), MUX(c,d,s0), s1 )',
            usage: 'RAM에서 수많은 칸 중 주소가 가리키는 칸의 값을 읽어 올 때, 이런 MUX 나무가 쓰입니다.',
          },
        },
        en: {
          title: 'MUX4 — One of Four',
          briefing:
            'Now pick one of four. The select signal **sel** is a **2-bit bus** (0–3).\n\n' +
            'sel = 0 → a, 1 → b, 2 → c, 3 → d. Use **Split 2** to break the bus into bits; the splitter’s b0 is the ones place (lowest bit).',
          hints: [
            'What if you used several of your 2-input MUXes? Think of a tournament.',
            'Round 1: one MUX picks from (a, b), another from (c, d). Which bit of sel should they use?',
            'Both round-1 MUXes use sel.b0; the final MUX uses sel.b1. Three MUXes total.',
          ],
          principle: {
            title: 'Hierarchical design — a tournament',
            body:
              'Each bit of the binary sel answers one question. b1: "first half (a,b) or second half (c,d)?" b0: "first or second within that half?"\n\n' +
              'So stacking 2:1 MUXes as a **tree** grows to 4:1, 8:1, and beyond. Building big parts by repeating small ones — **hierarchical design** — is a core technique of computer design.',
            formula: 'MUX4 = MUX( MUX(a,b,s0), MUX(c,d,s0), s1 )',
            usage: 'Reading the cell an address points to out of many RAM cells uses MUX trees like this.',
          },
        },
      },
      solution: (b) => {
        const sp = b.add('SPLIT2');
        const [m1, m2, m3] = [b.add('MUX'), b.add('MUX'), b.add('MUX')];
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
      id: '2-4',
      chapter: 2,
      inputs: [pin('in:2')],
      outputs: [pin('y:4')],
      allowedChips: [...GATES, 'MUX', 'DMUX', 'MUX4', ...bus(2, 4)],
      test: autoTest([pin('in:2')], (x) => [ONE_HOT(4, x)]),
      unlocks: { chipId: 'DEC2' },
      stars: { maxNand: 10 },
      binaryPins: ['y'],
      text: {
        ko: {
          title: '디코더 2→4',
          briefing:
            '**디코더** 는 2진수 번호를 받아, 그 번호의 출력 **하나만** 1로 켭니다.\n\n' +
            'in = 0 → y의 0번 비트만 1 (0001), in = 1 → 0010, in = 2 → 0100, in = 3 → 1000. 출력 y는 4비트 버스이니 **버스 합치기 4** 로 묶으세요.',
          hints: [
            'y의 0번 비트는 언제 1인가요? in의 두 비트가 모두 0일 때입니다. "두 비트가 모두 0" 은 어떤 게이트로?',
            '각 출력 비트 = (b1 또는 NOT b1) AND (b0 또는 NOT b0). 네 가지 조합이 정확히 네 출력입니다.',
            'NOT 2개로 ¬b0, ¬b1을 만들고, AND 4개: y0=¬b1∧¬b0, y1=¬b1∧b0, y2=b1∧¬b0, y3=b1∧b0.',
          ],
          principle: {
            title: '번호 → 한 줄 선택',
            body:
              '디코더의 출력은 언제나 딱 하나만 1입니다. 이런 형태를 **원-핫(one-hot)** 이라고 합니다.\n\n' +
              '이것이 **주소** 의 원리입니다. 메모리 칸마다 출력 줄 하나를 연결해 두면, 2진수 주소를 넣었을 때 그 칸 하나만 "선택됨" 신호를 받습니다. n비트 주소는 2ⁿ개의 칸을 고를 수 있습니다.',
            formula: 'yₖ = 1 ⟺ in = k',
            usage: 'RAM 주소 해석, CPU 명령어 해석(명령 번호 → 해당 동작 켜기), 7세그먼트 표시기.',
          },
        },
        en: {
          title: 'Decoder 2→4',
          briefing:
            'A **decoder** takes a binary number and turns on **only** the output with that number.\n\n' +
            'in = 0 → only bit 0 of y is 1 (0001), in = 1 → 0010, in = 2 → 0100, in = 3 → 1000. y is a 4-bit bus, so bundle it with **Merge 4**.',
          hints: [
            'When is bit 0 of y equal to 1? When both bits of in are 0. Which gate says "both are 0"?',
            'Each output bit = (b1 or NOT b1) AND (b0 or NOT b0). The four combinations are exactly the four outputs.',
            'Two NOTs give ¬b0, ¬b1, then four ANDs: y0=¬b1∧¬b0, y1=¬b1∧b0, y2=b1∧¬b0, y3=b1∧b0.',
          ],
          principle: {
            title: 'Number → one selected line',
            body:
              'Exactly one decoder output is 1 at any time. This form is called **one-hot**.\n\n' +
              'This is how **addresses** work. Wire one output line to each memory cell, and when a binary address comes in, only that cell receives "selected". An n-bit address can pick among 2ⁿ cells.',
            formula: 'yₖ = 1 ⟺ in = k',
            usage: 'RAM address decoding, CPU instruction decoding (opcode → enable that operation), 7-segment displays.',
          },
        },
      },
      solution: (b) => {
        const sp = b.add('SPLIT2');
        const m = b.add('MERGE4');
        const n0 = b.add('NOT');
        const n1 = b.add('NOT');
        b.wire('in', `${sp}.in`).wire(`${sp}.b0`, `${n0}.in`).wire(`${sp}.b1`, `${n1}.in`).wire(`${m}.out`, 'y');
        const lo = [`${n0}.out`, `${sp}.b0`];
        const hi = [`${n1}.out`, `${sp}.b1`];
        for (let k = 0; k < 4; k++) {
          const g = b.add('AND');
          b.wire(lo[k & 1]!, `${g}.a`).wire(hi[k >> 1]!, `${g}.b`).wire(`${g}.out`, `${m}.b${k}`);
        }
      },
    },
    {
      id: '2-5',
      chapter: 2,
      inputs: [pin('in:3')],
      outputs: [pin('y:8')],
      allowedChips: [...GATES, 'MUX', 'DMUX', 'MUX4', 'DEC2', ...bus(2, 3, 4, 8)],
      test: autoTest([pin('in:3')], (x) => [ONE_HOT(8, x)]),
      unlocks: { chipId: 'DEC3' },
      stars: { maxNand: 27 },
      binaryPins: ['y'],
      text: {
        ko: {
          title: '디코더 3→8',
          briefing:
            '3비트 번호(0~7)를 받아 8줄 중 하나를 켜는 디코더를 만드세요.\n\n' +
            '방금 만든 **DEC2** 를 활용하면 훨씬 쉽습니다. **버스 분리 3**, **버스 합치기 2/8** 을 쓸 수 있습니다.',
          hints: [
            '3비트 번호의 아래 두 비트는 "4개 묶음 안에서 몇 번째인가", 맨 위 비트는 "앞 묶음(0~3)인가 뒤 묶음(4~7)인가" 를 뜻합니다.',
            'DEC2에 아래 두 비트를 넣으면 4줄 중 하나가 켜집니다. 이것을 b2에 따라 앞 묶음 또는 뒤 묶음으로 보내면 됩니다.',
            'DEC2 출력의 각 줄 k에 대해: y[k] = AND(줄k, NOT b2), y[k+4] = AND(줄k, b2). AND 8개.',
          ],
          principle: {
            title: '디코더 확장',
            body:
              '작은 디코더의 출력에 **최상위 비트로 만든 허가 신호** 를 AND하면, 같은 디코더를 여러 묶음으로 복제할 수 있습니다.\n\n' +
              '이 방법을 반복하면 4→16, 8→256 디코더도 만들 수 있습니다. 챕터 6에서 256칸 RAM을 만들 때 다시 쓰게 됩니다.',
            formula: 'y[k + 4·b2] = DEC2(b1b0)[k]',
            usage: '큰 메모리의 주소 해석은 이렇게 여러 단계로 나뉘어 있습니다(행 디코더 + 열 디코더).',
          },
        },
        en: {
          title: 'Decoder 3→8',
          briefing:
            'Build a decoder that takes a 3-bit number (0–7) and turns on one of 8 lines.\n\n' +
            'Your **DEC2** makes this much easier. **Split 3** and **Merge 2/8** are available.',
          hints: [
            'The low two bits say "which one within a group of 4"; the top bit says "first group (0–3) or second (4–7)".',
            'Feed the low two bits to DEC2 to light one of 4 lines, then route it to the first or second group based on b2.',
            'For each DEC2 line k: y[k] = AND(line k, NOT b2), y[k+4] = AND(line k, b2). Eight ANDs.',
          ],
          principle: {
            title: 'Expanding decoders',
            body:
              'AND a small decoder’s outputs with an **enable made from the top bit**, and you can replicate it into several groups.\n\n' +
              'Repeat this to build 4→16 or 8→256 decoders. You will do exactly that for the 256-cell RAM in Chapter 6.',
            formula: 'y[k + 4·b2] = DEC2(b1b0)[k]',
            usage: 'Large memories decode addresses in stages like this (row decoder + column decoder).',
          },
        },
      },
      solution: (b) => {
        const sp = b.add('SPLIT3');
        const lo = b.add('MERGE2');
        const dec = b.add('DEC2');
        const ds = b.add('SPLIT4');
        const nb = b.add('NOT');
        const m = b.add('MERGE8');
        b.wire('in', `${sp}.in`)
          .wire(`${sp}.b0`, `${lo}.b0`)
          .wire(`${sp}.b1`, `${lo}.b1`)
          .wire(`${lo}.out`, `${dec}.in`)
          .wire(`${dec}.y`, `${ds}.in`)
          .wire(`${sp}.b2`, `${nb}.in`)
          .wire(`${m}.out`, 'y');
        for (let k = 0; k < 4; k++) {
          const g0 = b.add('AND');
          const g1 = b.add('AND');
          b.fan(`${ds}.b${k}`, `${g0}.a`, `${g1}.a`)
            .wire(`${nb}.out`, `${g0}.b`)
            .wire(`${sp}.b2`, `${g1}.b`)
            .wire(`${g0}.out`, `${m}.b${k}`)
            .wire(`${g1}.out`, `${m}.b${k + 4}`);
        }
      },
    },
    {
      id: '2-6',
      chapter: 2,
      inputs: [pin('i0'), pin('i1'), pin('i2'), pin('i3')],
      outputs: [pin('out:2')],
      allowedChips: [...GATES, 'MUX', 'DMUX', 'MUX4', 'DEC2', 'DEC3', ...bus(2, 3, 4, 8)],
      // 인코더는 "하나만 켜진" 입력(또는 모두 꺼짐)에 대해서만 정의된다
      test: {
        kind: 'truth',
        rows: [
          { in: [0, 0, 0, 0], out: [0] },
          { in: [1, 0, 0, 0], out: [0] },
          { in: [0, 1, 0, 0], out: [1] },
          { in: [0, 0, 1, 0], out: [2] },
          { in: [0, 0, 0, 1], out: [3] },
        ],
      },
      unlocks: { chipId: 'ENC4' },
      stars: { maxNand: 6 },
      text: {
        ko: {
          title: '인코더 4→2',
          briefing:
            '**인코더** 는 디코더의 반대입니다. 4개 입력 중 **켜진 하나의 번호** 를 2비트 2진수로 내보냅니다.\n\n' +
            'i0 → 0, i1 → 1, i2 → 2, i3 → 3. 여러 개가 동시에 켜지는 경우는 신경 쓰지 않아도 됩니다(테스트하지 않음).',
          hints: [
            '출력의 각 비트를 따로 생각하세요. 출력 b0(일의 자리)이 1이 되는 번호는? 1과 3입니다.',
            'out.b0 = i1 또는 i3, out.b1 = i2 또는 i3.',
            'OR 2개 + 버스 합치기 2. i0은 어디에도 연결하지 않아도 됩니다 — 번호 0은 "모두 0" 이니까요.',
          ],
          principle: {
            title: '줄 → 번호',
            body:
              '출력의 각 비트는 "그 비트가 1인 번호들" 을 OR로 모은 것입니다. 번호 0은 모든 비트가 0이라 아무 데도 연결되지 않습니다.\n\n' +
              '키보드를 생각해 보세요. 눌린 키(한 줄)를 컴퓨터가 처리할 수 있는 번호(키 코드)로 바꾸는 것이 인코더의 일입니다.',
            formula: 'out.b0 = i1 ∨ i3,  out.b1 = i2 ∨ i3',
            usage: '키보드·키패드 입력, 인터럽트 번호 만들기(우선순위 인코더).',
          },
        },
        en: {
          title: 'Encoder 4→2',
          briefing:
            'An **encoder** is the reverse of a decoder: it outputs the **number of the one active input** as 2-bit binary.\n\n' +
            'i0 → 0, i1 → 1, i2 → 2, i3 → 3. You can ignore cases with several inputs on (not tested).',
          hints: [
            'Think about each output bit separately. Which numbers have bit 0 (the ones place) set? 1 and 3.',
            'out.b0 = i1 or i3, out.b1 = i2 or i3.',
            'Two ORs + Merge 2. i0 does not need to connect anywhere — number 0 is "all zeros".',
          ],
          principle: {
            title: 'Line → number',
            body:
              'Each output bit ORs together "the numbers that have this bit set". Number 0 has every bit 0, so it connects nowhere.\n\n' +
              'Think of a keyboard: turning the pressed key (one line) into a number the computer can handle (a key code) is an encoder’s job.',
            formula: 'out.b0 = i1 ∨ i3,  out.b1 = i2 ∨ i3',
            usage: 'Keyboard/keypad input, generating interrupt numbers (priority encoders).',
          },
        },
      },
      solution: (b) => {
        const o0 = b.add('OR');
        const o1 = b.add('OR');
        const m = b.add('MERGE2');
        b.wire('i1', `${o0}.a`)
          .fan('i3', `${o0}.b`, `${o1}.b`)
          .wire('i2', `${o1}.a`)
          .wire(`${o0}.out`, `${m}.b0`)
          .wire(`${o1}.out`, `${m}.b1`)
          .wire(`${m}.out`, 'out');
      },
    },
    {
      id: '2-B',
      chapter: 2,
      inputs: [pin('state:2')],
      outputs: [pin('red'), pin('yellow'), pin('green')],
      allowedChips: [...GATES, 'MUX', 'DMUX', 'MUX4', 'DEC2', 'DEC3', 'ENC4', ...bus(2, 3, 4, 8)],
      test: autoTest([pin('state:2')], (s) => [s === 0 || s === 3 ? 1 : 0, s >= 2 ? 1 : 0, s === 1 ? 1 : 0]),
      stars: { maxNand: 8 },
      text: {
        ko: {
          title: '보스: 신호등 제어기',
          briefing:
            '신호등의 상태가 2비트 번호로 들어옵니다. 상태에 맞게 램프를 켜세요.\n\n' +
            '**0 = 빨강**, **1 = 초록**, **2 = 노랑**, **3 = 빨강 + 노랑** (점검 모드).',
          hints: [
            '디코더를 쓰면 상태마다 줄 하나가 켜집니다. 각 램프는 어떤 상태들에서 켜지나요?',
            '빨강 = 상태 0 또는 3, 노랑 = 상태 2 또는 3, 초록 = 상태 1. DEC2 + OR 2개로 풀 수 있습니다.',
            '★★★: 디코더 없이 비트를 직접 보세요. 노랑은 b1 그 자체! 빨강은 b0과 b1이 같을 때(XNOR), 초록은 b0 ∧ ¬b1.',
          ],
          principle: {
            title: '진리표를 다시 보면 더 간단해진다',
            body:
              '디코더 + OR 는 어떤 진리표에도 통하는 **일반적인 방법** 입니다. 하지만 진리표를 잘 보면 숨은 규칙이 보이기도 합니다.\n\n' +
              '노랑은 상태 2, 3 — 2진수 10, 11 — 즉 **윗비트가 1일 때** 입니다. 게이트가 하나도 필요 없죠. 이렇게 식을 줄이는 것을 **논리 최소화** 라고 하며, 실제 칩 설계 도구가 자동으로 해 줍니다.',
            formula: 'red = ¬(s1 ⊕ s0),  yellow = s1,  green = ¬s1 ∧ s0',
            usage: '모든 디지털 제어기는 "현재 상태 → 출력" 을 이렇게 조합 회로로 계산합니다. 챕터 8의 CPU 제어 유닛도 같은 원리입니다.',
          },
        },
        en: {
          title: 'Boss: Traffic Light',
          briefing:
            'The traffic light’s state arrives as a 2-bit number. Light the lamps to match.\n\n' +
            '**0 = red**, **1 = green**, **2 = yellow**, **3 = red + yellow** (maintenance mode).',
          hints: [
            'A decoder lights one line per state. In which states is each lamp on?',
            'Red = state 0 or 3, yellow = state 2 or 3, green = state 1. DEC2 + two ORs solves it.',
            '★★★: skip the decoder and look at the bits. Yellow is just b1! Red is when b0 and b1 match (XNOR); green is b0 ∧ ¬b1.',
          ],
          principle: {
            title: 'Look again and it gets simpler',
            body:
              'Decoder + OR is a **general method** that works for any truth table. But a closer look often reveals hidden patterns.\n\n' +
              'Yellow is states 2 and 3 — binary 10 and 11 — that is, **whenever the top bit is 1**. No gates needed. Shrinking formulas like this is **logic minimization**, and real chip-design tools do it automatically.',
            formula: 'red = ¬(s1 ⊕ s0),  yellow = s1,  green = ¬s1 ∧ s0',
            usage: 'Every digital controller computes "current state → outputs" with combinational logic like this. The CPU control unit in Chapter 8 works the same way.',
          },
        },
      },
      solution: (b) => {
        const sp = b.add('SPLIT2');
        const xn = b.add('XNOR');
        const n1 = b.add('NOT');
        const g = b.add('AND');
        b.wire('state', `${sp}.in`)
          .wire(`${sp}.b0`, `${xn}.a`)
          .wire(`${sp}.b1`, `${xn}.b`)
          .wire(`${xn}.out`, 'red')
          .wire(`${sp}.b1`, 'yellow')
          .wire(`${sp}.b1`, `${n1}.in`)
          .wire(`${sp}.b0`, `${g}.a`)
          .wire(`${n1}.out`, `${g}.b`)
          .wire(`${g}.out`, 'green');
      },
    },
  ],
};
