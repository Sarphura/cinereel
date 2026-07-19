import Corestore from 'corestore';
import Hyperdrive from 'hyperdrive';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { normalizeAndValidateDriveKey } from '../utils/hyperdrive.factory.js';
import type { Drive } from '../types/hyperdrive.js';
import type { DriveType } from '../types/types.js';

type Store = InstanceType<typeof Corestore>;

interface NamedDrive {
  drive: Drive;
  uuid: string;
  type: DriveType;
}

/**
 * Single Corestore + per-drive `namespace()` derivation for *new* drives,
 * plus `store.session()` + explicit key for *remote* drives opened by key.
 *
 * Invariants (validated empirically against hyperdrive v13.3.2):
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

export interface CreatedDrive {
  driveKey: string;
  uuid: string;
  type: DriveType;
}

export interface DriveInfo {
  uuid: string;
  driveKey: string;
  type: DriveType;
}

export interface StoreRuntime {
  store: Store;
  main: Drive;
  createDrive: (type: DriveType) => Promise<CreatedDrive>;
  mountDrive: (uuid: string, type: DriveType) => Promise<Drive>;
  mountOrCreate: (uuid: string, type: DriveType) => Promise<Drive>;
  getDrive: (uuid: string) => Drive | null;
  resolveByKey: (driveKey: string) => Promise<Drive>;
  listDrives: () => DriveInfo[];
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
 * v7.11.1 exposes `store.list(namespace)` as an async iterable of discovery
 * keys; an empty stream means the namespace has no data on disk. The recovery
 * path in the sidecar relies on this to honour the
 * "open existing or create new" contract for `mountOrCreate`.
 */
async function namespaceHasData(store: Store, uuid: string): Promise<boolean> {
  const iter = (store as unknown as {
    list: (ns?: string) => AsyncIterable<Buffer>;
  }).list(uuid);
  for await (const _ of iter) {
    return true;
  }
  return false;
}

export async function createStoreRuntime(
  storeDir: string,
): Promise<StoreRuntime> {
  const resolved = path.resolve(storeDir);
  await mkdir(resolved, { recursive: true });

  const store = new Corestore(resolved);
  await store.ready();

  const main = await mountByNamespace(store, 'main');

  const named: Map<string, NamedDrive> = new Map([
    ['main', { drive: main, uuid: 'main', type: 'metadata' }],
  ]);

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
    const drive = await mountByNamespace(store, uuid);
    named.set(uuid, { drive, uuid, type });
    return drive;
  }

  function getDrive(uuid: string): Drive | null {
    return named.get(uuid)?.drive ?? null;
  }

  async function resolveByKey(driveKey: string): Promise<Drive> {
    const { hex, buffer } = normalizeAndValidateDriveKey(driveKey);
    const hit = byKey.get(hex);
    if (hit) return hit;
    const drive = await mountByKey(store, buffer);
    byKey.set(hex, drive);
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
    const { hex } = normalizeAndValidateDriveKey(driveKey);
    const drive = byKey.get(hex);
    if (!drive) return;
    byKey.delete(hex);
    for (const [uuid, entry] of named) {
      if (entry.drive === drive) {
        named.delete(uuid);
        break;
      }
    }
    try {
      await drive.close();
    } catch (err) {
      console.warn('[hyper-sdk] evictByKey: drive.close failed', err);
    }
  }

  async function close(): Promise<void> {
    try {
      await store.close();
    } catch (err) {
      console.warn('[hyper-sdk] runtime.close: store.close failed', err);
    }
  }

  return { store, main, createDrive, mountDrive, mountOrCreate, getDrive, resolveByKey, listDrives, evictByKey, close };
}

export { InvalidDriveKeyError } from '../utils/hyperdrive.factory.js';