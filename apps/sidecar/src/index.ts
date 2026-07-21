/**
 * Sidecar entry point — production composition root.
 *
 * Wires (in order):
 *   1. `loadConfig()` — read env, validate, normalize
 *   2. `loadApiKeys()` — populate the in-process auth registry
 *   3. `bootstrap()` — SDK + drives + files + swarm + registry
 *   4. `buildServer()` — Fastify + routes + auth + error serializer
 *   5. `app.listen()` — actually start serving
 *   6. signal handlers — graceful shutdown
 *
 * This file should remain boring. All business logic lives in
 * `services/` + `repositories/`; all HTTP wiring lives in `controllers/`
 * + `middlewares/`. The only side effects here are top-level process
 * startup.
 */
import { loadConfig } from './config/index.js'
import { loadApiKeys, registeredKeyIds } from './auth/keys.js'
import { buildServer } from './middlewares/index.js'
import { bootstrap } from './bootstrap/index.js'

async function main(): Promise<void> {
  const config = loadConfig()

  // Load API keys into the in-process registry
  loadApiKeys(config)

  if (process.env.NODE_ENV !== 'production') {
    const kids = registeredKeyIds().filter((id: string) => !id.startsWith('__'))
    if (kids.length > 0) {
      console.warn(
        `[sidecar] registered API key IDs: ${kids.join(', ')} — ` +
          `exchange via POST /v1/auth/token (Bearer JWT) or use X-Sidecar-Token directly (dev only)`,
      )
    }
  }

  // 1. SDK + 2. Repositories + 3. Services + 4. Registry in one shot
  const services = await bootstrap(config)

  // Best-effort initial announce so the local swarm is in the DHT before any
  // HTTP request comes in. announce() itself waits on discovery.flushed() so
  // by the time we return the local node is at least registered.
  try {
    await services.swarm.announce(true)
  } catch (err) {
    // announcing is best-effort; log but do not block server start
    console.warn('[sidecar] initial announce failed:', (err as Error).message)
  }

  // `bootstrap` owns the SDK handle — pass it through to `buildServer`
  // for the test-routes path. Production code paths never read it.
  const app = await buildServer(config, services, services.sdk)

  await app.listen({ host: config.host, port: config.port })

  let shuttingDown = false
  async function shutdown(signal: NodeJS.Signals): Promise<void> {
    if (shuttingDown) return
    shuttingDown = true
    try {
      await app.close()
    } catch (err) {
      console.error('[sidecar] server close error:', (err as Error).message)
    }
    try {
      await services.sdk.close()
    } catch (err) {
      console.error('[sidecar] sdk close error:', (err as Error).message)
    }
    process.exit(0)
  }

  process.on('SIGTERM', (s) => void shutdown(s))
  process.on('SIGINT', (s) => void shutdown(s))
}

// Re-export the services bag for any callers (e.g. tests, external
// scripts) that want to compose the graph without booting HTTP.
export { bootstrap, type Services } from './bootstrap/index.js'
export {
  InMemoryDriveRegistry,
  type DriveRegistry,
} from './bootstrap/drive-registry.js'
export { MAIN_NAMESPACE } from './services/drives.service.js'

main().catch((err) => {
  console.error('[sidecar] fatal:', err)
  process.exit(1)
})