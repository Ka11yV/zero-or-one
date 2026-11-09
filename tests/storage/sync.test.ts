import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError, type User } from '../../src/net/api';
import { emptyCustomStore } from '../../src/storage/customChips';
import { emptyProgress, loadProgress, saveProgress, type Progress } from '../../src/storage/progress';
import { createSync } from '../../src/storage/sync';
import { emptySave, mergeCustom, mergeProgress, mergeSave, parseSave, sameSave, type LogicSave } from '../../src/storage/syncMerge';

const chip = (id: string, tag: string) => ({ kind: 'composite' as const, id, inputs: [], outputs: [], instances: [], wires: [], tag }) as never;

function prog(levels: Progress['levels'], extra: Partial<Progress> = {}): Progress {
  return { ...emptyProgress(), levels, ...extra };
}

describe('mergeProgress', () => {
  it('레벨 기록은 좋은 쪽을 모은다 (잃는 것 없음)', () => {
    const a = prog({ '1-1': { cleared: true, stars: 2, hintsUsed: 1, bestNand: 5 }, '1-2': { cleared: true, stars: 3, hintsUsed: 0, bestNand: 3 } });
    const b = prog({ '1-1': { cleared: true, stars: 3, hintsUsed: 0, bestNand: 4 }, '2-1': { cleared: false, stars: 0, hintsUsed: 2 } });
    const m = mergeProgress(a, b, 'local');
    expect(m.levels['1-1']).toEqual({ cleared: true, stars: 3, hintsUsed: 1, bestNand: 4 });
    expect(m.levels['1-2']).toEqual(a.levels['1-2']);
    expect(m.levels['2-1']).toEqual({ cleared: false, stars: 0, hintsUsed: 2 });
    expect(mergeProgress(b, a, 'remote').levels).toEqual(m.levels); // 순서·우선과 무관
  });

  it('칩·회로는 합집합, 같은 칩은 prefer 쪽 + 그 쪽 원본 회로', () => {
    const doc = (n: string) => ({ tag: n }) as never;
    const a = prog({}, { chips: { NOT: chip('NOT', 'a'), AND: chip('AND', 'a') }, chipSources: { NOT: doc('a-not'), AND: doc('a-and') }, drafts: { '1-3': doc('a') } });
    const b = prog({}, { chips: { NOT: chip('NOT', 'b'), OR: chip('OR', 'b') }, chipSources: { NOT: doc('b-not'), OR: doc('b-or') }, drafts: { '1-3': doc('b'), '1-4': doc('b4') }, programs: { '8-1': 'HLT' } });
    const m = mergeProgress(a, b, 'local');
    expect(Object.keys(m.chips).sort()).toEqual(['AND', 'NOT', 'OR']);
    expect((m.chips.NOT as unknown as { tag: string }).tag).toBe('a');
    expect(m.chipSources.NOT).toEqual(doc('a-not'));
    expect(m.chipSources.OR).toEqual(doc('b-or'));
    expect(m.drafts).toEqual({ '1-3': doc('a'), '1-4': doc('b4') });
    expect(m.programs).toEqual({ '8-1': 'HLT' });
    expect((mergeProgress(a, b, 'remote').chips.NOT as unknown as { tag: string }).tag).toBe('b');
  });
});

describe('mergeCustom', () => {
  it('같은 이름의 내 칩은 더 최근에 저장된 쪽', () => {
    const a = { ...emptyCustomStore(), chips: { MY: chip('MY', 'old'), A: chip('A', 'a') }, meta: { MY: { updated: 100 }, A: { updated: 1 } } };
    const b = { ...emptyCustomStore(), chips: { MY: chip('MY', 'new'), B: chip('B', 'b') }, meta: { MY: { updated: 200 }, B: { updated: 1 } } };
    const m = mergeCustom(a, b, 'local');
    expect(Object.keys(m.chips).sort()).toEqual(['A', 'B', 'MY']);
    expect((m.chips.MY as unknown as { tag: string }).tag).toBe('new');
    expect(m.meta.MY!.updated).toBe(200);
  });
});

describe('parseSave / sameSave', () => {
  it('이상한 서버 값은 빈 세이브로', () => {
    expect(sameSave(parseSave(null), emptySave())).toBe(true);
    expect(sameSave(parseSave({ progress: { version: 2 }, custom: 'x', flags: [1, 'pixel'] }), { ...emptySave(), flags: ['pixel'] })).toBe(true);
  });
  it('키 순서가 달라도 같은 내용', () => {
    const a: LogicSave = { ...emptySave(), flags: ['a'] };
    const b = JSON.parse(JSON.stringify({ flags: ['a'], custom: a.custom, progress: a.progress })) as LogicSave;
    expect(sameSave(a, b)).toBe(true);
    expect(sameSave(mergeSave(a, b, 'local'), a)).toBe(true);
  });
});

// ---------- 동기화 컨트롤러 (가짜 서버 + 메모리 localStorage) ----------

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

function fakeServer() {
  const users = new Map<string, User>();
  const saves = new Map<string, { data: unknown; rev: number }>();
  let session: User | null = null;
  let online = true;
  const net = () => {
    if (!online) throw new ApiError(0, 'network');
  };
  return {
    saves,
    setOnline(v: boolean) {
      online = v;
    },
    /** 소셜 로그인을 마치고 돌아온 상태 (세션 쿠키가 생김) */
    signIn(name: string) {
      if (!users.has(name)) users.set(name, { id: String(users.size + 1), name, avatarUrl: null, providers: ['google'] });
      session = users.get(name)!;
    },
    /** 다른 기기에서 저장한 것처럼 */
    remoteWrite(name: string, data: LogicSave) {
      const u = users.get(name)!;
      const cur = saves.get(u.id);
      saves.set(u.id, { data: structuredClone(data), rev: (cur?.rev ?? 0) + 1 });
    },
    api: {
      async me() {
        net();
        if (!session) throw new ApiError(401, 'unauthorized');
        return session;
      },
      async logout() {
        net();
        session = null;
      },
      async deleteAccount() {
        net();
        saves.delete(session!.id);
        users.delete(session!.name);
        session = null;
      },
      async getSave() {
        net();
        const s = saves.get(session!.id);
        return s ? { data: structuredClone(s.data), rev: s.rev, updatedAt: 'x' } : { data: null, rev: 0, updatedAt: null };
      },
      async putSave(_g: string, data: unknown, baseRev: number) {
        net();
        const cur = saves.get(session!.id);
        if ((cur?.rev ?? 0) !== baseRev) throw new ApiError(409, 'conflict', { data: cur?.data ?? null, rev: cur?.rev ?? 0 });
        const rev = baseRev + 1;
        saves.set(session!.id, { data: structuredClone(data), rev });
        return { rev, updatedAt: 'x' };
      },
    },
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clear = (_id: string, stars: number): Progress['levels'][string] => ({ cleared: true, stars, hintsUsed: 0, bestNand: 10 - stars });

describe('createSync', () => {
  let storage: MemStorage;
  beforeEach(() => {
    storage = new MemStorage();
    (globalThis as { localStorage?: unknown }).localStorage = storage;
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('로그인 안 하면 손님 상태, 아무것도 올리지 않음', async () => {
    const srv = fakeServer();
    const sync = createSync({ api: srv.api, onRemoteApplied: () => {}, pushDelay: 5 });
    await sync.init();
    expect(sync.state().status).toBe('guest');
    saveProgress(prog({ '1-1': clear('1-1', 3) }));
    await wait(20);
    expect(srv.saves.size).toBe(0);
    sync.dispose();
  });

  it('가입하면 이 브라우저의 기록이 계정으로 올라가고, 이후 변경도 자동 업로드', async () => {
    saveProgress(prog({ '1-1': clear('1-1', 3) }));
    const srv = fakeServer();
    const sync = createSync({ api: srv.api, onRemoteApplied: () => {}, pushDelay: 5 });
    srv.signIn('alice');
    await sync.init();
    expect(sync.state()).toMatchObject({ status: 'synced', user: { name: 'alice' } });
    expect((srv.saves.get('1')!.data as LogicSave).progress.levels['1-1']!.stars).toBe(3);
    // 백업이 남는다
    expect(storage.getItem('logic-game:v1:progress-backup')).toContain('1-1');

    saveProgress(prog({ '1-1': clear('1-1', 3), '1-2': clear('1-2', 2) }));
    await wait(30);
    expect(Object.keys((srv.saves.get('1')!.data as LogicSave).progress.levels)).toEqual(['1-1', '1-2']);
    expect(srv.saves.get('1')!.rev).toBe(2);
    expect(sync.state().status).toBe('synced');
    sync.dispose();
  });

  it('다른 기기의 기록과 합친다 — 새 기기에서 로그인', async () => {
    const srv = fakeServer();
    srv.signIn('bob');
    srv.remoteWrite('bob', { ...emptySave(), progress: prog({ '1-1': clear('1-1', 3), '1-2': clear('1-2', 3) }) });
    await srv.api.logout();
    // 새 기기에는 손님으로 깬 다른 레벨이 있다
    saveProgress(prog({ '1-1': clear('1-1', 1), '1-3': clear('1-3', 2) }));
    let applied = 0;
    const sync = createSync({ api: srv.api, onRemoteApplied: () => applied++, pushDelay: 5 });
    srv.signIn('bob');
    await sync.init();
    const p = loadProgress();
    expect(Object.keys(p.levels).sort()).toEqual(['1-1', '1-2', '1-3']);
    expect(p.levels['1-1']!.stars).toBe(3);
    expect(applied).toBe(1);
    // 서버도 합친 결과
    expect(Object.keys((srv.saves.get('1')!.data as LogicSave).progress.levels).sort()).toEqual(['1-1', '1-2', '1-3']);
    sync.dispose();
  });

  it('다시 열면 서버의 새 기록을 받아 온다', async () => {
    const srv = fakeServer();
    const s1 = createSync({ api: srv.api, onRemoteApplied: () => {}, pushDelay: 5 });
    srv.signIn('carol');
    await s1.init();
    s1.dispose();
    // 다른 기기에서 진행
    srv.remoteWrite('carol', { ...emptySave(), progress: prog({ '2-1': clear('2-1', 3) }) });
    let applied = 0;
    const s2 = createSync({ api: srv.api, onRemoteApplied: () => applied++, pushDelay: 5 });
    await s2.init();
    expect(applied).toBe(1);
    expect(loadProgress().levels['2-1']!.stars).toBe(3);
    expect(s2.state().status).toBe('synced');
    s2.dispose();
  });

  it('올리는 사이 다른 기기가 먼저 저장했으면(409) 합쳐서 다시 올린다', async () => {
    const srv = fakeServer();
    const sync = createSync({ api: srv.api, onRemoteApplied: () => {}, pushDelay: 5 });
    srv.signIn('dan');
    await sync.init();
    srv.remoteWrite('dan', { ...emptySave(), progress: prog({ '3-1': clear('3-1', 3) }) });
    saveProgress(prog({ '1-1': clear('1-1', 2) }));
    await wait(30);
    const server = srv.saves.get('1')!.data as LogicSave;
    expect(Object.keys(server.progress.levels).sort()).toEqual(['1-1', '3-1']);
    expect(Object.keys(loadProgress().levels).sort()).toEqual(['1-1', '3-1']);
    expect(sync.state().status).toBe('synced');
    sync.dispose();
  });

  it('서버가 꺼져 있으면 오프라인, 다시 켜지면 밀린 변경을 올린다', async () => {
    const srv = fakeServer();
    const sync = createSync({ api: srv.api, onRemoteApplied: () => {}, pushDelay: 5 });
    srv.signIn('erin');
    await sync.init();
    srv.setOnline(false);
    saveProgress(prog({ '1-1': clear('1-1', 3) }));
    await wait(30);
    expect(sync.state().status).toBe('offline');
    srv.setOnline(true);
    await sync.syncNow();
    expect((srv.saves.get('1')!.data as LogicSave).progress.levels['1-1']!.stars).toBe(3);
    expect(sync.state().status).toBe('synced');
    sync.dispose();
  });

  it('로그아웃해도 로컬 기록은 남고, 밀린 변경은 올린 뒤 나간다', async () => {
    const srv = fakeServer();
    const sync = createSync({ api: srv.api, onRemoteApplied: () => {}, pushDelay: 1000 });
    srv.signIn('fay');
    await sync.init();
    saveProgress(prog({ '1-1': clear('1-1', 3) }));
    await sync.logout();
    expect(sync.state()).toMatchObject({ status: 'guest', user: null });
    expect(loadProgress().levels['1-1']!.stars).toBe(3);
    expect((srv.saves.get('1')!.data as LogicSave).progress.levels['1-1']!.stars).toBe(3);
    expect(storage.getItem('logic-game:sync')).toBeNull();
    sync.dispose();
  });

  it('계정 삭제: 서버 기록은 지우고 이 브라우저의 기록은 남긴다', async () => {
    const srv = fakeServer();
    const sync = createSync({ api: srv.api, onRemoteApplied: () => {}, pushDelay: 5 });
    saveProgress(prog({ '1-1': clear('1-1', 2) }));
    srv.signIn('gil');
    await sync.init();
    expect(srv.saves.size).toBe(1);
    await sync.deleteAccount();
    expect(srv.saves.size).toBe(0);
    expect(sync.state().status).toBe('guest');
    expect(loadProgress().levels['1-1']!.stars).toBe(2);
    sync.dispose();
  });
});
