/**
 * Sidecar composition root — the single place that wires the full CSR
 * dependency graph in production.
 *
 * Builds, in order:
 *   1. SDK instance (from `hyper-sdk`'s `create`)
 *   2. DriveIndex (load persisted index), DriveRegistry (mount bookkeeping)
 *   3. DriveRepository, PeerConnectionRepository (wrappers over the SDK)
 *   4. DriveService (business CRUD over Hyperdrives)
 *   5. FileService (drive-keyed file ops backed by the registry)
 *   6. SwarmService (network surface — main drive key + swarm port are
 *      lazy so they reflect current SDK state)
 *
 * Returns the `Services` bag consumed by controllers / middlewares. The
 * composition lives in `bootstrap/` (not inlined into `index.ts`) so
 * tests can compose the same graph without booting the HTTP server.
 */
import { create as createSdk } from '../infrastructure/sdk/index.js'
import type { Config } from '../config/index.js'
import { MAIN_NAMESPACE, DriveService } from '../services/drives.service.js'
import { FileService } from '../services/files.service.js'
import { SwarmService } from '../services/swarm.service.js'
import {
  HyperdriveRepository,
  HyperdriveSwarmRepository,
  FileSystemDriveIndexRepository,
} from '../repositories/index.js'
import type { DriveRegistry } from './drive-registry.js'
import { InMemoryDriveRegistry } from './drive-registry.js'
import { driveKeyOf } from '../infrastructure/types/key.js'

export interface Services {
  drives: DriveService
  files: FileService
  swarm: SwarmService
  registry: DriveRegistry
  /**
   * The underlying SDK handle. Exposed so `buildServer` can pass it to
   * `TestController` for test-routes (which need to inject synthetic
   * connections into `sdk.connections`). Production code paths never
   * read this.
   */
  sdk: import('../infrastructure/index.js').SDK
}

/**
 * Resolve the UDP port the underlying Hyperswarm is bound to.
 *
 * The official SDK exposes `sdk.swarm` but does NOT publish its bound
 * port directly. Hyperswarm v4 keeps it on `swarm.dht.address()`. We
 * treat 0 as "not listening yet" — matches the historical sidecar
 * contract.
 */
function resolvedSwarmPort(sdk: ReturnType<typeof createSdk> extends Promise<infer S> ? S : never): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dht = (sdk.swarm as any).dht as
    | { address?: () => { port: number } }
    | undefined
  if (dht && typeof dht.address === 'function') {
    const addr = dht.address()
    return typeof addr.port === 'number' ? addr.port : 0
  }
  return 0
}

export async function bootstrap(config: Config): Promise<Services> {
  // 1. SDK
  const sdk = await createSdk({
    storage: config.storeDir,
    autoJoin: true,
    swarmOpts: {
      ...(config.swarmPort > 0 ? { port: config.swarmPort } : {}),
      ...(config.bootstrap && config.bootstrap.length > 0
        ? { bootstrap: config.bootstrap }
        : {}),
    },
  })

  // 2. Repositories + registry
  const index = new FileSystemDriveIndexRepository(config.storeDir)
  await index.load()
  const registry = new InMemoryDriveRegistry()
  const drivesRepo = new HyperdriveRepository(sdk)
  const peersRepo = new HyperdriveSwarmRepository(sdk.connections)

  // The "main" drive is always mounted under the `main` namespace. We
  // mount it first so the registry has a known anchor for `keyToUuid`.
  const mainDrive = await drivesRepo.openLocal(MAIN_NAMESPACE)
  registry.rememberLocal(MAIN_NAMESPACE, mainDrive)
  if (!index.entries()[MAIN_NAMESPACE]) {
    await index.set(MAIN_NAMESPACE, {
      name: 'main',
      type: 'metadata',
      createdAt: '2024-01-01T00:00:00.000Z',
    })
  }

  const keyToUuid = new Map<string, string>()
  keyToUuid.set(driveKeyOf(mainDrive), MAIN_NAMESPACE)

  // Remount every non-main drive recorded in the index.
  for (const [uuid, entry] of Object.entries(index.entries())) {
    if (uuid === MAIN_NAMESPACE) continue
    try {
      const drive = await drivesRepo.openLocal(uuid)
      registry.rememberLocal(uuid, drive)
      keyToUuid.set(driveKeyOf(drive), uuid)
    } catch (err) {
      console.warn(
        `[drive-index] failed to remount drive uuid=${uuid}:`,
        (err as Error).message,
      )
    }
  }

  // 3. Services
  const drives = new DriveService(drivesRepo, index, registry)
  drives.seed(keyToUuid)
  const files = new FileService(registry)
  const swarm = new SwarmService(
    sdk,
    peersRepo,
    drivesRepo,
    registry,
    () => driveKeyOf(mainDrive),
    () => resolvedSwarmPort(sdk),
  )

  return { drives, files, swarm, registry, sdk }
}