// 거의 맞았을 때 코칭 (순수 함수): 테스트 결과에서 흔한 실수 패턴을 찾아 "왜 틀렸는지" 알려 준다.
// 레벨이 패턴별 맞춤 문구(coach)를 주면 그것을, 없으면 일반 문구를 쓴다.
import type { PinDef, VerifyResult } from '../sim';

export type CoachKind =
  /** 모든 줄에서 출력이 정확히 반대 (비트 전부 뒤집힘) */
  | 'inverted'
  /** 모든 줄에서 출력이 정답보다 k만큼 큼(+)/작음(−) (2^폭으로 돌아감) */
  | 'offset'
  /** 정답은 바뀌는데 출력은 늘 같은 값 */
  | 'constant'
  /** 출력이 어떤 입력과 늘 같음 (입력을 그냥 이어 놓음) */
  | 'passthrough'
  /** 두 출력이 서로 바뀜 */
  | 'swapped'
  /** 대부분 맞고, 틀린 줄은 모두 어떤 입력 비트가 같은 값일 때 */
  | 'condition';

export interface Coaching {
  kind: CoachKind;
  /** 문제가 보이는 출력 핀 */
  pin: string;
  /** offset: 차이 (정답 + k = 내 출력) */
  k?: number;
  /** constant: 늘 나오는 값 */
  value?: number;
  /** passthrough: 그대로 나오는 입력, swapped: 바뀐 상대 출력 */
  other?: string;
  /** condition: 틀린 줄의 공통 조건 — 핀 값 전체(value) 또는 다비트 핀의 한 비트(bit) */
  cond?: { pin: string; bit?: number; value: number };
}

const mask = (w: number) => (w >= 31 ? 0x7fffffff : (1 << w) - 1);

/** 테스트 결과 → 가장 그럴듯한 코칭 하나 (없으면 null) */
export function diagnose(result: VerifyResult, pins: { inputs: PinDef[]; outputs: PinDef[] }): Coaching | null {
  if (result.pass || result.error) return null;
  const rows = result.rows.filter((r) => !r.oscillated);
  if (rows.length < 2) return null;
  const width = new Map([...pins.inputs, ...pins.outputs].map((p) => [p.name, p.width]));

  // 출력별로 (정답, 내 출력) 쌍 — 그 출력을 검사하는 줄만
  const pairsOf = (name: string) => rows.filter((r) => name in r.expected && name in r.actual).map((r) => ({ r, e: r.expected[name]!, a: r.actual[name]! }));
  const failingOutputs = pins.outputs.filter((p) => pairsOf(p.name).some((x) => x.e !== x.a));

  // 두 출력이 서로 바뀜 (예: sum과 carry)
  for (const p of failingOutputs) {
    for (const q of pins.outputs) {
      if (q.name === p.name || q.width !== p.width) continue;
      const ps = rows.filter((r) => p.name in r.expected && q.name in r.expected && p.name in r.actual && q.name in r.actual);
      if (ps.length >= 2 && ps.every((r) => r.actual[p.name] === r.expected[q.name] && r.actual[q.name] === r.expected[p.name])) {
        return { kind: 'swapped', pin: p.name, other: q.name };
      }
    }
  }

  for (const p of failingOutputs) {
    const ps = pairsOf(p.name);
    if (ps.length < 2) continue;
    const m = mask(p.width);
    const expVaries = new Set(ps.map((x) => x.e)).size > 1;
    // 늘 같은 값 (연결이 빠졌거나 상수에 묶임)
    if (expVaries && new Set(ps.map((x) => x.a)).size === 1) return { kind: 'constant', pin: p.name, value: ps[0]!.a };
    // 비트가 전부 반대
    if (ps.every((x) => x.a === (~x.e & m))) return { kind: 'inverted', pin: p.name };
    // 일정한 차이 (다비트만: 1비트에서는 반대와 같아짐)
    if (p.width > 1) {
      const d = (ps[0]!.a - ps[0]!.e) & m;
      if (d !== 0 && ps.every((x) => ((x.a - x.e) & m) === d)) {
        const k = d > m / 2 ? d - (m + 1) : d;
        return { kind: 'offset', pin: p.name, k };
      }
    }
    // 입력을 그대로 이어 놓음
    for (const i of pins.inputs) {
      if (i.width !== p.width) continue;
      if (ps.every((x) => x.r.inputs[i.name] === x.a)) return { kind: 'passthrough', pin: p.name, other: i.name };
    }
  }

  // 대부분 맞음: 틀린 줄에만 공통인 입력 조건 찾기
  const bad = rows.filter((r) => !r.ok);
  const good = rows.filter((r) => r.ok);
  if (bad.length && good.length && bad.length <= rows.length / 2) {
    const pin = failingOutputs[0]?.name ?? pins.outputs[0]?.name ?? '';
    for (const i of pins.inputs) {
      const w = width.get(i.name) ?? 1;
      // 핀 값 전체가 같을 때만 틀림 (예: b = 0일 때만)
      const whole = (r: (typeof rows)[number]) => r.inputs[i.name] ?? 0;
      const wv = whole(bad[0]!);
      if (w > 1 && bad.every((r) => whole(r) === wv) && !good.some((r) => whole(r) === wv)) {
        return { kind: 'condition', pin, cond: { pin: i.name, value: wv } };
      }
      for (let bit = 0; bit < w; bit++) {
        const val = (r: (typeof rows)[number]) => ((r.inputs[i.name] ?? 0) >> bit) & 1;
        const v = val(bad[0]!);
        // 틀린 줄은 모두 이 값이고, 이 값인데 맞은 줄은 없음 → 이 조건에서만 틀림
        if (bad.every((r) => val(r) === v) && !good.some((r) => val(r) === v)) {
          return { kind: 'condition', pin, cond: { pin: i.name, ...(w > 1 ? { bit } : {}), value: v } };
        }
      }
    }
  }
  return null;
}

/** 레벨 맞춤 문구를 고르는 키 (구체적인 것부터): offset+1, condition:b=0, inverted@lt … */
export function coachKeys(c: Coaching): string[] {
  const base =
    c.kind === 'offset'
      ? `offset${c.k! > 0 ? '+' : ''}${c.k}`
      : c.kind === 'condition' && c.cond
        ? `condition:${c.cond.pin}${c.cond.bit !== undefined ? `.${c.cond.bit}` : ''}=${c.cond.value}`
        : c.kind;
  return [`${base}@${c.pin}`, base, `${c.kind}@${c.pin}`, c.kind];
}

/** 레벨 맞춤 문구 (없으면 undefined → 일반 문구) */
export function levelCoachText(c: Coaching, coach: Record<string, string> | undefined): string | undefined {
  if (!coach) return undefined;
  for (const k of coachKeys(c)) if (coach[k]) return coach[k];
  return undefined;
}
