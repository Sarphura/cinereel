import type Hyperdrive from 'hyperdrive'
import { Injectable } from '@nestjs/common'
import { HyperService } from '@/modules/base/hyper/hyper.service'

/**
 * DriveWriteService
 *
 * 封装对 Hyperdrive 的最底层写入操作：
 *   - 写入 Buffer
 *   - 写入 JSON（自动序列化）
 *   - 删除单个条目
 *   - 清理块缓存并删除
 *   - 递归删除路径树
 *
 * 所有方法均支持传入 `drive` 参数以操作非本地 drive。
 * 当不传入 `drive` 时，默认使用本地 `HyperService.drive`。
 */
@Injectable()
export class DriveWriteService {
  constructor(private readonly hyper: HyperService) {}

  // ---------------------------------------------------------------------------
  // 写入
  // ---------------------------------------------------------------------------

  /**
   * 将 Buffer 内容写入 drive 的指定路径。
   *
   * @param path    drive 内的绝对路径
   * @param buffer  要写入的原始字节
   * @param drive   要操作的 drive 实例；默认使用本地 drive
   */
  async put(path: string, buffer: Buffer, drive?: Hyperdrive): Promise<void> {
    const target = drive ?? this.hyper.drive
    await target.put(path, buffer)
  }

  /**
   * 将对象序列化为格式化 JSON 后写入 drive 的指定路径。
   *
   * @param path  drive 内的绝对路径
   * @param data  要序列化的对象
   * @param drive 要操作的 drive 实例；默认使用本地 drive
   */
  async putJson<T>(path: string, data: T, drive?: Hyperdrive): Promise<void> {
    const target = drive ?? this.hyper.drive
    await target.put(path, Buffer.from(JSON.stringify(data, null, 2)))
  }

  // ---------------------------------------------------------------------------
  // 删除
  // ---------------------------------------------------------------------------

  /**
   * 删除 drive 中指定路径的单个文件条目。
   * 若路径不存在则静默忽略（不抛出错误）。
   *
   * @param path  drive 内的绝对路径
   * @param drive 要操作的 drive 实例；默认使用本地 drive
   */
  async del(path: string, drive?: Hyperdrive): Promise<void> {
    const target = drive ?? this.hyper.drive

    try {
      await target.del(path)
    } catch {
      // 条目不存在时忽略
    }
  }

  /**
   * 先释放块存储缓存（`clear`）再删除条目（`del`）。
   * 若路径不存在则静默忽略。
   *
   * @param path  drive 内的绝对路径
   * @param drive 要操作的 drive 实例；默认使用本地 drive
   */
  async clearAndDel(path: string, drive?: Hyperdrive): Promise<void> {
    const target = drive ?? this.hyper.drive

    await target.clear(path).catch(() => {})
    await target.del(path).catch(() => {})
  }

  /**
   * 递归删除 drive 中指定路径前缀下的所有条目（含目录本身）。
   * 优先删除路径最深的条目，避免父路径被提前清除。
   *
   * @param prefix  要删除的路径前缀（文件或目录均可）
   * @param drive   要操作的 drive 实例；默认使用本地 drive
   */
  async delTree(prefix: string, drive?: Hyperdrive): Promise<void> {
    const target = drive ?? this.hyper.drive
    const paths = new Set<string>()

    // 若前缀本身是一个文件条目，也纳入删除范围
    try {
      const entry = await target.entry(prefix, { wait: false })
      if (entry) {
        paths.add(prefix)
      }
    } catch {
      // 忽略读取错误
    }

    // 收集前缀下所有子条目
    try {
      for await (const entry of target.list(prefix)) {
        paths.add(entry.key)
      }
    } catch {
      // 忽略遍历错误
    }

    // 按路径长度降序删除，确保深层条目优先
    const sortedPaths = Array.from(paths).sort((a, b) => b.length - a.length)

    for (const p of sortedPaths) {
      await target.clear(p).catch(() => {})
      await target.del(p).catch(() => {})
    }
  }
}
