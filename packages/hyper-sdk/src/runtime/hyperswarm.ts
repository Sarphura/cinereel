import Hyperswarm from 'hyperswarm';
import Hyperdrive from 'hyperdrive';
import type { RemoteAddress, ServerSocket } from 'hyperswarm';

type Drive = InstanceType<typeof Hyperdrive>;

/**
 * Read the actual UDP port the underlying DHT is listening on. Hyperswarm v4
 * does NOT expose `swarm.port` — its constructor takes `opts.port` but never
 * surfaces the OS-assigned value when port=0 is requested. The real port
 * lives on `swarm.dht.listening` (a Set of sockets). Until the swarm has
 * called `.listen()` or `.join()` at least once, that set is empty, so we
 * return 0 to mirror the old "unbound" sentinel.
 *
 * Returns `{ port, host }` — the host sidecar peers should dial when they
 * want to use this node as a bootstrap. Defaults to `127.0.0.1` in the
 * unmapped case because the SDK is intended for loopback dev too.
 */
function readBoundAddr(
  swarm: Hyperswarm,
): { port: number; host: string } {
  const listening = (swarm.dht as unknown as { listening?: Set<{ address(): { host: string; port: number } }> }).listening;
  if (!listening || listening.size === 0) return { port: 0, host: '127.0.0.1' };
  const first = listening.values().next().value;
  if (!first) return { port: 0, host: '127.0.0.1' };
  const addr = first.address();
  return { port: addr.port, host: addr.host };
}

/**
 * Single peer address used to short-circuit Hyperswarm's default DHT
 * peer-lookup path. `host` should be a routable address of the remote
 * node's noise-over-UDP socket (the value returned from
 * `HyperswarmRuntime.exposeLanAddress()` on the remote side).
 */
export interface LanAddress {
  host: string;
  port: number;
}

export interface HyperswarmRuntime {
  /** Underlying Hyperswarm instance — exposed so callers can iterate `connections` etc. */
  swarm: Hyperswarm;
  /**
   * Real UDP port the DHT is currently bound to. Starts at 0 and is populated
   * lazily the first time the swarm actually listens (usually during the
   * first `join()`). Use this, NOT `swarm.port`, when you need the port
   * for bootstrap / monitoring.
   */
  port: number;
  /** DHT bootstrap helper bound to this swarm's UDP socket host. */
  boundHost: string;
  /**
   * Announce this drive on the DHT and block until at least one peer has been
   * discovered OR an explicit peer-discovery round finishes.
   *
   * - `wait = true`  →  `drive.update({ wait: true })` after `discovery.flushed()`
   *   so callers don't return until findingPeers() / one peer becomes available.
   * - `wait = false` →  fire-and-forget; the runtime still calls `discovery.flushed()`
   *   so the DHT announce is acknowledged before we return.
   *
   * NOTE: hyperdrive v13's `update()` only accepts `{ wait, activeRequests, force }`.
   * Earlier drafts of this SDK passed `{ flush: true }`, which is silently ignored —
   * update() then defaulted to `wait: false`, meaning `announce(true)` was returning
   * before any peer had actually been observed. Keep this implementation in sync
   * with hyperdrive's documented signature.
   */
  join: (drive: Drive, wait?: boolean) => Promise<void>;
  leave: (drive: Drive) => Promise<void>;
  destroy: () => Promise<void>;
  /**
   * Test hook: synthesize a peer connection in `swarm.connections` without
   * going through DHT hole-punching. Real Hyperswarm P2P requires a public
   * DHT route (or a relay) and is not reproducible on a loopback-only CI
   * box. Tests for the `/v1/swarm/peers` HTTP contract drive this hook to
   * inject exactly the kinds of `Connection`-shaped objects that a real
   * connected peer would expose, then verify the wrapper layer surfaces
   * them correctly.
   *
   * Always returns `null` if the connection already exists for `publicKey`.
   */
  __testInjectPeer: (publicKey: Buffer) => void;
  /**
   * Test hook: remove a previously-injected synthetic connection. Real
   * Hyperswarm listeners (`swarm.on('connection-close', ...)`) emit on real
   * disconnect; tests use this for symmetric cleanup.
   */
  __testRemovePeer: (publicKey: Buffer) => void;
  /**
   * Surface this node's LAN-reachable Noise port so a remote peer can dial
   * it directly and skip the DHT peer-lookup path entirely.
   *
   * Why this exists: hyperswarm v4's default connect flow resolves the
   * target's address via `dht.findPeer`, which on sparse DHT tables
   * (e.g. one bootstrap node) cannot return any candidate. Returning the
   * LAN address here lets callers pass it through to `connectToPeer()` as
   * `relayAddresses`, which makes hyperdht call `connectThroughNodes`
   * directly without DHT lookup. Validated via `dht.validateLocalAddresses`,
   * so each entry has been confirmed bindable by the runtime's UDX socket.
   *
   * Returns `[]` until the swarm has actually opened its UDP socket
   * (no entry has called `join()` yet).
   */
  exposeLanAddress: () => Promise<LanAddress[]>;
  /**
   * Dial a remote peer by its Noise public key, bypassing the DHT lookup.
   * The caller MUST supply at least one `relayAddresses` entry (typically
   * obtained from `remote.exposeLanAddress()`). Without relay addresses
   * hyperdht will fall back to `dht.findPeer`, which — as noted on
   * `exposeLanAddress` — does not work on loopback / sparse DHT setups.
   *
   * Returns a `Connection` once noise-handshake completes; rejects if the
   * handshake times out (default 10s) or the remote is unreachable at the
   * given address. The caller is responsible for keeping the returned
   * connection alive and consuming its streams.
   */
  connectToPeer: (
    publicKey: Buffer,
    relayAddresses: LanAddress[],
    opts?: { timeoutMs?: number },
  ) => Promise<{
    remotePublicKey: Buffer;
    on: (event: 'close', cb: () => void) => unknown;
  }>;
}

export function createHyperswarmRuntime(
  port = 0,
  bootstrap?: string[],
): HyperswarmRuntime {
  const swarm = new Hyperswarm({ port });

  if (bootstrap && bootstrap.length > 0) {
    for (const b of bootstrap) {
      // Hyperswarm v4 does not expose `dht.bootstrap(addr)` — the public
      // method is `dht.addNode({ host, port })`. Earlier we called
      // `swarm.dht.bootstrap(b)`, which throws `TypeError: ... is not a
      // function`; the try/catch here silently swallowed it, leaving the
      // bootstrap pool empty. Force-parse the address so we don't pass a
      // naked string to addNode.
      try {
        const m = b.match(/^(?:\[([^\]]+)\]|([^:]+))(?::(\d+))?$/);
        if (!m) continue;
        const host = m[1] ?? m[2] ?? '127.0.0.1';
        const port = Number(m[3] ?? 49737);
        if (!Number.isFinite(port)) continue;
        (swarm.dht as unknown as { addNode(n: { host: string; port: number }): void }).addNode({ host, port });
      } catch {
        /* ignore — invalid bootstrap addresses are non-fatal */
      }
    }
  }

  // Lazy port / host: refreshed after the first operation that actually opens
  // the UDP socket. Until then we expose the constructor's request which may
  // literally be `0`.
  let boundPort = readBoundAddr(swarm).port || port;
  let boundHost = readBoundAddr(swarm).host;

  async function refreshBound(): Promise<void> {
    const a = readBoundAddr(swarm);
    // If the underlying socket has a real OS-assigned port now, prefer it.
    if (a.port !== 0) {
      boundPort = a.port;
      boundHost = a.host;
      return;
    }
    // `readBoundAddr` may have raced ahead of the bind; wait one event-loop
    // tick and try again. The DHT opens the socket synchronously inside
    // swarm.join(), so a microtask is usually enough — but `listen()` is
    // also async, so allow up to 250ms for the port to settle.
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 10));
      const a2 = readBoundAddr(swarm);
      if (a2.port !== 0) {
        boundPort = a2.port;
        boundHost = a2.host;
        return;
      }
    }
  }

  async function join(drive: Drive, wait = true): Promise<void> {
    const discovery = swarm.join(drive.discoveryKey, { client: true, server: true });
    await discovery.flushed();
    // The UDP socket is bound synchronously inside swarm.join(); settle the
    // cached port before any peer-discovery wait so /v1/swarm/identity and
    // bootstrap handshakes see a real value.
    await refreshBound();
    await drive.update({ wait });
  }

  async function leave(drive: Drive): Promise<void> {
    await swarm.leave(drive.discoveryKey);
  }

  async function destroy(): Promise<void> {
    await swarm.destroy();
  }

  /**
   * Build a synthetic `Connection`-shaped object that satisfies the contract
   * `SwarmService.getPeers` reads: `conn.remotePublicKey` as a Buffer plus
   * `_connectedAt` so the service can produce a stable timestamp per peer.
   * The `on()` shim exists because some callers inspect
   * `Connection`'s EventEmitter surface; we don't subscribe to anything here
   * so a no-op stub is enough.
   */
  function buildFakeConnection(publicKey: Buffer, at: string): {
    remotePublicKey: Buffer;
    _connectedAt: string;
    on: (event: 'close', cb: () => void) => unknown;
  } {
    return {
      remotePublicKey: Buffer.from(publicKey),
      _connectedAt: at,
      on: () => ({ /* fake */ }),
    };
  }

  function __testInjectPeer(publicKey: Buffer): void {
    for (const conn of swarm.connections) {
      if (conn.remotePublicKey.equals(publicKey)) return;
    }
    (swarm.connections as Set<unknown>).add(
      buildFakeConnection(publicKey, new Date().toISOString()),
    );
  }

  function __testRemovePeer(publicKey: Buffer): void {
    for (const conn of swarm.connections) {
      if (conn.remotePublicKey.equals(publicKey)) {
        swarm.connections.delete(conn);
        return;
      }
    }
  }

  /**
   * Return this node's bindable Noise-over-UDP addresses. We rely on
   * hyperdht's own `validateLocalAddresses`, which probes each candidate by
   * binding a UDX socket and returns only those that the OS actually accepts
   * — so the returned list is safe to publish over a control plane (HTTP,
   * IPC, etc.) and use as `relayAddresses` on the remote side.
   */
  async function exposeLanAddress(): Promise<LanAddress[]> {
    const dht = swarm.dht as unknown as {
      io?: { serverSocket?: ServerSocket | null };
      validateLocalAddresses?: (
        addresses: RemoteAddress[],
      ) => Promise<RemoteAddress[]>;
    };
    const socket = dht.io && dht.io.serverSocket;
    if (!socket) return [];
    // hyperdht ships its helper behind `lib/holepuncher.js`; importing the
    // module-by-path is fine because hyperdht's package.json allows it.
    const Holepuncher = (await import('hyperdht/lib/holepuncher.js')).default;
    const candidates = (Holepuncher as unknown as {
      localAddresses(s: ServerSocket): RemoteAddress[];
    }).localAddresses(socket);
    if (typeof dht.validateLocalAddresses !== 'function') return [];
    const validated = await dht.validateLocalAddresses(candidates);
    return validated.map((a) => ({ host: a.host, port: a.port }));
  }

  /**
   * Open a noise-handshaked connection to `publicKey` using `relayAddresses`
   * as the candidate set hyperdht tries before falling back to DHT lookup.
   *
   * Implementation note: `swarm.dht.connect(publicKey, { relayAddresses })`
   * is the lowest-level entry point exposed by hyperswarm's DHT. Passing
   * explicit relay addresses is what lets us skip `dht.findPeer` — which on
   * a single-bootstrap-node test environment cannot return any candidate,
   * because the DHT routing table has no second hop to query.
   */
  function connectToPeer(
    publicKey: Buffer,
    relayAddresses: LanAddress[],
    opts: { timeoutMs?: number } = {},
  ): Promise<{
    remotePublicKey: Buffer;
    on: (event: 'close', cb: () => void) => unknown;
  }> {
    const timeoutMs = opts.timeoutMs ?? 10_000;
    return new Promise((resolve, reject) => {
      const dht = swarm.dht as unknown as {
        connect(
          target: Buffer,
          o: { relayAddresses: LanAddress[]; keyPair?: unknown },
        ): {
          remotePublicKey: Buffer;
          on: (event: 'open' | 'error' | 'close', cb: (...a: unknown[]) => void) => unknown;
        };
      };
      let conn: ReturnType<typeof dht.connect>;
      try {
        conn = dht.connect(publicKey, { relayAddresses });
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
        return;
      }
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`connectToPeer timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      conn.on('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          remotePublicKey: conn.remotePublicKey,
          on: (event, cb) => conn.on(event, cb),
        });
      });
      conn.on('error', (err: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }

  return {
    swarm,
    get port(): number {
      return boundPort;
    },
    get boundHost(): string {
      return boundHost;
    },
    join,
    leave,
    destroy,
    __testInjectPeer,
    __testRemovePeer,
    exposeLanAddress,
    connectToPeer,
  };
}
