import type Hyperdrive from 'hyperdrive'
import { Injectable } from '@nestjs/common'
import { DriveQueryService } from '@/modules/base/drive/service/drive.query.service'
import type { FileDownloadDto, FileDownloadResultDto } from '../domain/dto/file.dto'

/**
 * FileDownloadService
 *
 * 职责（单一）：从 Hyperdrive 读取文件内容。
 *   - 下载单个文件的原始 Buffer（download）
 *   - 读取并解析 JSON 文件（downloadJson）
 *   - 检测路径是否存在（exists）
 *   - 列出指定前缀下的所有文件路径（listFiles）
 *
 * 本服务只做读取，不包含任何写入逻辑。
 * 所有底层 Hyperdrive 操作均委托给 DriveQueryService。
 */
@Injectable()
export class FileDownloadService {
  constructor(private readonly driveQuery: DriveQueryService) {}

  // ---------------------------------------------------------------------------
  // 下载
  // ---------------------------------------------------------------------------

  /**
   * 从 Hyperdrive 读取指定路径的文件内容，以 Buffer 形式返回。
   * 路径不存在或数据不可用时，结果中的 buffer 为 null。
   *
   * @param dto 下载入参（path、可选 wait 标志、可选 drive 实例）
   * @returns 下载结果（buffer 与路径）
   */
  async download(dto: FileDownloadDto): Promise<FileDownloadResultDto> {
    const buffer = await this.driveQuery.get(dto.path, dto.wait ?? false, dto.drive)

    return {
      path: dto.path,
      buffer,
    }
  }

  /**
   * 从 Hyperdrive 读取指定路径的 JSON 文件并解析为目标类型。
   * 路径不存在、数据不可用或解析失败时返回 null。
   *
   * @param path  drive 内的绝对路径
   * @param wait  是否等待远端数据可用；默认 false
   * @param drive 要操作的 drive 实例；默认使用本地 drive
   */
  async downloadJson<T>(path: string, wait = false, drive?: Hyperdrive): Promise<T | null> {
    return this.driveQuery.getJson<T>(path, wait, drive)
  }

  // ---------------------------------------------------------------------------
  // 存在性检测
  // ---------------------------------------------------------------------------

  /**
   * 检测 Hyperdrive 中指定路径是否存在。
   *
   * @param path  drive 内的绝对路径
   * @param wait  是否等待远端数据可用；默认 false
   * @param drive 要操作的 drive 实例；默认使用本地 drive
   */
  async exists(path: string, wait = false, drive?: Hyperdrive): Promise<boolean> {
    return this.driveQuery.exists(path, wait, drive)
  }

  // ---------------------------------------------------------------------------
  // 列表
  // ---------------------------------------------------------------------------

  /**
   * 列出 Hyperdrive 中指定前缀路径下所有条目的路径字符串。
   *
   * @param prefix 路径前缀，如 '/' 或 '/movies'
   * @param wait   是否等待远端数据可用；默认 false
   * @param drive  要操作的 drive 实例；默认使用本地 drive
   * @returns 路径字符串数组
   */
  async listFiles(prefix: string, wait = false, drive?: Hyperdrive): Promise<string[]> {
    const entries = await this.driveQuery.list(prefix, wait, drive)
    return entries.map((entry) => entry.key)
  }
}
