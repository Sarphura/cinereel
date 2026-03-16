import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { vi } from 'vitest'
import type { CreateAppOptions } from '../src/app'

type AppBundle = Awaited<ReturnType<typeof import('../src/app')['createApp']>>

export function createControllerTestKit() {
  const activeBundles: AppBundle[] = []
  const activeDirs: string[] = []

  async function createTempDir(prefix: string) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
    activeDirs.push(dir)
    return dir
  }

  async function createAppBundle(
    prefix: string,
    options: CreateAppOptions = {},
  ) {
    const storeDir = await createTempDir(prefix)
    process.env.CORESTORE_DIR = storeDir
    process.env.PORT = '0'
    vi.resetModules()

    const { createApp } = await import('../src/app')
    const bundle = await createApp({
      logger: false,
      network: false,
      ...options,
    })

    activeBundles.push(bundle)

    return {
      bundle,
      storeDir,
    }
  }

  async function cleanup() {
    while (activeBundles.length) {
      const bundle = activeBundles.pop()

      if (!bundle) {
        continue
      }

      await bundle.hyper.close()
      await bundle.app.close()
    }

    while (activeDirs.length) {
      const dir = activeDirs.pop()

      if (!dir) {
        continue
      }

      await fs.rm(dir, { recursive: true, force: true })
    }

    delete process.env.CORESTORE_DIR
    delete process.env.PORT
    vi.restoreAllMocks()
    vi.resetModules()
  }

  return {
    cleanup,
    createAppBundle,
    createTempDir,
  }
}
