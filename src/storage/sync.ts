// 계정 동기화. 로그인하지 않으면 아무것도 하지 않는다(지금처럼 이 브라우저에만 저장).
// 로그인하면: 서버 세이브를 받아 로컬과 합치고(잃는 기록 없음), 이후 로컬이 바뀔 때마다 잠시 뒤 서버에 올린다.
import { readFlags, writeFlags, type AchvFlag } from '../game/achievements';
import { api as realApi, ApiError, type User } from '../net/api';
import { notifyLocalChange, onLocalChange, withoutNotify } from './changes';
import { loadCustomChips, saveCustomChips } from './customChips';
import { backupProgress, loadProgress, saveProgress } from './progress';
import { mergeSave, parseSave, SAVE_GAME, sameSave, type LogicSave, type Prefer } from './syncMerge';

const META_KEY = 'logic-game:sync';
const PUSH_DELAY = 1500;

/** 이 브라우저의 동기화 상태 (로그인한 계정, 마지막으로 맞춘 서버 rev, 그 뒤 로컬 변경 여부) */
interface SyncMeta {
  userId: string;
  username: string;
  rev: number;
  dirty: boolean;
  syncedAt?: number;
}

export type SyncStatus = 'checking' | 'offline' | 'guest' | 'syncing' | 'synced' | 'error';

export interface SyncState {
  status: SyncStatus;
  user: User | null;
  syncedAt?: number;
}

type Api = Pick<typeof realApi, 'me' | 'login' | 'signup' | 'logout' | 'getSave' | 'putSave'>;

function readMeta(): SyncMeta | null {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(META_KEY) ?? 'null') as SyncMeta | null;
    return v && typeof v.userId === 'string' && typeof v.rev === 'number' ? v : null;
  } catch {
    return null;
  }
}

function writeMeta(m: SyncMeta | null): void {
  try {
    if (m) globalThis.localStorage?.setItem(META_KEY, JSON.stringify(m));
    else globalThis.localStorage?.removeItem(META_KEY);
  } catch {
    /* 저장 불가 */
  }
}

export function readLocalSave(): LogicSave {
  return { progress: loadProgress(), custom: loadCustomChips(), flags: [...readFlags()].sort() };
}

function writeLocalSave(s: LogicSave): void {
  withoutNotify(() => {
    saveProgress(s.progress);
    saveCustomChips(s.custom);
    writeFlags(new Set(s.flags as AchvFlag[]));
  });
}

export interface SyncController {
  state(): SyncState;
  onState(fn: (s: SyncState) => void): () => void;
  /** 앱 시작 시: 로그인돼 있으면 서버와 맞춘다 */
  init(): Promise<void>;
  login(username: string, password: string, signup: boolean): Promise<void>;
  logout(): Promise<void>;
  /** 지금 바로 서버와 맞추기 */
  syncNow(): Promise<void>;
  dispose(): void;
}

/**
 * onRemoteApplied: 서버 데이터가 로컬에 합쳐져 저장 내용이 바뀌었을 때 (앱이 진행 기록을 다시 읽어야 함)
 */
export function createSync(opts: { onRemoteApplied(): void; api?: Api; pushDelay?: number }): SyncController {
  const api = opts.api ?? realApi;
  const delay = opts.pushDelay ?? PUSH_DELAY;
  let st: SyncState = { status: 'checking', user: null };
  const listeners = new Set<(s: SyncState) => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // 서버 작업은 한 번에 하나씩
  let queue: Promise<void> = Promise.resolve();
  const run = (job: () => Promise<void>) => (queue = queue.then(job, job));

  const set = (patch: Partial<SyncState>) => {
    st = { ...st, ...patch };
    for (const fn of listeners) fn(st);
  };

  const fail = (e: unknown) => {
    set({ status: e instanceof ApiError && e.code === 'network' ? 'offline' : 'error' });
  };

  /** 로컬 ← 합친 결과 저장. 실제로 바뀌었으면 앱에 알림 */
  const applyLocal = (merged: LogicSave, local: LogicSave) => {
    if (sameSave(merged, local)) return;
    writeLocalSave(merged);
    opts.onRemoteApplied();
  };

  /** 서버 세이브를 받아 합치고, 서버보다 앞선 내용이 있으면 올린다 */
  const pull = async (prefer: Prefer) => {
    const meta = readMeta()!;
    set({ status: 'syncing' });
    const remote = await api.getSave(SAVE_GAME);
    const local = readLocalSave();
    const remoteSave = parseSave(remote.data);
    const merged = remote.data === null ? local : mergeSave(local, remoteSave, prefer);
    applyLocal(merged, local);
    const needsPush = remote.data === null || !sameSave(merged, remoteSave);
    writeMeta({ ...meta, rev: remote.rev, dirty: needsPush });
    if (needsPush) await push();
    else finish();
  };

  const finish = () => {
    const m = readMeta();
    if (!m) return;
    const syncedAt = Date.now();
    writeMeta({ ...m, dirty: false, syncedAt });
    set({ status: 'synced', syncedAt });
  };

  /** 로컬 → 서버. 다른 기기가 먼저 저장했으면(409) 합쳐서 다시 */
  const push = async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const meta = readMeta();
      if (!meta) return;
      set({ status: 'syncing' });
      const local = readLocalSave();
      try {
        const r = await api.putSave(SAVE_GAME, local, meta.rev);
        writeMeta({ ...meta, rev: r.rev });
        // 올리는 동안 또 바뀌었으면 dirty 유지 (예약된 push가 처리)
        if (sameSave(readLocalSave(), local)) finish();
        return;
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 409)) throw e;
        const remote = parseSave(e.body?.data);
        const merged = mergeSave(readLocalSave(), remote, 'local');
        applyLocal(merged, readLocalSave());
        writeMeta({ ...meta, rev: typeof e.body?.rev === 'number' ? e.body.rev : meta.rev });
      }
    }
    set({ status: 'error' });
  };

  const schedulePush = () => {
    const meta = readMeta();
    if (!meta || !st.user) return;
    if (!meta.dirty) writeMeta({ ...meta, dirty: true });
    clearTimeout(timer);
    timer = setTimeout(() => void run(() => push().catch(fail)), delay);
  };

  const offChange = onLocalChange(schedulePush);
  const onHide = () => {
    if (document.visibilityState === 'hidden' && readMeta()?.dirty && st.user) {
      clearTimeout(timer);
      void run(() => push().catch(fail));
    }
  };
  globalThis.document?.addEventListener('visibilitychange', onHide);

  /** 로그인 직후: 이 브라우저가 처음 이 계정과 맞추면 로컬(손님 기록)을 우선, 아니면 미뤄 둔 변경 여부에 따라 */
  const startFor = async (user: User) => {
    const meta = readMeta();
    const same = meta?.userId === user.id;
    if (!same) {
      backupProgress(loadProgress());
      writeMeta({ userId: user.id, username: user.username, rev: 0, dirty: true });
    }
    set({ user });
    await pull(!same || meta!.dirty ? 'local' : 'remote');
  };

  return {
    state: () => st,
    onState(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    init: () =>
      run(async () => {
        try {
          const user = await api.me();
          await startFor(user);
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) {
            set({ status: 'guest', user: null });
            return;
          }
          // 서버에 닿지 않음: 로그인 정보가 남아 있으면 계정 이름은 보여 주되 오프라인
          const meta = readMeta();
          set({ user: meta ? { id: meta.userId, username: meta.username } : null });
          fail(e);
        }
      }),
    login: (username, password, signup) =>
      run(async () => {
        const user = await (signup ? api.signup(username, password) : api.login(username, password));
        await startFor(user).catch((e) => {
          fail(e);
          throw e;
        });
      }),
    logout: () =>
      run(async () => {
        clearTimeout(timer);
        if (readMeta()?.dirty) await push().catch(() => {});
        await api.logout().catch(() => {});
        // 이 브라우저의 기록은 그대로 둔다 (손님으로 계속 플레이)
        writeMeta(null);
        set({ status: 'guest', user: null, syncedAt: undefined });
      }),
    syncNow: () =>
      run(async () => {
        if (!st.user) return;
        clearTimeout(timer);
        await pull(readMeta()?.dirty ? 'local' : 'remote').catch(fail);
      }),
    dispose() {
      offChange();
      clearTimeout(timer);
      globalThis.document?.removeEventListener('visibilitychange', onHide);
    },
  };
}

/** 테스트용 */
export const _internal = { readMeta, writeMeta, notifyLocalChange };
