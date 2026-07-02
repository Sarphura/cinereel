import type Hyperdrive from 'hyperdrive'
import { Injectable } from '@nestjs/common'
import { DriveWriteService } from '@/modules/base/drive/service/drive.write.service'
import type { FileUploadDto, FileUploadResultDto } from '../domain/dto/file.dto'

/**
 * FileUploadService
 *
 * 职责（单一）：将文件内容写入 Hyperdrive。
 *   - 写入原始 Buffer（upload）
 *   - 写入 JSON 对象（uploadJson）
 *   - 删除单个文件（delete）
 *   - 递归删除路径树（deleteTree）
 *
 * 本服务只做写入，不包含任何读取逻辑。
 * 所有底层 Hyperdrive 操作均委托给 DriveWriteService。
 */
@Injectable()
export class FileUploadService {
  constructor(private readonly driveWrite: DriveWriteService) {}

  // ---------------------------------------------------------------------------
  // 上传
  // ---------------------------------------------------------------------------

  /**
   * 将 Buffer 写入 Hyperdrive 的指定路径。
   *
   * @param dto 上传入参（path、buffer、可选 drive 实例）
   * @returns 写入结果（路径与字节数）
   */
  async upload(dto: FileUploadDto): Promise<FileUploadResultDto> {
    await this.driveWrite.put(dto.path, dto.buffer, dto.drive)

    return {
      path: dto.path,
      byteLength: dto.buffer.byteLength,
    }
  }

  /**
   * 将对象序列化为 JSON 后写入 Hyperdrive 的指定路径。
   *
   * @param path  drive 内的绝对路径
   * @param data  要序列化的对象
   * @param drive 要操作的 drive 实例；默认使用本地 drive
   */
  async uploadJson<T>(path: string, data: T, drive?: Hyperdrive): Promise<void> {
    await this.driveWrite.putJson(path, data, drive)
  }

  // ---------------------------------------------------------------------------
  // 删除
  // ---------------------------------------------------------------------------

  /**
   * 删除 Hyperdrive 中指定路径的单个文件。
   * 路径不存在时静默忽略。
   *
   * @param path  drive 内的绝对路径
   * @param drive 要操作的 drive 实例；默认使用本地 drive
   */
  async delete(path: string, drive?: Hyperdrive): Promise<void> {
    await this.driveWrite.del(path, drive)
  }

  /**
   * 递归删除 Hyperdrive 中指定路径前缀下的所有文件与目录。
   *
   * @param prefix 要删除的路径前缀（文件或目录均可）
   * @param drive  要操作的 drive 实例；默认使用本地 drive
   */
  async deleteTree(prefix: string, drive?: Hyperdrive): Promise<void> {
    await this.driveWrite.delTree(prefix, drive)
  }
}
