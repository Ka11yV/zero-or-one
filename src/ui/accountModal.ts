// 계정: 맵 상단 버튼 + 로그인/가입 창 + 계정 창(동기화 상태·로그아웃)
import { t } from '../i18n';
import { ApiError } from '../net/api';
import type { SyncController, SyncState } from '../storage/sync';
import { button, h } from './dom';
import { openModal } from './modal';

const STATUS_ICON: Record<SyncState['status'], string> = {
  checking: '…',
  offline: '⚠',
  guest: '',
  syncing: '⟳',
  synced: '✓',
  error: '⚠',
};

/** 맵 툴바용 버튼: 상태가 바뀌면 스스로 갱신 */
export function accountButton(sync: SyncController): HTMLButtonElement {
  const b = button('', () => (sync.state().user ? openAccount(sync) : openLogin(sync)));
  b.classList.add('account-btn');
  const paint = (s: SyncState) => {
    b.dataset.status = s.status;
    b.textContent = s.user ? `👤 ${s.user.username} ${STATUS_ICON[s.status]}`.trim() : `👤 ${t('account.login')}`;
    b.title = s.user ? t(`account.status.${s.status}`) : t('account.loginTitle');
  };
  paint(sync.state());
  const off = sync.onState((s) => {
    if (!b.isConnected) return off();
    paint(s);
  });
  return b;
}

function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 429) return t('account.err.rate');
    const key = `account.err.${e.code}`;
    const msg = t(key);
    if (msg !== key) return msg;
  }
  return t('account.err.error');
}

/** 화면 위쪽에 잠깐 뜨는 알림 (맵에는 작업 화면 토스트가 없어서) */
function flash(msg: string): void {
  const el = h('div', { class: 'toast show success global-toast', role: 'status' }, msg);
  document.body.append(el);
  setTimeout(() => el.classList.remove('show'), 2200);
  setTimeout(() => el.remove(), 2600);
}

export function openLogin(sync: SyncController, mode: 'login' | 'signup' = 'login'): void {
  const signup = mode === 'signup';
  const user = h('input', { type: 'text', name: 'username', autocomplete: 'username', maxlength: '20', spellcheck: 'false', autocapitalize: 'off', required: '' });
  const pw = h('input', { type: 'password', name: 'password', autocomplete: signup ? 'new-password' : 'current-password', maxlength: '200', required: '' });
  const pw2 = h('input', { type: 'password', name: 'password2', autocomplete: 'new-password', maxlength: '200' });
  const msg = h('p', { class: 'small error', role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'btn primary' }, signup ? t('account.signup') : t('account.login'));
  const form = h(
    'form',
    { class: 'account-form', novalidate: '' },
    h('label', { class: 'field' }, h('span', {}, t('account.username')), user),
    signup ? h('p', { class: 'muted small hint' }, t('account.usernameHint')) : null,
    h('label', { class: 'field' }, h('span', {}, t('account.password')), pw),
    signup ? h('p', { class: 'muted small hint' }, t('account.passwordHint')) : null,
    signup ? h('label', { class: 'field' }, h('span', {}, t('account.password2')), pw2) : null,
    msg,
    h('div', { class: 'actions' }, button(t('common.cancel'), () => m.close(), 'ghost'), submit),
  );
  const swap = h('button', { type: 'button', class: 'link-btn' }, signup ? t('account.toLogin') : t('account.toSignup'));
  swap.onclick = () => {
    m.close();
    openLogin(sync, signup ? 'login' : 'signup');
  };
  const content = h(
    'div',
    { class: 'account' },
    h('h2', {}, `👤 ${signup ? t('account.signupTitle') : t('account.loginTitle')}`),
    h('p', { class: 'muted' }, t('account.intro')),
    form,
    h('p', { class: 'small swap' }, swap),
  );
  const m = openModal(content);
  form.onsubmit = async (e) => {
    e.preventDefault();
    msg.textContent = '';
    const name = user.value.trim().toLowerCase();
    if (signup) {
      if (!/^[a-z0-9_]{3,20}$/.test(name)) return void (msg.textContent = t('account.err.invalid_username'));
      if (pw.value.length < 8) return void (msg.textContent = t('account.err.invalid_password'));
      if (pw.value !== pw2.value) return void (msg.textContent = t('account.err.mismatch'));
    } else if (!name || !pw.value) return;
    submit.disabled = true;
    submit.textContent = '…';
    try {
      await sync.login(name, pw.value, signup);
      m.close();
      flash(t(signup ? 'account.welcomeNew' : 'account.welcome', { name }));
    } catch (err) {
      msg.textContent = errorText(err);
      submit.disabled = false;
      submit.textContent = signup ? t('account.signup') : t('account.login');
    }
  };
  setTimeout(() => user.focus(), 0);
}

export function openAccount(sync: SyncController): void {
  const statusEl = h('p', { class: 'sync-status' });
  const paint = (s: SyncState) => {
    statusEl.dataset.status = s.status;
    const when = s.syncedAt ? ' · ' + t('account.lastSync', { time: new Date(s.syncedAt).toLocaleTimeString() }) : '';
    statusEl.textContent = `${STATUS_ICON[s.status]} ${t(`account.status.${s.status}`)}${when}`;
  };
  paint(sync.state());
  const off = sync.onState(paint);
  const syncBtn = button(`⟳ ${t('account.syncNow')}`, () => void sync.syncNow());
  const content = h(
    'div',
    { class: 'account' },
    h('h2', {}, `👤 ${sync.state().user?.username ?? ''}`),
    statusEl,
    h('p', { class: 'muted small' }, t('account.syncInfo')),
    h('p', { class: 'muted small' }, t('account.localNote')),
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
      syncBtn,
      button(t('common.close'), () => m.close(), 'primary'),
    ),
  );
  const m = openModal(content, { onClose: off });
}
