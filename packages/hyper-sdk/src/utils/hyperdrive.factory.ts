import Hyperdrive from 'hyperdrive';
import type { CorestoreRuntime } from '../runtime/corestore.js';

type Drive = InstanceType<typeof Hyperdrive>;

/**
 * Resolve a drive by its public key (hex string).
 * Delegates to `runtime.resolveByKey`, which enforces the v13 invariant
 * that each Hyperdrive has its own dedicated Corestore.
 */
export async function resolveDriveByKey(
  runtime: CorestoreRuntime,
  driveKey: string,
): Promise<Drive> {
  return runtime.resolveByKey(driveKey);
}

export { InvalidDriveKeyError } from '../runtime/corestore.js';

export function driveKeyOf(drive: Drive): string {
  return drive.key.toString('hex');
}