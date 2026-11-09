// 회로 내보내기/불러오기: 회로 + 그 회로가 쓰는 칩 정의(전이적으로)를 하나로 묶는다.
import { isEditorDoc, type EditorDoc } from '../editor/doc';
import type { ChipLibrary, CompositeChipDef } from '../sim';

export interface CircuitBundle {
  format: 'logic-game-circuit';
  version: 1;
  doc: EditorDoc;
  /** 회로가 쓰는 내장 칩이 아닌 칩 정의들 (안쪽 칩까지) */
  chips: CompositeChipDef[];
  /** 내 칩 설명 (있으면) */
  notes?: Record<string, string>;
}

/** 문서가 쓰는 비내장 칩을 안쪽까지 모두 모은다 (안쪽 칩이 먼저) */
export function collectChips(doc: EditorDoc, lib: ChipLibrary): CompositeChipDef[] {
  const out: CompositeChipDef[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const def = lib.get(id);
    if (!def || def.kind !== 'composite') return;
    for (const i of def.instances) visit(i.chip);
    out.push({ id: def.id, kind: 'composite', inputs: def.inputs, outputs: def.outputs, instances: def.instances, wires: def.wires });
  };
  for (const i of doc.instances) visit(i.chip);
  return out;
}

export function makeBundle(doc: EditorDoc, lib: ChipLibrary, notes?: Record<string, string>): CircuitBundle {
  const chips = collectChips(doc, lib);
  const n = notes ? Object.fromEntries(Object.entries(notes).filter(([k]) => chips.some((c) => c.id === k))) : undefined;
  return { format: 'logic-game-circuit', version: 1, doc, chips, ...(n && Object.keys(n).length ? { notes: n } : {}) };
}

const isChipDef = (c: unknown): c is CompositeChipDef => {
  const d = c as CompositeChipDef;
  return !!d && d.kind === 'composite' && typeof d.id === 'string' && Array.isArray(d.inputs) && Array.isArray(d.outputs) && Array.isArray(d.instances) && Array.isArray(d.wires);
};

export function parseBundle(v: unknown): CircuitBundle | null {
  const b = v as CircuitBundle;
  if (!b || b.format !== 'logic-game-circuit' || b.version !== 1 || !isEditorDoc(b.doc) || !Array.isArray(b.chips) || !b.chips.every(isChipDef)) return null;
  return b;
}

// ---------- 공유 링크용 문자열 (deflate-raw + base64url) ----------

const toB64url = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const res = new Response(new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

/** 'z' + 압축 base64url, 압축을 못 쓰는 환경이면 'j' + 그냥 base64url */
export async function encodeBundle(b: CircuitBundle): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(b));
  if (typeof CompressionStream === 'function') return 'z' + toB64url(await pipe(json, new CompressionStream('deflate-raw')));
  return 'j' + toB64url(json);
}

export async function decodeBundle(s: string): Promise<CircuitBundle | null> {
  try {
    const kind = s[0];
    let bytes: Uint8Array = fromB64url(s.slice(1));
    if (kind === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    else if (kind !== 'j') return null;
    return parseBundle(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}
