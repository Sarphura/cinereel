import { describe, expect, it } from 'vitest'
import { Readable, Writable } from 'node:stream'
import { FileService } from '../src/hyper.implementation/file.service.js'
import type { SDK } from 'hyper-sdk'

class FakeDrive {
  writable = true
  readonly files = new Map<string, Buffer>()

  async entry(path: string): Promise<object | null> {
    return this.files.has(path) ? {} : null
  }

  createWriteStream(path: string): Writable {
    const chunks: Buffer[] = []
    return new Writable({
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(Buffer.from(chunk))
        callback()
      },
      final: (callback) => {
        this.files.set(path, Buffer.concat(chunks))
        callback()
      },
    })
  }
}

function createService(drive: FakeDrive): FileService {
  const sdk = {
    getDrive: async () => drive,
  } as unknown as SDK
  return new FileService(sdk)
}

describe('FileService', () => {
  it('把内容写入不存在的路径', async () => {
    const drive = new FakeDrive()
    const service = createService(drive)

    const result = await service.addFile(
      'a'.repeat(64),
      '/movies/file.txt',
      Readable.from('content'),
    )

    expect(result).toBe('created')
    expect(drive.files.get('/movies/file.txt')?.toString()).toBe('content')
  })

  it('同一路径的并发写入只有一个成功', async () => {
    const drive = new FakeDrive()
    const service = createService(drive)

    const results = await Promise.all([
      service.addFile('b'.repeat(64), '/same.txt', Readable.from('first')),
      service.addFile('b'.repeat(64), '/same.txt', Readable.from('second')),
    ])

    expect(results.sort()).toEqual(['already-exists', 'created'])
    expect(drive.files.get('/same.txt')?.toString()).toBe('first')
  })

  it('拒绝写入只读 Drive', async () => {
    const drive = new FakeDrive()
    drive.writable = false
    const service = createService(drive)

    const result = await service.addFile(
      'c'.repeat(64),
      '/readonly.txt',
      Readable.from('content'),
    )

    expect(result).toBe('drive-not-writable')
    expect(drive.files.size).toBe(0)
  })
})
