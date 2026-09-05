import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'

type DriveUse = { count: number; closing: boolean }

/** 同步登记先于异步 I/O，避免关闭检查和新操作之间出现空隙。 */
@Injectable()
export class DriveActivity {
  private readonly uses = new Map<string, DriveUse>()

  acquire(driveKey: string): () => void {
    const key = this.normalize(driveKey)
    const use = this.uses.get(key) ?? { count: 0, closing: false }
    if (use.closing) this.busy()
    use.count++
    this.uses.set(key, use)
    let released = false
    return () => {
      if (released) return
      released = true
      use.count--
      if (use.count === 0 && !use.closing) this.uses.delete(key)
    }
  }

  async withUse<T>(driveKey: string, action: () => Promise<T>): Promise<T> {
    const release = this.acquire(driveKey)
    try {
      return await action()
    } finally {
      release()
    }
  }

  async withExclusive<T>(driveKey: string, action: () => Promise<T>): Promise<T> {
    const key = this.normalize(driveKey)
    if (this.uses.has(key)) this.busy()
    this.uses.set(key, { count: 0, closing: true })
    try {
      return await action()
    } finally {
      this.uses.delete(key)
    }
  }

  private normalize(driveKey: string): string {
    if (!/^[0-9a-f]{64}$/iu.test(driveKey)) {
      throw new BadRequestException('driveKey 必须是 64 位十六进制字符串。')
    }
    return driveKey.toLowerCase()
  }

  private busy(): never {
    throw new ConflictException({
      statusCode: 409,
      code: 'drive-busy',
      message: 'Drive 正在使用或关闭；请结束文件操作并取消未完成的离线任务后重试。',
    })
  }
}
