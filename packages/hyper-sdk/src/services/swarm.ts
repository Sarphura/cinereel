import type { StoreRuntime } from '../runtime/corestore.js';
import {
  driveKeyOf,
  normalizeAndValidateDriveKey,
} from '../utils/hyperdrive.factory.js';
import type { SwarmRuntime } from '../runtime/hyperswarm.js';
import type { IdentityInfo, PeerInfo } from '../types/types.js';

export interface SwarmService {
  announce: (flush?: boolean) => Promise<void>;
  getPeers: () => PeerInfo[];
  mount: (publicKey: string) => Promise<{ driveKey: string }>;
  unmount: (publicKey: string) => Promise<void>;
  identity: () => IdentityInfo;
}

export function makeSwarmService(
  runtime: StoreRuntime,
  swarm: SwarmRuntime,
): SwarmService {
  async function announce(flush = true): Promise<void> {
    await swarm.join(runtime.main, flush);
  }

  function getPeers(): PeerInfo[] {
    const peers: PeerInfo[] = [];
    for (const conn of swarm.swarm.connections) {
      try {
        const stamped = (conn as unknown as { _connectedAt?: string })._connectedAt;
        peers.push({
          publicKey: conn.remotePublicKey.toString('hex'),
          connectedAt: stamped ?? new Date().toISOString(),
        });
      } catch (err) {
        console.warn('[hyper-sdk] getPeers: skipped peer', err);
      }
    }
    return peers;
  }

  async function mount(publicKey: string): Promise<{ driveKey: string }> {
    const { hex } = parseHexKey(publicKey);
    const drive = await runtime.resolveByKey(hex);
    await swarm.join(drive, true);
    return { driveKey: driveKeyOf(drive) };
  }

  async function unmount(publicKey: string): Promise<void> {
    const drive = await runtime.resolveByKey(publicKey);
    await swarm.leave(drive);
  }

  function identity(): IdentityInfo {
    let peerPublicKey = '';
    try {
      peerPublicKey = swarm.swarm.keyPair.publicKey.toString('hex');
    } catch (err) {
      console.warn('[hyper-sdk] identity: keyPair.publicKey unreadable', err);
    }
    return {
      mainDriveKey: driveKeyOf(runtime.main),
      peerPublicKey,
      swarmPort: swarm.port,
      peerCount: swarm.swarm.connections.size,
    };
  }

  return { announce, getPeers, mount, unmount, identity };
}

function parseHexKey(hex: string) {
  try {
    return normalizeAndValidateDriveKey(hex);
  } catch {
    throw new InvalidPublicKeyError(hex);
  }
}

export class InvalidPublicKeyError extends Error {
  constructor(public readonly provided: string) {
    super(`Invalid public key: ${provided}`);
    this.name = 'InvalidPublicKeyError';
  }
}