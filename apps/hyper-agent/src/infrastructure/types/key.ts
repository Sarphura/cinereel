/**
 * Hex / drive-key codec.
 *
 * The single source of truth for "drive public key as 64-char lowercase hex"
 * — used by every layer that handles a driveKey.
 *
 * The official `hyper-sdk` returns `Buffer` for `drive.key` and
 * `connection.remotePublicKey`; we never let `Buffer` cross the service
 * boundary — everything outside `infrastructure/` sees strings.
 */
export const HEX64 = /^[0-9a-f]{64}$/

/** Coerce a 32-byte public-key-like value to its 64-char lowercase hex form. */
export function toHexKey(buf: Uint8Array | Buffer): string {
  return Buffer.from(buf).toString('hex')
}

/** Test whether a string is a well-formed driveKey (64 lowercase hex chars). */
export function isHex64(s: string): boolean {
  return HEX64.test(s)
}

/**
 * Pull the hex driveKey off anything that exposes `HyperdriveLike.key`.
 *
 * Used by every site that needs to talk about a drive by its public key
 * (registry, service constructors, etc.).
 */
export function driveKeyOf(drive: { key: Uint8Array | Buffer }): string {
  return toHexKey(drive.key)
}