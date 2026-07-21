/**
 * Ambient type declarations for `hyperswarm` (v4.x). The Holepunch reference
 * docs are the sole source of truth for the public surface described below.
 *
 * Reference: https://github.com/holepunchto/pear-docs/blob/published/content/reference/building-blocks/hyperswarm.mdx
 */

import type { Duplex } from 'node:stream'
import type { EventEmitter } from 'node:events'

import type { KeyPair } from './hypercore.js'

// ────────────────────────────────────────────────────────────────────────────
// Construction-time options
// ────────────────────────────────────────────────────────────────────────────

export interface HyperswarmOptions {
  /** Noise key pair used for DHT listen+connect. */
  keyPair?: KeyPair
  /** 32-byte seed used to derive a deterministic key pair. */
  seed?: Buffer
  /** Max peers kept open (default 64). */
  maxPeers?: number
  /** Max outbound client connections (default Infinity). */
  maxClientConnections?: number
  /** Max inbound server connections (default Infinity). */
  maxServerConnections?: number
  /** Max parallel connection attempts (default 3). */
  maxParallel?: number
  /** Per-peer allow/reject filter. */
  firewall?: (remotePublicKey: Buffer, payload: unknown) => boolean
  /** Public key (or resolver) of a relay node. */
  relayThrough?:
    | Buffer
    | ((socket: Duplex) => Buffer | null | undefined | Promise<Buffer | null | undefined>)
  /** Reuse an existing hyperdht instance. */
  dht?: { [k: string]: unknown }
}

export interface SwarmJoinOptions {
  server?: boolean
  client?: boolean
  limit?: number
}

export interface DiscoveryRefreshOptions {
  client?: boolean
  server?: boolean
  limit?: number
}

export interface SuspendOptions {
  log?: (...args: unknown[]) => void
}

export interface ResumeOptions {
  log?: (...args: unknown[]) => void
}

export interface DestroyOptions {
  force?: boolean
}

// ────────────────────────────────────────────────────────────────────────────
// Return / value shapes
// ────────────────────────────────────────────────────────────────────────────

export interface PeerInfo {
  publicKey: Buffer
  topics: Buffer[]
  prioritized: boolean
  ban(banStatus?: boolean): void
  [k: string]: unknown
}

/** Connection stream is a NoiseSecretStream-shaped duplex. */
export interface SwarmSocket extends Duplex {
  remotePublicKey: Buffer
  [k: string]: unknown
}

/**
 * Result of `swarm.join(topic, opts)` — also returned by `swarm.status(topic)`.
 */
export interface PeerDiscovery {
  flushed(): Promise<void>
  refresh(opts?: DiscoveryRefreshOptions): Promise<void>
  destroy(): Promise<void>
  /** Optional surface used internally. */
  [k: string]: unknown
}

/**
 * Hyperswarm instance mirroring the v4 reference docs.
 */
export interface Hyperswarm extends EventEmitter {
  // Counters / collections
  readonly connecting: number
  readonly connections: Set<SwarmSocket>
  readonly peers: Map<string, PeerInfo>
  readonly dht: { [k: string]: unknown }

  // Topic membership
  join(topic: Buffer, opts?: SwarmJoinOptions): PeerDiscovery
  leave(topic: Buffer): Promise<void>
  status(topic: Buffer): PeerDiscovery | null
  flush(): Promise<void>

  // Direct peers
  joinPeer(noisePublicKey: Buffer): void
  leavePeer(noisePublicKey: Buffer): void

  // Lifecycle
  listen(): Promise<void>
  suspend(opts?: SuspendOptions): Promise<void>
  resume(opts?: ResumeOptions): Promise<void>
  destroy(opts?: DestroyOptions): Promise<void>

  on(event: 'connection', listener: (socket: SwarmSocket, peerInfo: PeerInfo) => void): this
  on(event: 'update', listener: () => void): this
  on(event: 'ban', listener: (peerInfo: PeerInfo, err: Error | null) => void): this
  on(event: string, listener: (...args: any[]) => void): this
  emit(event: string | symbol, ...args: any[]): boolean
}

export interface HyperswarmConstructor {
  new (opts?: HyperswarmOptions): Hyperswarm
}

// ────────────────────────────────────────────────────────────────────────────
// Module augmentation
// ────────────────────────────────────────────────────────────────────────────

declare module 'hyperswarm' {
  export const Hyperswarm: HyperswarmConstructor
  export default HyperswarmConstructor
}
