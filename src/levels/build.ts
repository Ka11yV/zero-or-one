// 참조 정답 회로를 짧게 쓰기 위한 도우미 (테스트 전용 — 플레이어에게는 보이지 않는다)
import type { ChipBuilder } from '../sim';

export class Wiring {
  private c0?: string;
  private c1?: string;
  constructor(readonly b: ChipBuilder) {}

  zero(): string {
    return (this.c0 ??= `${this.b.add('CONST0')}.out`);
  }
  one(): string {
    return (this.c1 ??= `${this.b.add('CONST1')}.out`);
  }

  gate(chip: 'AND' | 'OR' | 'XOR' | 'NAND' | 'NOR', x: string, y: string): string {
    const g = this.b.add(chip);
    this.b.wire(x, `${g}.a`).wire(y, `${g}.b`);
    return `${g}.out`;
  }
  not(x: string): string {
    const g = this.b.add('NOT');
    this.b.wire(x, `${g}.in`);
    return `${g}.out`;
  }
  and(...xs: string[]): string {
    return this.tree('AND', xs);
  }
  or(...xs: string[]): string {
    return this.tree('OR', xs);
  }
  private tree(chip: 'AND' | 'OR', xs: string[]): string {
    if (!xs.length) return chip === 'AND' ? this.one() : this.zero();
    let level = xs;
    while (level.length > 1) {
      const next: string[] = [];
      for (let i = 0; i < level.length; i += 2) next.push(i + 1 < level.length ? this.gate(chip, level[i]!, level[i + 1]!) : level[i]!);
      level = next;
    }
    return level[0]!;
  }
  mux(a: string, b: string, sel: string): string {
    const m = this.b.add('MUX');
    this.b.wire(a, `${m}.a`).wire(b, `${m}.b`).wire(sel, `${m}.sel`);
    return `${m}.out`;
  }

  /** 다비트 신호 → 비트 참조들 (LSB 먼저) */
  split(src: string, width: number): string[] {
    const s = this.b.add(`SPLIT${width}`);
    this.b.wire(src, `${s}.in`);
    return Array.from({ length: width }, (_, i) => `${s}.b${i}`);
  }
  /** 비트 참조들(LSB 먼저) → 다비트 신호 */
  merge(bits: string[]): string {
    const m = this.b.add(`MERGE${bits.length}`);
    bits.forEach((x, i) => this.b.wire(x, `${m}.b${i}`));
    return `${m}.out`;
  }
  /** 상수 다비트 값 */
  constant(value: number, width: number): string {
    return this.merge(Array.from({ length: width }, (_, i) => ((value >> i) & 1 ? this.one() : this.zero())));
  }

  /** 칩 하나를 놓고 입력을 연결한 뒤, 출력 핀 이름 → 참조 */
  chip(id: string, inputs: Record<string, string>): (pin: string) => string {
    const u = this.b.add(id);
    for (const [p, src] of Object.entries(inputs)) this.b.wire(src, `${u}.${p}`);
    return (p) => `${u}.${p}`;
  }
}
