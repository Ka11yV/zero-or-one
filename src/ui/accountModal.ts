// 계정: 맵 상단 버튼 + 소셜 로그인 창(게임 세계관: 진리표를 도는 NAND 회로) + 계정 창
import { getLang, t } from '../i18n';
import { api, ApiError, type ProviderId, type User } from '../net/api';
import type { SyncController, SyncState } from '../storage/sync';
import { button, h } from './dom';
import { openModal } from './modal';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(tag: string, attrs: Record<string, string>, ...children: Element[]): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...children);
  return el;
}

/** 사진이 없으면 이름 첫 글자 */
function avatar(user: Pick<User, 'name' | 'avatarUrl'>, size: number): HTMLElement {
  const wrap = h('span', { class: 'avatar', style: `--size:${size}px`, 'aria-hidden': 'true' });
  const initial = () => {
    wrap.textContent = [...user.name.trim()][0]?.toUpperCase() ?? '?';
  };
  if (user.avatarUrl) {
    const img = h('img', { src: user.avatarUrl, alt: '', referrerpolicy: 'no-referrer', width: String(size), height: String(size) });
    img.onerror = () => {
      img.remove();
      initial();
    };
    wrap.append(img);
  } else initial();
  return wrap;
}

/** 맵 툴바용 버튼: 상태가 바뀌면 스스로 갱신 */
export function accountButton(sync: SyncController): HTMLButtonElement {
  const b = h('button', { type: 'button', class: 'btn account-btn' });
  b.onclick = () => (sync.state().user ? openAccount(sync) : openLogin());
  const paint = (s: SyncState) => {
    b.textContent = '';
    b.dataset.status = s.status;
    if (s.user) {
      b.append(avatar(s.user, 20), h('span', { class: 'account-name' }, s.user.name), h('span', { class: 'status-dot', 'aria-hidden': 'true' }));
      b.title = t(`account.status.${s.status}`);
    } else {
      b.classList.add('guest');
      b.append(h('span', { class: 'login-glyph', 'aria-hidden': 'true' }, '⏻'), h('span', {}, t('account.login')));
      b.title = t('account.loginHint');
    }
    b.classList.toggle('guest', !s.user);
  };
  paint(sync.state());
  const off = sync.onState((s) => {
    if (!b.isConnected) return off();
    paint(s);
  });
  return b;
}

/** 화면 위쪽에 잠깐 뜨는 알림 (맵에는 작업 화면 토스트가 없어서) */
export function flash(msg: string, kind: 'success' | 'error' = 'success'): void {
  const el = h('div', { class: `toast show ${kind} global-toast`, role: 'status' }, msg);
  document.body.append(el);
  setTimeout(() => el.classList.remove('show'), 2600);
  setTimeout(() => el.remove(), 3000);
}

// ---------- 로그인 창 ----------

const GOOGLE_G = [
  ['#EA4335', 'M9 3.48c1.69 0 2.83.73 3.48 1.34l2.54-2.48C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l2.91 2.26C4.6 5.05 6.62 3.48 9 3.48z'],
  ['#4285F4', 'M17.64 9.2c0-.74-.06-1.28-.19-1.84H9v3.34h4.96c-.1.83-.64 2.08-1.84 2.92l2.84 2.2c1.7-1.57 2.68-3.88 2.68-6.62z'],
  ['#FBBC05', 'M3.88 10.78A5.54 5.54 0 0 1 3.58 9c0-.62.11-1.22.29-1.78L.96 4.96A9.008 9.008 0 0 0 0 9c0 1.45.35 2.82.96 4.04l2.92-2.26z'],
  ['#34A853', 'M9 18c2.43 0 4.47-.8 5.96-2.18l-2.84-2.2c-.76.53-1.78.9-3.12.9-2.38 0-4.4-1.57-5.12-3.74L.97 13.04C2.45 15.98 5.48 18 9 18z'],
];
const GITHUB_MARK =
  'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z';

function providerIcon(p: ProviderId): Element {
  if (p === 'google') return svg('svg', { viewBox: '0 0 18 18', width: '20', height: '20', 'aria-hidden': 'true' }, ...GOOGLE_G.map(([fill, d]) => svg('path', { fill: fill!, d: d! })));
  if (p === 'github') return svg('svg', { viewBox: '0 0 16 16', width: '20', height: '20', 'aria-hidden': 'true' }, svg('path', { fill: 'currentColor', d: GITHUB_MARK }));
  return h('span', { 'aria-hidden': 'true' }, '🧪');
}

/** 진리표를 한 줄씩 도는 NAND 회로 그림. stop()으로 멈춤 */
function nandDemo(): { el: HTMLElement; stop(): void } {
  const wire = (d: string, cls: string) => svg('path', { d, class: `w ${cls}` });
  const wa = wire('M30 50 H96', 'wa');
  const wb = wire('M30 110 H96', 'wb');
  const wo = wire('M176 80 H240', 'wo');
  const sw = (y: number, cls: string) => svg('g', { class: `sw ${cls}` }, svg('rect', { x: '6', y: String(y - 14), width: '28', height: '28', rx: '6' }), svg('text', { x: '20', y: String(y + 5) }, ));
  const swA = sw(50, 'sa');
  const swB = sw(110, 'sb');
  const gate = svg(
    'g',
    { class: 'gate' },
    svg('path', { d: 'M96 34 H136 A46 46 0 0 1 136 126 H96 Z' }),
    svg('circle', { cx: '188', cy: '80', r: '7', class: 'bubble' }),
    svg('text', { x: '128', y: '86', class: 'gate-label' }),
  );
  gate.querySelector('.gate-label')!.textContent = 'NAND';
  const lamp = svg('g', { class: 'lamp' }, svg('circle', { cx: '254', cy: '80', r: '16' }), svg('text', { x: '254', y: '86' }));
  const pcb = svg('g', { class: 'traces' }, ...['M0 14 H70 L84 2 H160', 'M200 152 H250 L268 134 H290', 'M0 146 H40 L52 158', 'M220 8 H290', 'M150 158 L162 146 H196'].map((d) => svg('path', { d })));
  const art = svg('svg', { viewBox: '0 0 290 160', class: 'nand-demo', role: 'img', 'aria-label': 'NAND' }, pcb, wa, wb, wo, gate, swA, swB, lamp);
  const row = h('div', { class: 'truth-row' });
  const rows = [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ] as const;
  const cells = rows.map(([a, b]) => h('span', { class: 'tt' }, `${a}${b}→${a & b ? 0 : 1}`));
  row.append(...cells);
  let i = 0;
  const step = () => {
    const [a, b] = rows[i % 4]!;
    const o = a & b ? 0 : 1;
    swA.querySelector('text')!.textContent = String(a);
    swB.querySelector('text')!.textContent = String(b);
    lamp.querySelector('text')!.textContent = String(o);
    art.classList.toggle('a1', a === 1);
    art.classList.toggle('b1', b === 1);
    art.classList.toggle('o1', o === 1);
    cells.forEach((c, k) => c.classList.toggle('on', k === i % 4));
    i++;
  };
  step();
  const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const timer = reduce ? undefined : setInterval(step, 1100);
  // 배경에 흐르는 0과 1
  const rain = h('div', { class: 'bit-rain', 'aria-hidden': 'true' });
  for (let c = 0; c < 14; c++) {
    const col = h('span', { style: `left:${c * 7.3 + 1}%;animation-delay:${(-c * 0.83) % 6}s;animation-duration:${5 + ((c * 1.7) % 4)}s` });
    col.textContent = Array.from({ length: 18 }, (_, k) => ((c * 7 + k * 3) % 5 < 2 ? '1' : '0')).join('\n');
    rain.append(col);
  }
  const el = h('div', { class: 'auth-hero' }, rain, h('div', { class: 'hero-mark' }, h('span', { class: 'z' }, '0'), h('span', { class: 'or' }, 'or'), h('span', { class: 'o' }, '1')), art, row);
  return { el, stop: () => clearInterval(timer) };
}

/** 소셜 로그인 창. error: 로그인에서 돌아왔는데 실패한 경우 */
export function openLogin(opts: { error?: string } = {}): void {
  const demo = nandDemo();
  const buttons = h('div', { class: 'provider-list' }, h('div', { class: 'provider-skeleton' }), h('div', { class: 'provider-skeleton' }));
  const msg = h('p', { class: 'auth-msg', role: 'alert' }, opts.error ?? '');
  const later = h('button', { type: 'button', class: 'link-btn' }, t('account.later'));
  const perks = h(
    'ul',
    { class: 'perks' },
    ...[
      ['☁', t('account.perk.cloud')],
      ['⇄', t('account.perk.merge')],
      ['▣', t('account.perk.devices')],
    ].map(([icon, text]) => h('li', {}, h('span', { class: 'perk-icon', 'aria-hidden': 'true' }, icon!), h('span', {}, text!))),
  );
  const panel = h(
    'div',
    { class: 'auth-panel' },
    h('p', { class: 'auth-kicker' }, '> CONNECT'),
    h('h2', { id: 'auth-title' }, t('account.loginTitle')),
    h('p', { class: 'auth-sub' }, t('account.loginSub')),
    buttons,
    msg,
    perks,
    h('p', { class: 'auth-foot' }, t('account.guestNote'), ' ', later),
  );
  const content = h('div', { class: 'auth' }, demo.el, panel);
  const m = openModal(content, { onClose: demo.stop });
  m.el.classList.add('auth-modal');
  m.el.setAttribute('aria-labelledby', 'auth-title');
  later.onclick = () => m.close();

  const go = (p: ProviderId, b: HTMLButtonElement) => {
    b.classList.add('busy');
    for (const x of buttons.querySelectorAll('button')) x.disabled = true;
    location.href = api.loginUrl(p, location.pathname + location.search.replace(/[?&]auth=\w+/, '') + location.hash);
  };
  api
    .providers()
    .then((ps) => {
      buttons.textContent = '';
      if (!ps.length) msg.textContent = t('account.err.noProviders');
      // 운영 제공자 먼저, 개발용은 마지막
      const order: ProviderId[] = ['google', 'github', 'dev'];
      for (const p of order.filter((x) => ps.includes(x))) {
        const b = h('button', { type: 'button', class: `provider-btn ${p}` }, providerIcon(p), h('span', {}, t(`account.with.${p}`)));
        b.onclick = () => go(p, b);
        buttons.append(b);
      }
      (buttons.querySelector('button') as HTMLButtonElement | null)?.focus();
    })
    .catch((e: unknown) => {
      buttons.textContent = '';
      msg.textContent = e instanceof ApiError && e.code !== 'network' ? t('account.err.error') : t('account.err.network');
    });
}

// ---------- 계정 창 ----------

export function openAccount(sync: SyncController): void {
  const user = sync.state().user;
  if (!user) return openLogin();
  const statusEl = h('div', { class: 'sync-pill' });
  const paint = (s: SyncState) => {
    statusEl.dataset.status = s.status;
    statusEl.textContent = '';
    const when = s.syncedAt ? t('account.lastSync', { time: new Date(s.syncedAt).toLocaleTimeString(getLang() === 'ko' ? 'ko-KR' : 'en-US', { hour: '2-digit', minute: '2-digit' }) }) : '';
    statusEl.append(h('span', { class: 'status-dot' }), h('span', {}, t(`account.status.${s.status}`)), when ? h('span', { class: 'muted' }, ` · ${when}`) : '');
  };
  paint(sync.state());
  const off = sync.onState(paint);

  const providerBadges = h(
    'div',
    { class: 'provider-badges' },
    ...user.providers.filter((p): p is ProviderId => p === 'google' || p === 'github' || p === 'dev').map((p) => h('span', { class: `provider-badge ${p}` }, providerIcon(p), t(`account.via.${p}`))),
  );

  // 계정 삭제: 한 번 더 확인
  const danger = h('div', { class: 'danger-zone' });
  const showDelete = () => {
    danger.textContent = '';
    const confirmBtn = button(
      t('account.deleteConfirm'),
      async () => {
        confirmBtn.disabled = true;
        try {
          await sync.deleteAccount();
          m.close();
          flash(t('account.deleted'));
        } catch {
          confirmBtn.disabled = false;
          danger.append(h('p', { class: 'auth-msg' }, t('account.err.error')));
        }
      },
      'danger',
    );
    danger.append(h('p', {}, t('account.deleteWarn')), h('div', { class: 'actions' }, button(t('common.cancel'), resetDanger, 'ghost'), confirmBtn));
  };
  const resetDanger = () => {
    danger.textContent = '';
    const b = h('button', { type: 'button', class: 'link-btn danger-link' }, t('account.delete'));
    b.onclick = showDelete;
    danger.append(b);
  };
  resetDanger();

  const content = h(
    'div',
    { class: 'account-card' },
    h('div', { class: 'account-head' }, avatar(user, 64), h('div', {}, h('h2', {}, user.name), providerBadges)),
    statusEl,
    h('p', { class: 'muted small' }, t('account.syncInfo')),
    h(
      'div',
      { class: 'actions' },
      button(
        t('account.logout'),
        async () => {
          await sync.logout();
          m.close();
          flash(t('account.loggedOut'));
        },
        'ghost',
      ),
      button(`⟳ ${t('account.syncNow')}`, () => void sync.syncNow()),
      button(t('common.close'), () => m.close(), 'primary'),
    ),
    danger,
  );
  const m = openModal(content, { onClose: off });
  m.el.classList.add('account-modal');
}
