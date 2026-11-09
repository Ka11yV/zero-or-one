import { describe, expect, it } from 'vitest';
import { assemble, disassemble, emulate } from '../../src/cpu/isa';

describe('어셈블러', () => {
  it('명령은 2바이트: [opcode << 4] [피연산자], 라벨은 주소로 바뀐다', () => {
    const r = assemble('start: LDI 5\n  ADD data ; 주석\nJMP start\ndata: .db 7, 0x10, 0b11\n');
    expect(r.errors).toEqual([]);
    expect([...r.image.slice(0, 9)]).toEqual([0x10, 5, 0x40, 6, 0x90, 0, 7, 16, 3]);
    expect(r.size).toBe(9);
    expect(r.lineAddr.get(3)).toBe(4);
  });

  it('.org로 위치를 옮기고, 피연산자 없는 명령은 0을 채운다', () => {
    const r = assemble('OUT\n.org 0x80\n.db 42\n');
    expect([...r.image.slice(0, 2)]).toEqual([0xe0, 0]);
    expect(r.image[0x80]).toBe(42);
    expect([...r.used].sort((a, b) => a - b)).toEqual([0, 1, 0x80]);
  });

  it('오류는 줄 번호와 함께 알려 준다', () => {
    const r = assemble('LDX 1\nLDA\nOUT 3\nJMP nowhere\nLDI 300\nx: NOP\nx: NOP\n');
    expect(r.errors.map((e) => [e.line, e.key])).toEqual([
      [1, 'asm.unknown'],
      [2, 'asm.operandMissing'],
      [3, 'asm.operandExtra'],
      [4, 'asm.noLabel'],
      [5, 'asm.range'],
      [7, 'asm.dupLabel'],
    ]);
  });

  it('대소문자를 가리지 않는다', () => {
    expect(assemble('ldi 1\nLoop: jmp loop').errors).toEqual([]);
  });

  it('역어셈블', () => {
    const r = assemble('LDA 0x80\nHALT');
    expect(disassemble(r.image, 0)).toBe('LDA 0x80');
    expect(disassemble(r.image, 2)).toBe('HALT');
  });
});

describe('기준 에뮬레이터', () => {
  it('플래그: SUB의 c는 a ≥ b, NOT 후 n', () => {
    const r = emulate(assemble('LDI 5\nSUB six\nJC bad\nJN neg\nbad: HALT\nneg: OUT\nHALT\nsix: .db 6').image);
    expect(r.outs).toEqual([255]);
    expect(r.halted).toBe(true);
  });

  it('클럭 수: 일반 명령 4, 메모리 명령 5, HALT 4', () => {
    expect(emulate(assemble('LDI 1\nHALT').image).cycles).toBe(8);
    expect(emulate(assemble('LDA 0x80\nHALT').image).cycles).toBe(9);
  });

  it('멈추지 않는 프로그램은 maxCycles에서 끊는다', () => {
    const r = emulate(assemble('l: JMP l').image, 0, 100);
    expect(r.halted).toBe(false);
    expect(r.cycles).toBeGreaterThanOrEqual(100);
  });
});
