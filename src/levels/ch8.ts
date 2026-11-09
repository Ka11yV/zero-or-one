import { assemble, emulate } from '../cpu/isa';
import { loadSteps, startSteps } from '../cpu/run';
import { pin, type SequenceStep, type TruthRow } from '../sim';
import { Wiring } from './build';
import { CH7_BEFORE } from './ch7';
import type { Chapter } from './types';

const BEFORE = [...CH7_BEFORE, 'ALU', 'ALU8', 'SEG7', 'BCD8'];

// ---------- 8-1 프로그램 카운터 ----------

function pcSteps(): SequenceStep[] {
  const steps: SequenceStep[] = [{ set: { reset: 1 }, clock: true, expect: { q: 0 } }, { set: { reset: 0, inc: 1 }, expect: { q: 0 } }];
  let q = 0;
  const push = (set: Record<string, number>, clock = true) => {
    const s = { inc: 0, load: 0, reset: 0, d: 0, ...set };
    if (clock) {
      if (s.reset) q = 0;
      else if (s.load) q = s.d & 255;
      else if (s.inc) q = (q + 1) & 255;
    }
    steps.push({ set, clock, expect: { q } });
  };
  for (let i = 0; i < 4; i++) push({ inc: 1 });
  push({ inc: 0, load: 1, d: 0x40 });
  push({ load: 0, inc: 1 });
  push({ inc: 1, load: 1, d: 0x10 }); // load가 inc보다 먼저
  push({ inc: 0, load: 0, d: 0x99 }); // 아무것도 안 하면 그대로
  push({ load: 1, d: 0xfe });
  push({ load: 0, inc: 1 });
  push({ inc: 1 }); // 255 → 0
  push({ inc: 1 });
  push({ reset: 1, load: 1, d: 0x77 }); // reset이 가장 먼저
  push({ reset: 0, load: 0, inc: 1 });
  return steps;
}

// ---------- 8-2 분기 판단 ----------

export function branchTake(op: number, z: number, n: number, c: number): number {
  if (op === 0x9) return 1;
  if (op === 0xa) return z;
  if (op === 0xb) return c;
  if (op === 0xc) return n;
  return 0;
}

// ---------- 8-3 단계 카운터 ----------

function stepSteps(): SequenceStep[] {
  const steps: SequenceStep[] = [{ set: { reset: 1 }, clock: true, expect: { t: 0 } }, { set: { reset: 0 }, expect: { t: 0 } }];
  let t = 0;
  const push = (set: Record<string, number>) => {
    const s = { t_rst: 0, hold: 0, reset: 0, ...set };
    if (s.reset) t = 0;
    else if (s.hold) t = t;
    else if (s.t_rst || t === 4) t = 0;
    else t = t + 1;
    steps.push({ set, clock: true, expect: { t } });
  };
  for (let i = 0; i < 7; i++) push({}); // 1 2 3 4 0 1 2
  push({ t_rst: 1 }); // 2 → 0 (짧은 명령)
  push({ t_rst: 0 });
  push({});
  push({ hold: 1 }); // 그대로
  push({ hold: 1 });
  push({ hold: 1, t_rst: 1 }); // hold가 우선
  push({ hold: 0, t_rst: 0 });
  push({});
  push({});
  push({ reset: 1 });
  push({ reset: 0 });
  return steps;
}

// ---------- 8-4 제어 유닛 ----------

export const CONTROL_OUTPUTS = ['mar_ld', 'mar_sel', 'ir_ld', 'pc_inc', 'pc_ld', 'a_ld', 'alu:3', 'b_in', 'ram_wr', 'out_ld', 'halt', 't_rst'] as const;
type Ctl = Record<'mar_ld' | 'mar_sel' | 'ir_ld' | 'pc_inc' | 'pc_ld' | 'a_ld' | 'alu' | 'b_in' | 'ram_wr' | 'out_ld' | 'halt' | 't_rst', number>;

/** 명령(op)·단계(t)·분기 판단(take) → 제어 신호. TECH_DESIGN §7.3 */
export function control(op: number, t: number, take: number): Ctl {
  const o: Ctl = { mar_ld: 0, mar_sel: 0, ir_ld: 0, pc_inc: 0, pc_ld: 0, a_ld: 0, alu: 0, b_in: 0, ram_wr: 0, out_ld: 0, halt: 0, t_rst: 0 };
  const mem = op >= 0x2 && op <= 0x7;
  if (t === 0 || t === 2) o.mar_ld = 1;
  else if (t === 1) {
    o.ir_ld = 1;
    o.pc_inc = 1;
  } else if (t === 3) {
    if (mem) {
      o.mar_ld = 1;
      o.mar_sel = 1;
    } else if (op === 0xf) o.halt = 1;
    else {
      o.t_rst = 1;
      switch (op) {
        case 0x0: o.pc_inc = 1; break;
        case 0x1: o.a_ld = 1; o.alu = 7; o.pc_inc = 1; break;
        case 0x8: o.a_ld = 1; o.alu = 5; o.pc_inc = 1; break;
        case 0x9: o.pc_ld = 1; break;
        case 0xd: o.a_ld = 1; o.alu = 7; o.b_in = 1; o.pc_inc = 1; break;
        case 0xe: o.out_ld = 1; o.pc_inc = 1; break;
        default: if (take) o.pc_ld = 1; else o.pc_inc = 1;
      }
    }
  } else if (t === 4) {
    if (mem) {
      o.t_rst = 1;
      o.pc_inc = 1;
      if (op === 0x3) o.ram_wr = 1;
      else {
        o.a_ld = 1;
        o.alu = ({ 2: 7, 4: 0, 5: 1, 6: 2, 7: 3 } as Record<number, number>)[op]!;
      }
    } else if (op === 0xf) o.halt = 1;
  }
  return o;
}

function controlRows(): TruthRow[] {
  const rows: TruthRow[] = [];
  for (let op = 0; op < 16; op++)
    for (let t = 0; t <= 4; t++)
      for (let take = 0; take < 2; take++) {
        const c = control(op, t, take);
        rows.push({ in: [op, t, take], out: CONTROL_OUTPUTS.map((p) => c[p.split(':')[0] as keyof Ctl]) });
      }
  return rows;
}

// ---------- 8-5 CPU ----------

const MULT_PROGRAM = `
      LDI 0
      STA 0x82
loop: LDA 0x81
      JZ done
      SUB one
      STA 0x81
      LDA 0x82
      ADD 0x80
      STA 0x82
      JMP loop
done: LDA 0x82
      OUT
      HALT
one:  .db 1
.org 0x80
      .db 3, 5
`;

/** 모든 명령을 한 번 이상 쓰는 점검 프로그램 */
const CHECK_PROGRAM = `
      IN            ; A = 53
      NOT           ; A = 202, N = 1
      JN neg
      HALT
neg:  STA 0x90
      LDI 0x0F
      AND 0x90      ; 0x0A
      OR 0x91       ; 0x4A
      STA 0x92
      LDI 200
      ADD 0x93      ; 300 → 44, C = 1
      JC carry
      HALT
carry: ADD 0x92     ; 44 + 74 = 118, C = 0
      JC bad
      NOP
      JZ bad
      SUB 0x94      ; 118 − 118 = 0, Z = 1
      JZ done
bad:  LDI 0xEE
      OUT
      HALT
done: LDA 0x92
      OUT
      HALT
.org 0x91
      .db 0x40, 0, 100, 118
`;

function cpuProgramSteps(src: string, input = 0): SequenceStep[] {
  const asm = assemble(src);
  if (asm.errors.length) throw new Error(`참조 프로그램 오류: ${JSON.stringify(asm.errors)}`);
  const emu = emulate(asm.image, input);
  return [
    ...loadSteps(asm.image, asm.used),
    ...startSteps(input),
    { clock: true, repeat: emu.cycles + 6, expect: { out: emu.outs[emu.outs.length - 1]!, halt: 1 } },
  ];
}

const CPU_IN = [pin('run'), pin('pa:8'), pin('pd:8'), pin('pw'), pin('in:8'), pin('reset'), pin('clk')];
const CPU_OUT = [pin('out:8'), pin('ow'), pin('halt'), pin('pc:8'), pin('a:8')];

// ---------- 프로그램 레벨 공통 문구 ----------

const STARTER_KO = (task: string) => `; ${task}
; 한 줄에 명령 하나.  ;  뒤는 주석입니다.
; 라벨:   loop:      .org 주소     .db 값, 값 …

HALT
`;
const STARTER_EN = (task: string) => `; ${task}
; One instruction per line.  Text after ; is a comment.
; Labels:  loop:      .org address     .db value, value …

HALT
`;

export const chapter8: Chapter = {
  id: 8,
  title: { ko: '스스로 일하는 기계', en: 'The Machine That Runs Itself' },
  subtitle: { ko: 'CPU와 컴퓨터', en: 'CPU and computer' },
  levels: [
    {
      id: '8-1',
      chapter: 8,
      inputs: [pin('d:8'), pin('inc'), pin('load'), pin('reset'), pin('clk')],
      outputs: [pin('q:8')],
      allowedChips: BEFORE,
      test: { kind: 'sequence', clockPin: 'clk', steps: pcSteps() },
      unlocks: { chipId: 'PC' },
      stars: { maxNand: 358 },
      text: {
        ko: {
          title: '프로그램 카운터',
          why:
            '📖 책갈피처럼 "지금 몇 번째 줄을 읽는 중인지" 기억하는 칩이에요.\n' +
            '🔁 반복문은 PC를 뒤로, if문은 PC를 앞으로 건너뛰게 하는 것뿐이에요.\n' +
            '💻 x86 컴퓨터에서는 IP, ARM 휴대폰 CPU에서는 PC라는 이름으로 모든 CPU에 들어 있어요.',
          briefing:
            '**문제**\n' +
            '컴퓨터는 메모리에 적힌 명령을 **차례대로** 읽어요. 그러려면 "다음에 읽을 주소"를 누군가 들고 있어야 해요. 그 레지스터가 **프로그램 카운터(PC)** 예요.\n' +
            '\n' +
            '**할 일**\n' +
            '클럭이 올라갈 때 이렇게 동작하세요 (위에 있을수록 우선):\n' +
            '- **reset = 1** → `q = 0` (처음부터)\n' +
            '- **load = 1** → `q = d` (점프: 다른 주소로 건너뛰기)\n' +
            '- **inc = 1** → `q = q + 1` (다음 칸으로. 255 다음은 0)\n' +
            '- 셋 다 0 → 그대로',
          coach: {
            'constant@q':
              'q가 늘 같은 값이에요. REG8의 **load** 가 `inc ∨ load ∨ reset` 으로, **clk** 가 clk에 이어졌는지 확인해 보세요.',
            'passthrough@q':
              'q에 d가 그대로 나와요. 늘 d를 저장하고 있어요. 첫 MUX8의 **sel = load** 인지, 그리고 inc일 때는 `q + 1` 이 들어가는지 확인해 보세요.',
          },
          hints: [
            '값을 기억하는 건 REG8입니다. 남은 문제는 "클럭이 올 때 무엇을 넣을지"(d)와 "언제 바꿀지"(load)입니다.',
            'q + 1은 ADD8(q, 0, cin = 1)로 만듭니다. 레지스터의 load = inc ∨ load ∨ reset. 레지스터의 d는 MUX8 두 개로 고릅니다.',
            'd = MUX8(MUX8(q+1, d, sel = load), 0, sel = reset). 0은 CONST0 8개 대신 "AND8(값, 0)"이나 MERGE8에 CONST0을 연결해 만들 수 있습니다.',
          ],
          principle: {
            title: '"다음은 어디?"를 기억하는 레지스터',
            body:
              'CPU는 혼자서 다음 할 일을 찾아야 합니다. PC는 그 위치를 가리키는 손가락입니다. 보통은 한 칸씩 **증가**하고, 점프 명령이 오면 다른 곳으로 **덮어쓰고**, 전원을 켜면 0으로 **리셋**됩니다.\n\n' +
              '반복문(loop)은 PC를 뒤쪽 주소로 되돌리는 것일 뿐이고, if문은 PC를 앞쪽으로 건너뛰게 하는 것일 뿐입니다. 프로그램의 모든 흐름 제어가 이 칩 하나로 표현됩니다.',
            formula: 'q ← reset ? 0 : load ? d : inc ? q + 1 : q   (clk ↑)',
            usage: 'x86에서는 IP/RIP, ARM에서는 PC라는 이름으로 모든 CPU에 들어 있습니다.',
          },
        },
        en: {
          title: 'Program Counter',
          why:
            '📖 Like a bookmark, this chip remembers "which line am I reading now?".\n' +
            '🔁 A loop just moves the PC back; an if just makes it skip ahead.\n' +
            '💻 Every CPU has one — called IP on x86 computers and PC on the ARM CPUs in phones.',
          briefing:
            '**The problem**\n' +
            'A computer reads the instructions in memory **in order**. Something has to hold "the address to read next". That register is the **program counter (PC)**.\n' +
            '\n' +
            '**Your job**\n' +
            'On a rising clock, do the following (higher lines win):\n' +
            '- **reset = 1** → `q = 0` (start over)\n' +
            '- **load = 1** → `q = d` (jump to another address)\n' +
            '- **inc = 1** → `q = q + 1` (next cell; after 255 comes 0)\n' +
            '- all 0 → keep the value',
          coach: {
            'constant@q':
              'q never changes. Check that the REG8’s **load** is `inc ∨ load ∨ reset` and its **clk** is wired to clk.',
            'passthrough@q':
              'd comes straight out of q — it always stores d. Is the first MUX8’s **sel = load**, and does `q + 1` go in when inc is on?',
          },
          hints: [
            'A REG8 remembers the value. The rest is "what to store on the clock" (d) and "when to change" (load).',
            'q + 1 is ADD8(q, 0, cin = 1). The register’s load = inc ∨ load ∨ reset. Choose its d with two MUX8s.',
            'd = MUX8(MUX8(q+1, d, sel = load), 0, sel = reset). Make the 0 by wiring CONST0 into a MERGE8.',
          ],
          principle: {
            title: 'The Register That Knows "Where Next?"',
            body:
              'A CPU has to find its own next task. The PC is the finger pointing at it. Usually it **increments** by one, a jump **overwrites** it, and power-on **resets** it to 0.\n\n' +
              'A loop is just setting the PC back to an earlier address; an if is just skipping it forward. All control flow in a program is expressed through this one chip.',
            formula: 'q ← reset ? 0 : load ? d : inc ? q + 1 : q   (clk ↑)',
            usage: 'Every CPU has one: IP/RIP on x86, PC on ARM.',
          },
        },
      },
      solution: (b) => {
        const w = new Wiring(b);
        const reg = b.add('REG8');
        const q = `${reg}.q`;
        const plus = w.chip('ADD8', { a: q, b: w.constant(0, 8), cin: w.one() });
        const m1 = w.chip('MUX8', { a: plus('sum'), b: 'd', sel: 'load' });
        const m2 = w.chip('MUX8', { a: m1('out'), b: w.constant(0, 8), sel: 'reset' });
        b.wire(m2('out'), `${reg}.d`).wire(w.or('inc', 'load', 'reset'), `${reg}.load`).wire('clk', `${reg}.clk`).wire(q, 'q');
      },
    },
    {
      id: '8-2',
      chapter: 8,
      inputs: [pin('op:4'), pin('z'), pin('n'), pin('c')],
      outputs: [pin('take')],
      allowedChips: [...BEFORE, 'PC'],
      test: {
        kind: 'truth',
        rows: Array.from({ length: 128 }, (_, i) => {
          const op = i >> 3;
          const z = (i >> 2) & 1;
          const n = (i >> 1) & 1;
          const c = i & 1;
          return { in: [op, z, n, c], out: [branchTake(op, z, n, c)] };
        }),
      },
      unlocks: { chipId: 'BRANCH' },
      stars: { maxNand: 70 },
      text: {
        ko: {
          title: '분기 판단기',
          why:
            '🎮 "HP가 0이면 게임 오버", 🔐 "비밀번호가 같으면 문 열기" — 프로그램의 모든 if문은 CPU 안에서 **점프할까 말까** 하는 1비트 판단으로 바뀌어요.\n' +
            '이번 레벨이 바로 그 1비트를 만드는 회로예요.',
          briefing:
            '**문제**\n' +
            '프로그램의 if문은 CPU 안에서 "**지금 점프할까?**" 라는 1비트 판단이 돼요.\n' +
            '\n' +
            '**점프 명령**\n' +
            '이 컴퓨터의 명령은 4비트 번호(**opcode**)로 구분해요. 그중 4개가 점프예요.\n' +
            '- op = 9 (**JMP**): 무조건 점프 → take = 1\n' +
            '- op = 10 (**JZ**): z 플래그가 1일 때만\n' +
            '- op = 11 (**JC**): c 플래그가 1일 때만\n' +
            '- op = 12 (**JN**): n 플래그가 1일 때만\n' +
            '- 다른 명령: take = 0\n' +
            '\n' +
            '**할 일**\n' +
            '"지금 점프해야 하는가?"를 판단하는 출력 take를 만드세요. 플래그 z, n, c는 7-2에서 만든 ALU8이 내는 그 플래그예요.',
          coach: {
            'inverted@take':
              'take가 정반대예요. 점프할 때 1, 아닐 때 0이에요. 마지막에 NOT이나 NOR가 들어가지 않았나요?',
            'constant@take':
              'take가 늘 같은 값이에요. **DEC4(op)** 의 9~12번 줄을 꺼내 각각 플래그와 AND 한 뒤 OR로 모아 보세요.',
          },
          hints: [
            'opcode가 몇 번인지 알아내는 데 딱 맞는 칩이 있습니다.',
            'DEC4(op)의 9, 10, 11, 12번 줄을 쓰세요. 10번 줄은 z와 AND.',
            'take = y9 ∨ (y10 ∧ z) ∨ (y11 ∧ c) ∨ (y12 ∧ n).',
          ],
          principle: {
            title: 'if문의 정체',
            body:
              '프로그래밍 언어의 `if (x == 0)`은 CPU에서 "빼기(또는 비교) → z 플래그 → JZ" 로 바뀝니다. 조건문은 결국 **플래그 하나와 AND 게이트 하나**입니다.\n\n' +
              'take = 1이면 PC에 새 주소를 load하고, 0이면 그냥 다음 칸으로 갑니다. 컴퓨터가 "판단한다"는 것은 이 1비트로 PC의 다음 값을 고르는 일입니다.',
            formula: 'take = JMP ∨ (JZ ∧ z) ∨ (JC ∧ c) ∨ (JN ∧ n)',
            usage: '모든 조건 분기 명령(x86의 JE/JNE/JB…, ARM의 BEQ/BNE…)이 같은 원리입니다.',
          },
        },
        en: {
          title: 'Branch Decider',
          why:
            '🎮 "Game over when HP hits 0", 🔐 "open the door if the password matches" — every if in a program becomes a 1-bit **jump or not** decision inside the CPU.\n' +
            'This level builds exactly that bit.',
          briefing:
            '**The problem**\n' +
            'An if in a program becomes a 1-bit decision inside the CPU: "**jump now?**"\n' +
            '\n' +
            '**Jump instructions**\n' +
            'Instructions are identified by a 4-bit number (the **opcode**). Four of them are jumps.\n' +
            '- op = 9 (**JMP**): always jump → take = 1\n' +
            '- op = 10 (**JZ**): only if flag z is 1\n' +
            '- op = 11 (**JC**): only if flag c is 1\n' +
            '- op = 12 (**JN**): only if flag n is 1\n' +
            '- any other instruction: take = 0\n' +
            '\n' +
            '**Your job**\n' +
            'Build the output take that decides "should we jump now?". z, n and c are the flags your ALU8 from 7-2 produces.',
          coach: {
            'inverted@take':
              'take is the exact opposite: 1 when jumping, 0 otherwise. Is there an extra NOT or NOR at the end?',
            'constant@take':
              'take never changes. Pull lines 9–12 out of **DEC4(op)**, AND each with its flag, and OR them together.',
          },
          hints: [
            'There is a chip that is perfect for "which opcode is it?".',
            'Use lines 9, 10, 11 and 12 of DEC4(op). AND line 10 with z, and so on.',
            'take = y9 ∨ (y10 ∧ z) ∨ (y11 ∧ c) ∨ (y12 ∧ n).',
          ],
          principle: {
            title: 'What an if Really Is',
            body:
              'An `if (x == 0)` in a programming language becomes "subtract (or compare) → z flag → JZ" in the CPU. A condition is ultimately **one flag and one AND gate**.\n\n' +
              'If take = 1, the PC loads a new address; if 0, it just moves to the next one. When a computer "decides", it is choosing the PC’s next value with this single bit.',
            formula: 'take = JMP ∨ (JZ ∧ z) ∨ (JC ∧ c) ∨ (JN ∧ n)',
            usage: 'Every conditional branch (JE/JNE/JB… on x86, BEQ/BNE… on ARM) works this way.',
          },
        },
      },
      solution: (b) => {
        const w = new Wiring(b);
        const y = w.split(w.chip('DEC4', { in: 'op' })('y'), 16);
        b.wire(w.or(y[9]!, w.and(y[10]!, 'z'), w.and(y[11]!, 'c'), w.and(y[12]!, 'n')), 'take');
      },
    },
    {
      id: '8-3',
      chapter: 8,
      inputs: [pin('t_rst'), pin('hold'), pin('reset'), pin('clk')],
      outputs: [pin('t:3')],
      allowedChips: [...BEFORE, 'PC', 'BRANCH'],
      test: { kind: 'sequence', clockPin: 'clk', steps: stepSteps() },
      unlocks: { chipId: 'STEP' },
      stars: { maxNand: 177 },
      text: {
        ko: {
          title: '단계 카운터',
          why:
            '🍳 요리 레시피처럼 CPU도 명령 하나를 **단계별로** 처리해요: 명령 가져오기 → 재료(피연산자) 가져오기 → 실행.\n' +
            '⏱ 이 카운터는 "지금 몇 번째 단계인지" 알려 주는 시계 바늘이에요.',
          briefing:
            '**문제**\n' +
            'CPU는 명령 하나를 한 번에 끝내지 못해요. 그래서 여러 **단계**(T0, T1, T2 …)로 나눠 실행해요.\n' +
            '- T0, T1: 메모리에서 명령 가져오기\n' +
            '- T2, T3: 피연산자 가져오기\n' +
            '- T3, T4: 실행\n' +
            '\n' +
            '**할 일**\n' +
            '`0 → 1 → 2 → 3 → 4 → 0 …` 을 세는 카운터 t를 만드세요. 클럭이 올라갈 때 (위에 있을수록 우선):\n' +
            '- **reset = 1** → t = 0\n' +
            '- **hold = 1** → 그대로 (컴퓨터가 멈췄을 때)\n' +
            '- **t_rst = 1** 이거나 지금 t = 4 → t = 0 (짧은 명령은 T3에서 일찍 끝나요)\n' +
            '- 그 외 → t + 1',
          coach: {
            'constant@t':
              't가 늘 같은 값이에요. 레지스터들의 **load = 1**(CONST1)과 **clk** 가 이어졌는지, 다음 값으로 `t + 1` 이 들어가는지 확인해 보세요.',
          },
          hints: [
            '5장의 COUNTER4와 비슷하지만, 4에서 0으로 돌아가고 "그대로" 기능이 있습니다. 3비트 값을 REG1 세 개(load = 1)나 다른 레지스터에 담아 보세요.',
            't + 1은 ADD4(t를 4비트로, 0, cin = 1). "0으로 갈 때" = t_rst ∨ (t = 4). t = 4는 DEC3(t)의 4번 줄.',
            '비트마다: 다음 값 = MUX(t+1의 비트 ∧ ¬zero, 지금 비트, sel = hold) ∧ ¬reset. 이것을 REG1(load = CONST1)의 d에.',
          ],
          principle: {
            title: '명령을 시간으로 쪼개기',
            body:
              '명령 하나를 한 번에 처리하려면 메모리를 동시에 여러 번 읽어야 해서 불가능합니다. 그래서 CPU는 명령을 **여러 클럭에 나눠서** 처리합니다. 이 카운터는 "지금 몇 번째 단계인가"를 알려 주는 시계 바늘입니다.\n\n' +
              '이 단계 신호와 명령 번호를 합치면 "지금 무엇을 해야 하는가"가 결정됩니다. 그 표가 다음 레벨의 **제어 유닛**입니다.',
            formula: 't ← reset ? 0 : hold ? t : (t_rst ∨ t = 4) ? 0 : t + 1',
            usage: '이런 구조를 "다중 사이클 CPU"라고 부릅니다. 현대 CPU는 여러 명령의 단계를 겹쳐서(파이프라인) 동시에 처리합니다.',
          },
        },
        en: {
          title: 'Step Counter',
          why:
            '🍳 Like a recipe, a CPU handles one instruction **step by step**: fetch the instruction → fetch the ingredients (operand) → execute.\n' +
            '⏱ This counter is the clock hand saying "which step are we on?".',
          briefing:
            '**The problem**\n' +
            'A CPU cannot finish an instruction in one go, so it runs it over several **steps** (T0, T1, T2 …):\n' +
            '- T0, T1: fetch the instruction from memory\n' +
            '- T2, T3: fetch the operand\n' +
            '- T3, T4: execute\n' +
            '\n' +
            '**Your job**\n' +
            'Build a counter t that goes `0 → 1 → 2 → 3 → 4 → 0 …` On a rising clock (higher lines win):\n' +
            '- **reset = 1** → t = 0\n' +
            '- **hold = 1** → stay (when the computer has halted)\n' +
            '- **t_rst = 1** or t is 4 → t = 0 (short instructions finish early at T3)\n' +
            '- otherwise → t + 1',
          coach: {
            'constant@t':
              't never changes. Check the registers have **load = 1** (CONST1) and **clk** wired, and that `t + 1` goes into d.',
          },
          hints: [
            'Like COUNTER4 from chapter 5, but it wraps from 4 to 0 and can hold. Keep the 3-bit value in three REG1s (load = 1) or another register.',
            't + 1 is ADD4(t widened to 4 bits, 0, cin = 1). "Go to 0" = t_rst ∨ (t = 4); t = 4 is line 4 of DEC3(t).',
            'Per bit: next = MUX(bit of t+1 ∧ ¬zero, current bit, sel = hold) ∧ ¬reset, into the d of a REG1 with load = CONST1.',
          ],
          principle: {
            title: 'Slicing an Instruction into Time',
            body:
              'Doing a whole instruction at once would need several memory reads at the same moment, which is impossible. So the CPU spreads an instruction **over several clocks**. This counter is the clock hand saying "which step are we on?".\n\n' +
              'Combine this step with the instruction number and you know "what to do right now". That table is the **control unit** of the next level.',
            formula: 't ← reset ? 0 : hold ? t : (t_rst ∨ t = 4) ? 0 : t + 1',
            usage: 'This design is a "multi-cycle CPU". Modern CPUs overlap the steps of many instructions (pipelining).',
          },
        },
      },
      solution: (b) => {
        const w = new Wiring(b);
        const regs = [0, 1, 2].map(() => b.add('REG1'));
        const t = regs.map((r) => `${r}.q`);
        const t4 = w.merge([...t, w.zero()]);
        const inc = w.split(w.chip('ADD4', { a: t4, b: w.constant(0, 4), cin: w.one() })('sum'), 4);
        const isFour = w.split(w.chip('DEC3', { in: w.merge(t) })('y'), 8)[4]!;
        const notZero = w.not(w.or('t_rst', isFour));
        const notReset = w.not('reset');
        regs.forEach((r, i) => {
          const next = w.and(w.mux(w.and(inc[i]!, notZero), t[i]!, 'hold'), notReset);
          b.wire(next, `${r}.d`).wire(w.one(), `${r}.load`).wire('clk', `${r}.clk`);
        });
        b.wire(w.merge(t), 't');
      },
    },
    {
      id: '8-4',
      chapter: 8,
      inputs: [pin('op:4'), pin('t:3'), pin('take')],
      outputs: CONTROL_OUTPUTS.map(pin),
      allowedChips: [...BEFORE, 'PC', 'BRANCH', 'STEP'],
      test: { kind: 'truth', rows: controlRows() },
      unlocks: { chipId: 'CONTROL' },
      stars: { maxNand: 218 },
      text: {
        ko: {
          title: '제어 유닛 — CPU의 지휘자',
          why:
            '🎼 오케스트라 지휘자처럼, 제어 유닛은 각 부품에게 **언제 무엇을 할지** 신호를 보내요.\n' +
            '🧾 "ADD 0x80" 한 줄도 CPU 안에서는 "T3에 주소를 넣고, T4에 더해서 저장" 같은 신호 시간표예요.\n' +
            '💡 실제 CPU 중에는 이 표를 작은 메모리에 적어 두고 읽는 것(마이크로코드)도 있어요.',
          briefing:
            '**하는 일**\n' +
            '명령(op)과 단계(t)를 보고, CPU의 각 부품에게 **지금 무엇을 할지** 신호를 보내요.\n' +
            '\n' +
            '**나오는 선**\n' +
            '- **mar_ld**: 주소 레지스터(MAR)에 저장. **mar_sel** = 0이면 PC 값, 1이면 메모리에서 읽은 값을\n' +
            '- **ir_ld**: 명령 레지스터에 메모리 값 저장\n' +
            '- **pc_inc** / **pc_ld**: PC 증가 / 메모리 값으로 점프\n' +
            '- **a_ld**: A 레지스터에 ALU 결과 저장 (플래그도 함께)\n' +
            '- **alu**: ALU8 연산 번호\n' +
            '- **b_in**: ALU의 b에 메모리 대신 키패드 입력(IN)\n' +
            '- **ram_wr**: A를 메모리에 쓰기 · **out_ld**: A를 출력 레지스터로\n' +
            '- **halt**: 정지 · **t_rst**: 단계를 T0으로\n' +
            '\n' +
            '**T0 ~ T2 (모든 명령 공통)**\n' +
            '- T0 → mar_ld\n' +
            '- T1 → ir_ld, pc_inc\n' +
            '- T2 → mar_ld\n' +
            '\n' +
            '**T3**\n' +
            '- 메모리 명령(op 2~7: LDA, STA, ADD, SUB, AND, OR): mar_ld, mar_sel (피연산자를 주소로)\n' +
            '- NOP(0): pc_inc, t_rst\n' +
            '- LDI(1): a_ld, `alu = 7`, pc_inc, t_rst\n' +
            '- NOT(8): a_ld, `alu = 5`, pc_inc, t_rst\n' +
            '- JMP(9): pc_ld, t_rst\n' +
            '- JZ/JC/JN(10~12): take면 pc_ld, 아니면 pc_inc · 그리고 t_rst\n' +
            '- IN(13): a_ld, `alu = 7`, b_in, pc_inc, t_rst\n' +
            '- OUT(14): out_ld, pc_inc, t_rst\n' +
            '- HALT(15): halt\n' +
            '\n' +
            '**T4 (메모리 명령만)**\n' +
            '공통으로 pc_inc, t_rst. 그리고\n' +
            '- LDA: a_ld, `alu = 7`\n' +
            '- STA: ram_wr\n' +
            '- ADD: a_ld, `alu = 0` · SUB: a_ld, `alu = 1`\n' +
            '- AND: a_ld, `alu = 2` · OR: a_ld, `alu = 3`\n' +
            '- HALT(15)는 T4에서도 halt\n' +
            '\n' +
            '**나머지**\n' +
            '표에 없는 경우는 모두 0이에요. 정확한 정답은 **진리표** 탭에 있어요 (t = 0~4만 테스트).',
          coach: {
            swapped:
              '제어선 두 개가 서로 바뀐 것 같아요 (예: pc_inc ↔ pc_ld, mar_ld ↔ ir_ld). 출력 핀 이름과 선을 다시 맞춰 보세요.',
            'constant@t_rst':
              't_rst가 늘 같은 값이에요. `t_rst = T3 ∧ (메모리 명령도 HALT도 아님) ∨ T4 ∧ 메모리 명령` 이에요.',
          },
          hints: [
            'DEC4(op)와 DEC3(t)로 "지금 어떤 명령인가", "지금 몇 단계인가"를 줄 하나씩으로 바꾸세요. 그다음은 출력마다 AND와 OR입니다.',
            '자주 쓰는 묶음을 먼저 만드세요: mem = y2 ∨ … ∨ y7. 예: mar_ld = T0 ∨ T2 ∨ (T3 ∧ mem), ir_ld = T1, ram_wr = T4 ∧ y3, out_ld = T3 ∧ y14, b_in = T3 ∧ y13, halt = (T3 ∨ T4) ∧ y15.',
            'alu는 비트마다 따로: 2번 비트 = T3∧(y1∨y8∨y13) ∨ T4∧y2, 1번 비트 = T3∧(y1∨y13) ∨ T4∧(y2∨y6∨y7), 0번 비트 = T3∧(y1∨y8∨y13) ∨ T4∧(y2∨y5∨y7). t_rst = T3∧(mem도 HALT도 아님) ∨ T4∧mem.',
          ],
          principle: {
            title: '명령어 = 제어 신호의 묶음',
            body:
              '"ADD 0x80"이라는 명령은 CPU 입장에서 "T3에 MAR에 0x80을 넣고, T4에 A ← A + RAM, 플래그 갱신, PC + 1"이라는 **신호들의 시간표**입니다. 제어 유닛은 그 시간표를 회로로 굳힌 것입니다.\n\n' +
              '여러분이 만든 칩은 사실 거대한 진리표 하나입니다: (명령, 단계, 조건) → 제어선. 데이터는 레지스터와 ALU 사이를 흐르고(데이터 경로), 이 칩은 **언제 어느 문을 열지** 정합니다.\n\n' +
              '실제 CPU 중에는 이 표를 아예 작은 메모리(ROM)에 적어 두고 읽는 방식도 있습니다. 이것을 **마이크로코드**라고 부릅니다.',
            formula: '제어선 = f(opcode, T, take)',
            usage: '모든 CPU의 "디코드" 단계. x86 CPU는 복잡한 명령을 마이크로코드로 쪼개 실행합니다.',
          },
        },
        en: {
          title: 'Control Unit — The Conductor',
          why:
            '🎼 Like an orchestra conductor, the control unit tells every part **when to do what**.\n' +
            '🧾 Even one line, "ADD 0x80", is a timetable of signals inside the CPU: "address in at T3, add and store at T4".\n' +
            '💡 Some real CPUs store this table in a small memory and read it out — that is microcode.',
          briefing:
            '**What it does**\n' +
            'Looking at the instruction (op) and step (t), it tells every part of the CPU **what to do right now**.\n' +
            '\n' +
            '**Its lines**\n' +
            '- **mar_ld**: store into the address register (MAR). **mar_sel** = 0 stores the PC, 1 stores the value read from memory\n' +
            '- **ir_ld**: store the memory value into the instruction register\n' +
            '- **pc_inc** / **pc_ld**: increment PC / jump to the memory value\n' +
            '- **a_ld**: store the ALU result into register A (flags too)\n' +
            '- **alu**: the ALU8 op number\n' +
            '- **b_in**: feed the keypad input into ALU b instead of memory (IN)\n' +
            '- **ram_wr**: write A to memory · **out_ld**: copy A to the output register\n' +
            '- **halt**: stop · **t_rst**: back to step T0\n' +
            '\n' +
            '**T0 – T2 (every instruction)**\n' +
            '- T0 → mar_ld\n' +
            '- T1 → ir_ld, pc_inc\n' +
            '- T2 → mar_ld\n' +
            '\n' +
            '**T3**\n' +
            '- memory instructions (op 2–7: LDA, STA, ADD, SUB, AND, OR): mar_ld, mar_sel (use the operand as an address)\n' +
            '- NOP(0): pc_inc, t_rst\n' +
            '- LDI(1): a_ld, `alu = 7`, pc_inc, t_rst\n' +
            '- NOT(8): a_ld, `alu = 5`, pc_inc, t_rst\n' +
            '- JMP(9): pc_ld, t_rst\n' +
            '- JZ/JC/JN(10–12): pc_ld if take, otherwise pc_inc · plus t_rst\n' +
            '- IN(13): a_ld, `alu = 7`, b_in, pc_inc, t_rst\n' +
            '- OUT(14): out_ld, pc_inc, t_rst\n' +
            '- HALT(15): halt\n' +
            '\n' +
            '**T4 (memory instructions only)**\n' +
            'Always pc_inc, t_rst, plus\n' +
            '- LDA: a_ld, `alu = 7`\n' +
            '- STA: ram_wr\n' +
            '- ADD: a_ld, `alu = 0` · SUB: a_ld, `alu = 1`\n' +
            '- AND: a_ld, `alu = 2` · OR: a_ld, `alu = 3`\n' +
            '- HALT(15) also outputs halt at T4\n' +
            '\n' +
            '**Everything else**\n' +
            'Everything not listed is 0. The exact answer is in the **truth table** tab (only t = 0–4 is tested).',
          coach: {
            swapped:
              'Two control lines look swapped (e.g. pc_inc ↔ pc_ld, mar_ld ↔ ir_ld). Re-check output names against their wires.',
            'constant@t_rst':
              't_rst never changes. It is `t_rst = T3 ∧ (neither memory nor HALT) ∨ T4 ∧ memory instruction`.',
          },
          hints: [
            'Use DEC4(op) and DEC3(t) to turn "which instruction" and "which step" into single lines. After that it is AND and OR for each output.',
            'Build common groups first: mem = y2 ∨ … ∨ y7. Then e.g. mar_ld = T0 ∨ T2 ∨ (T3 ∧ mem), ir_ld = T1, ram_wr = T4 ∧ y3, out_ld = T3 ∧ y14, b_in = T3 ∧ y13, halt = (T3 ∨ T4) ∧ y15.',
            'Do alu bit by bit: bit 2 = T3∧(y1∨y8∨y13) ∨ T4∧y2, bit 1 = T3∧(y1∨y13) ∨ T4∧(y2∨y6∨y7), bit 0 = T3∧(y1∨y8∨y13) ∨ T4∧(y2∨y5∨y7). t_rst = T3∧(neither mem nor HALT) ∨ T4∧mem.',
          ],
          principle: {
            title: 'An Instruction Is a Bundle of Control Signals',
            body:
              'To the CPU, "ADD 0x80" means a **timetable of signals**: at T3 put 0x80 into MAR; at T4 A ← A + RAM, update flags, PC + 1. The control unit is that timetable frozen into a circuit.\n\n' +
              'Your chip is really one big truth table: (instruction, step, condition) → control lines. Data flows between registers and the ALU (the data path), and this chip decides **which doors open when**.\n\n' +
              'Some real CPUs store this table in a small memory (ROM) and read it out. That is called **microcode**.',
            formula: 'control lines = f(opcode, T, take)',
            usage: 'The "decode" stage of every CPU. x86 CPUs break complex instructions into microcode.',
          },
        },
      },
      solution: (b) => {
        const w = new Wiring(b);
        const y = w.split(w.chip('DEC4', { in: 'op' })('y'), 16);
        const T = w.split(w.chip('DEC3', { in: 't' })('y'), 8);
        const [T0, T1, T2, T3, T4] = [T[0]!, T[1]!, T[2]!, T[3]!, T[4]!];
        const mem = w.or(...[2, 3, 4, 5, 6, 7].map((i) => y[i]!));
        const cond = w.or(y[10]!, y[11]!, y[12]!);
        const t3mem = w.and(T3, mem);
        const t4mem = w.and(T4, mem);
        const ldiNotIn = w.or(y[1]!, y[8]!, y[13]!);
        b.wire(w.or(T0, T2, t3mem), 'mar_ld');
        b.wire(t3mem, 'mar_sel');
        b.wire(T1, 'ir_ld');
        const shortInc = w.or(y[0]!, ldiNotIn, y[14]!, w.and(cond, w.not('take')));
        b.wire(w.or(T1, w.and(T3, shortInc), t4mem), 'pc_inc');
        b.wire(w.and(T3, w.or(y[9]!, w.and(cond, 'take'))), 'pc_ld');
        const t4alu = w.or(y[2]!, y[4]!, y[5]!, y[6]!, y[7]!);
        b.wire(w.or(w.and(T3, ldiNotIn), w.and(T4, t4alu)), 'a_ld');
        const bit2 = w.or(w.and(T3, ldiNotIn), w.and(T4, y[2]!));
        const bit1 = w.or(w.and(T3, w.or(y[1]!, y[13]!)), w.and(T4, w.or(y[2]!, y[6]!, y[7]!)));
        const bit0 = w.or(w.and(T3, ldiNotIn), w.and(T4, w.or(y[2]!, y[5]!, y[7]!)));
        b.wire(w.merge([bit0, bit1, bit2]), 'alu');
        b.wire(w.and(T3, y[13]!), 'b_in');
        b.wire(w.and(T4, y[3]!), 'ram_wr');
        b.wire(w.and(T3, y[14]!), 'out_ld');
        b.wire(w.and(w.or(T3, T4), y[15]!), 'halt');
        b.wire(w.or(w.and(T3, w.not(w.or(mem, y[15]!))), t4mem), 't_rst');
      },
    },
    {
      id: '8-5',
      chapter: 8,
      inputs: CPU_IN,
      outputs: CPU_OUT,
      allowedChips: [...BEFORE, 'PC', 'BRANCH', 'STEP', 'CONTROL'],
      test: { kind: 'sequence', clockPin: 'clk', steps: [...cpuProgramSteps(MULT_PROGRAM), ...cpuProgramSteps(CHECK_PROGRAM, 53)] },
      unlocks: { chipId: 'CPU' },
      text: {
        ko: {
          title: 'CPU 조립',
          why:
            '💻 지금 쓰는 컴퓨터·휴대폰·게임기가 모두 이 구조예요: **프로그램과 데이터를 같은 메모리에** 두고, 가져오기 → 해석 → 실행을 끝없이 반복해요.\n' +
            '🧩 지금까지 만든 PC, 단계 카운터, 제어 유닛, ALU, RAM이 여기서 하나로 합쳐져요.',
          briefing:
            '**드디어 CPU**\n' +
            '만든 부품을 모두 연결해, 메모리의 프로그램을 스스로 읽고 실행하는 기계를 완성하세요.\n' +
            '\n' +
            '**부품**\n' +
            '- RAM256: 프로그램과 데이터를 함께 저장\n' +
            '- PC · STEP · CONTROL · BRANCH · ALU8\n' +
            '- REG8 4개: MAR(주소 레지스터), IR(명령 레지스터), A(누산기), OUT(출력 레지스터)\n' +
            '- REG1 4개: 플래그 z·n·c, HALT\n' +
            '\n' +
            '**연결**\n' +
            '- RAM 주소 = MAR, 쓰는 값 = A, write = ram_wr. 메모리에서 읽은 값을 **q** 라 해요.\n' +
            '- MAR ← `mar_sel ? q : PC`, load = mar_ld\n' +
            '- IR ← q, load = ir_ld · op = IR의 위쪽 4비트(4~7번)\n' +
            '- PC: d = q, inc = pc_inc, load = pc_ld, reset = reset\n' +
            '- ALU8: a = A, b = `b_in ? in : q`, op = alu → A ← 결과, 플래그 ← z·n·c, load = a_ld\n' +
            '- BRANCH(op, 플래그) → take → CONTROL(op, t, take)\n' +
            '- STEP(t_rst, hold = HALT, reset)\n' +
            '- OUT ← A, load = out_ld · HALT: halt 신호면 1, reset이면 0\n' +
            '\n' +
            '**프로그램 적재**\n' +
            'run = 0인 동안에는 RAM의 주소·값·write를 **pa, pd, pw** 에서 받아요 (MUX로 고르기). 테스트가 이 길로 프로그램을 넣은 뒤 reset하고 run = 1로 실행해요.\n' +
            '\n' +
            '**출력**\n' +
            '- out = OUT, ow = out_ld, halt = HALT, pc = PC, a = A',
          coach: {
            'constant@pc':
              'pc가 움직이지 않아요. PC의 **inc / load** 가 CONTROL의 pc_inc / pc_ld에, **clk** 가 clk에 이어졌는지, run = 1일 때 RAM 주소가 **MAR** 에서 오는지 확인해 보세요.',
            'constant@halt':
              'halt가 늘 같은 값이에요. HALT 레지스터는 REG1(`d = NOT reset`, `load = halt ∨ reset`)이에요.',
          },
          hints: [
            '한꺼번에 하지 말고 길 하나씩 연결하세요. 먼저 "명령 가져오기": PC → MAR → RAM 주소, RAM q → IR. CONTROL의 T0~T2 신호만으로도 IR에 첫 명령이 들어오는지 확인할 수 있습니다.',
            'RAM 앞의 MUX 3개: addr = MUX8(pa, MAR, sel = run), d = MUX8(pd, A, sel = run), write = MUX(pw, ram_wr, sel = run). op = IR의 SPLIT8 → 4~7번 비트 → MERGE4.',
            'HALT 레지스터: REG1(d = NOT reset, load = halt ∨ reset). STEP의 hold = HALT의 q. 플래그 REG1 세 개의 load = a_ld, d = ALU8의 z, n, c.',
          ],
          principle: {
            title: '저장된 프로그램 — 폰 노이만 구조',
            body:
              '여러분의 CPU는 **명령과 데이터를 같은 메모리에** 둡니다. 그래서 프로그램을 바꾸려면 회로를 다시 짤 필요 없이 메모리 내용만 바꾸면 됩니다. 이것이 1945년 폰 노이만이 정리한 **저장된 프로그램** 개념이고, 오늘날 거의 모든 컴퓨터의 구조입니다.\n\n' +
              'CPU가 하는 일은 단 하나의 반복입니다: **가져오기(fetch) → 해석(decode) → 실행(execute)**. PC가 가리키는 명령을 가져와 IR에 넣고, 제어 유닛이 그것을 신호로 바꾸고, 데이터 경로가 실행합니다. 그리고 다시 처음으로.\n\n' +
              '이제 NAND 게이트 하나에서 시작한 여러분의 회로가 **프로그램을 실행합니다**.',
            formula: 'loop { IR ← RAM[PC]; PC++; 실행(IR) }',
            usage: '여러분이 쓰는 모든 컴퓨터, 휴대폰, 게임기가 이 구조입니다. 차이는 크기와 속도뿐입니다.',
          },
        },
        en: {
          title: 'Assembling the CPU',
          why:
            '💻 The computer, phone or console you use works exactly like this: **program and data in the same memory**, fetch → decode → execute, over and over.\n' +
            '🧩 The PC, step counter, control unit, ALU and RAM you built all come together here.',
          briefing:
            '**At last, the CPU**\n' +
            'Connect all your parts into a machine that reads and runs the program in memory by itself.\n' +
            '\n' +
            '**Parts**\n' +
            '- RAM256: program and data together\n' +
            '- PC · STEP · CONTROL · BRANCH · ALU8\n' +
            '- four REG8s: MAR (address register), IR (instruction register), A (accumulator), OUT (output register)\n' +
            '- four REG1s: flags z·n·c, HALT\n' +
            '\n' +
            '**Wiring**\n' +
            '- RAM address = MAR, data in = A, write = ram_wr. Call the value read from memory **q**.\n' +
            '- MAR ← `mar_sel ? q : PC`, load = mar_ld\n' +
            '- IR ← q, load = ir_ld · op = the upper 4 bits of IR (bits 4–7)\n' +
            '- PC: d = q, inc = pc_inc, load = pc_ld, reset = reset\n' +
            '- ALU8: a = A, b = `b_in ? in : q`, op = alu → A ← result, flags ← z·n·c, load = a_ld\n' +
            '- BRANCH(op, flags) → take → CONTROL(op, t, take)\n' +
            '- STEP(t_rst, hold = HALT, reset)\n' +
            '- OUT ← A, load = out_ld · HALT: 1 on halt, 0 on reset\n' +
            '\n' +
            '**Loading a program**\n' +
            'While run = 0, the RAM takes its address, data and write from **pa, pd, pw** (select with MUXes). The test loads the program this way, resets, then runs with run = 1.\n' +
            '\n' +
            '**Outputs**\n' +
            '- out = OUT, ow = out_ld, halt = HALT, pc = PC, a = A',
          coach: {
            'constant@pc':
              'pc never moves. Check the PC’s **inc / load** go to CONTROL’s pc_inc / pc_ld, its **clk** to clk, and that the RAM address comes from **MAR** when run = 1.',
            'constant@halt':
              'halt never changes. The HALT register is a REG1 with `d = NOT reset` and `load = halt ∨ reset`.',
          },
          hints: [
            'Do not wire everything at once — one path at a time. Start with "fetch": PC → MAR → RAM address, RAM q → IR. With only CONTROL’s T0–T2 signals you can already see the first instruction land in IR.',
            'Three MUXes in front of the RAM: addr = MUX8(pa, MAR, sel = run), d = MUX8(pd, A, sel = run), write = MUX(pw, ram_wr, sel = run). op = SPLIT8 of IR → bits 4–7 → MERGE4.',
            'HALT register: REG1(d = NOT reset, load = halt ∨ reset). STEP’s hold = HALT’s q. The three flag REG1s have load = a_ld and d = ALU8’s z, n, c.',
          ],
          principle: {
            title: 'The Stored Program — von Neumann Architecture',
            body:
              'Your CPU keeps **instructions and data in the same memory**. To change the program you do not rewire anything — you just change memory. This is the **stored-program** idea von Neumann described in 1945, and nearly every computer today works this way.\n\n' +
              'A CPU does one thing over and over: **fetch → decode → execute**. Fetch the instruction the PC points to into IR, let the control unit turn it into signals, let the data path carry it out. Then start again.\n\n' +
              'Your circuit, which began with a single NAND gate, now **runs programs**.',
            formula: 'loop { IR ← RAM[PC]; PC++; execute(IR) }',
            usage: 'Every computer, phone and console you use has this structure. The only differences are size and speed.',
          },
        },
      },
      solution: (b) => {
        const w = new Wiring(b);
        const ram = b.add('RAM256');
        const q = `${ram}.q`;
        const pcU = b.add('PC');
        const mar = b.add('REG8');
        const ir = b.add('REG8');
        const aReg = b.add('REG8');
        const outReg = b.add('REG8');
        const halt = b.add('REG1');
        const flags = [0, 1, 2].map(() => b.add('REG1'));
        const step = b.add('STEP');
        const ctl = b.add('CONTROL');
        const br = b.add('BRANCH');
        const alu = b.add('ALU8');
        const A = `${aReg}.q`;
        const C = (p: string) => `${ctl}.${p}`;

        // RAM (적재 경로 포함)
        b.wire(w.chip('MUX8', { a: 'pa', b: `${mar}.q`, sel: 'run' })('out'), `${ram}.addr`);
        b.wire(w.chip('MUX8', { a: 'pd', b: A, sel: 'run' })('out'), `${ram}.d`);
        b.wire(w.mux('pw', C('ram_wr'), 'run'), `${ram}.write`).wire('clk', `${ram}.clk`);
        // MAR, IR
        b.wire(w.chip('MUX8', { a: `${pcU}.q`, b: q, sel: C('mar_sel') })('out'), `${mar}.d`).wire(C('mar_ld'), `${mar}.load`).wire('clk', `${mar}.clk`);
        b.wire(q, `${ir}.d`).wire(C('ir_ld'), `${ir}.load`).wire('clk', `${ir}.clk`);
        const irBits = w.split(`${ir}.q`, 8);
        const op = w.merge([irBits[4]!, irBits[5]!, irBits[6]!, irBits[7]!]);
        // PC
        b.wire(q, `${pcU}.d`).wire(C('pc_inc'), `${pcU}.inc`).wire(C('pc_ld'), `${pcU}.load`).wire('reset', `${pcU}.reset`).wire('clk', `${pcU}.clk`);
        // ALU, A, 플래그
        b.wire(A, `${alu}.a`).wire(w.chip('MUX8', { a: q, b: 'in', sel: C('b_in') })('out'), `${alu}.b`).wire(C('alu'), `${alu}.op`);
        b.wire(`${alu}.out`, `${aReg}.d`).wire(C('a_ld'), `${aReg}.load`).wire('clk', `${aReg}.clk`);
        (['z', 'n', 'c'] as const).forEach((f, i) => {
          b.wire(`${alu}.${f}`, `${flags[i]}.d`).wire(C('a_ld'), `${flags[i]}.load`).wire('clk', `${flags[i]}.clk`);
          b.wire(`${flags[i]}.q`, `${br}.${f}`);
        });
        // 분기, 제어, 단계
        b.wire(op, `${br}.op`).wire(op, `${ctl}.op`).wire(`${br}.take`, `${ctl}.take`).wire(`${step}.t`, `${ctl}.t`);
        b.wire(C('t_rst'), `${step}.t_rst`).wire(`${halt}.q`, `${step}.hold`).wire('reset', `${step}.reset`).wire('clk', `${step}.clk`);
        // OUT, HALT
        b.wire(A, `${outReg}.d`).wire(C('out_ld'), `${outReg}.load`).wire('clk', `${outReg}.clk`);
        b.wire(w.not('reset'), `${halt}.d`).wire(w.or(C('halt'), 'reset'), `${halt}.load`).wire('clk', `${halt}.clk`);
        // 출력
        b.wire(`${outReg}.q`, 'out').wire(C('out_ld'), 'ow').wire(`${halt}.q`, 'halt').wire(`${pcU}.q`, 'pc').wire(A, 'a');
      },
    },
    {
      kind: 'program',
      id: '8-6',
      chapter: 8,
      cases: [
        { mem: { 0x80: 12, 0x81: 30 }, outs: [42] },
        { mem: { 0x80: 100, 0x81: 55 }, outs: [155] },
        { mem: { 0x80: 0, 0x81: 0 }, outs: [0] },
        { mem: { 0x80: 200, 0x81: 100 }, outs: [44] },
      ],
      maxCycles: 400,
      stars: { maxBytes: 8 },
      starter: { ko: STARTER_KO('0x80번지와 0x81번지의 수를 더해 OUT 하세요.'), en: STARTER_EN('Add the numbers at 0x80 and 0x81 and OUT the sum.') },
      solution: 'LDA 0x80\nADD 0x81\nOUT\nHALT\n',
      text: {
        ko: {
          title: '첫 프로그램: 덧셈',
          why:
            '🔤 Python이든 C든, 모든 프로그램은 결국 이런 **기계어 숫자** 로 바뀌어야 CPU가 실행할 수 있어요.\n' +
            '🛠 그 번역을 해 주는 프로그램이 컴파일러예요. 이번엔 여러분이 직접 CPU의 말로 써 봐요.',
          briefing:
            '**이제부터는 프로그램**\n' +
            '회로 대신 **프로그램** 을 만들어요. 실행하는 건 여러분이 8-5에서 만든 **바로 그 CPU 칩** 이에요.\n' +
            '\n' +
            '**할 일**\n' +
            '- 메모리 **0x80** 번지와 **0x81** 번지에 수가 하나씩 있어요.\n' +
            '- 두 수를 더해 **OUT** 으로 내보낸 뒤 **HALT** 하세요.\n' +
            '- 255를 넘으면 아래 8비트만 남아요 (`200 + 100 → 44`).\n' +
            '\n' +
            '**사용법**\n' +
            '왼쪽 편집기에 명령을 쓰면 바로 기계어로 바뀌어 메모리에 들어가요. **▶ 실행** 이나 **한 명령씩** 으로 CPU가 어떻게 움직이는지 보세요. 아래 명령어 표를 참고하세요.',
          hints: [
            'A 레지스터는 계산용 손 하나입니다. 메모리에서 하나를 집어 들고(LDA), 다른 하나를 더하면(ADD) 됩니다.',
            'LDA 0x80 → A = 첫 번째 수. ADD 0x81 → A = A + 두 번째 수.',
            'LDA 0x80 / ADD 0x81 / OUT / HALT — 4줄, 8바이트.',
          ],
          principle: {
            title: '기계어 — CPU가 읽는 유일한 언어',
            body:
              '여러분이 쓴 `LDA 0x80`은 메모리에 **0x20 0x80** 두 바이트로 들어갑니다. 첫 바이트의 위쪽 4비트(2)가 명령 번호, 둘째 바이트가 주소입니다. 이 숫자들이 **기계어**이고, `LDA` 같은 이름으로 쓰는 것을 **어셈블리어**라고 부릅니다.\n\n' +
              'CPU는 기계어 말고는 아무것도 모릅니다. Python이나 C로 쓴 프로그램도 결국 이런 숫자 열로 번역된 뒤에야 실행됩니다.',
            formula: 'LDA 0x80  =  0010 0000  1000 0000',
            usage: '컴파일러가 하는 일이 바로 이 번역입니다. 성능이 아주 중요한 코드는 지금도 어셈블리어로 직접 쓰기도 합니다.',
          },
        },
        en: {
          title: 'First Program: Addition',
          why:
            '🔤 Whether Python or C, every program must become **machine-code numbers** like these before a CPU can run it.\n' +
            '🛠 The program that does that translation is a compiler. This time you write in the CPU’s own language.',
          briefing:
            '**Programs from now on**\n' +
            'You write **programs**, not circuits. They run on **the very CPU chip** you built in 8-5.\n' +
            '\n' +
            '**Your job**\n' +
            '- Memory addresses **0x80** and **0x81** each hold a number.\n' +
            '- Add them, send the sum with **OUT**, then **HALT**.\n' +
            '- Past 255 only the low 8 bits remain (`200 + 100 → 44`).\n' +
            '\n' +
            '**How to use it**\n' +
            'Whatever you type on the left is assembled into machine code and loaded into memory immediately. Use **▶ Run** or **step by instruction** to watch the CPU work. See the instruction table below.',
          hints: [
            'Register A is your one working hand. Pick one number up from memory (LDA) and add the other (ADD).',
            'LDA 0x80 → A = first number. ADD 0x81 → A = A + second number.',
            'LDA 0x80 / ADD 0x81 / OUT / HALT — 4 lines, 8 bytes.',
          ],
          principle: {
            title: 'Machine Code — The Only Language a CPU Reads',
            body:
              'Your `LDA 0x80` goes into memory as two bytes, **0x20 0x80**. The upper 4 bits of the first byte (2) are the instruction number; the second byte is the address. These numbers are **machine code**, and writing them with names like `LDA` is **assembly language**.\n\n' +
              'A CPU understands nothing but machine code. Programs written in Python or C are translated into number sequences like these before they can run.',
            formula: 'LDA 0x80  =  0010 0000  1000 0000',
            usage: 'This translation is what a compiler does. Performance-critical code is still sometimes written directly in assembly.',
          },
        },
      },
    },
    {
      kind: 'program',
      id: '8-7',
      chapter: 8,
      cases: [{ outs: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0] }],
      maxCycles: 2000,
      stars: { maxBytes: 13 },
      starter: { ko: STARTER_KO('10, 9, 8, … 1, 0을 차례로 OUT 하고 멈추세요.'), en: STARTER_EN('OUT 10, 9, 8, … 1, 0 in order, then stop.') },
      solution: 'LDI 10\nloop: OUT\nJZ end\nSUB one\nJMP loop\nend: HALT\none: .db 1\n',
      text: {
        ko: {
          title: '카운트다운',
          why:
            '🔁 `for`, `while` 같은 반복문은 CPU 안에 따로 없어요. **뒤로 점프 + 빠져나갈 조건** 의 조합일 뿐이에요.\n' +
            '🎮 게임이 쉬지 않고 화면을 다시 그리는 것도, 운영체제가 입력을 기다리는 것도 이런 반복이에요.',
          briefing:
            '**할 일**\n' +
            '10부터 0까지 **11번** OUT 하고 HALT 하세요: `10, 9, 8, … 1, 0`\n' +
            '\n' +
            '**요령**\n' +
            '- 같은 명령을 11번 쓰지 말고 **반복(loop)** 을 만들어 보세요.\n' +
            '- 반복을 멈추려면 **조건 분기** 가 필요해요: JZ는 바로 앞 계산의 결과가 0이었을 때만 점프해요.\n' +
            '- SUB는 메모리에 있는 값을 빼요. 1을 빼려면 메모리 어딘가에 1을 적어 두세요: `one: .db 1`',
          hints: [
            '구조: A = 10 → (반복 시작) OUT → 0이면 끝 → 1 빼기 → 반복 시작으로.',
            'JMP loop는 무조건 loop 라벨로 돌아갑니다. JZ end는 z 플래그가 1일 때만 end로 갑니다. z 플래그는 A를 바꾼 마지막 명령(LDI, SUB…)이 정합니다.',
            'LDI 10 / loop: OUT / JZ end / SUB one / JMP loop / end: HALT / one: .db 1',
          ],
          principle: {
            title: '반복 = 뒤로 점프 + 조건',
            body:
              '`for`, `while` 같은 반복문은 CPU 안에 따로 존재하지 않습니다. **뒤로 가는 점프(JMP)**와 **빠져나가는 조건 분기(JZ)**의 조합일 뿐입니다.\n\n' +
              'JZ가 보는 z 플래그는 7-2에서 만든 ALU8이 계산하고, 8-2의 분기 판단기가 점프를 결정하고, 8-1의 PC가 새 주소를 받습니다. 여러분이 만든 칩들이 함께 "반복"이라는 개념을 만들어 냅니다.',
            formula: 'loop: 일 → 조건 확인 → JMP loop',
            usage: '모든 프로그램의 반복문, 게임의 프레임 루프, 운영체제의 대기 루프가 이렇게 실행됩니다.',
          },
        },
        en: {
          title: 'Countdown',
          why:
            '🔁 There is no `for` or `while` inside a CPU. They are just a **backward jump plus an exit condition**.\n' +
            '🎮 A game redrawing its screen nonstop and an operating system waiting for input are loops like this.',
          briefing:
            '**Your job**\n' +
            'OUT **11 times** from 10 down to 0, then HALT: `10, 9, 8, … 1, 0`\n' +
            '\n' +
            '**Tips**\n' +
            '- Instead of writing the same instruction 11 times, build a **loop**.\n' +
            '- To stop it you need a **conditional branch**: JZ jumps only when the previous result was 0.\n' +
            '- SUB subtracts a value stored in memory. To subtract 1, put a 1 somewhere in memory: `one: .db 1`',
          hints: [
            'Shape: A = 10 → (loop) OUT → stop if 0 → subtract 1 → back to loop.',
            'JMP loop always goes back to the loop label. JZ end goes to end only when the z flag is 1. The z flag is set by the last instruction that changed A (LDI, SUB…).',
            'LDI 10 / loop: OUT / JZ end / SUB one / JMP loop / end: HALT / one: .db 1',
          ],
          principle: {
            title: 'A Loop Is a Backward Jump Plus a Condition',
            body:
              'There is no `for` or `while` inside a CPU. They are just a **backward jump (JMP)** combined with a **conditional exit (JZ)**.\n\n' +
              'The z flag JZ looks at is computed by your ALU8 from 7-2, the branch decider from 8-2 decides to jump, and the PC from 8-1 takes the new address. Your chips together create the idea of "repeating".',
            formula: 'loop: work → test → JMP loop',
            usage: 'Every loop in every program, game frame loops, operating system idle loops all run like this.',
          },
        },
      },
    },
    {
      kind: 'program',
      id: '8-8',
      chapter: 8,
      cases: [
        { mem: { 0x80: 3, 0x81: 5 }, outs: [15] },
        { mem: { 0x80: 7, 0x81: 6 }, outs: [42] },
        { mem: { 0x80: 0, 0x81: 9 }, outs: [0] },
        { mem: { 0x80: 9, 0x81: 0 }, outs: [0] },
        { mem: { 0x80: 12, 0x81: 12 }, outs: [144] },
      ],
      maxCycles: 4000,
      stars: { maxBytes: 27 },
      starter: { ko: STARTER_KO('0x80번지 × 0x81번지를 OUT 하세요.'), en: STARTER_EN('OUT the product of the numbers at 0x80 and 0x81.') },
      solution: MULT_PROGRAM.replace(/\.org 0x80[\s\S]*$/, ''),
      text: {
        ko: {
          title: '곱셈 — 하드웨어에 없는 연산',
          why:
            '🧮 초기 8비트 컴퓨터(Apple II, 패미컴의 6502 CPU)에는 곱셈 명령이 없어서, 이렇게 **프로그램으로** 곱했어요.\n' +
            '⚖ 회로로 만들면 빠르지만 크고, 프로그램으로 하면 작지만 느려요. 컴퓨터 설계의 영원한 맞바꿈이에요.',
          briefing:
            '**문제**\n' +
            '여러분의 CPU에는 곱셈 명령이 없어요. 그래도 **프로그램으로** 곱셈을 할 수 있어요.\n' +
            '\n' +
            '**할 일**\n' +
            '- 0x80번지의 수 x와 0x81번지의 수 y를 곱해 OUT 하고 HALT 하세요.\n' +
            '- 결과가 255 이하인 경우만 테스트해요.\n' +
            '- x나 y가 **0** 일 수도 있어요!',
          hints: [
            'x × y = x를 y번 더하기. 결과를 담을 칸(예: `res: .db 0`)과, 남은 횟수를 셀 칸이 필요합니다. 0x81의 y를 그대로 세는 데 써도 됩니다.',
            '반복: 남은 횟수를 A로 가져와(LDA) 0이면 끝(JZ). 아니면 1 빼서 저장(SUB one, STA), 결과를 가져와 x를 더해 저장(LDA res, ADD 0x80, STA res), 처음으로(JMP).',
            '끝나면 LDA res / OUT / HALT. y가 0이면 첫 검사에서 바로 끝나므로 결과 0이 나옵니다.',
          ],
          principle: {
            title: '소프트웨어가 하드웨어를 넓힌다',
            body:
              '곱셈 회로를 만들 수도 있지만, 반복과 덧셈만 있으면 **프로그램으로** 같은 일을 할 수 있습니다. 하드웨어는 작은 명령 몇 개만 제공하고, 나머지는 소프트웨어가 조합해서 만듭니다.\n\n' +
              '대신 느립니다: 12 × 12는 덧셈을 12번 반복하느라 수백 클럭이 걸립니다. 그래서 실제 CPU는 자주 쓰는 연산(곱셈, 나눗셈, 부동소수점)을 결국 하드웨어로 넣습니다. **속도와 회로 크기의 맞바꿈**은 컴퓨터 설계의 영원한 주제입니다.',
            formula: 'x × y = x + x + … + x  (y번)',
            usage: '초기 8비트 컴퓨터(Apple II, 패미컴의 6502 CPU)에는 곱셈 명령이 없어 이렇게 프로그램으로 곱했습니다.',
          },
        },
        en: {
          title: 'Multiplication — An Operation the Hardware Lacks',
          why:
            '🧮 Early 8-bit computers (the 6502 in the Apple II and NES) had no multiply instruction, so they multiplied **in software** like this.\n' +
            '⚖ A circuit is fast but big; a program is small but slow. That trade-off is the eternal theme of computer design.',
          briefing:
            '**The problem**\n' +
            'Your CPU has no multiply instruction. You can still multiply — **in software**.\n' +
            '\n' +
            '**Your job**\n' +
            '- Multiply x at 0x80 by y at 0x81, OUT the result and HALT.\n' +
            '- Only results up to 255 are tested.\n' +
            '- x or y may be **0**!',
          hints: [
            'x × y = add x, y times. You need a cell for the result (e.g. `res: .db 0`) and a counter — you can count down y at 0x81 itself.',
            'Loop: load the counter (LDA); if 0, finish (JZ). Otherwise subtract 1 and store it (SUB one, STA), load the result, add x and store it (LDA res, ADD 0x80, STA res), and go back (JMP).',
            'At the end: LDA res / OUT / HALT. If y is 0 the first test exits immediately and the result is 0.',
          ],
          principle: {
            title: 'Software Extends Hardware',
            body:
              'You could build a multiplier circuit, but with loops and addition you can do the same thing **in a program**. Hardware offers a few small instructions; software combines them into everything else.\n\n' +
              'It is slower, though: 12 × 12 loops twelve additions and takes hundreds of clocks. That is why real CPUs eventually put common operations (multiply, divide, floating point) into hardware. **Trading speed for circuit size** is the eternal theme of computer design.',
            formula: 'x × y = x + x + … + x  (y times)',
            usage: 'Early 8-bit computers (the 6502 in the Apple II and NES) had no multiply instruction and multiplied in software like this.',
          },
        },
      },
    },
    {
      kind: 'program',
      id: '8-B',
      chapter: 8,
      cases: [
        { input: 4, outs: [10] },
        { input: 10, outs: [55] },
        { input: 1, outs: [1] },
        { input: 0, outs: [0] },
        { input: 20, outs: [210] },
      ],
      maxCycles: 6000,
      stars: { maxBytes: 33 },
      starter: { ko: STARTER_KO('IN으로 n을 받아 1 + 2 + … + n을 OUT 하세요.'), en: STARTER_EN('Read n with IN and OUT 1 + 2 + … + n.') },
      solution: `
      IN
      STA n
      LDI 0
      STA sum
loop: LDA n
      JZ done
      ADD sum
      STA sum
      LDA n
      SUB one
      STA n
      JMP loop
done: LDA sum
      OUT
      HALT
one:  .db 1
n:    .db 0
sum:  .db 0
`,
      text: {
        ko: {
          title: '최종 보스: 내 컴퓨터',
          why:
            '🏁 NAND 게이트 하나에서 시작해 만든 **모든 칩** 이 이 프로그램 하나를 위해 함께 움직여요.\n' +
            '⌨ 키패드로 입력 → 계산 → 표시기에 출력. 계산기와 컴퓨터가 하는 일이 바로 이거예요.',
          briefing:
            '**마지막 과제**\n' +
            '**키패드** 로 숫자 n을 입력받아(**IN**) **1 + 2 + … + n** 을 계산해 **표시기** 에 보여 주세요(**OUT**). 그리고 HALT.\n' +
            '\n' +
            '**예**\n' +
            '- n = 4 → 10, n = 10 → 55\n' +
            '- n = 0이면 0\n' +
            '- 테스트는 n = 0, 1, 4, 10, 20으로 해요.\n' +
            '\n' +
            'NAND 게이트 하나에서 시작해 여러분이 만든 모든 칩이 이 프로그램 하나를 위해 함께 움직여요.',
          hints: [
            '필요한 칸: 남은 n, 합계 sum, 상수 1. IN 직후 A에 n이 있으니 바로 저장(STA n)하세요.',
            '반복: n이 0이면 끝. 아니면 sum = sum + n, n = n − 1, 다시 처음으로. "A = n"인 상태에서 ADD sum 하면 n + sum이 한 번에 됩니다.',
            'IN / STA n / LDI 0 / STA sum / loop: LDA n / JZ done / ADD sum / STA sum / LDA n / SUB one / STA n / JMP loop / done: LDA sum / OUT / HALT',
          ],
          principle: {
            title: 'NAND에서 컴퓨터까지',
            body:
              '지금 이 프로그램을 실행하는 것은 **여러분이 직접 만든 회로**입니다. NAND로 NOT·AND·OR를, 그것으로 가산기와 MUX를, 피드백으로 래치와 레지스터를, 그것들을 모아 RAM과 ALU를, 마지막으로 제어 유닛을 붙여 CPU를 만들었습니다.\n\n' +
              '각 단계에서 여러분은 아래 칸의 세부를 잊고 "칩"이라는 상자로만 생각했습니다. 이것이 **추상화**이고, 수십억 개의 트랜지스터로 된 현대 컴퓨터를 사람이 설계할 수 있는 이유입니다.\n\n' +
              '여러분의 컴퓨터와 휴대폰도 원리는 정확히 같습니다. 다만 레지스터가 더 넓고, 명령이 더 많고, 훨씬 빠를 뿐입니다.',
            formula: 'NAND → 게이트 → 가산기 → 레지스터 → RAM → ALU → CPU → 프로그램',
            usage: '이제 어떤 컴퓨터를 봐도 그 안에서 무슨 일이 일어나는지 설명할 수 있습니다.',
          },
        },
        en: {
          title: 'Final Boss: My Computer',
          why:
            '🏁 **Every chip** you built, starting from a single NAND gate, works together for this one program.\n' +
            '⌨ Keypad in → compute → display out. That is exactly what calculators and computers do.',
          briefing:
            '**The last task**\n' +
            'Read a number n from the **keypad** (**IN**), compute **1 + 2 + … + n**, show it on the **display** (**OUT**), then HALT.\n' +
            '\n' +
            '**Examples**\n' +
            '- n = 4 → 10, n = 10 → 55\n' +
            '- n = 0 → 0\n' +
            '- The test uses n = 0, 1, 4, 10 and 20.\n' +
            '\n' +
            'Every chip you have built, starting from a single NAND gate, works together for this one program.',
          hints: [
            'Cells you need: the remaining n, the running sum, the constant 1. Right after IN, A holds n — store it (STA n).',
            'Loop: if n is 0, finish. Otherwise sum = sum + n, n = n − 1, repeat. With A = n, ADD sum computes n + sum in one step.',
            'IN / STA n / LDI 0 / STA sum / loop: LDA n / JZ done / ADD sum / STA sum / LDA n / SUB one / STA n / JMP loop / done: LDA sum / OUT / HALT',
          ],
          principle: {
            title: 'From NAND to Computer',
            body:
              'The thing running this program is **a circuit you built yourself**. NAND gave you NOT, AND and OR; those gave adders and MUXes; feedback gave latches and registers; together they became RAM and an ALU; and a control unit turned it all into a CPU.\n\n' +
              'At each stage you forgot the details below and thought only in "chips". That is **abstraction**, and it is why humans can design modern computers with billions of transistors.\n\n' +
              'Your laptop and phone work on exactly the same principles — just with wider registers, more instructions and far more speed.',
            formula: 'NAND → gates → adders → registers → RAM → ALU → CPU → programs',
            usage: 'Now you can explain what happens inside any computer you see.',
          },
        },
      },
    },
  ],
};
