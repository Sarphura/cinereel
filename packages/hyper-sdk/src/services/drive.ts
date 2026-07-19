import type { CorestoreRuntime } from '../runtime/corestore.js';
import { driveKeyOf } from '../utils/hyperdrive.factory.js';
import type { DriveDescriptor, DriveType } from '../types/types.js';

export interface DriveService {
  /** Create a new drive (UUID namespace) and return its key and metadata. */
  create: (name: string, type: DriveType) => Promise<DriveDescriptor>;
  /** List all drives (main + named). */
  list: () => Promise<DriveDescriptor[]>;
  /** Remove a drive by its drive key. */
  remove: (driveKey: string) => Promise<void>;
}

/**
 * @deprecated Use the CorestoreRuntime directly.  The sidecar owns business-layer
 * metadata (name, createdAt) and should use `runtime.createDrive()` + its own
 * DriveIndex rather than calling this service.
 */
export function makeDriveService(
  runtime: CorestoreRuntime,
  _preloadedDescriptors?: Map<string, DriveDescriptor>,
): DriveService {
  async function create(name: string, type: DriveType): Promise<DriveDescriptor> {
    const created = await runtime.createDrive(type);
    // Fallback: embed name/type from args when no index is available.
    // The sidecar wrapper replaces this with enriched DriveDescriptor.
    return {
      driveKey: created.driveKey,
      name,
      type: created.type,
      isLocal: true,
    };
  }

  async function list(): Promise<DriveDescriptor[]> {
    const descriptors: DriveDescriptor[] = [];
    for (const info of runtime.listDrives()) {
      descriptors.push({
        driveKey: info.driveKey,
        name: info.uuid === 'main' ? 'main' : info.uuid,
        type: info.type,
        isLocal: true,
      });
    }
    return descriptors;
  }

  async function remove(driveKey: string): Promise<void> {
    const norm = driveKey.toLowerCase().replace(/^0x/, '');
    if (!/^[0-9a-f]{64}$/.test(norm)) {
      throw new Error(`Invalid drive key: ${driveKey}`);
    }
    // Drop the byKey cache entry and close the underlying drive instance.
    // We do NOT purge on-disk data here — that's the caller's job (the
    // sidecar wrapper decides whether to also call drive.purge()). The
    // SDK just makes sure the in-memory handle is gone.
    await runtime.evictByKey(norm);
  }

  return { create, list, remove };
}

/** Re-export so callers can build their own wrapper without importing runtime. */
export { driveKeyOf };
