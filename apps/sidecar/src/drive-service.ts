/**
 * DriveService — sidecar-level business wrapper around the hyper-sdk.
 *
 * Composes:
 *   - `StoreRuntime` from the SDK (Hyperdrive lifecycle, UUID namespaces)
 *   - `DriveIndex` (business metadata: name, type, createdAt)
 *
 * The SDK is responsible for data storage; this service injects business
 * semantics that can be discovered and consumed by remote peers.
 */

import type {
  StoreRuntime,
  DriveType,
} from '@cinereel/hyper-sdk';
import { driveKeyOf } from '@cinereel/hyper-sdk';
import type { DriveDescriptor } from '@cinereel/hyper-sdk';
import {
  createDriveIndex,
  type DriveIndex,
} from './drive-index';

export { type DriveDescriptor, type DriveType };

async function toDescriptor(
  uuid: string,
  driveKey: string,
  index: DriveIndex,
): Promise<DriveDescriptor> {
  const entry = index.entries()[uuid];
  return {
    driveKey,
    name: entry?.name ?? uuid,
    type: entry?.type ?? 'blob',
    isLocal: true,
    createdAt: entry?.createdAt,
  };
}

export interface SidecarDriveService {
  create(name: string, type: DriveType): Promise<DriveDescriptor>;
  list(): Promise<DriveDescriptor[]>;
  remove(driveKey: string): Promise<void>;
}

export function createSidecarDriveService(
  runtime: StoreRuntime,
  index: DriveIndex,
  keyToUuid?: Map<string, string>,
): SidecarDriveService {
  // Reverse index: driveKey → uuid
  const ktou: Map<string, string> = keyToUuid ?? new Map();
  if (!keyToUuid) {
    // First-run: only main is mounted; populate the map.
    ktou.set(driveKeyOf(runtime.main), 'main');
  }

  async function create(name: string, type: DriveType): Promise<DriveDescriptor> {
    const created = await runtime.createDrive(type);
    ktou.set(created.driveKey, created.uuid);
    await index.set(created.uuid, {
      name,
      type,
      createdAt: new Date().toISOString(),
    });
    return {
      driveKey: created.driveKey,
      name,
      type,
      isLocal: true,
      createdAt: new Date().toISOString(),
    };
  }

  async function list(): Promise<DriveDescriptor[]> {
    const results: DriveDescriptor[] = [];
    for (const info of runtime.listDrives()) {
      results.push(await toDescriptor(info.uuid, info.driveKey, index));
    }
    return results;
  }

  async function remove(driveKey: string): Promise<void> {
    const uuid = ktou.get(driveKey);
    if (!uuid) return; // not found, no-op
    if (uuid === 'main') throw new Error('Cannot remove the main drive');
    // Drop the sidecar-level business index FIRST. If the runtime evict
    // throws (e.g. drive already closed), we still want the on-disk index
    // and reverse map to reflect the intent. The reverse-map delete and
    // runtime evict always run side-by-side so a follow-up list() cannot
    // resurrect a "removed" drive from runtime.listDrives().
    await index.remove(uuid);
    ktou.delete(driveKey);
    await runtime.closeDriveByKey(driveKey);
  }

  return { create, list, remove };
}

/**
 * Bootstrap: load the persisted index, remount all recorded drives, and
 * return a fully-initialised SidecarDriveService.
 */
export async function createSidecarDriveServiceWithRecovery(
  runtime: StoreRuntime,
  storeDir: string,
): Promise<{ service: SidecarDriveService; index: DriveIndex }> {
  const index = createDriveIndex(storeDir);
  const entries = await index.load();

  // Reverse index built during recovery
  const keyToUuid = new Map<string, string>();
  keyToUuid.set(driveKeyOf(runtime.main), 'main');

  // Remount every non-main drive recorded in the index.
  for (const [uuid, entry] of Object.entries(entries)) {
    if (uuid === 'main') continue;
    try {
      const existing = runtime.getDrive(uuid);
      if (existing) {
        keyToUuid.set(driveKeyOf(existing), uuid);
      } else {
        // Use the index UUID (not a new one) so we open existing storage.
        const drive = await runtime.mountOrCreate(uuid, entry.type);
        keyToUuid.set(driveKeyOf(drive), uuid);
      }
    } catch (err) {
      console.warn(`[drive-index] failed to remount drive uuid=${uuid}:`, (err as Error).message);
    }
  }

  const service = createSidecarDriveService(runtime, index, keyToUuid);
  return { service, index };
}
