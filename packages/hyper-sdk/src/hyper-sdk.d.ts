// Type augmentations for hyper SDK modules.
// These live in `src/` so ambient `declare module` form works correctly.
declare module 'corestore' {
  export interface CorestoreInstance {
    name(): string;
    close(): Promise<void>;
    ready(): Promise<void>;
    session(): CorestoreInstance;
    namespace(name: string): CorestoreInstance;
  }
  export type NamespaceInstance = CorestoreInstance & {
    discoveryKey: Buffer;
    key: Buffer;
  };
  export interface CorestoreApi extends CorestoreInstance {
    get(opts: { name: string }): NamespaceInstance;
    get(opts: { key: Buffer }): NamespaceInstance;
  }
  const Corestore: new (dir?: string) => CorestoreApi;
  export { Corestore };
  export default Corestore;
}

declare module 'hyperdrive' {
  import type { Readable, Writable } from 'node:stream';

  // v13 entry value — blob===null means directory, otherwise it's a file blob handle
  export interface HyperdriveEntryValue {
    executable?: boolean;
    linkname?: string | null;
    blob?: unknown; // null when directory
    metadata?: unknown;
  }

  export interface HyperdriveEntryResult {
    key: string; // path string (e.g. '/test.txt') not the drive key
    seq: number;
    value: HyperdriveEntryValue | null;
  }

  // Renamed from Drive to avoid naming conflict with the default export constructor.
  export interface HyperdriveInstance {
    // identity
    readonly key: Buffer;       // drive public key (64-char hex)
    readonly discoveryKey: Buffer;
    readonly version: number;

    // lifecycle
    ready(): Promise<this>;
    close(): Promise<void>;
    update(opts?: { flush?: boolean }): Promise<void>;

    // content ops — v13 all return Promise / Readable / Writable
    entry(name: string, opts?: { wait?: boolean; follow?: boolean }): Promise<HyperdriveEntryResult | null>;
    readdir(folder: string, opts?: { wait?: boolean }): Readable;
    list(folder: string, opts?: { recursive?: boolean; wait?: boolean; ignore?: string | string[] }): Readable;
    del(name: string): Promise<void>;

    // streams
    createReadStream(name: string, opts?: { wait?: boolean; start?: number; end?: number }): Readable;
    createWriteStream(name: string, opts?: { executable?: boolean; metadata?: unknown; dedup?: boolean }): Writable;

    // high-level helpers
    put(name: string, buf: Buffer, opts?: { executable?: boolean; metadata?: unknown }): Promise<void>;
    putEntry(name: string, opts: { executable?: boolean; metadata?: unknown; blob?: unknown }): Promise<void>;
    exists(name: string): Promise<boolean>;

    // session
    checkout(version: number): HyperdriveInstance;
    /**
     * Wait for the drive to update from peers.
     * v13 accepts `{ wait?: boolean; activeRequests?: unknown; force?: boolean }`.
     * `wait: true` makes update() block until `findingPeers()` resolves OR a
     * peer surfaces; `wait: false` (default) returns immediately.
     */
    update(opts?: {
      wait?: boolean;
      activeRequests?: unknown;
      force?: boolean;
    }): Promise<boolean | undefined>;
  }

  // tsc uses `default` to resolve `InstanceType<typeof Hyperdrive>` at the call-site,
  // so the constructor type must match the shape above.
  // v13 constructor: `Hyperdrive(corestore, key, opts)`.
  // NOTE: key is a POSITIONAL argument. Passing `{ key }` as the second
  // arg is silently ignored (because isOptions({...}) === true) and a
  // random key is generated — a footgun that bites resolveDriveByKey.
  const Hyperdrive: {
    new (corestore: unknown): HyperdriveInstance;
    new (corestore: unknown, name: string): HyperdriveInstance;
    new (corestore: unknown, key: Buffer, opts?: {
      encryptionKey?: Buffer;
      _db?: unknown;
      _checkout?: unknown;
      onwait?: (err?: Error) => void;
    }): HyperdriveInstance;
  };
  export { Hyperdrive };
  export default Hyperdrive;
}

declare module 'hyperswarm' {
  // Minimal subset of hyperdht's types we consume via `swarm.dht.*`.
  // hyperdht does NOT ship type declarations, so we mirror only the
  // surface area this SDK needs. Anything else is intentionally omitted.
  export interface RemoteAddress {
    host: string;
    port: number;
  }
  export interface ServerSocket {
    address(): { host: string; port: number; family?: string };
  }
  export interface NoiseKeyPair {
    publicKey: Buffer;
    secretKey: Buffer;
  }
  export interface Connection {
    readonly remotePublicKey: Buffer;
    on(event: 'close', cb: () => void): this;
  }
  export interface SwarmOptions {
    port?: number;
    bootstrap?: string[];
  }
  export interface DiscoveryPromise extends Promise<void> {
    flushed(): Promise<void>;
  }
  export interface DHTHandle {
    /** Pass an "ip:port" string to register as a bootstrap node. */
    bootstrap(addr: string): void;
    /** Set of bound UDP sockets. Used by the SDK to discover its own port. */
    listening: Set<{ address(): { host: string; port: number } }>;
    /** Low-level UDX + noise socket used for outgoing holepunch packets. */
    io?: { serverSocket?: ServerSocket | null };
    /**
     * Probe each candidate by binding a fresh UDX socket on it. Returns
     * the subset the OS actually accepts. Used by `exposeLanAddress()`.
     */
    validateLocalAddresses(
      addresses: RemoteAddress[],
    ): Promise<RemoteAddress[]>;
    /**
     * Open a noise-handshaked connection to a target public key. Passing
     * `relayAddresses` lets hyperdht try those hosts first, skipping the
     * DHT peer-lookup path entirely.
     */
    connect(
      target: Buffer,
      opts: { relayAddresses: RemoteAddress[]; keyPair?: NoiseKeyPair },
    ): Connection;
  }
  export default class Hyperswarm {
    constructor(opts?: SwarmOptions);
    readonly connections: Set<Connection>;
    /** Local Noise keypair. Surfaced for identity endpoints and handshake. */
    readonly keyPair: NoiseKeyPair;
    // NOTE: hyperswarm@4 does NOT expose `swarm.port`. The OS-assigned
    // port (when opts.port=0) lives on `swarm.dht.listening`, which the
    // SDK runtime reads lazily and exposes via `HyperswarmRuntime.port`.
    // Consumers that need the bound UDP port must go through the runtime,
    // NOT through `swarm.port`.
    dht: DHTHandle;
    join(
      key: Buffer,
      opts?: { client?: boolean; server?: boolean },
    ): DiscoveryPromise;
    leave(key: Buffer): Promise<void>;
    destroy(): Promise<void>;
  }
}

// hyperdht ships no .d.ts; we only need a tiny sliver of its internal
// `Holepuncher.localAddresses` helper for `HyperswarmRuntime.exposeLanAddress`.
declare module 'hyperdht/lib/holepuncher.js' {
  import type { RemoteAddress, ServerSocket } from 'hyperswarm';
  const Holepuncher: {
    localAddresses(socket: ServerSocket): RemoteAddress[];
  };
  export default Holepuncher;
}
