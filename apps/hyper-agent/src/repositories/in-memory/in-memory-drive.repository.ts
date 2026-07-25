/**
 * In-memory `DriveRepository` for tests.
 *
 * Each call to `openLocal` / `openRemote` returns a fresh stub object that
 * implements the `HyperdriveLike` shape — services that take a
 * `DriveRepository` get back something they can `entry()` / `stat()` /
 * `readdir()` against without ever booting `hyper-sdk`.
 *
 * Default `entry()` returns null, `stat()` returns null, `readdir()`
 * yields nothing — tests that need richer behavior can pass their own
 * `factory` to the constructor.
 */
import type { HyperdriveLike } from '../../infrastructure/index.js'

export class InMemoryDriveRepository {
  private readonly drives = new Map<string, HyperdriveLike>()

  constructor(private readonly factory: () => HyperdriveLike = makeDefaultDrive) {}

  async openLocal(uuid: string): Promise<HyperdriveLike> {
    let d = this.drives.get(uuid)
    if (!d) {
      d = this.factory()
      this.drives.set(uuid, d)
    }
    return d
  }

  async openRemote(driveKey: string): Promise<HyperdriveLike> {
    let d = this.drives.get(driveKey)
    if (!d) {
      d = this.factory()
      this.drives.set(driveKey, d)
    }
    return d
  }

  async close(drive: HyperdriveLike): Promise<void> {
    for (const [k, v] of this.drives) {
      if (v === drive) this.drives.delete(k)
    }
  }
}

function makeDefaultDrive(): HyperdriveLike {
  return {
    key: new Uint8Array(32),
    core: { discoveryKey: new Uint8Array(32) },
    async ready() {},
    async close() {},
    async put() {},
    async get() {
      return null
    },
    async entry() {
      return null
    },
    async exists() {
      return false
    },
    async del() {},
    async clear() {
      return { blocks: 0 }
    },
    async symlink() {},
    createReadStream() {
      throw new Error('not supported in in-memory fake')
    },
    createWriteStream() {
      throw new Error('not supported in in-memory fake')
    },
    async *readdir(): AsyncIterable<string> {
      // empty
    },
    async stat() {
      return null
    },
  }
}