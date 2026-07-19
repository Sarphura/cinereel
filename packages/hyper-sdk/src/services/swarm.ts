import type { CorestoreRuntime } from '../runtime/corestore.js';
import { resolveDriveByKey, driveKeyOf } from '../utils/hyperdrive.factory.js';
import type { HyperswarmRuntime } from '../runtime/hyperswarm.js';
import type { IdentityInfo, PeerInfo } from '../types/types.js';

export interface SwarmService {
  announce: (flush?: boolean) => Promise<void>;
  getPeers: () => PeerInfo[];
  mount: (publicKey: string) => Promise<{ driveKey: string }>;
  unmount: (publicKey: string) => Promise<void>;
  identity: () => IdentityInfo;
  /**
   * Test hook (gated at the HTTP layer): synthesise a peer connection with
   * the given hex Noise public key. Use to exercise the `/v1/swarm/peers`
   * HTTP contract on CI without depending on real Hyperswarm hole-punching.
   */
  __testInjectPeer: (hexPublicKey: string) => void;
  /** Test hook: remove a previously-injected synthetic peer. */
  __testRemovePeer: (hexPublicKey: string) => void;
}

export function makeSwarmService(
  runtime: CorestoreRuntime,
  swarm: HyperswarmRuntime,
): SwarmService {
  async function announce(flush = true): Promise<void> {
    await swarm.join(runtime.main, flush);
  }

  function getPeers(): PeerInfo[] {
    const peers: PeerInfo[] = [];
    const now = new Date().toISOString();
    for (const conn of swarm.swarm.connections) {
      try {
        // Real Hyperswarm connections don't carry `_connectedAt`; the
        // service stamps one at read time. Test-injected fakes stamp the
        // timestamp when they are added so a stable peer keeps a stable
        // `connectedAt` across calls — useful for snapshot tests.
        const connectedAt =
          (conn as unknown as { _connectedAt?: string })._connectedAt ?? now;
        peers.push({
          publicKey: conn.remotePublicKey.toString('hex'),
          connectedAt,
        });
      } catch {
        /* ignore */
      }
    }
    return peers;
  }

  async function mount(publicKey: string): Promise<{ driveKey: string }> {
    const norm = publicKey.toLowerCase().replace(/^0x/, '');
    if (!/^[0-9a-f]{64}$/.test(norm)) {
      throw new InvalidPublicKeyError(publicKey);
    }
    const drive = await resolveDriveByKey(runtime, norm);
    await swarm.join(drive, true);
    return { driveKey: driveKeyOf(drive) };
  }

  async function unmount(publicKey: string): Promise<void> {
    const drive = await resolveDriveByKey(runtime, publicKey);
    await swarm.leave(drive);
  }

  function identity(): IdentityInfo {
    const peerPublicKey = (() => {
      try {
        return swarm.swarm.keyPair.publicKey.toString('hex');
      } catch {
        return '';
      }
    })();
    return {
      mainDriveKey: driveKeyOf(runtime.main),
      peerPublicKey,
      swarmPort: swarm.port,
      peerCount: swarm.swarm.connections.size,
    };
  }

  function __testInjectPeer(hexPublicKey: string): void {
    swarm.__testInjectPeer(parseHexKey(hexPublicKey));
  }

  function __testRemovePeer(hexPublicKey: string): void {
    swarm.__testRemovePeer(parseHexKey(hexPublicKey));
  }

  return { announce, getPeers, mount, unmount, identity, __testInjectPeer, __testRemovePeer };
}

function parseHexKey(hex: string): Buffer {
  const norm = hex.toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{64}$/.test(norm)) {
    throw new InvalidPublicKeyError(hex);
  }
  return Buffer.from(norm, 'hex');
}

export class InvalidPublicKeyError extends Error {
  constructor(public readonly provided: string) {
    super(`Invalid public key: ${provided}`);
    this.name = 'InvalidPublicKeyError';
  }
}