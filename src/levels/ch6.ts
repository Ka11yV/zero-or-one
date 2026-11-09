import { pin, type SequenceStep } from '../sim';
import { bus, GATES } from './common';
import type { Chapter } from './types';

const BEFORE = [
  ...GATES,
  'MUX', 'DMUX', 'MUX4', 'DEC2', 'DEC3', 'ENC4',
  'HALF_ADDER', 'FULL_ADDER', 'ADD4', 'NEG4', 'SUB4', 'CMP4',
  'NOT8', 'AND8', 'OR8', 'XOR8', 'MUX8', 'ADD8', 'MUX4_8', 'DEC4', 'ADDSUB8',
  'SR_LATCH', 'D_LATCH', 'DFF', 'REG1', 'REG8', 'COUNTER4',
  'CONST0', 'CONST1',
  ...bus(2, 3, 4, 8, 16),
];

const ramPins = (addrBits: number) => [pin(`addr:${addrBits}`), pin('d:8'), pin('write'), pin('clk')];

/** 쓰기(주소, 값) → 읽기 확인 순서를 만든다. 읽기 전에 반드시 먼저 쓴다(전원 투입 시 메모리 값은 정해져 있지 않으므로). */
function ramSteps(writes: [number, number][], reads: number[], overwrite: [number, number], extra: SequenceStep[] = []): SequenceStep[] {
  const mem = new Map<number, number>();
  const steps: SequenceStep[] = [];
  for (const [a, v] of writes) {
    steps.push({ set: { write: 1, addr: a, d: v }, clock: true, expect: { q: v } });
    mem.set(a, v);
  }
  steps.push({ set: { write: 0 } });
  for (const a of reads) steps.push({ set: { addr: a }, expect: { q: mem.get(a)! } });
  // write = 0이면 클럭이 와도 바뀌지 않아야 한다
  steps.push({ set: { addr: reads[0]!, d: 0xee }, clock: true, expect: { q: mem.get(reads[0]!)! } });
  const [oa, ov] = overwrite;
  steps.push({ set: { write: 1, addr: oa, d: ov }, clock: true, expect: { q: ov } });
  mem.set(oa, ov);
  steps.push({ set: { write: 0 } });
  for (const a of reads) steps.push({ set: { addr: a }, expect: { q: mem.get(a)! } });
  return [...steps, ...extra];
}

export const chapter6: Chapter = {
  id: 6,
  title: { ko: '주소로 기억하기', en: 'Memory by Address' },
  subtitle: { ko: 'RAM 만들기', en: 'Building RAM' },
  levels: [
    {
      id: '6-1',
      chapter: 6,
      inputs: ramPins(2),
      outputs: [pin('q:8')],
      allowedChips: BEFORE,
      test: {
        kind: 'sequence',
        clockPin: 'clk',
        steps: ramSteps([[0, 11], [1, 22], [2, 33], [3, 44]], [0, 2, 1, 3], [1, 55]),
      },
      unlocks: { chipId: 'RAM4' },
      stars: { maxNand: 850 },
      text: {
        ko: {
          title: 'RAM 4칸',
          why:
            '📱 휴대폰 사양에 적힌 "메모리 8GB"가 바로 **RAM** 이에요.\n' +
            '🧠 실행 중인 프로그램과 지금 다루는 데이터는 RAM에 머물러요. 전원이 꺼지면 사라지고요.\n' +
            '이번 레벨: 주소로 칸을 골라 읽고 쓰는 **가장 작은 RAM**',
          briefing:
            '**곤란한 상황**\n' +
            '레지스터 하나는 값 하나만 기억해요. 값이 여러 개면? 칸마다 **번호(주소)** 를 붙여서 골라 쓰면 돼요.\n' +
            '\n' +
            '**할 일**\n' +
            '8비트 값 **4개** 를 저장하는 메모리를 만드세요. 주소 **addr** 는 0~3이에요.\n' +
            '- **읽기:** q에는 항상 addr가 가리키는 칸의 값 (클럭 없이 바로)\n' +
            '- **쓰기:** write = 1일 때 클럭이 오면, addr가 가리키는 칸에 d를 저장 (다른 칸은 그대로)\n' +
            '\n' +
            '**재료**\n' +
            '지금까지 만든 부품 세 가지를 조합하면 돼요: **레지스터**, **디코더**, **MUX**',
          coach: {
            'constant@q':
              'q가 늘 같은 값이에요. q는 **addr가 가리키는 레지스터** 를 골라 내보내야 해요. 레지스터 4개의 출력이 MUX에 이어졌나요?',
            'passthrough@q':
              'q에 입력 d가 그대로 나오고 있어요. q는 d가 아니라 **저장된 레지스터 값** 중 하나를 골라야 해요.',
            'condition:write=0':
              '쓸 때는 맞는데 **write = 0일 때** 틀려요. write = 0이면 클럭이 와도 어떤 칸도 바뀌면 안 돼요. 레지스터의 쓰기 허가에 **디코더 출력과 write** 를 함께 넣었나요?',
          },
          hints: [
            '레지스터 4개(REG8)가 각각 한 칸입니다. 문제는 두 가지: "어느 레지스터에 쓸지" 와 "어느 레지스터를 읽을지".',
            '쓰기: DEC2로 주소를 원-핫으로 바꾸고, 각 줄을 write와 AND해 그 레지스터의 load로. d와 clk는 모든 레지스터에 공통.',
            '읽기: 네 레지스터의 출력을 MUX4_8에 넣고 sel = addr. 출력이 q.',
          ],
          principle: {
            title: 'RAM = 디코더 + 레지스터 + MUX',
            body:
              '**RAM(Random Access Memory)** 은 번호 붙은 서랍장입니다. 주소만 알면 어느 서랍이든 **같은 시간에** 바로 열 수 있어서 "랜덤 액세스" 라고 부릅니다(테이프처럼 처음부터 감을 필요가 없죠).\n\n' +
              '쓰기 경로: 주소 → **디코더** → 한 서랍만 load 허가. 읽기 경로: 모든 서랍 → **MUX** → 주소가 고른 하나만 출력.\n\n' +
              '2장에서 만든 디코더와 MUX, 5장의 레지스터가 바로 이 순간을 위해 있었습니다.',
            formula: 'q = mem[addr],   clk↑ ∧ write ⇒ mem[addr] ← d',
            usage: '컴퓨터의 주기억장치. 여러분 컴퓨터의 RAM 16GB는 이런 칸이 약 170억 개(× 8비트) 있는 것입니다.',
          },
        },
        en: {
          title: '4-Cell RAM',
          why:
            '📱 The "8 GB memory" on a phone’s spec sheet is **RAM**.\n' +
            '🧠 Running programs and the data they work on live in RAM — and vanish when the power goes off.\n' +
            'This level: the **smallest RAM**, picking cells by address to read and write',
          briefing:
            '**The problem**\n' +
            'A register remembers one value. Need several? Give each cell a **number (address)** and pick the one you want.\n' +
            '\n' +
            '**Your job**\n' +
            'Build a memory that stores **four** 8-bit values. The address **addr** is 0–3.\n' +
            '- **Read:** q always shows the cell addr points to (immediately, no clock)\n' +
            '- **Write:** with write = 1, a clock tick stores d into the cell addr points to (other cells unchanged)\n' +
            '\n' +
            '**Ingredients**\n' +
            'Combine three parts you have already built: **registers**, a **decoder**, and a **MUX**',
          coach: {
            'constant@q':
              'q never changes. q must pick **the register addr points to**. Are the four registers’ outputs wired into a MUX?',
            'passthrough@q':
              'Input d comes straight out of q. q should pick one of the **stored register values**, not d.',
            'condition:write=0':
              'Writing works, but it goes wrong **when write = 0**. With write = 0 a clock tick must change no cell. Does each register’s write enable combine **the decoder output and write**?',
          },
          hints: [
            'Four registers (REG8) are the four cells. Two questions remain: "which register to write" and "which register to read".',
            'Write: turn the address into one-hot with DEC2, AND each line with write, and feed it to that register’s load. d and clk go to every register.',
            'Read: feed the four register outputs into MUX4_8 with sel = addr. Its output is q.',
          ],
          principle: {
            title: 'RAM = decoder + registers + MUX',
            body:
              '**RAM (Random Access Memory)** is a chest of numbered drawers. Given an address you can open any drawer **in the same amount of time** — hence "random access" (no winding from the start like a tape).\n\n' +
              'Write path: address → **decoder** → load enable for exactly one drawer. Read path: all drawers → **MUX** → only the addressed one comes out.\n\n' +
              'The decoders and MUXes from Chapter 2 and registers from Chapter 5 were all leading to this moment.',
            formula: 'q = mem[addr],   clk↑ ∧ write ⇒ mem[addr] ← d',
            usage: 'A computer’s main memory. 16 GB of RAM is roughly 17 billion such cells (× 8 bits).',
          },
        },
      },
      solution: (b) => {
        const dec = b.add('DEC2');
        const ys = b.add('SPLIT4');
        const mux = b.add('MUX4_8');
        b.wire('addr', `${dec}.in`).wire(`${dec}.y`, `${ys}.in`).wire('addr', `${mux}.sel`).wire(`${mux}.out`, 'q');
        ['a', 'b', 'c', 'd'].forEach((port, i) => {
          const g = b.add('AND');
          const r = b.add('REG8');
          b.wire(`${ys}.b${i}`, `${g}.a`)
            .wire('write', `${g}.b`)
            .wire(`${g}.out`, `${r}.load`)
            .wire('d', `${r}.d`)
            .wire('clk', `${r}.clk`)
            .wire(`${r}.q`, `${mux}.${port}`);
        });
      },
    },
    {
      id: '6-2',
      chapter: 6,
      inputs: ramPins(4),
      outputs: [pin('q:8')],
      allowedChips: [...BEFORE, 'RAM4'],
      test: {
        kind: 'sequence',
        clockPin: 'clk',
        steps: ramSteps(
          [[0, 1], [5, 50], [10, 100], [15, 150], [3, 30], [12, 120], [6, 66]],
          [0, 15, 5, 10, 3, 12, 6],
          [10, 200],
        ),
      },
      unlocks: { chipId: 'RAM16' },
      stars: { maxNand: 3520 },
      text: {
        ko: {
          title: 'RAM 16칸',
          why:
            '🏢 "3동 502호"처럼 주소를 두 단계로 나누면, 큰 아파트에서도 집을 쉽게 찾아요.\n' +
            '💾 실제 메모리 칩도 안쪽을 행과 열로 나눠서 칸을 찾아요.',
          briefing:
            '**아이디어**\n' +
            '16칸(주소 4비트)을 REG8 16개로 처음부터 배선해도 되지만, 방금 만든 **RAM4** 를 4개 쓰면 훨씬 간단해요.\n' +
            '- 주소 위 2비트 → RAM4 **4개 중 어느 것**\n' +
            '- 주소 아래 2비트 → 그 RAM4 **안의 어느 칸**\n' +
            '\n' +
            '**할 일**\n' +
            'addr(4비트)·d·write·clk을 받아 16칸 RAM을 만드세요. 읽기·쓰기 규칙은 RAM4와 같아요.\n' +
            '\n' +
            '**도움**\n' +
            'RAM4 칩은 이제 **빠른 모드** 로 시뮬레이션되고, 오른쪽 **메모리 뷰어** 에서 각 칸의 값을 볼 수 있어요.',
          coach: {
            'constant@q':
              'q가 늘 같은 값이에요. 4개의 RAM4 출력 중 **주소 위 2비트** 가 가리키는 것을 골라 q로 내보내야 해요.',
            condition:
              '특정 주소에서만 틀려요. 주소 **위 2비트** 는 "RAM4 4개 중 어느 것", **아래 2비트** 는 "그 안의 어느 칸"이에요. 둘이 바뀌지 않았나요? 쓰기 신호가 고른 RAM4에만 가는지도 확인해 보세요.',
          },
          hints: [
            '16칸 = 4칸짜리 묶음 4개. 주소 4비트 중 위 2비트는 "몇 번째 묶음", 아래 2비트는 "묶음 안의 몇 번째 칸".',
            '모든 RAM4에 아래 2비트 주소, d, clk를 공통으로 줍니다. write는 DEC2(위 2비트)로 한 묶음에만 허가하세요.',
            '쓰기: AND(DEC2(hi).y[i], write) → RAM4[i].write. 읽기: MUX4_8(네 RAM4의 q, sel = hi). 주소는 버스 분리 4 → 버스 합치기 2 ×2로 나눕니다.',
          ],
          principle: {
            title: '계층적 주소',
            body:
              '주소를 **위 비트(묶음 번호)** 와 **아래 비트(묶음 안의 번호)** 로 나누면, 작은 메모리를 여러 개 이어 큰 메모리를 만들 수 있습니다. 4장 디코더 4→16의 행/열 아이디어와 같습니다.\n\n' +
              '실제 컴퓨터도 메모리 칩 여러 개를 이렇게 묶어 쓰고(뱅크), 주소의 위쪽 비트로 어느 칩을 쓸지 고릅니다.',
            formula: 'addr = (hi, lo):  RAM4[hi][lo]',
            usage: '메모리 모듈의 뱅크·랭크 구성, 주소 디코딩.',
          },
        },
        en: {
          title: '16-Cell RAM',
          why:
            '🏢 Splitting an address in two, like "building 3, flat 502", makes any home easy to find in a huge complex.\n' +
            '💾 Real memory chips also find cells by row and column inside.',
          briefing:
            '**The idea**\n' +
            'You could wire 16 cells (4-bit address) from 16 REG8s, but four of your **RAM4** chips are much simpler.\n' +
            '- top 2 address bits → **which of the four** RAM4s\n' +
            '- bottom 2 address bits → **which cell inside** that RAM4\n' +
            '\n' +
            '**Your job**\n' +
            'Take addr (4 bits), d, write and clk and build a 16-cell RAM. Read and write work just like RAM4.\n' +
            '\n' +
            '**Help**\n' +
            'RAM4 chips now run in **fast mode**, and the **Memory viewer** on the right shows every cell’s value.',
          coach: {
            'constant@q':
              'q never changes. Pick the RAM4 output that the **top 2 address bits** point to and send it to q.',
            condition:
              'Only some addresses go wrong. The **top 2 bits** choose "which RAM4", the **bottom 2 bits** choose "which cell inside". Are they swapped? Also check that write reaches only the chosen RAM4.',
          },
          hints: [
            '16 cells = four groups of 4. Of the 4 address bits, the top 2 say "which group" and the bottom 2 "which cell in the group".',
            'Give every RAM4 the low 2 address bits, d, and clk. Enable write for only one group using DEC2 on the top 2 bits.',
            'Write: AND(DEC2(hi).y[i], write) → RAM4[i].write. Read: MUX4_8(the four RAM4 q outputs, sel = hi). Split the address with Split 4 → two Merge 2s.',
          ],
          principle: {
            title: 'Hierarchical addressing',
            body:
              'Split the address into **high bits (group number)** and **low bits (number within the group)**, and you can chain small memories into a big one — the same row/column idea as the 4→16 decoder in Chapter 4.\n\n' +
              'Real computers combine many memory chips this way (banks) and use the high address bits to pick the chip.',
            formula: 'addr = (hi, lo):  RAM4[hi][lo]',
            usage: 'Memory module banks and ranks, address decoding.',
          },
        },
      },
      solution: (b) => {
        const sp = b.add('SPLIT4');
        const lo = b.add('MERGE2');
        const hi = b.add('MERGE2');
        const dec = b.add('DEC2');
        const ys = b.add('SPLIT4');
        const mux = b.add('MUX4_8');
        b.wire('addr', `${sp}.in`)
          .wire(`${sp}.b0`, `${lo}.b0`)
          .wire(`${sp}.b1`, `${lo}.b1`)
          .wire(`${sp}.b2`, `${hi}.b0`)
          .wire(`${sp}.b3`, `${hi}.b1`)
          .wire(`${hi}.out`, `${dec}.in`)
          .wire(`${dec}.y`, `${ys}.in`)
          .wire(`${hi}.out`, `${mux}.sel`)
          .wire(`${mux}.out`, 'q');
        ['a', 'b', 'c', 'd'].forEach((port, i) => {
          const g = b.add('AND');
          const r = b.add('RAM4');
          b.wire(`${ys}.b${i}`, `${g}.a`)
            .wire('write', `${g}.b`)
            .wire(`${g}.out`, `${r}.write`)
            .wire(`${lo}.out`, `${r}.addr`)
            .wire('d', `${r}.d`)
            .wire('clk', `${r}.clk`)
            .wire(`${r}.q`, `${mux}.${port}`);
        });
      },
    },
    {
      id: '6-3',
      chapter: 6,
      inputs: ramPins(8),
      outputs: [pin('q:8')],
      allowedChips: [...BEFORE, 'RAM4', 'RAM16'],
      test: {
        kind: 'sequence',
        clockPin: 'clk',
        steps: ramSteps(
          [[0, 7], [1, 8], [17, 170], [128, 128], [255, 255], [77, 77], [200, 2], [15, 150], [16, 160], [240, 24]],
          [0, 255, 17, 128, 1, 77, 200, 15, 16, 240],
          [128, 99],
        ),
      },
      unlocks: { chipId: 'RAM256' },
      stars: { maxNand: 56800 },
      text: {
        ko: {
          title: 'RAM 256칸',
          why:
            '🕹️ 다음 장의 컴퓨터는 **프로그램과 데이터를 모두** 이 256바이트에 담아요.\n' +
            '📐 같은 구조를 계속 쌓으면 GB 메모리가 돼요. 주소가 1비트 늘 때마다 칸 수는 **2배**!',
          briefing:
            '**할 일**\n' +
            '주소 8비트, **256바이트** 메모리를 만드세요. 읽기·쓰기 규칙은 지금까지와 같아요.\n' +
            '\n' +
            '**아이디어**\n' +
            'RAM16 16개를 묶어요.\n' +
            '- 주소 위 4비트 → RAM16 **16개 중 어느 것**\n' +
            '- 주소 아래 4비트 → 그 RAM16 **안의 어느 칸**\n' +
            '\n' +
            '**막히는 곳**\n' +
            '읽기에는 16개 중 하나를 고르는 8비트 MUX가 필요한데, 그런 칩은 아직 없어요. **MUX4_8을 토너먼트처럼** 쌓으면 돼요.',
          coach: {
            'constant@q':
              'q가 늘 같은 값이에요. RAM16 16개의 출력을 **MUX4_8 토너먼트** 로 모아, 주소 위 4비트가 가리키는 것을 q로 내보내야 해요.',
            condition:
              '특정 주소에서만 틀려요. 주소 **위 4비트** 는 "RAM16 16개 중 어느 것", **아래 4비트** 는 "그 안의 어느 칸"이에요. 토너먼트 MUX의 단계마다 주소 비트를 맞게 썼는지, 쓰기 신호가 고른 RAM16에만 가는지 확인해 보세요.',
          },
          hints: [
            '주소 8비트 = 위 4비트(16개 RAM16 중 어느 것) + 아래 4비트(그 안의 칸). 6-2와 같은 구조를 한 단계 크게.',
            '쓰기 허가: DEC4(위 4비트)의 16줄 각각을 write와 AND. 읽기: MUX4_8 4개로 1라운드(sel = 위 4비트 중 아래 2비트), MUX4_8 1개로 결승(sel = 맨 위 2비트).',
            '주소 나누기: 버스 분리 8 → 버스 합치기 4 ×2 (lo, hi). hi를 다시 버스 분리 4 → 버스 합치기 2 ×2로 나눠 MUX의 sel에 씁니다.',
          ],
          principle: {
            title: '같은 패턴의 반복',
            body:
              'RAM4 → RAM16 → RAM256. 매번 같은 방법(디코더로 쓰기 허가, MUX로 읽기 선택)을 한 단계씩 키웠을 뿐입니다. 이 칩 안에는 NAND가 약 5만 6천 개 들어 있지만, 여러분이 직접 다룬 것은 매 단계 몇 개의 부품뿐이었습니다.\n\n' +
              '이것이 **추상화** 의 힘입니다. 아래 단계를 믿고 상자로 다루면, 사람이 이해할 수 있는 크기로 거대한 시스템을 만들 수 있습니다.',
            formula: 'addr[7:4] → RAM16 선택,  addr[3:0] → 칸 선택',
            usage: '1970년대 후반 가정용 컴퓨터의 RAM이 수 KB(256바이트 칩을 여러 개)였습니다.',
          },
        },
        en: {
          title: '256-Cell RAM',
          why:
            '🕹️ The Chapter 8 computer keeps **both its program and its data** in these 256 bytes.\n' +
            '📐 Keep stacking the same structure and you reach gigabytes: every extra address bit **doubles** the cells!',
          briefing:
            '**Your job**\n' +
            'Build an 8-bit-address, **256-byte** memory. Read and write work as before.\n' +
            '\n' +
            '**The idea**\n' +
            'Bundle 16 RAM16s.\n' +
            '- top 4 address bits → **which of the 16** RAM16s\n' +
            '- bottom 4 address bits → **which cell inside** that RAM16\n' +
            '\n' +
            '**The catch**\n' +
            'Reading needs an 8-bit MUX that picks one of 16, which you do not have yet. Stack MUX4_8s **like a tournament**.',
          coach: {
            'constant@q':
              'q never changes. Gather the 16 RAM16 outputs with a **MUX4_8 tournament** and send the one picked by the top 4 address bits to q.',
            condition:
              'Only some addresses go wrong. The **top 4 bits** choose "which RAM16", the **bottom 4 bits** choose "which cell inside". Check the address bits at each tournament stage, and that write reaches only the chosen RAM16.',
          },
          hints: [
            '8-bit address = top 4 bits (which of the 16 RAM16s) + bottom 4 bits (which cell inside). Same structure as 6-2, one level bigger.',
            'Write enable: AND each of DEC4(top 4 bits)’s 16 lines with write. Read: four MUX4_8s for round 1 (sel = the lower 2 of the top 4 bits), one MUX4_8 for the final (sel = the top 2 bits).',
            'Split the address: Split 8 → Merge 4 ×2 (lo, hi). Split hi again with Split 4 → Merge 2 ×2 for the MUX selects.',
          ],
          principle: {
            title: 'The same pattern, repeated',
            body:
              'RAM4 → RAM16 → RAM256. Each step just scaled up the same method (decoder for write enable, MUX for read select). This chip holds about 56,000 NANDs, yet at every step you handled only a handful of parts.\n\n' +
              'That is the power of **abstraction**: trust the level below, treat it as a box, and you can build huge systems at a size humans can understand.',
            formula: 'addr[7:4] → pick RAM16,  addr[3:0] → pick cell',
            usage: 'Late-1970s home computers had a few KB of RAM — many 256-byte chips.',
          },
        },
      },
      solution: (b) => {
        const sp = b.add('SPLIT8');
        const lo = b.add('MERGE4');
        const hi = b.add('MERGE4');
        b.wire('addr', `${sp}.in`);
        for (let i = 0; i < 4; i++) b.wire(`${sp}.b${i}`, `${lo}.b${i}`).wire(`${sp}.b${i + 4}`, `${hi}.b${i}`);
        const dec = b.add('DEC4');
        const ys = b.add('SPLIT16');
        const hs = b.add('SPLIT4');
        const s0 = b.add('MERGE2');
        const s1 = b.add('MERGE2');
        b.wire(`${hi}.out`, `${dec}.in`)
          .wire(`${dec}.y`, `${ys}.in`)
          .wire(`${hi}.out`, `${hs}.in`)
          .wire(`${hs}.b0`, `${s0}.b0`)
          .wire(`${hs}.b1`, `${s0}.b1`)
          .wire(`${hs}.b2`, `${s1}.b0`)
          .wire(`${hs}.b3`, `${s1}.b1`);
        const final = b.add('MUX4_8');
        b.wire(`${s1}.out`, `${final}.sel`).wire(`${final}.out`, 'q');
        const ports = ['a', 'b', 'c', 'd'];
        for (let g = 0; g < 4; g++) {
          const m = b.add('MUX4_8');
          b.wire(`${s0}.out`, `${m}.sel`).wire(`${m}.out`, `${final}.${ports[g]}`);
          for (let k = 0; k < 4; k++) {
            const i = g * 4 + k;
            const and = b.add('AND');
            const r = b.add('RAM16');
            b.wire(`${ys}.b${i}`, `${and}.a`)
              .wire('write', `${and}.b`)
              .wire(`${and}.out`, `${r}.write`)
              .wire(`${lo}.out`, `${r}.addr`)
              .wire('d', `${r}.d`)
              .wire('clk', `${r}.clk`)
              .wire(`${r}.q`, `${m}.${ports[k]}`);
          }
        }
      },
    },
    {
      id: '6-B',
      chapter: 6,
      inputs: [pin('d:8'), pin('rec'), pin('reset'), pin('clk')],
      outputs: [pin('q:8')],
      allowedChips: [...BEFORE, 'RAM4', 'RAM16', 'RAM256'],
      test: {
        kind: 'sequence',
        clockPin: 'clk',
        steps: [
          { set: { reset: 1, rec: 0 }, clock: true },
          { set: { reset: 0, rec: 1, d: 10 }, clock: true },
          { set: { d: 20 }, clock: true },
          { set: { d: 30 }, clock: true },
          { set: { d: 40 }, clock: true },
          { set: { rec: 0, reset: 1 }, clock: true, expect: { q: 10 } },
          { set: { reset: 0 }, expect: { q: 10 } },
          { clock: true, expect: { q: 20 } },
          { clock: true, expect: { q: 30 } },
          { clock: true, expect: { q: 40 } },
          { set: { reset: 1 }, clock: true, expect: { q: 10 } },
          { set: { reset: 0, rec: 1, d: 77 }, clock: true },
          { set: { rec: 0, reset: 1 }, clock: true, expect: { q: 77 } },
          { set: { reset: 0 }, clock: true, expect: { q: 20 } },
        ],
      },
      stars: { maxNand: 3660 },
      text: {
        ko: {
          title: '보스: 녹음기',
          why:
            '🎙️ 음성 메모, 🎮 게임 리플레이, 📹 블랙박스 — 값을 순서대로 저장했다가 다시 꺼내는 장치예요.\n' +
            '**카운터가 주소를 만들고 RAM이 값을 담는** 구조는 컴퓨터의 축소판이에요.',
          briefing:
            '**할 일**\n' +
            '값을 차례로 **녹음** 하고 처음부터 **재생** 하는 장치를 만드세요.\n' +
            '- **위치** (0, 1, 2, …)는 클럭마다 하나씩 앞으로 가요\n' +
            '- **reset = 1** 이면 다음 클럭에 위치 0으로 돌아가요\n' +
            '- **rec = 1** 이면 클럭마다 지금 위치에 d를 기록해요\n' +
            '- **q** 에는 항상 지금 위치에 기록된 값이 나와요 (재생)\n' +
            '\n' +
            '**힌트**\n' +
            '16칸이면 충분해요.',
          coach: {
            'constant@q':
              'q가 변하지 않아요. 위치를 세는 **카운터의 출력** 을 RAM의 **주소** 로 썼나요? 카운터가 클럭마다 실제로 올라가는지도 확인해 보세요.',
            'passthrough@q':
              'q에 입력 d가 그대로 나와요. q는 d가 아니라 **RAM에서 읽은 값** 이어야 재생이 돼요.',
          },
          hints: [
            '"지금 위치" 를 기억하고 클럭마다 1씩 늘리는 부품을 이미 만들었습니다. 그리고 "위치(주소)에 값을 쓰고 읽는" 부품도.',
            'COUNTER4의 출력을 RAM16의 주소로! 카운터의 reset이 곧 녹음기의 reset입니다.',
            'COUNTER4(reset, clk).q → RAM16.addr, rec → RAM16.write, d → RAM16.d, clk → RAM16.clk, RAM16.q → q. 부품 2개면 끝.',
          ],
          principle: {
            title: '주소를 계산하는 회로 + 메모리',
            body:
              '카운터가 **주소를 만들고**, RAM이 그 주소의 값을 **읽고 씁니다**. 둘이 같은 클럭에 맞춰 움직이니 쓰기와 다음 칸으로 이동이 한 번에 일어납니다.\n\n' +
              '이 구조를 잘 기억해 두세요. 챕터 8의 컴퓨터에서 **프로그램 카운터(PC)** 가 다음 명령의 주소를 만들고, RAM에서 그 명령을 읽어 옵니다. 녹음기를 "재생" 하는 것이 곧 **프로그램을 실행하는 것** 의 시작입니다.',
            formula: 'q = mem[p],   clk↑: (rec ⇒ mem[p] ← d),  p ← reset ? 0 : p + 1',
            usage: '오디오 녹음/재생 버퍼, 로직 분석기, 그리고 CPU의 명령어 인출(fetch).',
          },
        },
        en: {
          title: 'Boss: Recorder',
          why:
            '🎙️ Voice memos, 🎮 game replays, 📹 dash cams — devices that store values in order and play them back.\n' +
            'A **counter making addresses for a RAM** is a computer in miniature.',
          briefing:
            '**Your job**\n' +
            'Build a device that **records** values one after another and **plays** them back from the start.\n' +
            '- The **position** (0, 1, 2, …) advances by one each clock\n' +
            '- With **reset = 1**, the next clock returns to position 0\n' +
            '- With **rec = 1**, each clock writes d at the current position\n' +
            '- **q** always shows the value recorded at the current position (playback)\n' +
            '\n' +
            '**Hint**\n' +
            '16 cells are plenty.',
          coach: {
            'constant@q':
              'q never changes. Did you use the position **counter’s output** as the RAM **address**? Check that the counter really goes up each clock.',
            'passthrough@q':
              'Input d comes straight out of q. For playback, q must be **the value read from RAM**, not d.',
          },
          hints: [
            'You already built a part that remembers "the current position" and adds 1 each clock — and a part that reads and writes values at an address.',
            'Feed COUNTER4’s output into RAM16’s address! The counter’s reset is the recorder’s reset.',
            'COUNTER4(reset, clk).q → RAM16.addr, rec → RAM16.write, d → RAM16.d, clk → RAM16.clk, RAM16.q → q. Two parts, done.',
          ],
          principle: {
            title: 'A circuit that computes addresses + memory',
            body:
              'The counter **generates the address** and the RAM **reads and writes** at it. Since both move on the same clock, writing and stepping to the next cell happen together.\n\n' +
              'Remember this structure. In the Chapter 8 computer, the **program counter (PC)** generates the address of the next instruction and the RAM supplies it. Playing back a recording is the beginning of **running a program**.',
            formula: 'q = mem[p],   clk↑: (rec ⇒ mem[p] ← d),  p ← reset ? 0 : p + 1',
            usage: 'Audio record/playback buffers, logic analyzers, and the CPU’s instruction fetch.',
          },
        },
      },
      solution: (b) => {
        const c = b.add('COUNTER4');
        const r = b.add('RAM16');
        b.wire('reset', `${c}.reset`)
          .fan('clk', `${c}.clk`, `${r}.clk`)
          .wire(`${c}.q`, `${r}.addr`)
          .wire('rec', `${r}.write`)
          .wire('d', `${r}.d`)
          .wire(`${r}.q`, 'q');
      },
    },
  ],
};
