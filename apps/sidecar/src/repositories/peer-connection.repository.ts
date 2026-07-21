/**
 * PeerConnectionRepository — read-side abstraction over the swarm's
 * underlying `Set<Connection>`.
 *
 * The official `hyper-sdk` exposes `sdk.connections` (declared as
 * `Connection[]` but actually a `Set<Connection>` at runtime). Services
 * depend on this interface, not on `sdk.connections` directly, so:
 *   - test fakes can inject a fixed connection list;
 *   - the wire shape (`PeerConnection.remotePublicKey`) doesn't leak the
 *     SDK's structural `Connection` type upward.
 *
 * Note: the SDK does NOT expose a public `add` / `delete` API; the test
 * route (`/v1/_test/peer`) reaches into `sdk.connections` directly via
 * `(sdk.connections as unknown as Set<...>)`. That write path is
 * deliberately kept inside the controllers layer; this repository is the
 * read side only.
 */
export interface PeerConnection {
  remotePublicKey: Buffer
}

export interface PeerConnectionRepository {
  /** Snapshot of all live connections. */
  list(): PeerConnection[]

  /** Number of live connections. */
  count(): number
}

/**
 * Production `PeerConnectionRepository` — wraps `sdk.connections`. Accepts
 * any value with `Symbol.iterator` + `.size` so it can be backed by both
 * the SDK's `Set<Connection>` and test-injected fakes.
 */
export class HyperdriveSwarmRepository implements PeerConnectionRepository {
  constructor(private readonly connections: unknown) {}

  list(): PeerConnection[] {
    const set = this.connections as
      | { values(): IterableIterator<PeerConnection> }
      | Iterable<PeerConnection>
    if (set && typeof (set as { values?: unknown }).values === 'function') {
      return [...(set as { values(): IterableIterator<PeerConnection> }).values()]
    }
    if (set && typeof (set as Iterable<PeerConnection>)[Symbol.iterator] === 'function') {
      return [...(set as Iterable<PeerConnection>)]
    }
    return []
  }

  count(): number {
    const c = this.connections as { size?: number; length?: number }
    if (typeof c.size === 'number') return c.size
    if (typeof c.length === 'number') return c.length
    return this.list().length
  }
}