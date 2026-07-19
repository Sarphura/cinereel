import Hyperswarm from 'hyperswarm';
import type { Drive } from '../types/hyperdrive.js';

const DEFAULT_BOOTSTRAP_PORT = 49737;
const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
const BOUND_REFRESH_MAX_TRIES = 25;
const BOUND_REFRESH_INTERVAL_MS = 10;
const UNBOUND_PORT = 0;
const LOOPBACK_HOST = '127.0.0.1';

export interface PeerConnection {
  remotePublicKey: Buffer;
  on: (event: 'close', cb: () => void) => unknown;
}

export interface SwarmRuntime {
  swarm: Hyperswarm;
  /**
   * Real UDP port the DHT is currently bound to. Starts at 0 and is populated
   * lazily the first time the swarm actually listens (usually during the
   * first `join()`). Use this, NOT `swarm.port`, when you need the port
   * for bootstrap / monitoring.
   */
  port: number;
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
   * hyperdrive v13's `update()` only accepts `{ wait, activeRequests, force }`.
   */
  join: (drive: Drive, wait?: boolean) => Promise<void>;
  leave: (drive: Drive) => Promise<void>;
  destroy: () => Promise<void>;
}

function readBoundAddr(swarm: Hyperswarm): { port: number; host: string } {
  const listening = swarm.dht.listening;
  if (!listening || listening.size === 0) return { port: UNBOUND_PORT, host: LOOPBACK_HOST };
  const first = listening.values().next().value;
  if (!first) return { port: UNBOUND_PORT, host: LOOPBACK_HOST };
  const addr = first.address();
  return { port: addr.port, host: addr.host };
}

function parseBootstrapAddress(input: string): { host: string; port: number } | null {
  const m = input.match(/^(?:\[([^\]]+)\]|([^:]+))(?::(\d+))?$/);
  if (!m) return null;
  const host = m[1] ?? m[2] ?? LOOPBACK_HOST;
  const port = Number(m[3] ?? DEFAULT_BOOTSTRAP_PORT);
  if (!Number.isFinite(port)) return null;
  return { host, port };
}

export function createHyperswarmRuntime(
  port = 0,
  bootstrap?: string[],
): SwarmRuntime {
  const swarm = new Hyperswarm({ port });

  if (bootstrap && bootstrap.length > 0) {
    for (const addr of bootstrap) {
      const parsed = parseBootstrapAddress(addr);
      if (!parsed) {
        console.warn('[hyper-sdk] bootstrap: skipping unparseable address', addr);
        continue;
      }
      try {
        swarm.dht.addNode(parsed);
      } catch (err) {
        console.warn('[hyper-sdk] bootstrap: addNode failed for', parsed, err);
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
    if (a.port !== UNBOUND_PORT) {
      boundPort = a.port;
      boundHost = a.host;
      return;
    }
    // `readBoundAddr` may have raced ahead of the bind; wait one event-loop
    // tick and try again. The DHT opens the socket synchronously inside
    // swarm.join(), so a microtask is usually enough — but `listen()` is
    // also async, so allow up to BOUND_REFRESH_MAX_TRIES * interval for
    // the port to settle.
    for (let i = 0; i < BOUND_REFRESH_MAX_TRIES; i++) {
      await new Promise((r) => setTimeout(r, BOUND_REFRESH_INTERVAL_MS));
      const a2 = readBoundAddr(swarm);
      if (a2.port !== UNBOUND_PORT) {
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
    destroy
  };
}