import { describe, expect, it } from 'vitest'
import { Readable, Writable } from 'node:stream'
import { FileService } from '../src/hyper.implementation/file.service.js'
import type { SDK } from 'hyper-sdk'

class FakeDrive {
  writable = true
  version = 7
  readonly files = new Map<string, Buffer>()
  readonly writeChunkSizes: number[] = []

  async entry(path: string): Promise<{
    value: {
      linkname: string | null
      blob: { byteLength: number }
    }
  } | null> {
    const content = this.files.get(path)
    return content === undefined
      ? null
      : {
          value: {
            linkname: null,
            blob: { byteLength: content.byteLength },
          },
        }
  }

  async *readdir(path: string): AsyncGenerator<string> {
    const prefix = path === '/' ? '/' : `${path}/`
    const childNames = new Set<string>()

    for (const filePath of this.files.keys()) {
      if (!filePath.startsWith(prefix)) continue

      const suffix = filePath.slice(prefix.length)
      const childName = suffix.split('/', 1)[0]
      if (childName) childNames.add(childName)
    }

    for (const childName of [...childNames].sort()) {
      yield childName
    }
  }

  createWriteStream(path: string): Writable {
    const chunks: Buffer[] = []
    const writeChunkSizes = this.writeChunkSizes
    return new Writable({
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(Buffer.from(chunk))
        writeChunkSizes.push(chunk.byteLength)
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
  it('分页列出目录的直接子项，并从后代文件合成目录', async () => {
    const drive = new FakeDrive()
    drive.files.set('/movies/action/a.mp4', Buffer.from('action'))
    drive.files.set('/movies/drama/b.mp4', Buffer.from('drama'))
    drive.files.set('/movies/poster.jpg', Buffer.from('poster'))
    const service = createService(drive)

    const firstPage = await service.listDirectory(
      'a'.repeat(64),
      '/movies',
      undefined,
      2,
    )
    const secondPage = await service.listDirectory(
      'a'.repeat(64),
      '/movies',
      firstPage.nextCursor ?? undefined,
      2,
    )

    expect(firstPage).toEqual({
      path: '/movies',
      driveVersion: 7,
      entries: [
        {
          path: '/movies/action',
          name: 'action',
          type: 'directory',
          size: null,
        },
        {
          path: '/movies/drama',
          name: 'drama',
          type: 'directory',
          size: null,
        },
      ],
      nextCursor: 'drama',
    })
    expect(secondPage).toEqual({
      path: '/movies',
      driveVersion: 7,
      entries: [
        {
          path: '/movies/poster.jpg',
          name: 'poster.jpg',
          type: 'file',
          size: 6,
        },
      ],
      nextCursor: null,
    })
  })

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

  it('把大输入拆成符合 Hypercore 限制的块', async () => {
    const drive = new FakeDrive()
    const service = createService(drive)
    const content = Buffer.alloc(16 * 1024 * 1024, 1)

    const result = await service.addFile(
      'a'.repeat(64),
      '/video.mp4',
      Readable.from(content),
    )

    expect(result).toBe('created')
    const written = drive.files.get('/video.mp4')
    expect(written?.byteLength).toBe(content.byteLength)
    expect(written?.equals(content)).toBe(true)
    expect(Math.max(...drive.writeChunkSizes)).toBeLessThanOrEqual(1024 * 1024)
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
