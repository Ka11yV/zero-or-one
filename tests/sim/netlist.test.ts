import { describe, expect, it } from 'vitest';
import { ChipBuilder, CompileError, compile, createLibrary, runTest, Simulator } from '../../src/sim';
import { lib, NOT } from './chips';

function compileError(fn: () => unknown): CompileError {
  try {
    fn();
  } catch (e) {
    if (e instanceof CompileError) return e;
    throw e;
  }
  throw new Error('CompileError가 발생하지 않음');
}

describe('넷리스트 컴파일', () => {
  const l = lib();

  it('출력끼리 연결하면 단락 오류', () => {
    const b = new ChipBuilder('SHORT', ['a', 'b'], ['out']);
    const n1 = b.add('NAND');
    const n2 = b.add('NAND');
    b.fan('a', `${n1}.a`, `${n1}.b`, `${n2}.a`).wire('b', `${n2}.b`);
    b.wire(`${n1}.out`, 'out').wire(`${n2}.out`, 'out');
    expect(compileError(() => compile(b.build(), l)).code).toBe('multiple-drivers');
  });

  it('입력 핀을 출력에 연결해도 단락', () => {
    const b = new ChipBuilder('SHORT2', ['a'], ['out']);
    const n = b.add('NOT');
    b.wire('a', `${n}.in`).wire(`${n}.out`, 'a').wire('a', 'out');
    expect(compileError(() => compile(b.build(), l)).code).toBe('multiple-drivers');
  });

  it('비트 폭 불일치', () => {
    const b = new ChipBuilder('W', ['x:4'], ['out']);
    const n = b.add('NOT');
    b.wire('x', `${n}.in`).wire(`${n}.out`, 'out');
    expect(compileError(() => compile(b.build(), l)).code).toBe('width-mismatch');
  });

  it('자기 자신을 포함하는 칩', () => {
    const b = new ChipBuilder('LOOP', ['a'], ['out']);
    const self = b.add('LOOP');
    b.wire('a', `${self}.a`).wire(`${self}.out`, 'out');
    const loop = b.build();
    expect(compileError(() => compile(loop, createLibrary([loop]))).code).toBe('recursive-chip');
  });

  it('간접 재귀(A→B→A)도 검출', () => {
    const a = new ChipBuilder('A', ['x'], ['y']);
    const ai = a.add('B');
    a.wire('x', `${ai}.x`).wire(`${ai}.y`, 'y');
    const b = new ChipBuilder('B', ['x'], ['y']);
    const bi = b.add('A');
    b.wire('x', `${bi}.x`).wire(`${bi}.y`, 'y');
    const A = a.build();
    expect(compileError(() => compile(A, createLibrary([A, b.build()]))).code).toBe('recursive-chip');
  });

  it('알 수 없는 칩 / 핀', () => {
    const b1 = new ChipBuilder('U', ['a'], ['out']);
    b1.add('NOPE');
    expect(compileError(() => compile(b1.build(), l)).code).toBe('unknown-chip');

    const b2 = new ChipBuilder('U2', ['a'], ['out']);
    const n = b2.add('NOT');
    b2.wire('a', `${n}.zzz`);
    expect(compileError(() => compile(b2.build(), l)).code).toBe('unknown-pin');
  });

  it('검증기는 컴파일 오류를 결과로 돌려준다 (예외 대신)', () => {
    const b = new ChipBuilder('W2', ['x:4'], ['out']);
    const n = b.add('NOT');
    b.wire('x', `${n}.in`).wire(`${n}.out`, 'out');
    const res = runTest(b.build(), l, { kind: 'truth', rows: [] });
    expect(res.pass).toBe(false);
    expect(res.error?.code).toBe('width-mismatch');
  });

  it('미연결 입력/출력은 경고 (미연결 입력 = 0)', () => {
    const b = new ChipBuilder('LOOSE', ['a'], ['out', 'extra']);
    const n = b.add('NAND');
    b.wire('a', `${n}.a`).wire(`${n}.out`, 'out');
    const nl = compile(b.build(), l);
    expect(nl.warnings).toEqual([
      { kind: 'undriven-input', path: `${n}.b` },
      { kind: 'unconnected-output', path: 'extra' },
    ]);
    const sim = new Simulator(nl);
    sim.setInput('a', 1);
    sim.settle();
    expect(sim.getOutput('out')).toBe(1); // NAND(1, 0)
  });

  it('같은 칩을 여러 번 써도 내부 넷은 독립적', () => {
    const b = new ChipBuilder('TWO_NOTS', ['a', 'b'], ['x', 'y']);
    const n1 = b.add('NOT');
    const n2 = b.add('NOT');
    b.wire('a', `${n1}.in`).wire('b', `${n2}.in`).wire(`${n1}.out`, 'x').wire(`${n2}.out`, 'y');
    const sim = new Simulator(compile(b.build(), l));
    sim.setInput('a', 1);
    sim.settle();
    expect([sim.getOutput('x'), sim.getOutput('y')]).toEqual([0, 1]);
  });

  it('칩 정의를 고치면 그 칩을 쓰는 상위 칩에 반영된다', () => {
    const broken = { ...NOT, wires: NOT.wires.slice(0, 1).concat(NOT.wires.slice(2)) }; // b 입력 미연결
    const l2 = createLibrary([broken]);
    const b = new ChipBuilder('USE', ['a'], ['out']);
    const n = b.add('NOT');
    b.wire('a', `${n}.in`).wire(`${n}.out`, 'out');
    const sim = new Simulator(compile(b.build(), l2));
    sim.setInput('a', 1);
    sim.settle();
    expect(sim.getOutput('out')).toBe(1); // NAND(1, 0)=1 — 고장난 NOT
  });

  it('내장 칩은 덮어쓸 수 없다', () => {
    expect(() => createLibrary([{ ...NOT, id: 'NAND' }])).toThrow();
  });
});

describe('시뮬레이터 단계 실행', () => {
  it('신호는 게이트 하나당 한 단계씩 전파된다', () => {
    const b = new ChipBuilder('CHAIN', ['a'], ['out']);
    const ids = [b.add('NOT'), b.add('NOT'), b.add('NOT')];
    b.wire('a', `${ids[0]}.in`)
      .wire(`${ids[0]}.out`, `${ids[1]}.in`)
      .wire(`${ids[1]}.out`, `${ids[2]}.in`)
      .wire(`${ids[2]}.out`, 'out');
    const sim = new Simulator(compile(b.build(), lib()));
    expect(sim.getOutput('out')).toBe(1);
    sim.setInput('a', 1);
    expect(sim.step()).toBe(1);
    expect(sim.getOutput('out')).toBe(1);
    sim.step();
    expect(sim.getOutput('out')).toBe(1);
    sim.step();
    expect(sim.getOutput('out')).toBe(0);
    expect(sim.busy).toBe(false);
  });
});
