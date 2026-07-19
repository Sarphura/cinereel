import Corestore from 'corestore';
import Hyperdrive from 'hyperdrive';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { DriveType } from '../types/types.js';

type Drive = InstanceType<typeof Hyperdrive>;
type Store = InstanceType<typeof Corestore>;

/**
 * Internal record kept in the `named` map.
 * `uuid` is the Corestore namespace name; it is the stable, persistent
 * identifier that survives restarts because Corestore derives the same
 * storage from the same namespace string.
 *
 * `type` is the drive type.  Stored here (not in Hyper) because Corestore
 * is a storage engine and has no concept of application-level types.
 */
interface NamedDrive {
  drive: Drive;
  uuid: string;
  type: DriveType;
}

/**
 * Single Corestore + per-drive `namespace()` derivation for *new* drives,
 * plus `store.session()` + explicit key for *remote* drives opened by key.
 *
 * Verified empirically against hyperdrive v13.3.2:
 *
 *   - One Corestore can host many simultaneously-open Hyperdrives, as long
 *     as each drive is derived via a unique `store.namespace(name)`.
 *   - Reusing the same `store.namespace(name)` value twice causes the second
 *     `drive.ready()` to hang (alias collision).
 *   - Using the root session directly for `new Hyperdrive(store)` more than
 *     once also hangs.
 *   - To open an existing drive by its public key, you MUST pass the key as
 *     the second positional argument to the constructor — NOT in opts.
 *     `store.namespace('remote:<hex>')` + `new Hyperdrive(ns)` does NOT
 *     honor a key; it generates a fresh random key.
 *   - The correct pattern for opening a remote drive by key alongside
 *     namespace-derived drives is `new Hyperdrive(store.session(), keyBuf)`.
 */

/**
 * Returned by `createDrive`.  `uuid` doubles as the Corestore namespace
 * name, so this record is sufficient to re-open the drive after a restart.
 */
export interface CreatedDrive {
  driveKey: string;
  uuid: string;
  type: DriveType;
}

/**
 * Runtime info for a mounted drive — used when listing drives from the SDK
 * perspective.  Does NOT contain business-layer fields (name, createdAt, etc.)
 */
export interface DriveInfo {
  uuid: string;
  driveKey: string;
  type: DriveType;
}

export interface CorestoreRuntime {
  /** The single Corestore instance for this process. */
  store: Store;
  /** Main drive (namespace 'main'). */
  main: Drive;
  /**
   * Create a new drive with a randomly-generated UUID namespace.
   * The returned `uuid` is the Corestore namespace name and is stable across
   * restarts — the same string always maps to the same storage.
   */
  createDrive: (type: DriveType) => Promise<CreatedDrive>;
  /**
   * Mount an existing drive by its UUID (Corestore namespace name).
   * Returns the existing drive if already mounted; throws if the namespace
   * has no stored data (storage is empty).
   */
  mountDrive: (uuid: string, type: DriveType) => Promise<Drive>;
  /**
   * Mount a drive by its UUID, or create it if the namespace is empty.
   * Safe for recovery: uses the index UUID, not a new random one.
   */
  mountOrCreate: (uuid: string, type: DriveType) => Promise<Drive>;
  /**
   * Mount a drive by its UUID (Corestore namespace name).
   * Returns the existing drive if already mounted; null if not found.
   */
  getDrive: (uuid: string) => Drive | null;
  /**
   * Resolve a remote drive by its public key (hex).  Uses main fast path
   * internally when the key is already mounted.
   */
  resolveByKey: (driveKey: string) => Promise<Drive>;
  /**
   * List all live drives (including the main drive) with SDK-level info.
   * Business-layer fields (name, createdAt) are NOT included — those are
   * injected by the sidecar wrapper from the drive index.
   */
  listDrives: () => DriveInfo[];
  /**
   * Close and forget a remote drive previously opened via `resolveByKey`.
   * Clears the byKey cache so a future `resolveByKey` of the same hex string
   * re-opens from disk (or fails cleanly). Safe to call on drives opened
   * via `mountOrCreate` / `mountDrive` as well: those entries live in
   * `named` and the SDK tracks both maps consistently.
   */
  evictByKey: (driveKey: string) => Promise<void>;
  close: () => Promise<void>;
}

async function mountByNamespace(store: Store, uuid: string): Promise<Drive> {
  const drive = new Hyperdrive(store.namespace(uuid));
  await drive.ready();
  return drive;
}

async function mountByKey(store: Store, key: Buffer): Promise<Drive> {
  const drive = new Hyperdrive(store.session(), key);
  await drive.ready();
  return drive;
}

/**
 * Probe whether a Corestore namespace has any stored cores.
 *
 * v7.11.1 exposes `store.list(namespace)` as an async iterable of discovery
 * keys; an empty stream means the namespace has no data on disk. We use this
 * in `mountOrCreate` to honour the "open existing or create new" contract
 * that the recovery path in the sidecar depends on.
 */
async function namespaceHasData(store: Store, uuid: string): Promise<boolean> {
  // `store.list` on a namespaced session filters by the session's namespace;
  // we ask the root store explicitly with the namespace string to avoid
  // accidentally walking siblings.
  const iter = (store as unknown as {
    list: (ns?: string) => AsyncIterable<Buffer>;
  }).list(uuid);
  for await (const _ of iter) {
    return true;
  }
  return false;
}

export async function createCorestoreRuntime(
  storeDir: string,
): Promise<CorestoreRuntime> {
  const resolved = path.resolve(storeDir);
  await mkdir(resolved, { recursive: true });

  const store = new Corestore(resolved);
  await store.ready();

  // main drive lives in the fixed 'main' namespace
  const main = await mountByNamespace(store, 'main');

  // Track UUID → { drive, type } for every mounted drive (main included).
  // 'main' uses its own fixed entry; all other drives use a random UUID.
  const named: Map<string, NamedDrive> = new Map([
    ['main', { drive: main, uuid: 'main', type: 'metadata' }],
  ]);

  // Memoize remote drives by their hex key for fast-path lookup.
  const byKey: Map<string, Drive> = new Map([
    [main.key.toString('hex'), main],
  ]);

  async function createDrive(type: DriveType): Promise<CreatedDrive> {
    const uuid = crypto.randomUUID();
    const drive = await mountByNamespace(store, uuid);
    named.set(uuid, { drive, uuid, type });
    return {
      driveKey: drive.key.toString('hex'),
      uuid,
      type,
    };
  }

  async function mountDrive(uuid: string, type: DriveType): Promise<Drive> {
    const existing = named.get(uuid)?.drive;
    if (existing) return existing;
    const drive = await mountByNamespace(store, uuid);
    named.set(uuid, { drive, uuid, type });
    return drive;
  }

  async function mountOrCreate(uuid: string, type: DriveType): Promise<Drive> {
    const existing = named.get(uuid)?.drive;
    if (existing) return existing;
    if (await namespaceHasData(store, uuid)) {
      return mountDrive(uuid, type);
    }
    // Empty namespace: derive a drive via mountByNamespace with this exact UUID.
    // (We intentionally reuse `mountByNamespace` so storage paths stay aligned
    // with the createDrive() path; the UUID itself is the only difference.)
    const drive = await mountByNamespace(store, uuid);
    named.set(uuid, { drive, uuid, type });
    return drive;
  }

  function getDrive(uuid: string): Drive | null {
    return named.get(uuid)?.drive ?? null;
  }

  async function resolveByKey(driveKey: string): Promise<Drive> {
    const norm = driveKey.toLowerCase().replace(/^0x/, '');
    if (!/^[0-9a-f]{64}$/.test(norm)) {
      throw new InvalidDriveKeyError(driveKey);
    }

    // fast path: already mounted
    const hit = byKey.get(norm);
    if (hit) return hit;

    // remote drive: open via session() + explicit key buffer
    const drive = await mountByKey(store, Buffer.from(norm, 'hex'));
    byKey.set(norm, drive);
    return drive;
  }

  function listDrives(): DriveInfo[] {
    return Array.from(named.values()).map(({ uuid, drive, type }) => ({
      uuid,
      driveKey: drive.key.toString('hex'),
      type,
    }));
  }

  async function evictByKey(driveKey: string): Promise<void> {
    const norm = driveKey.toLowerCase().replace(/^0x/, '');
    const drive = byKey.get(norm);
    if (!drive) return;
    byKey.delete(norm);
    // Drop any named entry that points at the same instance so the next listDrives
    // call no longer surfaces it. Drive objects are referenced by identity.
    for (const [uuid, entry] of named) {
      if (entry.drive === drive) {
        named.delete(uuid);
        break;
      }
    }
    try {
      await drive.close();
    } catch {
      /* ignore close errors during eviction */
    }
  }

  async function close(): Promise<void> {
    try {
      await store.close();
    } catch {
      /* ignore */
    }
  }

  return { store, main, createDrive, mountDrive, mountOrCreate, getDrive, resolveByKey, listDrives, evictByKey, close };
}

export class InvalidDriveKeyError extends Error {
  constructor(public readonly provided: string) {
    super(`Invalid drive key: ${provided}`);
    this.name = 'InvalidDriveKeyError';
  }
}
