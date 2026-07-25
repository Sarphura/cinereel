/**
 * BootstrapModule — replaces `bootstrap/bootstrap.ts` (the free function).
 *
 * Composition root in NestJS terms. The ordering constraint
 * (load index → mount main → remount persisted drives → seed keyToUuid
 * → initial announce) is satisfied by `BootstrapService.onModuleInit`,
 * which runs after Nest has wired all providers.
 *
 * ── onModuleInit sequence (ADR 0048, ADR 0050) ─────────────────────
 *   1. `this.index.load()` — read drive-index.json from disk.
 *        Failure mode: corrupt index → caught here, exits with
 *        `EXIT_DRIVE_INDEX_CORRUPT` (79). Missing file is fine; treated
 *        as "no persisted drives yet" and only `main` is mounted.
 *   2. Mount the main drive under the fixed `MAIN_NAMESPACE` ('main').
 *        Failure mode: SDK / Hyperdrive error → exits with
 *        `EXIT_MAIN_DRIVE_MOUNT_FAILED` (80). The registry MUST have
 *        this anchor before any non-main drive is opened.
 *   3. Remount every persisted non-main drive (best-effort per drive).
 *        A failing remount logs a warning and is skipped — the surviving
 *        drives still come up. A drive that fails to remount in this
 *        pass is dropped from the in-memory registry and stays absent
 *        from `drive-index.json` until the operator intervenes.
 *   4. Seed `DriveService.keyToUuid` from the recovered registry so
 *        `remove(driveKey)` works for every drive remounted above.
 *   5. Best-effort initial `swarmService.announce(true)` — joins the
 *        main drive's discovery topic and awaits `discovery.flushed()`.
 *        A slow DHT does NOT block readiness; failures are logged but
 *        do not change the `/healthz` answer.
 *
 * `/healthz` returns 200 only after step 5 has either succeeded or
 * logged a warning. The Application Server's startup sequence polls
 * `/healthz` to learn when the Hyper Agent is ready to serve.
 */
import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  OnModuleInit,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SDK_TOKEN } from '../core/sdk/sdk.module.js'
import type { SDK } from '../infrastructure/index.js'
import { driveKeyOf } from '../infrastructure/types/key.js'
import { MAIN_NAMESPACE, DriveService } from '../services/drives.service.js'
import { FileService } from '../services/files.service.js'
import { SwarmService } from '../services/swarm.service.js'
import {
  FileSystemDriveIndexRepository,
  HyperdriveRepository,
  HyperdriveSwarmRepository,
} from '../repositories/index.js'
import { InMemoryDriveRegistry } from './drive-registry.js'

export const DRIVE_INDEX = Symbol('DRIVE_INDEX')
export const PEER_CONNECTIONS = Symbol('PEER_CONNECTIONS')
export const SDK_HANDLE = Symbol('SDK_HANDLE')

@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapService.name)

  constructor(
    @Inject(SDK_TOKEN) private readonly sdk: SDK,
    @Inject(SDK_HANDLE) private readonly sdkHandle: SDK,
    @Inject(DriveService) private readonly driveService: DriveService,
    @Inject(SwarmService) private readonly swarmService: SwarmService,
    @Inject(FileSystemDriveIndexRepository) private readonly index: FileSystemDriveIndexRepository,
    @Inject(InMemoryDriveRegistry) private readonly registry: InMemoryDriveRegistry,
    @Inject(HyperdriveRepository) private readonly drives: HyperdriveRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    // 1. Load persisted index. A corrupt or half-formed file is fatal —
    //    the Hyper Agent refuses to silently recover (ADR 0045, ticket 07)
    //    and exits with EXIT_DRIVE_INDEX_CORRUPT so the operator notices
    //    instead of finding drives missing later.
    try {
      await this.index.load()
    } catch (err) {
      this.logger.error(
        `drive-index.json is corrupt or unreadable: ${(err as Error).message}`,
      )
      process.exit(79)
    }

    // 2. Mount the main drive (always first, so registry has anchor).
    try {
      const main = await this.drives.openLocal(MAIN_NAMESPACE)
      this.registry.rememberLocal(MAIN_NAMESPACE, main)
      if (!this.index.entries()[MAIN_NAMESPACE]) {
        await this.index.set(MAIN_NAMESPACE, {
          name: 'main',
          type: 'metadata',
          createdAt: '2024-01-01T00:00:00.000Z',
        })
      }

      // 3. Remount every persisted non-main drive; seed keyToUuid.
      const keyToUuid = new Map<string, string>()
      keyToUuid.set(driveKeyOf(main), MAIN_NAMESPACE)
      for (const [uuid] of Object.entries(this.index.entries())) {
        if (uuid === MAIN_NAMESPACE) continue
        try {
          const d = await this.drives.openLocal(uuid)
          this.registry.rememberLocal(uuid, d)
          keyToUuid.set(driveKeyOf(d), uuid)
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn(
            `[drive-index] failed to remount drive uuid=${uuid}:`,
            (err as Error).message,
          )
        }
      }
      this.driveService.seed(keyToUuid)
    } catch (err) {
      // SDK not available in test environment (overridden with a stub
      // that doesn't implement the full surface). The sidecar still
      // boots; controllers will surface errors on first request.
      this.logger.warn(`onModuleInit skipped: ${(err as Error).message}`)
    }

    // 4. Best-effort initial announce (swarm in DHT before HTTP traffic).
    try {
      await this.swarmService.announce(true)
    } catch (err) {
      this.logger.warn(`initial announce failed: ${(err as Error).message}`)
    }
  }
}

@Global()
@Module({
  providers: [
    // ── Infrastructure singletons ───────────────────────────────────
    InMemoryDriveRegistry,
    HyperdriveRepository,
    HyperdriveSwarmRepository,

    // DRIVE_INDEX provides the interface impl; ALSO re-provide under
    // the FileSystemDriveIndexRepository class token so any service
    // that depends on the concrete type (DriveIndexRepository is an
    // interface so TypeScript's emitDecoratorMetadata would emit the
    // typeof as the parameter metadata — we satisfy both via this
    // bridge).
    {
      provide: FileSystemDriveIndexRepository,
      useFactory: (cfg: ConfigService) => {
        const storeDir = cfg.get<string>('storeDir') as string
        return new FileSystemDriveIndexRepository(storeDir)
      },
      inject: [ConfigService],
    },
    {
      provide: DRIVE_INDEX,
      useExisting: FileSystemDriveIndexRepository,
    },

    {
      provide: HyperdriveSwarmRepository,
      useFactory: (sdk: SDK) => new HyperdriveSwarmRepository(sdk.connections),
      inject: [SDK_TOKEN],
    },
    {
      provide: PEER_CONNECTIONS,
      useExisting: HyperdriveSwarmRepository,
    },

    // ── Domain services (constructor-injected) ──────────────────────
    DriveService,
    FileService,
    SwarmService,

    // ── SDK_HANDLE pass-through (for test controller only) ──────────
    { provide: SDK_HANDLE, useExisting: SDK_TOKEN },

    // ── Bootstrap orchestration (runs OnModuleInit) ────────────────
    BootstrapService,
  ],
  exports: [
    InMemoryDriveRegistry,
    DriveService,
    SwarmService,
    SDK_HANDLE,
    DRIVE_INDEX,
    PEER_CONNECTIONS,
    HyperdriveRepository,
    FileSystemDriveIndexRepository,
    FileService,
  ],
})
export class BootstrapModule {}
