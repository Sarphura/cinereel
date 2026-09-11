import { describe, expect, it } from 'vitest'
import { Readable, Writable } from 'node:stream'
import type { SDK } from 'hyper-sdk'
import { DriveFileService } from '../src/service/file/drivefile.service.js'

const DRIVE_KEY = 'a'.repeat(64)

class FakeDrive {
  writable = true
  failOnCreateWriteStream = false
  failOnWrite = false
  readonly files = new Map<string, Buffer>()

  async entry(path: string): Promise<unknown> {
    return this.files.has(path) ? { value: {} } : null
  }

  createWriteStream(path: string): Writable {
    if (this.failOnCreateWriteStream) throw new Error('createWriteStream 失败')
    const chunks: Buffer[] = []
    const files = this.files
    const failOnWrite = this.failOnWrite
    return new Writable({
      write(chunk: Buffer, _encoding, callback) {
        if (failOnWrite) {
          callback(new Error('写入失败'))
          return
        }
        chunks.push(Buffer.from(chunk))
        callback()
      },
      final(callback) {
        files.set(path, Buffer.concat(chunks))
        callback()
      },
    })
  }
}

function createService(drive: FakeDrive): DriveFileService {
  return new DriveFileService({ getDrive: async () => drive } as unknown as SDK)
}

/** 有限长度的正文流：记录被读取的 chunk 数；耗尽后不会像 Readable.from 那样自毁。 */
function trackedContent(chunks = 3): { stream: Readable; pulls: () => number } {
  let pulls = 0
  const stream = new Readable({
    read() {
      pulls += 1
      this.push(pulls > chunks ? null : Buffer.alloc(1024, pulls))
    },
  })
  return { stream, pulls: () => pulls }
}

const settle = () => new Promise<void>((resolve) => { setTimeout(resolve, 20) })

describe('DriveFileService.addFile 正文流收尾', () => {
  it('目标已存在时丢弃剩余正文，但不销毁正文流（保住 409 响应）', async () => {
    const drive = new FakeDrive()
    drive.files.set('/exists.txt', Buffer.from('old'))
    const { stream, pulls } = trackedContent()

    await expect(createService(drive).addFile(DRIVE_KEY, '/exists.txt', stream))
      .rejects.toThrow('目标路径已经存在。')

    await settle()
    expect(pulls()).toBeGreaterThan(0)
    expect(stream.readableEnded).toBe(true)
    expect(stream.readableAborted).toBe(false)
  })

  it('Drive 只读时同样丢弃剩余正文', async () => {
    const drive = new FakeDrive()
    drive.writable = false
    const { stream, pulls } = trackedContent()

    await expect(createService(drive).addFile(DRIVE_KEY, '/new.txt', stream))
      .rejects.toThrow('写权限')

    await settle()
    expect(pulls()).toBeGreaterThan(0)
    expect(stream.readableEnded).toBe(true)
    expect(stream.readableAborted).toBe(false)
  })

  it('createWriteStream 抛错时也丢弃剩余正文', async () => {
    const drive = new FakeDrive()
    drive.failOnCreateWriteStream = true
    const { stream, pulls } = trackedContent()

    await expect(createService(drive).addFile(DRIVE_KEY, '/new.txt', stream))
      .rejects.toThrow('createWriteStream 失败')

    await settle()
    expect(pulls()).toBeGreaterThan(0)
    expect(stream.readableEnded).toBe(true)
    expect(stream.readableAborted).toBe(false)
  })

  it('成功路径写入正文并返回成功标记', async () => {
    const drive = new FakeDrive()
    const stream = Readable.from([Buffer.from('hello')])

    await expect(createService(drive).addFile(DRIVE_KEY, '/new.txt', stream)).resolves.toBe(true)
    expect(drive.files.get('/new.txt')).toEqual(Buffer.from('hello'))
  })

  it('写入失败时正文由 pipeline 负责销毁，不由 finally 排空', async () => {
    const drive = new FakeDrive()
    drive.failOnWrite = true
    const { stream } = trackedContent()

    await expect(createService(drive).addFile(DRIVE_KEY, '/new.txt', stream)).rejects.toThrow('写入失败')
    // 交出后由 pipeline 销毁源流：在 'end' 之前被中断，故 readableAborted 为真。
    expect(stream.readableAborted).toBe(true)
  })
})
