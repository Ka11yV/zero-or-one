// 효과음: 파일 없이 WebAudio로 합성한다. 음소거 설정은 진행 기록과 별개 키에 저장.
const KEY = 'logic-game:sound';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = (() => {
  try {
    return globalThis.localStorage?.getItem(KEY) === 'off';
  } catch {
    return false;
  }
})();
const listeners = new Set<(m: boolean) => void>();

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  try {
    globalThis.localStorage?.setItem(KEY, m ? 'off' : 'on');
  } catch {
    /* 저장 불가 — 이번 세션에만 적용 */
  }
  for (const f of listeners) f(m);
}

export function onMuteChange(f: (m: boolean) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (muted) return null;
  try {
    if (!ctx) {
      const AC = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return { ctx, out: master! };
  } catch {
    return null;
  }
}

/** 음 하나: 주파수, 시작(초 뒤), 길이, 파형, 크기 */
function tone(freq: number, at: number, dur: number, type: OscillatorType = 'triangle', vol = 0.5, slideTo?: number): void {
  const a = audio();
  if (!a) return;
  const t0 = a.ctx.currentTime + at;
  const osc = a.ctx.createOscillator();
  const g = a.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** 짧은 잡음(폭죽 터지는 소리) */
function noise(at: number, dur: number, vol = 0.4, cutoff = 1800): void {
  const a = audio();
  if (!a) return;
  const t0 = a.ctx.currentTime + at;
  const len = Math.floor(a.ctx.sampleRate * dur);
  const buf = a.ctx.createBuffer(1, len, a.ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = a.ctx.createBufferSource();
  src.buffer = buf;
  const f = a.ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  const g = a.ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(a.out);
  src.start(t0);
}

const NOTE = (n: number) => 440 * 2 ** ((n - 69) / 12);

export const sfx = {
  /** 클리어 도장 */
  pop(): void {
    noise(0, 0.25, 0.5, 2400);
    tone(NOTE(72), 0, 0.18, 'square', 0.18, NOTE(84));
  },
  /** 별 i번째 (0, 1, 2): 도 → 미 → 솔 */
  star(i: number): void {
    const n = [76, 80, 83][i] ?? 83;
    tone(NOTE(n), 0, 0.35, 'triangle', 0.45);
    tone(NOTE(n + 12), 0.02, 0.25, 'sine', 0.2);
  },
  /** 폭죽 한 발 */
  boom(delay = 0): void {
    noise(delay, 0.5, 0.35, 900);
  },
  /** ★★★ / 챕터 완료 팡파르 */
  fanfare(): void {
    const seq: [number, number, number][] = [
      [72, 0, 0.18],
      [76, 0.14, 0.18],
      [79, 0.28, 0.18],
      [84, 0.42, 0.55],
    ];
    for (const [n, at, d] of seq) {
      tone(NOTE(n), at, d, 'square', 0.16);
      tone(NOTE(n - 12), at, d, 'triangle', 0.25);
    }
  },
  /** 새 칩 해금: 올라가는 스윕 + 화음 */
  unlock(): void {
    tone(180, 0, 0.9, 'sawtooth', 0.12, 1400);
    for (const [n, at] of [
      [72, 0.75],
      [76, 0.78],
      [79, 0.81],
      [84, 0.84],
    ] as const) {
      tone(NOTE(n), at, 1.2, 'triangle', 0.22);
    }
    noise(0.75, 0.6, 0.25, 3000);
  },
  /** 카운트업 틱 */
  tick(): void {
    tone(NOTE(96), 0, 0.03, 'square', 0.05);
  },
  /** 엔딩 탑이 한 층 올라갈 때 */
  rise(i: number): void {
    tone(NOTE(60 + i * 2), 0, 0.3, 'triangle', 0.3);
  },
};
