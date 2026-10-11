/**
 * In-memory stand-in for `firebase/database`, aliased in place of the real
 * module by vitest.config.ts.
 *
 * It mirrors the behaviours this app actually depends on:
 *  - writing an array stores it the way Realtime Database does (an object keyed
 *    by index, with nullish entries dropped), so code that reads it back via
 *    `Array.isArray(v) ? v : Object.values(v)` is exercised for real;
 *  - `update()` replaces each named child wholesale;
 *  - `onValue` listeners fire on any write that could affect their path.
 *
 * Tests drive it through `fakeDb` at the bottom of this file.
 */

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

interface Snapshot {
  exists: () => boolean;
  val: () => unknown;
  key: string | null;
}

export interface DatabaseReference {
  path: string;
  key: string | null;
}

let store: Record<string, Json> = {};
let listeners: { path: string; callback: (snapshot: Snapshot) => void }[] = [];
let pushCounter = 0;
const writeLog: { op: 'set' | 'update' | 'remove'; path: string }[] = [];

const segments = (path: string) => path.split('/').filter(Boolean);

/** Realtime Database has no arrays: it stores index-keyed objects and drops nulls. */
function normalize(value: unknown): Json {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    const out: Record<string, Json> = {};
    value.forEach((entry, index) => {
      const normalized = normalize(entry);
      if (normalized !== null) out[String(index)] = normalized;
    });
    return Object.keys(out).length > 0 ? out : null;
  }
  if (typeof value === 'object') {
    const out: Record<string, Json> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const normalized = normalize(entry);
      if (normalized !== null) out[key] = normalized;
    }
    return Object.keys(out).length > 0 ? out : null;
  }
  return value as Json;
}

/**
 * The real SDK hands back a JS array when a node's keys are exactly 0..n-1, and
 * a plain object when there are gaps. Both branches matter: the app guards with
 * `Array.isArray(v) ? v : Object.values(v)` precisely because of this.
 */
function reconstruct(node: Json): Json {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return node;

  const entries = Object.entries(node as Record<string, Json>);
  const rebuilt = Object.fromEntries(entries.map(([key, value]) => [key, reconstruct(value)]));
  const keys = Object.keys(rebuilt);

  const isContiguousIndexed =
    keys.length > 0 && keys.every((key, index) => key === String(index));

  return isContiguousIndexed ? (Object.values(rebuilt) as Json[]) : rebuilt;
}

function readPath(path: string): Json {
  let node: Json = store;
  for (const segment of segments(path)) {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return null;
    node = (node as Record<string, Json>)[segment] ?? null;
  }
  return reconstruct(node);
}

function writePath(path: string, value: unknown) {
  const parts = segments(path);
  const normalized = normalize(value);

  if (parts.length === 0) {
    store = (normalized as Record<string, Json>) ?? {};
    return;
  }

  let node = store as Record<string, Json>;
  for (const segment of parts.slice(0, -1)) {
    const next = node[segment];
    if (next === null || next === undefined || typeof next !== 'object' || Array.isArray(next)) {
      node[segment] = {};
    }
    node = node[segment] as Record<string, Json>;
  }

  const leaf = parts[parts.length - 1];
  if (normalized === null) delete node[leaf];
  else node[leaf] = normalized;
}

function snapshotAt(path: string): Snapshot {
  const value = readPath(path);
  const parts = segments(path);
  return {
    exists: () => value !== null && value !== undefined,
    val: () => value,
    key: parts.length ? parts[parts.length - 1] : null,
  };
}

/** A write at `path` is visible to listeners on that path, its parents and its children. */
function notify(path: string) {
  for (const listener of [...listeners]) {
    if (path === listener.path || path.startsWith(`${listener.path}/`) || listener.path.startsWith(`${path}/`)) {
      listener.callback(snapshotAt(listener.path));
    }
  }
}

export function ref(_db: unknown, path = ''): DatabaseReference {
  const parts = segments(path);
  return { path: parts.join('/'), key: parts.length ? parts[parts.length - 1] : null };
}

export function onValue(reference: DatabaseReference, callback: (snapshot: Snapshot) => void) {
  const entry = { path: reference.path, callback };
  listeners.push(entry);
  callback(snapshotAt(reference.path));
  return () => {
    listeners = listeners.filter((candidate) => candidate !== entry);
  };
}

export async function get(reference: DatabaseReference): Promise<Snapshot> {
  return snapshotAt(reference.path);
}

export async function set(reference: DatabaseReference, value: unknown): Promise<void> {
  writeLog.push({ op: 'set', path: reference.path });
  writePath(reference.path, value);
  notify(reference.path);
}

export async function update(
  reference: DatabaseReference,
  values: Record<string, unknown>
): Promise<void> {
  writeLog.push({ op: 'update', path: reference.path });
  for (const [key, value] of Object.entries(values)) {
    writePath(reference.path ? `${reference.path}/${key}` : key, value);
  }
  notify(reference.path);
}

export async function remove(reference: DatabaseReference): Promise<void> {
  writeLog.push({ op: 'remove', path: reference.path });
  writePath(reference.path, null);
  notify(reference.path);
}

export function push(reference: DatabaseReference): DatabaseReference {
  pushCounter += 1;
  const key = `push_${pushCounter}`;
  return { path: `${reference.path}/${key}`, key };
}

export function getDatabase() {
  return {};
}

export function connectDatabaseEmulator() {
  /* no-op */
}

/** Test-facing control surface. */
export const fakeDb = {
  reset() {
    store = {};
    listeners = [];
    pushCounter = 0;
    writeLog.length = 0;
  },
  /** Seed raw data, e.g. `fakeDb.seed('users/u1/transactions', [...])`. */
  seed(path: string, value: unknown) {
    writePath(path, value);
    notify(path);
  },
  /** Read back whatever the app wrote. */
  read(path: string): unknown {
    return readPath(path);
  },
  /** Read a path the app stores as an array, back as an array. */
  readArray<T>(path: string): T[] {
    const value = readPath(path);
    if (!value) return [];
    return (Array.isArray(value) ? value : Object.values(value)) as T[];
  },
  /** Every write performed, for asserting that a change took exactly one round trip. */
  writes(): readonly { op: string; path: string }[] {
    return writeLog;
  },
  listenerCount() {
    return listeners.length;
  },
};
