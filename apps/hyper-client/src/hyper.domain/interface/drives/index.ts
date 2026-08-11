/**
 * Repositories barrel.
 *
 * CSR layer: data access. Nothing in this barrel may import from
 * `services/`, `controllers/`, `middlewares/`, or `bootstrap/`.
 */
export type { DriveRepository } from './drive.repository.js'
export { HyperdriveRepository } from './drive.repository.js'
export type {
  DriveIndexEntry,
  DriveIndexRepository,
} from './drive-index.repository.js'
export {
  FileSystemDriveIndexRepository,
  MAIN_INDEX_ENTRY,
} from './drive-index.repository.js'
export type {
  PeerConnection,
  PeerConnectionRepository,
} from './peer-connection.repository.js'
export { HyperdriveSwarmRepository } from './peer-connection.repository.js'

export { InMemoryDriveIndexRepository } from '../../../hyper.infrastructure/persistence/in-memory/in-memory-drive-index.repository.js'
export { InMemoryDriveRepository } from '../../../hyper.infrastructure/persistence/in-memory/in-memory-drive.repository.js'
export { InMemoryPeerConnectionRepository } from '../../../hyper.infrastructure/persistence/in-memory/in-memory-peer-connection.repository.js'