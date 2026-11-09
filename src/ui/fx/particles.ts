// 화면 전체를 덮는 캔버스 파티클: 폭죽, 컨페티, 반짝이. 클릭은 아래로 통과한다.

export const reducedMotion = (): boolean => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  kind: 'spark' | 'paper' | 'star';
  rot: number;
  vr: number;
  gravity: number;
  drag: number;
  trail: { x: number; y: number }[];
}

export const FIREWORK_COLORS = ['#ffb547', '#3ddc84', '#5aa9ff', '#ff6b9a', '#ffe14d', '#b48cff', '#ffffff'];

let canvas: HTMLCanvasElement | null = null;
let g: CanvasRenderingContext2D | null = null;
let parts: Particle[] = [];
let raf = 0;
let last = 0;

function ensureCanvas(): CanvasRenderingContext2D | null {
  if (canvas && g) return g;
  canvas = document.createElement('canvas');
  canvas.className = 'fx-canvas';
  document.body.append(canvas);
  g = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
  return g;
}

function resize(): void {
  if (!canvas) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  g?.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function teardown(): void {
  cancelAnimationFrame(raf);
  raf = 0;
  window.removeEventListener('resize', resize);
  canvas?.remove();
  canvas = null;
  g = null;
}

function frame(now: number): void {
  const ctx = g;
  if (!ctx) return;
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  const alive: Particle[] = [];
  for (const p of parts) {
    p.life += dt;
    if (p.life >= p.max) continue;
    p.vx *= p.drag;
    p.vy = p.vy * p.drag + p.gravity * dt;
    if (p.kind === 'spark') {
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 5) p.trail.shift();
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    const fade = 1 - p.life / p.max;
    ctx.globalAlpha = Math.max(0, Math.min(1, fade * 1.4));
    ctx.fillStyle = p.color;
    ctx.strokeStyle = p.color;
    if (p.kind === 'spark') {
      ctx.lineWidth = p.size;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const t0 = p.trail[0] ?? p;
      ctx.moveTo(t0.x, t0.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    } else if (p.kind === 'paper') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.cos(p.rot * 2.3));
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    } else {
      drawStar(ctx, p.x, p.y, p.size * (0.6 + 0.4 * Math.sin(p.life * 18)), p.rot);
    }
    alive.push(p);
  }
  ctx.globalAlpha = 1;
  parts = alive;
  if (parts.length) raf = requestAnimationFrame(frame);
  else teardown();
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number): void {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = rot + (i * Math.PI) / 4;
    const rr = i % 2 ? r * 0.3 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function add(ps: Particle[]): void {
  if (reducedMotion() || !ensureCanvas()) return;
  parts.push(...ps);
  if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
}

const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;

/** 폭죽 한 발: (x, y)에서 사방으로 */
export function burst(x: number, y: number, opts: { count?: number; power?: number; colors?: readonly string[] } = {}): void {
  const count = opts.count ?? 70;
  const power = opts.power ?? 420;
  const colors = opts.colors ?? FIREWORK_COLORS;
  const base = pick(colors);
  const ps: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.2;
    const s = power * (0.45 + Math.random() * 0.55);
    ps.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 0,
      max: 0.9 + Math.random() * 0.7,
      color: Math.random() < 0.6 ? base : pick(colors),
      size: 2 + Math.random() * 1.6,
      kind: 'spark',
      rot: 0,
      vr: 0,
      gravity: 260,
      drag: 0.965,
      trail: [],
    });
  }
  add(ps);
}

/** 위에서 쏟아지는 컨페티 */
export function confetti(count = 160): void {
  const w = window.innerWidth;
  const ps: Particle[] = [];
  for (let i = 0; i < count; i++) {
    ps.push({
      x: Math.random() * w,
      y: -20 - Math.random() * 200,
      vx: (Math.random() - 0.5) * 160,
      vy: 120 + Math.random() * 180,
      life: 0,
      max: 3 + Math.random() * 1.5,
      color: pick(FIREWORK_COLORS),
      size: 7 + Math.random() * 6,
      kind: 'paper',
      rot: Math.random() * 6,
      vr: (Math.random() - 0.5) * 10,
      gravity: 60,
      drag: 0.995,
      trail: [],
    });
  }
  add(ps);
}

/** 사각형 주변 반짝이 */
export function sparkle(r: { left: number; top: number; width: number; height: number }, count = 24, color = '#ffe9a8'): void {
  const ps: Particle[] = [];
  for (let i = 0; i < count; i++) {
    ps.push({
      x: r.left + Math.random() * r.width,
      y: r.top + Math.random() * r.height,
      vx: (Math.random() - 0.5) * 40,
      vy: -20 - Math.random() * 40,
      life: 0,
      max: 0.6 + Math.random() * 0.9,
      color,
      size: 3 + Math.random() * 4,
      kind: 'star',
      rot: Math.random() * 3,
      vr: (Math.random() - 0.5) * 4,
      gravity: 0,
      drag: 0.98,
      trail: [],
    });
  }
  add(ps);
}

/** 요소 가운데에서 폭죽 */
export function burstAt(el: Element, opts?: Parameters<typeof burst>[2]): void {
  const r = el.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, opts);
}

/** 화면 여기저기 폭죽 n발 (간격 ms) */
export function fireworksShow(shots: number, gapMs = 260, onShot?: (i: number) => void): void {
  for (let i = 0; i < shots; i++) {
    setTimeout(() => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      burst(w * (0.15 + Math.random() * 0.7), h * (0.15 + Math.random() * 0.35), { count: 80 + Math.floor(Math.random() * 40), power: 380 + Math.random() * 200 });
      onShot?.(i);
    }, i * gapMs);
  }
}

export function clearParticles(): void {
  parts = [];
  teardown();
}
