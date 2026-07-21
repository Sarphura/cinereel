/**
 * Ambient type declarations for `hyperdrive` (v13.x) and the `corestore`
 * (v7.x) subset referenced by the Hyperdrive / Hypercore docs.
 *
 * References:
 *   - https://github.com/holepunchto/pear-docs/blob/published/content/reference/building-blocks/hyperdrive.mdx
 */

import type { Readable, Writable, Duplex } from 'node:stream'
import type { EventEmitter } from 'node:events'

import type {
  Hypercore,
  HypercoreOptions,
  KeyPair,
} from './hypercore.js'

// ────────────────────────────────────────────────────────────────────────────
// HYPERDRIVE  (v13.x)
// ────────────────────────────────────────────────────────────────────────────

export interface DriveOptions {
  /** Encryption key for both db + blob cores. */
  encryptionKey?: Buffer
  /** Hook called when a block must be downloaded before it can be read. */
  onwait?: (path: string, drive: Hyperdrive) => void
  /** Whether the drive cores actively maintain peer connections. */
  active?: boolean
  /** Pre-set the drive key (same as passing `key` to the constructor). */
  key?: Buffer
}

export interface WriteOptions {
  executable?: boolean
  metadata?: unknown
  dedup?: boolean
}

export interface DriveGetOptions {
  wait?: boolean
  timeout?: number
}

export interface DriveEntryOptions {
  follow?: boolean
  wait?: boolean
  timeout?: number
}

export interface DriveTruncateOptions {
  blobs?: number
}

export interface DriveUpdateOptions {
  wait?: boolean
}

export interface DriveClearOptions {
  diff?: boolean
}

export interface SymlinkOptions {
  metadata?: unknown
}

/** Hyperblobs subset that the drive docs reference. */
export interface Hyperblobs {
  get(key: Buffer | string): Promise<Buffer | null>
  put(buffer: Buffer): Promise<{ block: Buffer; size: number }>
  clear(blocks: Buffer | Buffer[]): Promise<void>
  [k: string]: unknown
}

/** Subset of Hyperbee used by Hyperdrive internals. */
export interface Hyperbee {
  core: Hypercore
  version: number
  get(key: string, opts?: { wait?: boolean }): Promise<{ key: string; value: HyperdriveEntryValue } | null>
  createReadStream(opts?: HyperbeeRange): Readable
  createDiffStream(other: Hyperbee | number, opts?: object): Readable
  watch(folder?: string): AsyncIterable<{ key: string; value: unknown }>
  close(): Promise<void>
  [k: string]: unknown
}

export interface HyperbeeRange {
  gt?: Buffer | string
  gte?: Buffer | string
  lt?: Buffer | string
  lte?: Buffer | string
}

export interface HyperdriveEntryValue {
  /** `file` or `directory` or `symlink`. */
  type: 'file' | 'directory' | 'symlink'
  /** Pointer into the Hyperblobs store (for files). */
  blob?: Buffer | null
  /** Path that a symlink points to. */
  linkname?: string | null
  /** Arbitrary JSON metadata stored on the entry. */
  metadata?: unknown
  /** Whether the file should be treated as executable. */
  executable?: boolean
}

export interface HyperdriveEntry {
  key: string
  value: HyperdriveEntryValue
  seq: number
}

export interface HyperdriveListOptions {
  recursive?: boolean
  ignore?: string[] | ((path: string) => boolean)
  wait?: boolean
  timeout?: number
}

export interface HyperdriveReadStreamOptions {
  start?: number
  end?: number
  length?: number
  wait?: boolean
  timeout?: number
}

export interface HyperdriveDiffOptions {
  /** Hivebee range constraint shorthand passed to `Hyperbee.createDiffStream`. */
  [k: string]: unknown
}

/** `Drive` returned by `drive.checkout(version)` — read-only snapshot. */
export interface HyperdriveSnapshot extends Hyperdrive {
  writable: false
}

/** MirrorDrive wrapper from the docs. */
export interface MirrorDrive {
  done(): Promise<void>
  destroy(): void
  on(event: 'append' | 'truncate' | 'mirror', listener: (...args: any[]) => void): this
  [k: string]: unknown
}

/** File-level transfer monitor from `drive.monitor`. */
export interface HyperdriveMonitor extends EventEmitter {
  /** Stats describing transfer progress of the monitored file. */
  [k: string]: unknown
}

/** A `Download` returned by `drive.download*` helpers. */
export interface HyperdriveDownload {
  done(): Promise<void>
  destroy(): void
  [k: string]: unknown
}

/**
 * Hyperdrive instance mirroring the v13.3.x docs.
 */
export interface Hyperdrive extends EventEmitter {
  ready(): Promise<void>
  close(): Promise<void>
  purge(): Promise<void>

  // Files
  put(path: string, buffer: Buffer | string, options?: WriteOptions): Promise<void>
  get(path: string, options?: DriveGetOptions): Promise<Buffer | null>
  entry(path: string, options?: DriveEntryOptions): Promise<HyperdriveEntry | null>
  exists(path: string): Promise<boolean>
  has(path: string): Promise<boolean>
  del(path: string): Promise<void>
  clear(path: string, options?: DriveClearOptions): Promise<{ blocks: number } | null>
  clearAll(options?: DriveClearOptions): Promise<{ blocks: number } | null>
  symlink(name: string, dst: string, options?: SymlinkOptions): Promise<void>
  createReadStream(path: string, options?: HyperdriveReadStreamOptions): Readable
  createWriteStream(path: string, options?: WriteOptions): Writable

  // Listings & dirs
  list(folder?: string, options?: HyperdriveListOptions): Readable
  readdir(folder?: string, options?: HyperdriveListOptions): Readable
  entries(range?: HyperbeeRange, options?: HyperbeeRange): Readable
  compare(entryA: HyperdriveEntry, entryB: HyperdriveEntry): number
  watch(folder?: string): AsyncIterable<[Hyperdrive, Hyperdrive]>

  // Versions
  batch(): Hyperdrive
  flush(): Promise<void>
  checkout(version: number): HyperdriveSnapshot
  diff(version: number, folder?: string, options?: HyperdriveDiffOptions): Readable
  truncate(version: number, options?: DriveTruncateOptions): Promise<void>

  // Replication & downloads
  mirror(out: Hyperdrive, options?: object): MirrorDrive
  download(folder?: string, options?: HyperdriveListOptions): Promise<HyperdriveDownload>
  downloadDiff(version: number, folder?: string, options?: HyperdriveDiffOptions): Promise<HyperdriveDownload>
  downloadRange(dbRanges: object[], blobRanges: object[]): Promise<HyperdriveDownload>
  findingPeers(): (err?: Error | null) => void
  replicate(isInitiatorOrStream: boolean | Duplex, opts?: object): Duplex
  update(options?: DriveUpdateOptions): Promise<boolean>

  // Blob accessors
  getBlobs(): Promise<Hyperblobs>
  getBlobsLength(checkout?: number): Promise<number>
  monitor(name: string, options?: object): HyperdriveMonitor

  // Properties
  readonly corestore: Corestore
  readonly db: Hyperbee
  readonly core: Hypercore
  readonly blobs: Hyperblobs | null
  readonly id: string
  readonly key: Buffer
  readonly discoveryKey: Buffer
  readonly contentKey: Buffer
  readonly writable: boolean
  readonly readable: boolean
  readonly version: number
  readonly supportsMetadata: boolean

  on(event: string, listener: (...args: any[]) => void): this
  emit(event: string | symbol, ...args: any[]): boolean
}

/** Default export from `hyperdrive`. */
export interface HyperdriveConstructor {
  new (corestore: Corestore, key?: Buffer, opts?: DriveOptions): Hyperdrive
  new (corestore: Corestore, opts: DriveOptions): Hyperdrive

  /** Static helper that resolves the default drive key from a Corestore. */
  getDriveKey(corestore: Corestore): Promise<Buffer>
}

// ────────────────────────────────────────────────────────────────────────────
// CORESTORE  (v7.x – subset referenced by Hyperdrive/Hypercore)
// ────────────────────────────────────────────────────────────────────────────

export interface CorestoreOptions {
  /** Storage directory. */
  storage?: string | (() => unknown) | unknown
  /** Default network options forwarded to new cores. */
  network?: object
}

export interface ReplicateOptions {
  /** Initiator role for the noise handshake. */
  initiator?: boolean
  /** User data attached to the protomux. */
  userData?: unknown
  [k: string]: unknown
}

export interface Corestore extends EventEmitter {
  /** Open (or generate) the default core on this store. */
  get(options?: HypercoreOptions): Promise<Hypercore>
  /** Open a named core within a namespace. */
  namespace(name: string | Buffer): Corestore
  session(opts?: { name?: string }): Corestore
  /** Bind an active session to drive peership. */
  replicate(optsOrStream?: ReplicateOptions | Duplex): Duplex
  /** Open a store-wide notify-group for atom batching. */
  notifyGroup(topic: Buffer): void
  /** Close every owned core. */
  close(): Promise<void>
  /** Persisted user-data store. */
  cache?: { get: (k: string) => Promise<Buffer | null>; set: (k: string, v: Buffer | string) => Promise<void> }
  /** List cores known to the store. */
  list: () => Promise<Buffer[]>
  /** Number of cores currently held in memory. */
  cores: { size: number }
  on(event: string, listener: (...args: any[]) => void): this
}

export interface CorestoreConstructor {
  new (storage?: string | (() => unknown) | unknown, opts?: CorestoreOptions): Corestore
}

// ────────────────────────────────────────────────────────────────────────────
// Module augmentations
// ────────────────────────────────────────────────────────────────────────────

declare module 'hyperdrive' {
  export const Hyperdrive: HyperdriveConstructor
  export default HyperdriveConstructor
}

declare module 'corestore' {
  export const Corestore: CorestoreConstructor
  export default CorestoreConstructor
}

// Re-exported so consumers can `import { KeyPair } from 'hypercore.js'`
// via the central barrel if desired.
export type { KeyPair }
