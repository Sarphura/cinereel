/**
 * Ambient type declarations for `hypercore` — the Holepunch reference docs
 * describe the v11 surface, which is the version consumed by
 * `@cinereel/hyper-sdk`.
 *
 * Reference: https://github.com/holepunchto/pear-docs/blob/published/content/reference/building-blocks/hypercore.mdx
 */

import type { Readable, Writable, Duplex } from 'node:stream'
import type { EventEmitter } from 'node:events'

// ────────────────────────────────────────────────────────────────────────────
// Generic crypto / encoding helpers
// ────────────────────────────────────────────────────────────────────────────

/** A 32-byte Ed25519 / Noise key pair, as used across the hyper stack. */
export interface KeyPair {
  publicKey: Buffer
  secretKey: Buffer | null
}

/** Compact-encoding style codec passed as `valueEncoding`. */
export interface Codec {
  encode(value: unknown): Buffer
  decode(buffer: Buffer): unknown
}

/** Anything accepted where the docs say `string | object` for valueEncoding. */
export type ValueEncoding = string | Codec

// ────────────────────────────────────────────────────────────────────────────
// Construction-time options
// ────────────────────────────────────────────────────────────────────────────

export interface HypercoreOptions {
  /** Public key of an existing core (32 bytes). Omit to generate one. */
  key?: Buffer | null
  /** Ed25519 key pair used for signing appended blocks. */
  keyPair?: KeyPair
  /** 32-byte encryption key enabling block encryption. */
  encryptionKey?: Buffer
  /** Custom encryption provider satisfying the HypercoreEncryption interface. */
  encryption?: HypercoreEncryption | null
  /** Default encoding for values returned from `get`. */
  valueEncoding?: ValueEncoding | null
  /** Open the session read-only when false. */
  writable?: boolean
  /** Download blocks on demand only (default true). */
  sparse?: boolean
  /** Do not keep the underlying core alive when this is the last session. */
  weak?: boolean
  /** Snapshot the length at open time; later blocks are invisible. */
  snapshot?: boolean
  /** Default per-call timeout for `get` / `seek` (ms, 0 = none). */
  timeout?: number
  /** Wait for blocks to download by default. */
  wait?: boolean
  /** Notified whenever `get` triggers a network wait. */
  onwait?: (index: number, core: Hypercore) => void
  /** Notified on every `get` call with the requested index. */
  onseq?: (index: number, core: Hypercore) => void
  /** Enable legacy (v9) manifest compatibility. */
  compat?: boolean
  /** Acquire an exclusive write lock on the core. */
  exclusive?: boolean
  /** Storage descriptor (advanced). */
  storage?: HypercoreStorage | string
  /** Provide a manifest explicitly (advanced). */
  manifest?: unknown
}

export interface HypercoreEncryption {
  /** Padding size prepended to every block. */
  padding: number
  encrypt(index: number, block: Buffer, context: { key: Buffer }): Buffer | Promise<Buffer>
  decrypt(index: number, block: Buffer, context: { key: Buffer }): Buffer | Promise<Buffer>
}

export interface HypercoreStorage {
  /** Resolves when the underlying store is ready. */
  ready(): Promise<void> | void
  /** Resolves when the store has been closed. */
  close(): Promise<void> | void
  /** Resolves when the store has been deleted. */
  destroy(): Promise<void> | void
}

export interface SessionOptions extends HypercoreOptions {
  /** Storage atom used to stage writes. */
  atom?: unknown
  /** Named session; writes are staged under this name. */
  name?: string
  /** Roll a named/atom session back to this length after opening. */
  checkout?: number
}

// ────────────────────────────────────────────────────────────────────────────
// Per-call options
// ────────────────────────────────────────────────────────────────────────────

export interface GetOptions {
  wait?: boolean
  timeout?: number
  valueEncoding?: ValueEncoding
  decrypt?: boolean
  raw?: boolean
  onwait?: (index: number, core: Hypercore) => void
  activeRequests?: unknown
}

export interface SeekOptions {
  wait?: boolean
  timeout?: number
  activeRequests?: unknown
}

export interface UpdateOptions {
  wait?: boolean
  force?: boolean
  activeRequests?: unknown
}

export interface ClearOptions {
  diff?: boolean
}

export interface TruncateOptions {
  fork?: number
  keyPair?: KeyPair
  signature?: Buffer
}

export interface AppendOptions {
  keyPair?: KeyPair
  signature?: Buffer
  maxLength?: number
}

export interface ReadStreamOptions {
  start?: number
  end?: number
  live?: boolean
  snapshot?: boolean
  wait?: boolean
  timeout?: number
}

export interface ByteStreamOptions {
  byteOffset?: number
  byteLength?: number
  prefetch?: number
}

export interface DownloadRange {
  start?: number
  end?: number
  blocks?: number[]
  linear?: boolean
  activeRequests?: unknown
}

export interface ProofBlockRequest {
  index: number
}
export interface ProofHashRequest {
  index: number
}
export interface ProofSeekRequest {
  bytes: number
}
export interface ProofUpgradeRequest {
  start: number
  length: number
}

export interface ProofOptions {
  block?: ProofBlockRequest
  hash?: ProofHashRequest
  seek?: ProofSeekRequest
  upgrade?: ProofUpgradeRequest
  manifest?: object
}

export interface CommitOptions {
  length?: number
  treeLength?: number
  keyPair?: KeyPair
  signature?: Buffer
}

export interface SweepOptions {
  batchSize?: number
}

export interface CloseOptions {
  error?: Error
}

export interface InfoOptions {
  storage?: boolean
}

export interface SetEncryptionKeyOptions {
  block?: boolean
}

export interface KeyOptions {
  compat?: boolean
  version?: number
  namespace?: Buffer
}

export interface ProtocolStreamOptions {
  stream?: Duplex | unknown
  ondiscoverykey?: (discoveryKey: Buffer) => void
  keepAlive?: boolean
}

export interface DefaultStorageOptions {
  sparse?: boolean
}

// ────────────────────────────────────────────────────────────────────────────
// Return / value shapes
// ────────────────────────────────────────────────────────────────────────────

export interface HypercoreInfo {
  key: Buffer
  discoveryKey: Buffer
  length: number
  contiguousLength: number
  byteLength: number
  fork: number
  padding: number
  storage?: { oplog: number; tree: number; blocks: number; bitfield: number }
}

/** Returned by `core.download()`. */
export interface HypercoreDownload {
  /** Resolves once the requested range has been downloaded. */
  done(): Promise<void>
  /** Cancel the download. */
  destroy(): void
}

/** Returned by `core.createProtocolStream()` and `core.replicate()`. */
export interface HypercoreProtocolStream extends Duplex {
  noiseStream: { userData: ProtobufMux }
}

export interface ReplicatorPeer {
  remotePublicKey: Buffer
  [k: string]: unknown
}

/** Minimal Protomux shape — the docs only require `userData`. */
export interface ProtobufMux {
  userData?: unknown
  [k: string]: unknown
}

export interface HypercoreExtensionHandlers {
  encoding?: string | Codec
  onmessage?: (message: unknown, peer: ReplicatorPeer) => void
  /** Receives broadcast helpers from `registerExtension`. */
  [k: string]: unknown
}

export interface HypercoreExtension {
  /** Send a message to a single peer. */
  send(message: unknown, peer: ReplicatorPeer): void
  /** Send a message to all peers. */
  broadcast(message: unknown): void
  /** Unregister the extension. */
  destroy(): void
}

/** Concrete `TreeProof`; the docs only define shape, so we keep fields opaque. */
export interface TreeProof {
  fork: number
  operations: unknown[]
  signature: Buffer
  [k: string]: unknown
}

/**
 * A single Hypercore session. Mirrors the v11 reference docs.
 */
export interface Hypercore extends EventEmitter {
  // ── Construction / cloning ────────────────────────────────────────────
  session(options?: SessionOptions): Hypercore
  snapshot(options?: SessionOptions): Hypercore
  commit(session: Hypercore, opts?: CommitOptions): Promise<{ length: number; byteLength: number } | null>
  replicate(isInitiatorOrStream: boolean | Duplex | ProtobufMux, opts?: ProtocolStreamOptions): HypercoreProtocolStream

  // ── Writing & mutation ───────────────────────────────────────────────
  append(block: Buffer | Buffer[] | string | (Buffer | string)[], options?: AppendOptions): Promise<{ length: number; byteLength: number }>
  createWriteStream(): Writable
  clear(start: number, end?: number, options?: ClearOptions): Promise<{ blocks: number } | null>
  truncate(newLength: number, options?: TruncateOptions): Promise<void>

  // ── Reading ──────────────────────────────────────────────────────────
  get(index: number, options?: GetOptions): Promise<Buffer | null>
  has(start: number, end?: number): Promise<boolean>
  update(options?: UpdateOptions): Promise<boolean>
  seek(bytes: number, options?: SeekOptions): Promise<[index: number, relativeOffset: number]>
  createReadStream(options?: ReadStreamOptions): Readable
  createByteStream(options?: ByteStreamOptions): Readable
  download(range?: DownloadRange): HypercoreDownload

  // ── Merkle proofs ────────────────────────────────────────────────────
  treeHash(length?: number): Promise<Buffer>
  proof(opts: ProofOptions): Promise<TreeProof>
  verifyFullyRemote(proof: object): Promise<unknown>
  signable(length?: number, fork?: number): Promise<Buffer>

  // ── Mark & sweep ─────────────────────────────────────────────────────
  startMarking(): Promise<void>
  markBlock(start: number, end?: number): Promise<void>
  clearMarkings(): Promise<void>
  sweep(opts?: SweepOptions): Promise<void>

  // ── Lifecycle & configuration ───────────────────────────────────────
  close(options?: CloseOptions): Promise<void>
  purge(): Promise<void>
  ready(): Promise<void>
  setEncryption(encryption: HypercoreEncryption | null): Promise<void>
  setEncryptionKey(key: Buffer, opts?: SetEncryptionKeyOptions): Promise<void>
  setKeyPair(keyPair: KeyPair): void
  setActive(active: boolean): void
  setGroup(topic: Buffer): Promise<void>
  setUserData(key: string, value: Buffer | string): Promise<void>
  getUserData(key: string): Promise<Buffer | null>

  // ── Discovery helpers ───────────────────────────────────────────────
  findingPeers(): (err?: Error | null) => void
  info(options?: InfoOptions): Promise<HypercoreInfo>
  registerExtension(name: string, handlers?: HypercoreExtensionHandlers): HypercoreExtension

  // ── Properties (read-only) ───────────────────────────────────────────
  readonly writable: boolean
  readonly readable: boolean
  readonly id: string | null
  readonly key: Buffer | null
  readonly keyPair: KeyPair | null
  readonly discoveryKey: Buffer | null
  readonly length: number
  readonly byteLength: number
  readonly manifest: unknown | null
  readonly signedLength: number
  readonly contiguousLength: number
  readonly remoteContiguousLength: number
  readonly fork: number
  readonly padding: number
  readonly peers: ReplicatorPeer[]

  // ── Events ───────────────────────────────────────────────────────────
  on(event: 'close', listener: () => void): this
  on(event: 'ready', listener: () => void): this
  on(event: 'append', listener: () => void): this
  on(event: 'truncate', listener: (ancestors: number, forkId: number) => void): this
  on(event: 'peer-add', listener: () => void): this
  on(event: 'peer-remove', listener: () => void): this
  on(event: 'upload', listener: (index: number, byteLength: number, peer: ReplicatorPeer) => void): this
  on(event: 'download', listener: (index: number, byteLength: number, peer: ReplicatorPeer) => void): this
  on(event: 'remote-contiguous-length', listener: (length: number) => void): this
  on(event: 'migrate', listener: (key: Buffer) => void): this
  on(event: string, listener: (...args: any[]) => void): this

  emit(event: string | symbol, ...args: any[]): boolean
}

/** Default export from the `hypercore` package. */
export interface HypercoreConstructor {
  /** Max suggested block size (15 MB). */
  readonly MAX_SUGGESTED_BLOCK_SIZE: number

  /** `new Hypercore(storage, [key], [options])`. */
  new (storage: string | HypercoreStorage | null, key?: Buffer | string | HypercoreOptions, options?: HypercoreOptions): Hypercore
  new (storage: string | HypercoreStorage | null, options?: HypercoreOptions): Hypercore

  /** Derive the public key for a manifest. */
  key(manifest: Buffer | object, options?: KeyOptions): Buffer
  /** Derive the discovery key from a Hypercore public key. */
  discoveryKey(key: Buffer): Buffer
  /** Derive a per-block encryption key from a public key + master key. */
  blockEncryptionKey(key: Buffer, encryptionKey: Buffer): Buffer
  /** Get the Protomux attached to a protocol stream. */
  getProtocolMuxer(stream: HypercoreProtocolStream): ProtobufMux
  /** Build the raw internal Core object without a session. */
  createCore(storage: string | HypercoreStorage, opts?: HypercoreOptions): unknown
  /** Wrap a path or CoreStorage into a default CoreStorage. */
  defaultStorage(storage: string | HypercoreStorage, opts?: DefaultStorageOptions): HypercoreStorage
  /** Open an encrypted noise stream with an attached Protomux. */
  createProtocolStream(isInitiator: boolean | Duplex | ProtobufMux, opts?: ProtocolStreamOptions): HypercoreProtocolStream
}

// ────────────────────────────────────────────────────────────────────────────
// Module augmentation
// ────────────────────────────────────────────────────────────────────────────

declare module 'hypercore' {
  export const MAX_SUGGESTED_BLOCK_SIZE: number
  export const Hypercore: HypercoreConstructor
  export default HypercoreConstructor
}
