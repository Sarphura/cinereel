import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'
import Hyperswarm from 'hyperswarm'
import { FastifyInstance } from 'fastify'
import type { FastifyBaseLogger } from 'fastify'

export interface HyperModuleConfig {
  log: FastifyBaseLogger
  store: Corestore
  drive: Hyperdrive
  swarm: Hyperswarm
  driveKey: string
  storeDir: string
  createPeerDrive: (key: Buffer) => Hyperdrive
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

export interface PublishedResourceRecord {
  id: string
  displayName: string
  sourceName: string
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
  children?: PublicationTreeNode[]
}

export interface DriveSummaryRecord {
  driveKey: string
  label: string
  createdAt: number
  updatedAt: number
  fileCount: number
  totalSize: number
  publicationCount: number
  isLocal: boolean
}
