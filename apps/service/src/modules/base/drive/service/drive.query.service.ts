import type Hyperdrive from 'hyperdrive'
import { Injectable } from '@nestjs/common'
import { HyperService } from '@/modules/base/hyper/hyper.service'

/**
 * DriveQueryService
 *
 * 封装对 Hyperdrive 的最底层只读操作：
 *   - 存在性检测
 *   - 读取文件内容（Buffer / JSON）
 *   - 读取条目元数据
 *   - 遍历目录条目（列表 / 流式 Walk）
 *
 * 所有方法均支持传入 `drive` 参数以操作非本地 drive（例如对等节点的 drive）。
 * 当不传入 `drive` 时，默认使用本地 `HyperService.drive`。
 */
@Injectable()
export class DriveQueryService {
  constructor(private readonly hyper: HyperService) {}

  // ---------------------------------------------------------------------------
  // 错误判断工具
  // ---------------------------------------------------------------------------

  /**
   * 判断是否为远端节点数据块暂不可用的错误（对等节点尚未同步）。
   */
  isBlockNotAvailableError(error: unknown): boolean {
    return (
      !!error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as Record<string, unknown>).code === 'BLOCK_NOT_AVAILABLE'
    )
  }

  // ---------------------------------------------------------------------------
  // 存在性检测
  // ---------------------------------------------------------------------------

  /**
   * 判断指定路径在 drive 中是否存在（含文件与目录）。
   *
   * @param path  drive 内的绝对路径
   * @param wait  是否等待远端数据可用；默认 false（仅查本地缓存）
   * @param drive 要操作的 drive 实例；默认使用本地 drive
   */
  async exists(path: string, wait = false, drive?: Hyperdrive): Promise<boolean> {
    const target = drive ?? this.hyper.drive

    try {
      const entry = await target.entry(path, { wait })
      return entry !== null && entry !== undefined
    } catch (error) {
      if (this.isBlockNotAvailableError(error)) {
        return false
      }
      throw error
    }
  }

  // ---------------------------------------------------------------------------
  // 读取单条文件内容
  // ---------------------------------------------------------------------------

  /**
   * 读取 drive 中指定路径的文件内容，以 Buffer 返回。
   * 路径不存在或数据不可用时返回 null。
   *
   * @param path  drive 内的绝对路径
   * @param wait  是否等待远端数据可用；默认 false
   * @param drive 要操作的 drive 实例；默认使用本地 drive
   */
  async get(path: string, wait = false, drive?: Hyperdrive): Promise<Buffer | null> {
    const target = drive ?? this.hyper.drive

    try {
      const buffer = await target.get(path, { wait })
      return buffer ?? null
    } catch (error) {
      if (this.isBlockNotAvailableError(error)) {
        return null
      }
      throw error
    }
  }

  /**
   * 读取 drive 中指定路径的 JSON 文件并解析为指定类型。
   * 解析失败或路径不存在时返回 null。
   *
   * @param path  drive 内的绝对路径
   * @param wait  是否等待远端数据可用；默认 false
   * @param drive 要操作的 drive 实例；默认使用本地 drive
   */
  async getJson<T>(path: string, wait = false, drive?: Hyperdrive): Promise<T | null> {
    const buffer = await this.get(path, wait, drive)

    if (!buffer) {
      return null
    }

    try {
      return JSON.parse(buffer.toString()) as T
    } catch {
      return null
    }
  }

  // ---------------------------------------------------------------------------
  // 读取条目元数据
  // ---------------------------------------------------------------------------

  /**
   * 读取 drive 中指定路径的条目元数据（不含文件内容）。
   * 用于在读取内容前先做廉价的存在性 / 元数据检查。
   *
   * @param path  drive 内的绝对路径
   * @param wait  是否等待远端数据可用；默认 false
   * @param drive 要操作的 drive 实例；默认使用本地 drive
   */
  async getEntry(
    path: string,
    wait = false,
    drive?: Hyperdrive,
  ): Promise<Awaited<ReturnType<Hyperdrive['entry']>>> {
    const target = drive ?? this.hyper.drive

    try {
      return await target.entry(path, { wait })
    } catch (error) {
      if (this.isBlockNotAvailableError(error)) {
        return null
      }
      throw error
    }
  }

  // ---------------------------------------------------------------------------
  // 遍历路径下的条目
  // ---------------------------------------------------------------------------

  /**
   * 列出指定前缀路径下的所有条目，以数组形式返回。
   *
   * @param prefix  路径前缀，如 '/' 或 '/publications'
   * @param wait    是否等待远端数据可用；默认 false
   * @param drive   要操作的 drive 实例；默认使用本地 drive
   */
  async list(
    prefix: string,
    wait = false,
    drive?: Hyperdrive,
  ): Promise<NonNullable<Awaited<ReturnType<Hyperdrive['entry']>>>[]> {
    const target = drive ?? this.hyper.drive
    const entries: NonNullable<Awaited<ReturnType<Hyperdrive['entry']>>>[] = []

    try {
      for await (const entry of target.list(prefix, { wait })) {
        entries.push(entry as NonNullable<Awaited<ReturnType<Hyperdrive['entry']>>>)
      }
    } catch (error) {
      if (this.isBlockNotAvailableError(error)) {
        return []
      }
      throw error
    }

    return entries
  }

  /**
   * 流式遍历指定前缀路径下的所有条目，对每个条目执行回调。
   * 与 `list` 的区别在于它不会将全部条目加载到内存中，适合处理大量文件。
   *
   * @param prefix  路径前缀
   * @param visitor 每个条目的回调；返回 false 可提前中止遍历
   * @param wait    是否等待远端数据可用；默认 false
   * @param drive   要操作的 drive 实例；默认使用本地 drive
   */
  async walk(
    prefix: string,
    visitor: (
      entry: NonNullable<Awaited<ReturnType<Hyperdrive['entry']>>>,
    ) => boolean | void | Promise<boolean | void>,
    wait = false,
    drive?: Hyperdrive,
  ): Promise<void> {
    const target = drive ?? this.hyper.drive

    try {
      for await (const entry of target.list(prefix, { wait })) {
        const result = await visitor(
          entry as NonNullable<Awaited<ReturnType<Hyperdrive['entry']>>>,
        )

        if (result === false) {
          break
        }
      }
    } catch (error) {
      if (this.isBlockNotAvailableError(error)) {
        return
      }
      throw error
    }
  }
}
