/**
 * Structural view of a `Hyperdrive` instance and SDK types.
 *
 * The official `hyper-sdk` does NOT re-export its `Hyperdrive` class, and
 * `hyperdrive` isn't a direct dependency of the sidecar. Capturing the
 * surface we *actually use* here keeps `repositories/` type-safe without
 * forcing a new dependency, and lets tests stub the surface cleanly.
 *
 * `HyperdriveLike` is deliberately smaller than `Hyperdrive` — it lists
 * exactly the methods repositories/services call. If a new method needs to
 * be used, add it here AND at the call site together.
 */
import type { Readable } from 'node:stream'

export interface HyperdriveLike {
  readonly key: Uint8Array
  readonly core: { readonly discoveryKey: Uint8Array }
  ready(): Promise<void>
  close(): Promise<void>
  put(path: string, buffer: Buffer | string): Promise<void>
  get(path: string, options?: { wait?: boolean; timeout?: number }): Promise<Buffer | null>
  entry(
    path: string,
    options?: { wait?: boolean; timeout?: number },
  ): Promise<{ key: string; seq: number; value: unknown } | null>
  exists(path: string): Promise<boolean>
  del(path: string): Promise<void>
  clear(
    path: string,
    options?: { diff?: boolean },
  ): Promise<{ blocks: number } | null>
  symlink(name: string, dst: string, options?: { metadata?: unknown }): Promise<void>
  createReadStream(path: string, options?: Record<string, unknown>): Readable
  createWriteStream(path: string, options?: Record<string, unknown>): NodeJS.WritableStream
  readdir(folder?: string, options?: Record<string, unknown>): AsyncIterable<string> | NodeJS.ReadableStream
  stat(path: string, options?: { wait?: boolean }): Promise<{
    isDirectory(): boolean
    isFile(): boolean
    size?: number
  } | null>
  list(
    path: string,
    options?: { recursive?: boolean },
  ): AsyncIterable<{ key: string; value: unknown }>
}

export interface ReadStream extends Readable {
  readonly length: number
}

export interface TreeNode {
  name: string
  type: 'file' | 'directory'
  size?: number
  children?: TreeNode[]
}

export interface SDK {
  readonly publicKey: Uint8Array
  readonly connections: Array<{ remotePublicKey: Buffer }>
  readonly swarm: {
    address(): { port: number }
    join(discoveryKey: Buffer, opts?: { server?: boolean; client?: boolean }): { flushed(): Promise<void> }
    leave(discoveryKey: Buffer): Promise<void>
  }
  getDrive(namespace: string): Promise<HyperdriveLike>
  join(discoveryKey: Buffer | Uint8Array, opts?: { server?: boolean; client?: boolean }): { flushed(): Promise<void> }
  close(): Promise<void>
}

export interface PeerInfo {
  publicKey: string
  connectedAt: string
}

export interface IdentityInfo {
  mainDriveKey: string
  peerPublicKey: string
  swarmPort: number
  peerCount: number
}

export interface HyperdriveEntry {
  key: string
  seq: number
  value: { type: 'file' | 'directory' | 'symlink'; metadata: unknown } | null
}
