import { loadConfig } from './config.js';
import { loadApiKeys } from './auth/keys.js';
import {
  createStoreRuntime,
  createHyperswarmRuntime,
  makeFileService,
  makeSwarmService,
} from '@cinereel/hyper-sdk';
import { buildServer } from './server.js';
import {
  createSidecarDriveServiceWithRecovery,
  type SidecarDriveService,
} from './drive-service.js';

export type { SidecarDriveService };

async function main(): Promise<void> {
  const config = loadConfig();

  // Load API keys into the in-process registry
  loadApiKeys(config);

  if (process.env.NODE_ENV !== 'production') {
    const { registeredKeyIds } = await import('./auth/keys.js');
    const kids = registeredKeyIds().filter((id: string) => !id.startsWith('__'));
    if (kids.length > 0) {
      console.warn(
        `[sidecar] registered API key IDs: ${kids.join(', ')} — ` +
          `exchange via POST /v1/auth/token (Bearer JWT) or use X-Sidecar-Token directly (dev only)`,
      );
    }
  }

  const runtime = await createStoreRuntime(config.storeDir);
  const swarm = createHyperswarmRuntime(config.swarmPort, config.bootstrap);

  // Bootstrap: load drive index from disk and remount all recorded drives.
  const { service: drives, index } =
    await createSidecarDriveServiceWithRecovery(runtime, config.storeDir);

  const files = makeFileService(runtime);
  const swarmUc = makeSwarmService(runtime, swarm);

  try {
    await swarmUc.announce(true);
  } catch (err) {
    // announcing is best-effort; log but do not block server start
    console.warn('[sidecar] initial announce failed:', (err as Error).message);
  }

  const app = await buildServer(config, {
    drives,
    files,
    swarm: swarmUc,
    swarmRuntime: swarm,
  });

  await app.listen({ host: config.host, port: config.port });

  let shuttingDown = false;
  async function shutdown(signal: NodeJS.Signals): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    const deadline = Date.now() + config.shutdownTimeoutMs;
    void deadline;
    try {
      await app.close();
    } catch (err) {
      console.error('[sidecar] server close error:', (err as Error).message);
    }
    try {
      await swarm.destroy();
    } catch {
      /* ignore */
    }
    try {
      await runtime.close();
    } catch (err) {
      console.error('[sidecar] corestore close error:', (err as Error).message);
    }
    void index;
    process.exit(0);
  }

  process.on('SIGTERM', (s) => void shutdown(s));
  process.on('SIGINT', (s) => void shutdown(s));
}

main().catch((err) => {
  console.error('[sidecar] fatal:', err);
  process.exit(1);
});
