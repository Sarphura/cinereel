export type DriveType = 'metadata' | 'blob';

export interface DriveDescriptor {
  driveKey: string;
  name: string;
  type: DriveType;
  isLocal: boolean;
  createdAt?: string;
}

export type EntryType = 'file' | 'directory';

export interface HyperdriveEntry {
  key: string;
  seq: number;
  value: {
    type: EntryType;
    metadata: unknown;
  } | null;
}

export interface TreeNode {
  name: string;
  type: EntryType;
  size?: number;
  children?: TreeNode[];
}

export interface PeerInfo {
  publicKey: string;
  connectedAt: string;
}

export interface IdentityInfo {
  mainDriveKey: string;
  /** Hex-encoded Noise public key of the local Hyperswarm node. */
  peerPublicKey: string;
  swarmPort: number;
  peerCount: number;
}
