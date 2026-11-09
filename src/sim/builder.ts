import { SELF, type ChipId, type CompositeChipDef, type Instance, type PinDef, type PinRef, type Wire } from './types';

/** 'a' → {name:'a', width:1}, 'x:8' → {name:'x', width:8} */
export function pin(spec: string): PinDef {
  const [name, w] = spec.split(':');
  return { name: name!, width: w ? Number(w) : 1 };
}

/**
 * 코드로 회로를 만드는 도우미 (테스트·레벨 참조 정답용).
 *
 * 핀 참조 문법: 'uid.pin' = 인스턴스의 핀, 'pin'(점 없음) = 이 칩 자신의 외부 핀.
 *
 * ```ts
 * const b = new ChipBuilder('NOT', ['in'], ['out']);
 * const n = b.add('NAND');
 * b.wire('in', `${n}.a`).wire('in', `${n}.b`).wire(`${n}.out`, 'out');
 * const NOT = b.build();
 * ```
 */
export class ChipBuilder {
  private readonly instances: Instance[] = [];
  private readonly wires: Wire[] = [];
  private counter = 0;

  constructor(
    private readonly id: ChipId,
    private readonly inputs: string[],
    private readonly outputs: string[],
  ) {}

  /** 칩을 배치하고 uid를 돌려준다. */
  add(chip: ChipId, uid?: string): string {
    const id = uid ?? `${chip.toLowerCase()}${this.counter++}`;
    this.instances.push({ uid: id, chip });
    return id;
  }

  wire(from: string, to: string): this {
    this.wires.push({ from: ref(from), to: ref(to) });
    return this;
  }

  /** 한 출처를 여러 목적지에 연결 */
  fan(from: string, ...to: string[]): this {
    for (const t of to) this.wire(from, t);
    return this;
  }

  build(): CompositeChipDef {
    return {
      id: this.id,
      kind: 'composite',
      inputs: this.inputs.map(pin),
      outputs: this.outputs.map(pin),
      instances: [...this.instances],
      wires: [...this.wires],
    };
  }
}

function ref(s: string): PinRef {
  const dot = s.indexOf('.');
  return dot < 0 ? { inst: SELF, pin: s } : { inst: s.slice(0, dot), pin: s.slice(dot + 1) };
}
