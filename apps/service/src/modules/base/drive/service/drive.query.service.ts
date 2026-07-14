import type Hyperdrive from 'hyperdrive'
import type { HyperdriveEntry } from 'hyperdrive'
import { Injectable } from '@nestjs/common'
import { HyperService } from '@/modules/base/hyper/hyper.service'
import { isBlockNotAvailableError } from '../exception/drive.exception'

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
      if (wait) {
        await target.update()
      }
      // 注意：entry() 的 options.wait 控制的是「逐 block 网络等待」行为，
      // 应始终传 false，避免无限阻塞；同步等待已由上方 update() 处理。
      const entry = await target.entry(path, { wait: false })
      return entry !== null && entry !== undefined
    } catch (error) {
      if (isBlockNotAvailableError(error)) {
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
      if (wait) {
        await target.update()
      }
      // 注意：get() 的 options.wait 控制的是「逐 block 网络等待」行为，
      // 应始终传 false，避免无限阻塞；同步等待已由上方 update() 处理。
      const buffer = await target.get(path, { wait: false })
      return buffer ?? null
    } catch (error) {
      if (isBlockNotAvailableError(error)) {
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
  ): Promise<HyperdriveEntry | null> {
    const target = drive ?? this.hyper.drive

    try {
      if (wait) {
        await target.update()
      }
      return await target.entry(path, { wait })
    } catch (error) {
      if (isBlockNotAvailableError(error)) {
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
  ): Promise<HyperdriveEntry[]> {
    const target = drive ?? this.hyper.drive
    const entries: HyperdriveEntry[] = []

    try {
      if (wait) {
        await target.update()
      }
      // options.wait 控制「逐 block 网络等待」：
      // - 本地 drive（wait=false）：所有 block 都在本地，无需等待，遍历立即完成。
      // - 远端 drive（wait=true）：首次读取时 hyperbee metadata 的 block 尚未复制到
      //   本地，必须等待其从 peer 拉取，否则会抛 BLOCK_NOT_AVAILABLE 被下方吞成空列表，
      //   表现为「远端资源树为空」。调用方需先确保已有活跃 peer 连接，避免无限等待。
      for await (const entry of target.list(prefix, { wait })) {
        entries.push(entry)
      }
    } catch (error) {
      if (isBlockNotAvailableError(error)) {
        return []
      }
      throw error
    }

    return entries
  }

  /**
   * 流式遍历指定前缀路径下的所有条目，逐个调用回调函数，若回调函数返回 false，则停止遍历。
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
      entry: HyperdriveEntry,
    ) => boolean | void | Promise<boolean | void>,
    wait = false,
    drive?: Hyperdrive,
  ): Promise<void> {
    const target = drive ?? this.hyper.drive

    try {
      if (wait) {
        await target.update()
      }
      // 与 list() 同理：options.wait 会导致逐 block 阻塞，始终传 false。
      for await (const entry of target.list(prefix, { wait: false })) {
        const result = await visitor(entry)

        if (result === false) {
          break
        }
      }
    } catch (error) {
      if (isBlockNotAvailableError(error)) {
        return
      }
      throw error
    }
  }
}
