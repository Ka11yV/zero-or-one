// 챕터 8 컴퓨터의 명령어 집합(ISA), 어셈블러, 기준 에뮬레이터.
// 명령어는 2바이트: [opcode(상위 4비트) | 0000] [operand(8비트)]

export interface OpInfo {
  code: number;
  name: string;
  /** 피연산자(주소나 값)가 필요한가 */
  operand: 'none' | 'value' | 'addr';
  /** 메모리를 한 번 더 읽고/쓰는 명령 (5클럭) */
  memory: boolean;
}

export const OPS: OpInfo[] = [
  { code: 0x0, name: 'NOP', operand: 'none', memory: false },
  { code: 0x1, name: 'LDI', operand: 'value', memory: false },
  { code: 0x2, name: 'LDA', operand: 'addr', memory: true },
  { code: 0x3, name: 'STA', operand: 'addr', memory: true },
  { code: 0x4, name: 'ADD', operand: 'addr', memory: true },
  { code: 0x5, name: 'SUB', operand: 'addr', memory: true },
  { code: 0x6, name: 'AND', operand: 'addr', memory: true },
  { code: 0x7, name: 'OR', operand: 'addr', memory: true },
  { code: 0x8, name: 'NOT', operand: 'none', memory: false },
  { code: 0x9, name: 'JMP', operand: 'addr', memory: false },
  { code: 0xa, name: 'JZ', operand: 'addr', memory: false },
  { code: 0xb, name: 'JC', operand: 'addr', memory: false },
  { code: 0xc, name: 'JN', operand: 'addr', memory: false },
  { code: 0xd, name: 'IN', operand: 'none', memory: false },
  { code: 0xe, name: 'OUT', operand: 'none', memory: false },
  { code: 0xf, name: 'HALT', operand: 'none', memory: false },
];

const BY_NAME = new Map(OPS.map((o) => [o.name, o]));

// ================= 어셈블러 =================

export interface AsmError {
  line: number;
  /** i18n 키 (asm.*) */
  key: string;
  params?: Record<string, string | number>;
}

export interface AsmResult {
  /** 256바이트 메모리 이미지 */
  image: Uint8Array;
  /** 실제로 채운 주소들 */
  used: Set<number>;
  /** 프로그램 크기(바이트) = 채운 바이트 수 */
  size: number;
  /** 줄 번호(1부터) → 그 줄의 시작 주소 */
  lineAddr: Map<number, number>;
  errors: AsmError[];
}

function parseNumber(s: string): number | undefined {
  const t = s.trim().toLowerCase();
  if (/^-?\d+$/.test(t)) return Number(t);
  if (/^0x[0-9a-f]+$/.test(t)) return parseInt(t.slice(2), 16);
  if (/^0b[01]+$/.test(t)) return parseInt(t.slice(2), 2);
  if (/^\$[0-9a-f]+$/.test(t)) return parseInt(t.slice(1), 16);
  return undefined;
}

const LABEL_RE = /^[A-Za-z_][\w]*$/;

/**
 * 문법:
 *   ; 주석 (# 도 가능)
 *   loop:           라벨
 *   LDI 5           명령 + 피연산자 (10진수, 0x1F, 0b101, 라벨)
 *   .org 0x80       다음 바이트를 놓을 주소
 *   .db 1, 2, 0x30  데이터 바이트
 */
export function assemble(src: string): AsmResult {
  const image = new Uint8Array(256);
  const used = new Set<number>();
  const lineAddr = new Map<number, number>();
  const errors: AsmError[] = [];
  const labels = new Map<string, number>();
  const fixups: { addr: number; label: string; line: number }[] = [];
  let pc = 0;
  let overflow = false;

  const emit = (v: number, line: number) => {
    if (pc > 255) {
      if (!overflow) errors.push({ line, key: 'asm.overflow' });
      overflow = true;
      return;
    }
    image[pc] = v & 255;
    used.add(pc);
    pc++;
  };

  const lines = src.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = i + 1;
    let text = raw.replace(/[;#].*$/, '').trim();
    // 라벨 (여러 개 가능: a: b: NOP)
    let m: RegExpExecArray | null;
    while ((m = /^([A-Za-z_]\w*)\s*:/.exec(text))) {
      const name = m[1]!.toLowerCase();
      if (BY_NAME.has(name.toUpperCase())) {
        errors.push({ line, key: 'asm.labelReserved', params: { name: m[1]! } });
      } else if (labels.has(name)) errors.push({ line, key: 'asm.dupLabel', params: { name: m[1]! } });
      else labels.set(name, pc);
      text = text.slice(m[0].length).trim();
    }
    if (!text) return;
    lineAddr.set(line, pc);
    const [word, ...rest] = text.split(/\s+/);
    const arg = rest.join(' ').trim();
    const w = word!.toUpperCase();

    if (w === '.ORG') {
      const v = parseNumber(arg);
      if (v === undefined || v < 0 || v > 255) errors.push({ line, key: 'asm.range', params: { value: arg || '?' } });
      else {
        pc = v;
        lineAddr.set(line, pc);
      }
      return;
    }
    if (w === '.DB' || w === 'DB') {
      if (!arg) errors.push({ line, key: 'asm.operandMissing', params: { op: '.db' } });
      for (const part of arg.split(',').map((s) => s.trim()).filter(Boolean)) {
        const v = parseNumber(part);
        if (v === undefined) {
          if (LABEL_RE.test(part)) {
            fixups.push({ addr: pc, label: part.toLowerCase(), line });
            emit(0, line);
          } else errors.push({ line, key: 'asm.badNumber', params: { value: part } });
        } else if (v < -128 || v > 255) errors.push({ line, key: 'asm.range', params: { value: part } });
        else emit(v, line);
      }
      return;
    }

    const op = BY_NAME.get(w);
    if (!op) {
      errors.push({ line, key: 'asm.unknown', params: { word: word! } });
      return;
    }
    emit(op.code << 4, line);
    if (op.operand === 'none') {
      if (arg) errors.push({ line, key: 'asm.operandExtra', params: { op: op.name } });
      emit(0, line);
      return;
    }
    if (!arg) {
      errors.push({ line, key: 'asm.operandMissing', params: { op: op.name } });
      emit(0, line);
      return;
    }
    const v = parseNumber(arg);
    if (v !== undefined) {
      if (v < (op.operand === 'value' ? -128 : 0) || v > 255) errors.push({ line, key: 'asm.range', params: { value: arg } });
      emit(v, line);
    } else if (LABEL_RE.test(arg)) {
      fixups.push({ addr: pc, label: arg.toLowerCase(), line });
      emit(0, line);
    } else {
      errors.push({ line, key: 'asm.badNumber', params: { value: arg } });
      emit(0, line);
    }
  });

  for (const f of fixups) {
    const v = labels.get(f.label);
    if (v === undefined) errors.push({ line: f.line, key: 'asm.noLabel', params: { name: f.label } });
    else if (f.addr <= 255) image[f.addr] = v;
  }
  errors.sort((a, b) => a.line - b.line);
  return { image, used, size: used.size, lineAddr, errors };
}

/** 메모리의 한 명령을 사람이 읽을 수 있게 */
export function disassemble(mem: ArrayLike<number>, addr: number): string {
  const op = OPS[(mem[addr & 255]! >> 4) & 15]!;
  const arg = mem[(addr + 1) & 255]!;
  if (op.operand === 'none') return op.name;
  return `${op.name} ${op.operand === 'addr' ? `0x${arg.toString(16).toUpperCase().padStart(2, '0')}` : arg}`;
}

// ================= 기준 에뮬레이터 =================

export interface EmuResult {
  outs: number[];
  halted: boolean;
  /** 하드웨어 기준 클럭 수 (일반 명령 4클럭, 메모리 명령 5클럭, HALT는 4클럭째에 멈춤) */
  cycles: number;
  a: number;
  pc: number;
  mem: Uint8Array;
}

/** 하드웨어 CPU와 같은 동작을 명령 단위로 계산한다 (테스트 기대값 생성용) */
export function emulate(image: Uint8Array, input = 0, maxCycles = 20000): EmuResult {
  const mem = new Uint8Array(image);
  let pc = 0;
  let a = 0;
  let z = 0;
  let n = 0;
  let c = 0;
  let cycles = 0;
  const outs: number[] = [];
  const setA = (v: number, carry = 0) => {
    a = v & 255;
    z = a === 0 ? 1 : 0;
    n = a >> 7;
    c = carry;
  };
  while (cycles < maxCycles) {
    const op = (mem[pc]! >> 4) & 15;
    const arg = mem[(pc + 1) & 255]!;
    const info = OPS[op]!;
    if (op === 0xf) {
      cycles += 4;
      return { outs, halted: true, cycles, a, pc, mem };
    }
    cycles += info.memory ? 5 : 4;
    let next = (pc + 2) & 255;
    switch (op) {
      case 0x1: setA(arg); break;
      case 0x2: setA(mem[arg]!); break;
      case 0x3: mem[arg] = a; break;
      case 0x4: { const s = a + mem[arg]!; setA(s, s > 255 ? 1 : 0); break; }
      case 0x5: { const b = mem[arg]!; setA(a - b, a >= b ? 1 : 0); break; }
      case 0x6: setA(a & mem[arg]!); break;
      case 0x7: setA(a | mem[arg]!); break;
      case 0x8: setA(~a); break;
      case 0x9: next = arg; break;
      case 0xa: if (z) next = arg; break;
      case 0xb: if (c) next = arg; break;
      case 0xc: if (n) next = arg; break;
      case 0xd: setA(input); break;
      case 0xe: outs.push(a); break;
    }
    pc = next;
  }
  return { outs, halted: false, cycles, a, pc, mem };
}
