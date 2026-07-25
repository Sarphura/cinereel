/**
 * Wire / transport DTOs shared by services and controllers.
 *
 * Pure data — no behavior. Anything in here is a JSON-serializable shape
 * that crosses the HTTP boundary.
 *
 * Lives in `infrastructure/types/` (CSR layer: infrastructure) because
 * these shapes are the contract between transport and business layers,
 * not the contract between business and persistence.
 */
import type { Readable } from 'node:stream'

/** Business tag for a drive. Not interpreted by the SDK; the sidecar owns it. */
export type DriveType = 'metadata' | 'blob'

/** A single mounted drive as known to the sidecar. */
export interface DriveDescriptor {
  driveKey: string
  name: string
  type: DriveType
  isLocal: boolean
  createdAt?: string
}

/** A connected peer on the swarm. */
export interface PeerInfo {
  publicKey: string
  connectedAt: string
}

/** Local node identity surfaced to the HTTP layer. */
export interface IdentityInfo {
  mainDriveKey: string
  peerPublicKey: string
  swarmPort: number
  peerCount: number
}

/** Hyperdrive entry value shape, narrowed from the v13 raw form. */
export interface HyperdriveEntry {
  key: string
  seq: number
  value: { type: 'file' | 'directory' | 'symlink'; metadata: unknown } | null
}

/** Tree node emitted by `FileService.getTree`. */
export interface TreeNode {
  name: string
  type: 'file' | 'directory'
  size?: number
  children?: TreeNode[]
}

/** Readable stream DTO (returned by file-read handlers). */
export type ReadStream = Readable