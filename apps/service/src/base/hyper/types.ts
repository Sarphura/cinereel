import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'
import Hyperswarm from 'hyperswarm'
import { FastifyInstance } from 'fastify'
import type { FastifyBaseLogger } from 'fastify'
import type { CollectionDriveContentType } from '../../modules/drive/entity/schema'

export interface HyperModuleOptions {
  network?: boolean
}

export interface HyperModuleConfig {
  log: FastifyBaseLogger
  store: Corestore
  drive: Hyperdrive
  swarm: Hyperswarm | null
  driveKey: string
  storeDir: string
  createPeerDrive: (key: Buffer) => Hyperdrive
  ensureDriveDiscovery: (topic: Buffer) => Promise<void>
  getDriveDiscoveryCount: (topic: Buffer) => Promise<number>
  close: () => Promise<void>
}

export type HyperFastifyContext = FastifyInstance & {
  hyperConfig: HyperModuleConfig
}

export interface LibraryEntry {
  path: string
  name: string
  extension: string
  size: number
  updatedAt: number
  kind: 'video' | 'audio' | 'other'
}

export interface MountOperation {
  type: 'add' | 'change' | 'remove' | 'equal'
  key: string
  bytesAdded: number
  bytesRemoved: number
}

export interface MountResult {
  sourcePath: string
  mountedPath: string
  kind: 'file' | 'directory'
  filesDiscovered: number
  filesAdded: number
  filesChanged: number
  filesRemoved: number
  bytesAdded: number
  bytesRemoved: number
  operations: MountOperation[]
  publication: PublishedResourceRecord
}

export interface MountJob {
  id: string
  driveKey: string
  targetPath: string
  mountedPath: string | null
  kind: 'file' | 'directory' | null
  totalFiles: number
  processedFiles: number
  totalBytes: number
  processedBytes: number
  currentFilePath: string | null
  progress: number
  status: 'queued' | 'mounting' | 'completed' | 'failed'
  error: string | null
  result: MountResult | null
  createdAt: number
  updatedAt: number
}

export interface ScanFailedFileRecord {
  path: string
  fileName: string
  error: string
  failedAt: number
}

export interface ScanJob {
  id: string
  driveKey: string
  rootPath: string
  publicationId: string
  totalFiles: number
  processedFiles: number
  currentFilePath: string | null
  progress: number
  status: 'queued' | 'scanning' | 'completed' | 'failed'
  error: string | null
  failedFiles: ScanFailedFileRecord[]
  createdAt: number
  updatedAt: number
}

export interface PublishedResourceRecord {
  id: string
  sourceName: string
  sourcePath?: string
  rootPath: string
  kind: 'file' | 'directory'
  createdAt: number
  updatedAt: number
  fileCount: number
  totalSize: number
}

export interface PublicationTreeNode {
  path: string
  name: string
  type: 'file' | 'directory'
  size: number
  updatedAt: number
  localDirPath?: string | null
  scanStatus?: 'ok' | 'failed' | 'pending' | null
  scanError?: string | null
  children?: PublicationTreeNode[]
}

export interface DriveSummaryRecord {
  driveKey: string
  name: string
  type: CollectionDriveContentType
  remark?: string
  createdAt: number
  updatedAt: number
  fileCount: number
  totalSize: number
  publicationCount: number
  peerCount: number
  isLocal: boolean
}

export interface ProfileSummaryRecord {
  driveKey: string
  name: string
  bio: string
  avatarPath: string | null
  updatedAt: number
  collections: Array<{
    driveKey: string
    name: string
    addedAt: number
    updatedAt: number
  }>
}
