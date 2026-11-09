import { pin, type SequenceStep } from '../sim';
import { bus, GATES } from './common';
import type { Chapter } from './types';

const BEFORE = [
  ...GATES,
  'MUX', 'DMUX', 'MUX4', 'DEC2', 'DEC3', 'ENC4',
  'HALF_ADDER', 'FULL_ADDER', 'ADD4', 'NEG4', 'SUB4', 'CMP4',
  'NOT8', 'AND8', 'OR8', 'XOR8', 'MUX8', 'ADD8', 'MUX4_8', 'DEC4', 'ADDSUB8',
  'CONST0', 'CONST1',
  ...bus(2, 3, 4, 8, 16),
];

const counterSteps = (): SequenceStep[] => {
  const steps: SequenceStep[] = [{ set: { reset: 1 }, clock: true, expect: { q: 0 } }, { set: { reset: 0 }, expect: { q: 0 } }];
  for (let i = 1; i <= 17; i++) steps.push({ clock: true, expect: { q: i & 15 } });
  steps.push({ set: { reset: 1 }, clock: true, expect: { q: 0 } });
  return steps;
};

export const chapter5: Chapter = {
  id: 5,
  title: { ko: '기억하는 회로', en: 'Circuits That Remember' },
  subtitle: { ko: '래치, 플립플롭, 레지스터, 카운터', en: 'Latches, flip-flops, registers, counters' },
  levels: [
    {
      id: '5-1',
      chapter: 5,
      inputs: [pin('s'), pin('r')],
      outputs: [pin('q'), pin('nq')],
      allowedChips: BEFORE,
      test: {
        kind: 'sequence',
        steps: [
          { set: { r: 1 }, expect: { q: 0, nq: 1 } },
          { set: { r: 0 }, expect: { q: 0, nq: 1 } },
          { set: { s: 1 }, expect: { q: 1, nq: 0 } },
          { set: { s: 0 }, expect: { q: 1, nq: 0 } },
          { set: { r: 1 }, expect: { q: 0, nq: 1 } },
          { set: { r: 0 }, expect: { q: 0, nq: 1 } },
          { set: { s: 1 }, expect: { q: 1, nq: 0 } },
          { set: { s: 0 }, expect: { q: 1, nq: 0 } },
        ],
      },
      unlocks: { chipId: 'SR_LATCH' },
      stars: { maxNand: 4 },
      text: {
        ko: {
          title: 'SR 래치 — 첫 기억',
          briefing:
            '지금까지 만든 회로는 모두 **입력이 같으면 출력도 같았습니다**. 이제 "방금 무슨 일이 있었는지" 를 **기억** 하는 회로를 만듭니다.\n\n' +
            '**s(set)** 를 잠깐 1로 하면 q가 1이 되고, s를 다시 0으로 해도 **q는 1로 남아야** 합니다. **r(reset)** 를 잠깐 1로 하면 q가 0이 되어 남습니다. nq는 항상 q의 반대입니다.\n\n' +
            '이 레벨의 테스트는 진리표가 아니라 **순서** 입니다. 같은 입력(s=0, r=0)에 대해 앞에서 무슨 일이 있었는지에 따라 답이 달라집니다.',
          hints: [
            '출력을 다시 입력으로 되돌려 연결할 수 있습니다(피드백). 게이트 두 개가 서로의 출력을 입력으로 받으면 어떻게 될까요?',
            'NOR 두 개를 교차로 연결해 보세요: q = NOR(r, nq), nq = NOR(s, q). 또는 NAND 두 개 + 입력 반전.',
            '★★★(NAND 4개): q = NAND(¬s, nq), nq = NAND(¬r, q). NOT 2개 + NAND 2개.',
          ],
          principle: {
            title: '피드백 = 기억',
            body:
              '교차 연결된 두 게이트는 서로를 붙잡아 줍니다. q가 1이면 nq를 0으로 만들고, nq가 0이면 다시 q를 1로 유지합니다. 입력이 사라져도 이 **고리** 가 상태를 계속 유지합니다 — 이것이 **1비트 기억** 의 정체입니다.\n\n' +
              '**실험해 보세요:** 샌드박스에서 NOT 하나의 출력을 자기 입력에 연결하면? 안정될 수 없어 계속 깜빡입니다(발진). 피드백은 기억을 만들기도 하고, 시계(오실레이터)를 만들기도 합니다.\n\n' +
              's와 r을 동시에 1로 하면 q와 nq가 모두 같은 값이 되어 약속이 깨집니다. 그래서 다음 레벨에서 이 경우를 원천 차단합니다.',
            formula: 'q = ¬(r ∨ nq),  nq = ¬(s ∨ q)',
            usage: '모든 메모리(레지스터, 캐시의 SRAM)의 기본 원리. 버튼의 떨림(바운스)을 없애는 회로에도 쓰입니다.',
          },
        },
        en: {
          title: 'SR Latch — The First Memory',
          briefing:
            'Every circuit so far gave **the same output for the same input**. Now you will build one that **remembers** what just happened.\n\n' +
            'Briefly setting **s (set)** to 1 makes q 1, and **q must stay 1** after s returns to 0. Briefly setting **r (reset)** to 1 makes q 0, and it stays. nq is always the opposite of q.\n\n' +
            'This level is tested by a **sequence**, not a truth table. For the same input (s=0, r=0), the answer depends on what happened before.',
          hints: [
            'You can route an output back into an input (feedback). What happens if two gates take each other’s outputs as inputs?',
            'Cross-connect two NORs: q = NOR(r, nq), nq = NOR(s, q). Or two NANDs plus inverted inputs.',
            '★★★ (4 NANDs): q = NAND(¬s, nq), nq = NAND(¬r, q). Two NOTs + two NANDs.',
          ],
          principle: {
            title: 'Feedback = memory',
            body:
              'Two cross-connected gates hold each other in place. If q is 1 it forces nq to 0, and nq being 0 keeps q at 1. Even after the input goes away, this **loop** keeps the state — that is what **1 bit of memory** really is.\n\n' +
              '**Try it:** in the sandbox, connect a NOT’s output to its own input. It can never settle and keeps blinking (oscillation). Feedback can make memory — or a clock (oscillator).\n\n' +
              'Setting s and r to 1 together makes q and nq equal, breaking the promise. The next level rules this case out entirely.',
            formula: 'q = ¬(r ∨ nq),  nq = ¬(s ∨ q)',
            usage: 'The basis of all memory (registers, the SRAM in caches), and of circuits that debounce buttons.',
          },
        },
      },
      solution: (b) => {
        const ns = b.add('NOT');
        const nr = b.add('NOT');
        const g1 = b.add('NAND');
        const g2 = b.add('NAND');
        b.wire('s', `${ns}.in`)
          .wire('r', `${nr}.in`)
          .wire(`${ns}.out`, `${g1}.a`)
          .wire(`${nr}.out`, `${g2}.a`)
          .fan(`${g1}.out`, `${g2}.b`, 'q')
          .fan(`${g2}.out`, `${g1}.b`, 'nq');
      },
    },
    {
      id: '5-2',
      chapter: 5,
      inputs: [pin('d'), pin('e')],
      outputs: [pin('q')],
      allowedChips: [...BEFORE, 'SR_LATCH'],
      test: {
        kind: 'sequence',
        steps: [
          { set: { e: 1, d: 0 }, expect: { q: 0 } },
          { set: { d: 1 }, expect: { q: 1 } },
          { set: { e: 0 }, expect: { q: 1 } },
          { set: { d: 0 }, expect: { q: 1 } },
          { set: { e: 1 }, expect: { q: 0 } },
          { set: { d: 1 }, expect: { q: 1 } },
          { set: { e: 0 }, expect: { q: 1 } },
          { set: { d: 0 }, expect: { q: 1 } },
          { set: { d: 1 }, expect: { q: 1 } },
        ],
      },
      unlocks: { chipId: 'D_LATCH' },
      stars: { maxNand: 9 },
      text: {
        ko: {
          title: 'D 래치 — 언제 기억할까',
          briefing:
            'SR 래치는 "켜기" 와 "끄기" 두 입력이 필요해 다루기 불편합니다. **D 래치** 는 저장할 **값 d** 와 **허가 e** 만 받습니다.\n\n' +
            '**e = 1** 이면 q가 d를 그대로 따라가고(투명), **e = 0** 이면 그 순간의 값을 붙잡아 d가 바뀌어도 무시합니다.',
          hints: [
            'SR 래치 칩을 쓰세요. "d를 저장하라" 는 건 d=1이면 set, d=0이면 reset 하라는 뜻입니다. 단, e가 1일 때만.',
            's = d AND e, r = (NOT d) AND e. 이러면 s와 r이 동시에 1이 될 수 없습니다.',
            'AND 2개 + NOT 1개 + SR_LATCH. SR_LATCH.q → q.',
          ],
          principle: {
            title: '허가 신호로 기억을 제어하기',
            body:
              'd와 ¬d로 s와 r을 만들면, s와 r은 **절대 동시에 1이 될 수 없습니다**. SR 래치의 금지 상태가 구조적으로 사라졌죠.\n\n' +
              'e는 "지금 받아 적어" 라는 신호입니다. e가 1인 동안은 래치가 투명한 유리창처럼 d를 그대로 보여 주고, e가 0으로 내려가는 순간 마지막 값을 **얼려 둡니다**.',
            formula: 'q ← d  (e = 1일 때),  q 유지  (e = 0일 때)',
            usage: '데이터를 잠시 붙잡아 두는 버퍼, 다음 레벨 플립플롭의 재료.',
          },
        },
        en: {
          title: 'D Latch — When to Remember',
          briefing:
            'An SR latch needs separate "on" and "off" inputs, which is awkward. A **D latch** takes just a **value d** and an **enable e**.\n\n' +
            'With **e = 1**, q follows d directly (transparent). With **e = 0**, it holds the value from that moment and ignores changes to d.',
          hints: [
            'Use your SR latch chip. "Store d" means set when d=1 and reset when d=0 — but only while e is 1.',
            's = d AND e, r = (NOT d) AND e. Now s and r can never both be 1.',
            'Two ANDs + one NOT + SR_LATCH. SR_LATCH.q → q.',
          ],
          principle: {
            title: 'Controlling memory with an enable',
            body:
              'Deriving s and r from d and ¬d means s and r **can never both be 1**. The SR latch’s forbidden state is gone by construction.\n\n' +
              'e means "write this down now". While e is 1 the latch is a transparent window showing d; the moment e drops to 0, it **freezes** the last value.',
            formula: 'q ← d  (e = 1),  q holds  (e = 0)',
            usage: 'Buffers that briefly hold data, and the raw material for the next level’s flip-flop.',
          },
        },
      },
      solution: (b) => {
        const nd = b.add('NOT');
        const gs = b.add('AND');
        const gr = b.add('AND');
        const sr = b.add('SR_LATCH');
        b.fan('d', `${gs}.a`, `${nd}.in`)
          .wire(`${nd}.out`, `${gr}.a`)
          .fan('e', `${gs}.b`, `${gr}.b`)
          .wire(`${gs}.out`, `${sr}.s`)
          .wire(`${gr}.out`, `${sr}.r`)
          .wire(`${sr}.q`, 'q');
      },
    },
    {
      id: '5-3',
      chapter: 5,
      inputs: [pin('d'), pin('clk')],
      outputs: [pin('q')],
      allowedChips: [...BEFORE, 'SR_LATCH', 'D_LATCH'],
      test: {
        kind: 'sequence',
        clockPin: 'clk',
        steps: [
          { set: { d: 0 }, clock: true, expect: { q: 0 } },
          { set: { d: 1 }, expect: { q: 0 } },
          { clock: true, expect: { q: 1 } },
          { set: { d: 0 }, expect: { q: 1 } },
          { set: { clk: 1 }, expect: { q: 0 } },
          { set: { d: 1 }, expect: { q: 0 } },
          { set: { clk: 0 }, expect: { q: 0 } },
          { clock: true, expect: { q: 1 } },
          { set: { d: 0 }, clock: true, expect: { q: 0 } },
        ],
      },
      unlocks: { chipId: 'DFF' },
      stars: { maxNand: 19 },
      text: {
        ko: {
          title: 'D 플립플롭 — 찰칵!',
          briefing:
            'D 래치는 e가 1인 **동안** 계속 바뀝니다. 컴퓨터는 수많은 부품이 **정확히 같은 순간** 에 값을 저장해야 하므로, "순간" 에만 반응하는 부품이 필요합니다.\n\n' +
            '**클럭 clk가 0 → 1로 올라가는 순간(상승 엣지)** 의 d만 저장하세요. clk가 1로 머물러 있는 동안이나 내려갈 때 d가 바뀌어도 q는 그대로입니다.\n\n' +
            '오른쪽 **입력값** 칸의 **클럭** 버튼으로 clk를 한 번 올렸다 내릴 수 있습니다.',
          hints: [
            'D 래치 두 개를 이어 보세요. 하나가 투명할 때 다른 하나는 닫혀 있다면? 문이 두 개인 에어록처럼.',
            '앞쪽(마스터)은 clk = 0일 때 열리고, 뒤쪽(슬레이브)은 clk = 1일 때 열리게 하세요.',
            'master.e = NOT clk, master.d = d, slave.d = master.q, slave.e = clk, slave.q → q.',
          ],
          principle: {
            title: '마스터-슬레이브: 에어록 원리',
            body:
              'clk = 0일 때: 마스터는 d를 따라가고, 슬레이브는 닫혀 이전 값을 지킵니다.\n\n' +
              'clk가 1로 올라가는 순간: 마스터가 닫히며 그 순간의 d를 붙잡고, 동시에 슬레이브가 열려 그 값을 내보냅니다. 이후 d가 바뀌어도 마스터가 닫혀 있으니 영향이 없습니다.\n\n' +
              '두 문이 **동시에 열리는 순간이 없기** 때문에, 값은 클럭 한 번에 정확히 한 칸만 이동합니다. 이것이 **엣지 트리거** 이며, 컴퓨터의 모든 동작이 클럭에 맞춰 "찰칵, 찰칵" 진행되는 이유입니다.',
            formula: 'q ← d  (clk ↑ 순간에만)',
            usage: 'CPU의 모든 레지스터. "3GHz CPU" 는 이 찰칵이 1초에 30억 번 일어난다는 뜻입니다.',
          },
        },
        en: {
          title: 'D Flip-Flop — Click!',
          briefing:
            'A D latch keeps changing **while** e is 1. A computer needs countless parts to store values at **exactly the same instant**, so it needs a part that reacts to a moment.\n\n' +
            'Store d **only at the instant clk rises from 0 to 1 (the rising edge)**. If d changes while clk stays 1, or as it falls, q must not change.\n\n' +
            'The **Clock** button in the **Input values** card raises and lowers clk once.',
          hints: [
            'Chain two D latches. What if one is closed whenever the other is transparent? Like an airlock with two doors.',
            'Make the front one (master) open when clk = 0 and the back one (slave) open when clk = 1.',
            'master.e = NOT clk, master.d = d, slave.d = master.q, slave.e = clk, slave.q → q.',
          ],
          principle: {
            title: 'Master-slave: the airlock',
            body:
              'While clk = 0: the master follows d, and the slave is closed, guarding the old value.\n\n' +
              'The instant clk rises: the master closes, capturing d at that moment, while the slave opens and passes it out. Later changes to d cannot get past the closed master.\n\n' +
              'Because **both doors are never open at once**, a value moves exactly one stage per clock. This is **edge triggering**, and it is why everything in a computer advances in step with the clock: click, click.',
            formula: 'q ← d  (only at clk ↑)',
            usage: 'Every register in a CPU. A "3 GHz CPU" means this click happens 3 billion times a second.',
          },
        },
      },
      solution: (b) => {
        const nc = b.add('NOT');
        const m = b.add('D_LATCH');
        const s = b.add('D_LATCH');
        b.fan('clk', `${nc}.in`, `${s}.e`)
          .wire(`${nc}.out`, `${m}.e`)
          .wire('d', `${m}.d`)
          .wire(`${m}.q`, `${s}.d`)
          .wire(`${s}.q`, 'q');
      },
    },
    {
      id: '5-4',
      chapter: 5,
      inputs: [pin('d'), pin('load'), pin('clk')],
      outputs: [pin('q')],
      allowedChips: [...BEFORE, 'SR_LATCH', 'D_LATCH', 'DFF'],
      test: {
        kind: 'sequence',
        clockPin: 'clk',
        steps: [
          { set: { load: 1, d: 0 }, clock: true, expect: { q: 0 } },
          { set: { load: 0, d: 1 }, clock: true, expect: { q: 0 } },
          { set: { load: 1 }, clock: true, expect: { q: 1 } },
          { set: { load: 0, d: 0 }, clock: true, expect: { q: 1 } },
          { clock: true, expect: { q: 1 } },
          { set: { load: 1 }, clock: true, expect: { q: 0 } },
          { set: { load: 0, d: 1 }, clock: true, expect: { q: 0 } },
        ],
      },
      unlocks: { chipId: 'REG1' },
      stars: { maxNand: 23 },
      text: {
        ko: {
          title: '1비트 레지스터',
          briefing:
            'D 플립플롭은 클럭마다 **항상** 새 값을 받아들입니다. 하지만 컴퓨터는 "이번에는 이 레지스터만 바꾸고, 나머지는 그대로" 가 필요합니다.\n\n' +
            '**load = 1** 일 때만 클럭에 d를 저장하고, **load = 0** 이면 클럭이 와도 **기존 값을 유지** 하세요.',
          hints: [
            'DFF는 클럭마다 무조건 d를 저장합니다. 그렇다면 "유지" 하려면 DFF에 무엇을 넣어 줘야 할까요?',
            '유지 = 자기 자신의 현재 값(q)을 다시 저장하는 것. load로 "새 값 d" 와 "현재 값 q" 중 하나를 골라 DFF에 넣으세요.',
            'MUX(a = DFF.q, b = d, sel = load) → DFF.d, clk → DFF.clk, DFF.q → q.',
          ],
          principle: {
            title: '"유지" 도 저장이다',
            body:
              '플립플롭은 클럭마다 반드시 무언가를 저장합니다. 그래서 값을 유지하고 싶을 때는 **자기 출력을 다시 입력으로** 넣어 줍니다. MUX가 "새 값이냐, 지금 값이냐" 를 고르죠.\n\n' +
              '모든 레지스터가 같은 클럭을 받지만, **load 신호** 로 각자 바뀔지 말지를 정합니다. 챕터 8의 CPU 제어 유닛은 매 단계마다 어떤 레지스터의 load를 켤지 결정하는 회로입니다.',
            formula: 'q ← load ? d : q   (clk ↑)',
            usage: 'CPU 레지스터의 쓰기 허가(write enable).',
          },
        },
        en: {
          title: '1-bit Register',
          briefing:
            'A D flip-flop takes a new value on **every** clock. But a computer needs "change only this register now, leave the others alone".\n\n' +
            'Store d on the clock **only when load = 1**; when **load = 0**, **keep the old value** even when the clock ticks.',
          hints: [
            'A DFF always stores d on each clock. So what should you feed the DFF to "keep" its value?',
            'Keeping = storing its own current value (q) again. Use load to choose between "new value d" and "current value q" for the DFF.',
            'MUX(a = DFF.q, b = d, sel = load) → DFF.d, clk → DFF.clk, DFF.q → q.',
          ],
          principle: {
            title: '"Keep" is also a store',
            body:
              'A flip-flop stores something on every clock, so to keep a value you feed **its own output back as input**. The MUX chooses "new value or current value".\n\n' +
              'Every register receives the same clock, but the **load signal** decides whether each one changes. The Chapter 8 CPU control unit is a circuit that decides, step by step, which registers’ load to turn on.',
            formula: 'q ← load ? d : q   (clk ↑)',
            usage: 'The write enable of CPU registers.',
          },
        },
      },
      solution: (b) => {
        const m = b.add('MUX');
        const f = b.add('DFF');
        b.wire(`${f}.q`, `${m}.a`)
          .wire('d', `${m}.b`)
          .wire('load', `${m}.sel`)
          .wire(`${m}.out`, `${f}.d`)
          .wire('clk', `${f}.clk`)
          .wire(`${f}.q`, 'q');
      },
    },
    {
      id: '5-5',
      chapter: 5,
      inputs: [pin('d:8'), pin('load'), pin('clk')],
      outputs: [pin('q:8')],
      allowedChips: [...BEFORE, 'SR_LATCH', 'D_LATCH', 'DFF', 'REG1'],
      test: {
        kind: 'sequence',
        clockPin: 'clk',
        steps: [
          { set: { load: 1, d: 0 }, clock: true, expect: { q: 0 } },
          { set: { load: 0, d: 170 }, clock: true, expect: { q: 0 } },
          { set: { load: 1 }, clock: true, expect: { q: 170 } },
          { set: { load: 0, d: 85 }, clock: true, expect: { q: 170 } },
          { set: { load: 1 }, clock: true, expect: { q: 85 } },
          { set: { d: 255 }, clock: true, expect: { q: 255 } },
          { set: { load: 0, d: 0 }, clock: true, expect: { q: 255 } },
          { set: { load: 1, d: 42 }, expect: { q: 255 } },
          { clock: true, expect: { q: 42 } },
        ],
      },
      unlocks: { chipId: 'REG8' },
      stars: { maxNand: 184 },
      text: {
        ko: {
          title: '8비트 레지스터',
          briefing:
            '1비트 레지스터 8개를 나란히 놓아 **8비트 값 하나** 를 기억하는 레지스터를 만드세요. load와 clk는 8개가 모두 공유합니다.\n\n' +
            'REG1 하나를 배선한 뒤 **⌘D(복제)** 를 쓰면 빠릅니다.',
          hints: [
            '4장의 8비트 칩들과 같은 패턴입니다: 버스 분리 → 비트마다 같은 부품 → 버스 합치기.',
            '각 REG1의 d는 d 버스의 한 비트, q는 출력 버스의 한 비트. load와 clk는 8개 모두에 연결(팬아웃).',
            '버스 분리 8 → REG1 ×8 → 버스 합치기 8, load·clk → 모든 REG1.',
          ],
          principle: {
            title: 'CPU의 작업대',
            body:
              '**레지스터** 는 CPU 안에 있는 아주 빠른 저장 칸입니다. 계산할 값을 레지스터에 올려 두고, ALU로 계산하고, 결과를 다시 레지스터에 씁니다.\n\n' +
              '모든 비트가 같은 클럭 엣지에 동시에 바뀌기 때문에, 레지스터에는 "반쯤 바뀐 값" 이 존재하지 않습니다. 이 성질 덕분에 수많은 부품이 엇갈림 없이 협력할 수 있습니다.',
            formula: 'q[0..7] ← load ? d[0..7] : q[0..7]   (clk ↑)',
            usage: '누산기(A), 명령 레지스터(IR), 메모리 주소 레지스터(MAR) — 챕터 8 CPU에서 모두 이 칩을 씁니다.',
          },
        },
        en: {
          title: '8-bit Register',
          briefing:
            'Line up eight 1-bit registers to remember **one 8-bit value**. All eight share load and clk.\n\n' +
            'Wire one REG1, then use **⌘D (duplicate)** to go faster.',
          hints: [
            'Same pattern as the 8-bit chips in Chapter 4: split → the same part per bit → merge.',
            'Each REG1 gets one bit of the d bus and drives one bit of the output bus. load and clk fan out to all eight.',
            'Split 8 → REG1 ×8 → Merge 8, with load and clk → every REG1.',
          ],
          principle: {
            title: 'The CPU’s workbench',
            body:
              'A **register** is a very fast storage slot inside the CPU. Values are loaded into registers, computed by the ALU, and the result is written back to a register.\n\n' +
              'Because every bit changes on the same clock edge, a register never holds a "half-changed" value. That property lets countless parts cooperate without getting out of step.',
            formula: 'q[0..7] ← load ? d[0..7] : q[0..7]   (clk ↑)',
            usage: 'Accumulator (A), instruction register (IR), memory address register (MAR) — the Chapter 8 CPU uses this chip for all of them.',
          },
        },
      },
      solution: (b) => {
        const sp = b.add('SPLIT8');
        const m = b.add('MERGE8');
        b.wire('d', `${sp}.in`).wire(`${m}.out`, 'q');
        for (let i = 0; i < 8; i++) {
          const r = b.add('REG1');
          b.wire(`${sp}.b${i}`, `${r}.d`).wire('load', `${r}.load`).wire('clk', `${r}.clk`).wire(`${r}.q`, `${m}.b${i}`);
        }
      },
    },
    {
      id: '5-6',
      chapter: 5,
      inputs: [pin('reset'), pin('clk')],
      outputs: [pin('q:4')],
      allowedChips: [...BEFORE, 'SR_LATCH', 'D_LATCH', 'DFF', 'REG1', 'REG8'],
      test: { kind: 'sequence', clockPin: 'clk', steps: counterSteps() },
      unlocks: { chipId: 'COUNTER4' },
      stars: { maxNand: 137 },
      text: {
        ko: {
          title: '4비트 카운터',
          briefing:
            '클럭이 올 때마다 **1씩 증가** 하는 카운터를 만드세요. 15 다음은 0으로 돌아갑니다. **reset = 1** 이면 다음 클럭에 0이 됩니다.\n\n' +
            '**자동 클럭** 을 켜면 숫자가 저절로 올라가는 모습을 볼 수 있습니다.',
          hints: [
            '"다음 값 = 현재 값 + 1". 현재 값은 플립플롭에 있고, +1은 가산기로 할 수 있습니다. 가산기의 출력을 다시 플립플롭으로!',
            'DFF 4개(또는 레지스터)의 출력 q를 ADD4.a에 넣고, b = 0000, cin = 1로 +1. 합계를 다시 DFF의 d로.',
            'reset: 합계의 각 비트를 AND(합계, NOT reset)으로 거르면 reset = 1일 때 0이 저장됩니다.',
          ],
          principle: {
            title: '상태 + 조합 회로 = 상태 기계',
            body:
              '카운터는 **현재 상태(플립플롭)** 와 **다음 상태를 계산하는 조합 회로(가산기)** 가 고리를 이룬 구조입니다. 클럭이 칠 때마다 계산된 다음 상태가 현재 상태가 됩니다.\n\n' +
              '1장의 NOT 고리는 멈추지 않고 깜빡였지만, 여기서는 플립플롭이 고리를 **클럭마다 한 번씩만** 돌게 합니다. 피드백을 클럭으로 길들인 것이죠.\n\n' +
              '이 구조 — 레지스터 + 조합 논리 — 가 모든 디지털 시스템, 그리고 CPU의 정체입니다.',
            formula: 'q ← reset ? 0 : q + 1   (clk ↑)',
            usage: '프로그램 카운터(PC — 다음에 실행할 명령의 주소), 타이머, 주파수 분주기.',
          },
        },
        en: {
          title: '4-bit Counter',
          briefing:
            'Build a counter that **increases by 1** on every clock. After 15 it wraps to 0. When **reset = 1**, the next clock sets it to 0.\n\n' +
            'Turn on **Auto clock** to watch the number climb by itself.',
          hints: [
            '"next value = current value + 1". The current value lives in flip-flops, and +1 is an adder’s job. Feed the adder’s output back into the flip-flops!',
            'Put the q of four DFFs (or a register) into ADD4.a, with b = 0000 and cin = 1 for +1. Route the sum back to the DFFs’ d.',
            'reset: filter each sum bit with AND(sum, NOT reset) so that reset = 1 stores 0.',
          ],
          principle: {
            title: 'State + combinational logic = state machine',
            body:
              'A counter is a loop of **current state (flip-flops)** and **combinational logic that computes the next state (an adder)**. Each clock tick, the computed next state becomes the current state.\n\n' +
              'The NOT loop from Chapter 5’s first card blinked forever, but here the flip-flops let the loop go around **only once per clock**. Feedback, tamed by a clock.\n\n' +
              'This structure — registers + combinational logic — is the essence of every digital system, including the CPU.',
            formula: 'q ← reset ? 0 : q + 1   (clk ↑)',
            usage: 'The program counter (PC — address of the next instruction), timers, frequency dividers.',
          },
        },
      },
      solution: (b) => {
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
          b.wire(`${sum}.b${i}`, `${g}.a`).wire(`${nr}.out`, `${g}.b`).wire(`${g}.out`, `${f}.d`).wire('clk', `${f}.clk`).wire(`${f}.q`, `${qm}.b${i}`);
        }
        b.fan(`${qm}.out`, `${add}.a`, 'q');
      },
    },
    {
      id: '5-B',
      chapter: 5,
      inputs: [pin('run'), pin('reset'), pin('clk')],
      outputs: [pin('q:4')],
      allowedChips: [...BEFORE, 'SR_LATCH', 'D_LATCH', 'DFF', 'REG1', 'REG8', 'COUNTER4'],
      test: {
        kind: 'sequence',
        clockPin: 'clk',
        steps: [
          { set: { reset: 1 }, clock: true, expect: { q: 0 } },
          { set: { reset: 0 }, clock: true, expect: { q: 0 } },
          { clock: true, expect: { q: 0 } },
          { set: { run: 1 }, clock: true, expect: { q: 1 } },
          { clock: true, expect: { q: 2 } },
          { clock: true, expect: { q: 3 } },
          { set: { run: 0 }, clock: true, expect: { q: 3 } },
          { clock: true, expect: { q: 3 } },
          { set: { run: 1 }, clock: true, expect: { q: 4 } },
          { clock: true, expect: { q: 5 } },
          { set: { reset: 1 }, clock: true, expect: { q: 0 } },
          { set: { reset: 0 }, clock: true, expect: { q: 1 } },
          { set: { run: 0, reset: 1 }, clock: true, expect: { q: 0 } },
        ],
      },
      stars: { maxNand: 137 },
      text: {
        ko: {
          title: '보스: 스톱워치',
          briefing:
            '**run = 1** 이면 클럭마다 1초씩(1씩) 올라가고, **run = 0** 이면 멈춰서 현재 값을 유지합니다. **reset = 1** 이면 다음 클럭에 0이 됩니다(run보다 우선).\n\n' +
            '자동 클럭을 켜고 run을 켰다 껐다 해 보세요. 진짜 스톱워치처럼 동작해야 합니다.',
          hints: [
            '카운터와 거의 같습니다. 다른 점은 "run = 0이면 +0" 이라는 것뿐.',
            '+1 을 할 때 cin에 상수 1 대신 무엇을 넣으면 "run일 때만 +1" 이 될까요?',
            'ADD4(a = q, b = 0000, cin = run). reset은 카운터처럼 AND(합계, NOT reset)로. DFF 4개로 상태 저장.',
          ],
          principle: {
            title: '제어 신호가 동작을 바꾼다',
            body:
              '같은 회로라도 **제어 입력**(run, reset)에 따라 다르게 동작합니다. 여기서 run은 가산기의 cin으로 들어가 "+1 할지, +0 할지" 를 정했습니다. 4장 보스의 sub 신호와 같은 아이디어죠.\n\n' +
              '이제 여러분은 **기억(레지스터)**, **계산(가산기/ALU)**, **선택(MUX)**, **주소(디코더)** 를 모두 가졌습니다. 다음 챕터에서 이것들을 조합해 수백 칸짜리 기억 장치, **RAM** 을 만듭니다.',
            formula: 'q ← reset ? 0 : q + run   (clk ↑)',
            usage: '타이머, 이벤트 카운터, 그리고 CPU의 프로그램 카운터(점프 명령이 오면 증가 대신 새 값을 load).',
          },
        },
        en: {
          title: 'Boss: Stopwatch',
          briefing:
            'With **run = 1** it climbs by 1 each clock; with **run = 0** it stops and holds its value. With **reset = 1** the next clock sets it to 0 (reset beats run).\n\n' +
            'Turn on the auto clock and toggle run. It should behave like a real stopwatch.',
          hints: [
            'Almost identical to the counter. The only difference: "+0 when run = 0".',
            'For the +1, what could you feed into cin instead of Const 1 so it only adds while running?',
            'ADD4(a = q, b = 0000, cin = run). Handle reset like the counter with AND(sum, NOT reset). Four DFFs hold the state.',
          ],
          principle: {
            title: 'Control signals change behavior',
            body:
              'The same circuit behaves differently depending on its **control inputs** (run, reset). Here run went into the adder’s cin and decided "+1 or +0" — the same idea as the sub signal in the Chapter 4 boss.\n\n' +
              'You now have **memory (registers)**, **computation (adders/ALU)**, **selection (MUX)** and **addressing (decoders)**. Next chapter you combine them into a memory with hundreds of cells: **RAM**.',
            formula: 'q ← reset ? 0 : q + run   (clk ↑)',
            usage: 'Timers, event counters, and the CPU’s program counter (which loads a new value instead of incrementing on a jump).',
          },
        },
      },
      solution: (b) => {
        const add = b.add('ADD4');
        const zero = b.add('CONST0');
        const zb = b.add('MERGE4');
        const sum = b.add('SPLIT4');
        const qm = b.add('MERGE4');
        const nr = b.add('NOT');
        b.wire('reset', `${nr}.in`);
        for (let i = 0; i < 4; i++) b.wire(`${zero}.out`, `${zb}.b${i}`);
        b.wire(`${zb}.out`, `${add}.b`).wire('run', `${add}.cin`).wire(`${add}.sum`, `${sum}.in`);
        for (let i = 0; i < 4; i++) {
          const g = b.add('AND');
          const f = b.add('DFF');
          b.wire(`${sum}.b${i}`, `${g}.a`).wire(`${nr}.out`, `${g}.b`).wire(`${g}.out`, `${f}.d`).wire('clk', `${f}.clk`).wire(`${f}.q`, `${qm}.b${i}`);
        }
        b.fan(`${qm}.out`, `${add}.a`, 'q');
      },
    },
  ],
};
