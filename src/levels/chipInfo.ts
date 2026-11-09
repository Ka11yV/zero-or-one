// 칩 내부 보기에서 보여주는 "한 줄 규칙" 설명. 칩 id → 언어별 문장 (줄바꿈으로 여러 줄)
import type { Lang } from '../i18n';

export const CHIP_SUMMARY: Record<string, Record<Lang, string>> = {
  NAND: {
    ko: '둘 다 1일 때만 0, 나머지는 모두 1이에요. (AND를 뒤집은 것)\n이 게임의 모든 칩은 이 NAND 하나로 만들어져요.',
    en: 'Outputs 0 only when both inputs are 1; otherwise 1. (an inverted AND)\nEvery chip in this game is built from this one gate.',
  },
  NOT: {
    ko: '들어온 값을 뒤집어요. 0이면 1, 1이면 0.',
    en: 'Flips the input: 0 becomes 1, 1 becomes 0.',
  },
  AND: {
    ko: '둘 다 1이어야 1이에요. 하나라도 0이면 0.',
    en: 'Outputs 1 only when both inputs are 1. If either is 0, the output is 0.',
  },
  OR: {
    ko: '둘 중 하나만 1이어도 1이에요. 둘 다 0일 때만 0.',
    en: 'Outputs 1 if at least one input is 1. Only 0 when both are 0.',
  },
  NOR: {
    ko: '둘 다 0일 때만 1이에요. 하나라도 1이면 0. (OR를 뒤집은 것)',
    en: 'Outputs 1 only when both inputs are 0. (an inverted OR)',
  },
  XOR: {
    ko: '두 값이 서로 다르면 1, 같으면 0이에요.\n"둘 중 딱 하나만 1"일 때 1.',
    en: 'Outputs 1 when the inputs differ, 0 when they are the same.\nIn other words: exactly one of them is 1.',
  },
  XNOR: {
    ko: '두 값이 같으면 1, 다르면 0이에요. (XOR를 뒤집은 것 = "같은가?" 검사기)',
    en: 'Outputs 1 when the inputs are equal, 0 when they differ. (an inverted XOR: an equality check)',
  },
  MUX: {
    ko: 'sel이 0이면 a를, 1이면 b를 그대로 내보내요.\n두 길 중 하나를 고르는 스위치.',
    en: 'Passes a through when sel = 0, b when sel = 1.\nA switch that picks one of two signals.',
  },
  DMUX: {
    ko: 'in을 sel이 가리키는 쪽으로 보내요. sel = 0이면 a로, 1이면 b로.\n선택되지 않은 쪽은 0.',
    en: 'Routes in to the output chosen by sel: a when sel = 0, b when sel = 1.\nThe other output stays 0.',
  },
  MUX4: {
    ko: 'sel(0~3)이 가리키는 입력 하나를 내보내요. 0 → a, 1 → b, 2 → c, 3 → d.',
    en: 'Passes the input chosen by sel (0–3): 0 → a, 1 → b, 2 → c, 3 → d.',
  },
  DEC2: {
    ko: 'in의 숫자(0~3)에 해당하는 y 비트 하나만 1로 켜요. 나머지는 모두 0.\n예: in = 2 → y = 0100',
    en: 'Turns on exactly one bit of y: the one numbered by in (0–3). All others are 0.\nExample: in = 2 → y = 0100',
  },
  DEC3: {
    ko: 'in의 숫자(0~7)에 해당하는 y 비트 하나만 1로 켜요.\n예: in = 5 → y = 00100000',
    en: 'Turns on the one bit of y numbered by in (0–7).\nExample: in = 5 → y = 00100000',
  },
  ENC4: {
    ko: '디코더의 반대예요. 켜져 있는 입력의 번호(0~3)를 2비트 숫자로 알려 줘요.\n예: i2만 1 → out = 2',
    en: 'The reverse of a decoder: reports the number (0–3) of the input that is on, as a 2-bit value.\nExample: only i2 on → out = 2',
  },
  HALF_ADDER: {
    ko: '1비트 두 개를 더해요. sum은 그 자리 값, carry는 다음 자리로 올리는 값.\n1 + 1 = 10(2진수) → sum 0, carry 1',
    en: 'Adds two bits. sum is the digit for this place, carry goes to the next place.\n1 + 1 = 10 (binary) → sum 0, carry 1',
  },
  FULL_ADDER: {
    ko: '1비트 세 개(a, b, 아래 자리에서 올라온 cin)를 더해요.\n1이 홀수 개면 sum = 1, 1이 2개 이상이면 cout = 1.',
    en: 'Adds three bits (a, b and the carry-in from the place below).\nsum = 1 when an odd number of them are 1; cout = 1 when two or more are 1.',
  },
  ADD4: {
    ko: '4비트 숫자 두 개를 더해요: sum = a + b + cin.\n결과가 15를 넘으면 cout = 1 (자리 넘침).',
    en: 'Adds two 4-bit numbers: sum = a + b + cin.\ncout = 1 when the result is larger than 15 (overflow).',
  },
  NEG4: {
    ko: '숫자의 부호를 바꿔요 (2의 보수). 모든 비트를 뒤집고 1을 더하면 −x.\n예: 3(0011) → 13(1101) = −3',
    en: 'Negates a number (two’s complement): flip every bit, then add 1.\nExample: 3 (0011) → 13 (1101) = −3',
  },
  SUB4: {
    ko: '뺄셈 diff = a − b 를 해요. 실제로는 a + (−b)로 계산해요.\na ≥ b 이면 cout = 1 (빌려 오지 않음).',
    en: 'Subtracts: diff = a − b, computed as a + (−b).\ncout = 1 when a ≥ b (no borrow needed).',
  },
  CMP4: {
    ko: '두 4비트 숫자를 비교해요.\na와 b가 같으면 eq = 1, a가 b보다 작으면 lt = 1.',
    en: 'Compares two 4-bit numbers.\neq = 1 when a equals b; lt = 1 when a is less than b.',
  },
  NOT8: {
    ko: '8비트를 한꺼번에 뒤집어요. 각 비트마다 NOT.',
    en: 'Flips all 8 bits at once: a NOT on every bit.',
  },
  AND8: {
    ko: '같은 자리 비트끼리 AND해요. 둘 다 1인 자리만 1.\n특정 비트만 남기는 "마스크"로 자주 써요.',
    en: 'ANDs each pair of matching bits: 1 only where both are 1.\nOften used as a "mask" to keep only some bits.',
  },
  OR8: {
    ko: '같은 자리 비트끼리 OR해요. 둘 중 하나라도 1인 자리는 1.\n특정 비트를 켜는 데 써요.',
    en: 'ORs each pair of matching bits: 1 where either is 1.\nUsed to switch particular bits on.',
  },
  XOR8: {
    ko: '같은 자리 비트끼리 XOR해요. 서로 다른 자리만 1.\nb가 1인 자리의 a 비트가 뒤집혀요.',
    en: 'XORs each pair of matching bits: 1 where they differ.\nWherever b is 1, the bit of a gets flipped.',
  },
  MUX8: {
    ko: 'sel이 0이면 8비트 a를, 1이면 8비트 b를 통째로 내보내요.',
    en: 'Passes the whole 8-bit a when sel = 0, the whole 8-bit b when sel = 1.',
  },
  ADD8: {
    ko: '8비트 숫자 두 개를 더해요: sum = a + b + cin.\n결과가 255를 넘으면 cout = 1.',
    en: 'Adds two 8-bit numbers: sum = a + b + cin.\ncout = 1 when the result is larger than 255.',
  },
  MUX4_8: {
    ko: 'sel(0~3)이 가리키는 8비트 입력 하나를 통째로 내보내요. 0 → a, 1 → b, 2 → c, 3 → d.',
    en: 'Passes the whole 8-bit input chosen by sel (0–3): 0 → a, 1 → b, 2 → c, 3 → d.',
  },
  DEC4: {
    ko: 'in의 숫자(0~15)에 해당하는 y 비트 하나만 1로 켜요.\nRAM에서 "몇 번 칸인가"를 고를 때 써요.',
    en: 'Turns on the one bit of y numbered by in (0–15).\nRAM uses this to pick which cell is addressed.',
  },
  ADDSUB8: {
    ko: 'sub = 0이면 out = a + b, sub = 1이면 out = a − b.\n뺄셈은 b를 뒤집고 1을 더해서(= −b) 덧셈으로 해요.',
    en: 'out = a + b when sub = 0, and a − b when sub = 1.\nSubtraction flips b and adds 1 (= −b), so it is still an addition.',
  },
  SR_LATCH: {
    ko: 's = 1이면 q가 1로 켜지고(set), r = 1이면 0으로 꺼져요(reset).\n둘 다 0이면 마지막 값을 그대로 기억해요. nq는 항상 q의 반대.',
    en: 's = 1 switches q on (set); r = 1 switches it off (reset).\nWhen both are 0 it remembers its last value. nq is always the opposite of q.',
  },
  D_LATCH: {
    ko: 'e = 1인 동안에는 q가 d를 그대로 따라가요.\ne = 0이 되면 그 순간의 값을 붙잡아 계속 기억해요.',
    en: 'While e = 1, q simply follows d.\nWhen e goes to 0, it holds on to the value it had at that moment.',
  },
  DFF: {
    ko: 'clk이 0에서 1로 올라가는 순간에만 d를 저장해요.\n그 외에는 d가 바뀌어도 q는 그대로예요.',
    en: 'Stores d only at the instant clk rises from 0 to 1.\nAt any other time, q stays put even if d changes.',
  },
  REG1: {
    ko: 'load = 1일 때 clk이 올라가면 d를 저장하고, load = 0이면 기존 값을 계속 기억해요.',
    en: 'On a rising clk, stores d if load = 1; if load = 0 it keeps its old value.',
  },
  REG8: {
    ko: '8비트 숫자 하나를 기억하는 칸이에요.\nload = 1일 때 clk이 올라가면 d를 저장하고, 아니면 그대로 유지해요.',
    en: 'A box that remembers one 8-bit number.\nOn a rising clk it stores d if load = 1; otherwise it keeps its value.',
  },
  COUNTER4: {
    ko: 'clk이 올라갈 때마다 1씩 늘어나요 (0 → 1 → … → 15 → 0).\nreset = 1이면 0으로 돌아가요.',
    en: 'Counts up by 1 on every rising clk (0 → 1 → … → 15 → 0).\nreset = 1 sends it back to 0.',
  },
  RAM4: {
    ko: '8비트 숫자를 4칸에 기억해요. addr로 칸 번호(0~3)를 골라요.\nq에는 언제나 그 칸의 값이 나오고, write = 1일 때 clk이 올라가면 d를 그 칸에 저장해요.',
    en: 'Remembers 8-bit numbers in 4 cells; addr picks the cell (0–3).\nq always shows that cell; on a rising clk with write = 1, d is stored there.',
  },
  RAM16: {
    ko: '8비트 숫자를 16칸에 기억해요. addr(0~15)로 칸을 골라 읽고,\nwrite = 1일 때 clk이 올라가면 d를 그 칸에 저장해요.',
    en: 'Remembers 8-bit numbers in 16 cells. addr (0–15) picks the cell to read;\non a rising clk with write = 1, d is stored there.',
  },
  RAM256: {
    ko: '8비트 숫자를 256칸(256바이트)에 기억해요. addr(0~255)로 칸을 골라 읽고,\nwrite = 1일 때 clk이 올라가면 d를 그 칸에 저장해요.',
    en: 'Remembers 8-bit numbers in 256 cells (256 bytes). addr (0–255) picks the cell to read;\non a rising clk with write = 1, d is stored there.',
  },
  ALU: {
    ko: 'op가 0이면 a + b, 1이면 a − b, 2면 a AND b, 3이면 a OR b를 내보내요.\n네 가지를 모두 계산해 두고 op로 하나를 골라요.',
    en: 'Outputs a + b for op 0, a − b for op 1, a AND b for op 2, a OR b for op 3.\nIt computes all four and op picks one.',
  },
  ALU8: {
    ko: 'op(0~7)에 따라 더하기·빼기·AND·OR·XOR·NOT a·a·b 중 하나를 계산해요.\n결과가 0이면 z = 1, 맨 위 비트가 1이면 n = 1, 덧셈·뺄셈에서 자리 넘침이 있으면 c = 1.',
    en: 'Computes add, subtract, AND, OR, XOR, NOT a, a or b depending on op (0–7).\nz = 1 when the result is 0, n = its top bit, c = carry from add/subtract.',
  },
  SEG7: {
    ko: '4비트 숫자(0~F)를 숫자판의 막대 7개(a~g) 중 켤 것들로 바꿔요.',
    en: 'Turns a 4-bit number (0–F) into which of the 7 display bars (a–g) to light.',
  },
  BCD8: {
    ko: '0~99 사이의 2진수를 십의 자리(tens)와 일의 자리(ones)로 나눠요.\n예: 37 → tens 3, ones 7',
    en: 'Splits a binary number from 0 to 99 into its tens and ones digits.\nExample: 37 → tens 3, ones 7',
  },
  PC: {
    ko: '다음에 읽을 명령의 주소를 기억해요. clk이 올라갈 때 reset이면 0, load면 d로 점프, inc면 1 증가.',
    en: 'Holds the address of the next instruction. On a rising clk: reset → 0, load → jump to d, inc → add 1.',
  },
  BRANCH: {
    ko: '지금 점프해야 하면 take = 1이에요. JMP는 항상, JZ는 z일 때, JC는 c일 때, JN은 n일 때.',
    en: 'take = 1 when the CPU should jump: always for JMP, on z for JZ, on c for JC, on n for JN.',
  },
  STEP: {
    ko: '명령 실행 단계 0 → 1 → 2 → 3 → 4 → 0 을 세요. t_rst면 0으로, hold면 그대로, reset이면 0.',
    en: 'Counts the instruction steps 0 → 1 → 2 → 3 → 4 → 0. t_rst goes back to 0, hold freezes, reset clears.',
  },
  CONTROL: {
    ko: '지금 명령(op)과 단계(t)를 보고 CPU의 각 부품에 "지금 할 일" 신호를 보내요.\nCPU의 지휘자.',
    en: 'Looks at the current instruction (op) and step (t) and tells every CPU part what to do right now.\nThe conductor of the CPU.',
  },
  CPU: {
    ko: '메모리의 프로그램을 스스로 하나씩 읽고 실행하는 컴퓨터예요.\nrun = 0일 때 pa·pd·pw로 프로그램을 넣고, reset 후 run = 1로 실행해요.',
    en: 'A computer that fetches and runs the program in its memory by itself.\nLoad a program through pa·pd·pw while run = 0, then reset and run with run = 1.',
  },
};
