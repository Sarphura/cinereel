/**
 * Unit tests for `FileService` — verifies the `isRemote` business rule.
 *
 * Other behaviors (entry / readStream / recursive delete) require real
 * Hyperdrive IO and are covered by integration tests in `smoke.test.ts`.
 */
import { describe, it, expect } from 'vitest'
import { FileService, DriveNotMountedError } from '../../src/services/files.service.js'
import { InMemoryDriveRegistry } from '../../src/bootstrap/drive-registry.js'
import { InMemoryDriveRepository } from '../../src/repositories/index.js'
import type { HyperdriveLike } from '../../src/infrastructure/index.js'

function makeDrive(keyHex: string): HyperdriveLike {
  return {
    key: Buffer.from(keyHex, 'hex'),
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
      throw new Error('not supported in unit test')
    },
    createWriteStream() {
      throw new Error('not supported in unit test')
    },
    async *readdir(): AsyncIterable<string> {
      // empty
    },
    async stat() {
      return null
    },
  }
}

describe('FileService', () => {
  it('write() rejects remote drives', async () => {
    const registry = new InMemoryDriveRegistry()
    const repo = new InMemoryDriveRepository()
    const local = makeDrive('a'.repeat(64))
    const remote = makeDrive('b'.repeat(64))
    registry.rememberLocal('local-uuid', local)
    const remoteKeyHex = Buffer.from(remote.key).toString('hex')
    registry.rememberRemote(remoteKeyHex, remote)
    void repo
    const service = new FileService(registry)
    const remoteKey = remoteKeyHex

    await expect(service.write(remoteKey, '/x', Buffer.from('hi'))).rejects.toThrow(/remote/)
  })

  it('write() does not reject local drives on shape check', async () => {
    const registry = new InMemoryDriveRegistry()
    const local = makeDrive('a'.repeat(64))
    registry.rememberLocal('local-uuid', local)
    const service = new FileService(registry)

    // The fake's createWriteStream throws "not supported"; what we're
    // verifying here is that we DO get past the isRemote gate (i.e. we
    // get the createWriteStream error, not the "cannot write to remote"
    // error).
    await expect(
      service.write('a'.repeat(64), '/x', Buffer.from('hi')),
    ).rejects.toThrow(/not supported/)
  })

  it('readStream() throws DriveNotMountedError for unknown driveKey', async () => {
    const registry = new InMemoryDriveRegistry()
    const service = new FileService(registry)
    await expect(service.readStream('c'.repeat(64), '/x')).rejects.toBeInstanceOf(
      DriveNotMountedError,
    )
  })

  it('readStream() rejects malformed driveKey before resolving', async () => {
    const registry = new InMemoryDriveRegistry()
    const service = new FileService(registry)
    await expect(service.readStream('not-hex', '/x')).rejects.toThrow(/invalid driveKey/)
  })
})