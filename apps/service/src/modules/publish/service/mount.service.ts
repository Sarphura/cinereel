import * as fs from 'node:fs'
import * as path from 'node:path'
import { Injectable, NotFoundException, Logger } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { DriveQueryService } from '@/modules/base/drive/service/drive.query.service'
import { DriveWriteService } from '@/modules/base/drive/service/drive.write.service'
import { SwarmService } from '@/modules/base/swarm/swarm.service'
import { MountRepository } from '../repository/mount.repository'
import { DriveService } from './drive.service'
import type { MountJob, CreateMountJobDto } from '../domain/dto/mount.dto'

/**
 * MountService
 *
 * 职责：将本地文件系统目录中的文件批量写入到指定的本地 Hyperdrive。
 *
 * 挂载流程（异步队列执行）：
 * 1. 接收 CreateMountJobDto，创建任务记录（status: queued）
 * 2. 异步扫描 targetPath 下所有文件
 * 3. 逐文件读取并写入 Drive（更新 progress / currentFilePath）
 * 4. 完成后将 status 置为 completed；出错则置为 failed
 */
@Injectable()
export class MountService {
  private readonly logger = new Logger(MountService.name)

  constructor(
    private readonly driveService: DriveService,
    private readonly driveQuery: DriveQueryService,
    private readonly driveWrite: DriveWriteService,
    private readonly swarm: SwarmService,
    private readonly mountRepo: MountRepository,
  ) {}

  // ---------------------------------------------------------------------------
  // 查询
  // ---------------------------------------------------------------------------

  listJobs(): MountJob[] {
    return this.mountRepo.findAll().sort((a, b) => b.createdAt - a.createdAt)
  }

  getJob(id: string): MountJob {
    const job = this.mountRepo.findById(id)
    if (!job) throw new NotFoundException(`MountJob 不存在: ${id}`)
    return job
  }

  // ---------------------------------------------------------------------------
  // 创建任务
  // ---------------------------------------------------------------------------

  async createJob(driveKey: string, targetPath: string): Promise<MountJob> {
    const stat = await fs.promises.stat(targetPath).catch(() => null)
    if (!stat) throw new Error(`路径不存在或无法访问: ${targetPath}`)

    const now = Date.now()
    const job: MountJob = {
      id: randomUUID(),
      driveKey,
      targetPath,
      mountedPath: null,
      kind: stat.isDirectory() ? 'directory' : 'file',
      totalFiles: 0,
      processedFiles: 0,
      totalBytes: 0,
      processedBytes: 0,
      currentFilePath: null,
      progress: 0,
      status: 'queued',
      error: null,
      result: null,
      createdAt: now,
      updatedAt: now,
    }

    this.mountRepo.save(job)
    this.logger.log(`挂载任务已创建: ${job.id} → ${targetPath}`)

    // 异步执行，不阻塞 HTTP 响应
    void this.runJob(job)

    return job
  }

  // ---------------------------------------------------------------------------
  // 异步执行挂载
  // ---------------------------------------------------------------------------

  private async runJob(job: MountJob): Promise<void> {
    const update = (patch: Partial<MountJob>) => {
      Object.assign(job, { ...patch, updatedAt: Date.now() })
      this.mountRepo.save(job)
    }

    update({ status: 'mounting' })

    try {
      // 解析目标 Hyperdrive 实例：
      //   1. 若 driveKey 与本地主 drive 匹配 → 直接使用 HyperService.drive
      //   2. 若为其他本地 drive（仅凭 key 重建）→ 从 Corestore session 创建
      //   3. 否则视为远端 drive → 委托 SwarmService.mountRemoteDrive
      // 委托 DriveService.resolveDrive：基于 DriveRepository.isLocal 做准确判断，
      // 本地 drive 直接返回，远端 drive 才走 P2P 挂载，不会误阻塞。
      const drive = await this.driveService.resolveDrive(job.driveKey)

      // 收集所有需写入的本地文件
      const files = await this.collectFiles(job.targetPath, job.kind === 'directory')
      const totalBytes = files.reduce((sum, f) => sum + f.size, 0)

      update({ totalFiles: files.length, totalBytes })

      const pubId = randomUUID()

      // 计算 drive 内的挂载根路径：
      //   - 单文件：直接挂到根目录下（/<filename>）
      //   - 目录：以 targetPath 为根，保留子目录结构
      const driveRoot =
        job.kind === 'directory'
          ? '/'
          : '/'

      for (const file of files) {
        update({ currentFilePath: file.absPath })

        // 计算该文件在 drive 内的绝对路径（保持目录层级）
        const relativePath =
          job.kind === 'directory'
            ? path.relative(job.targetPath, file.absPath)
            : path.basename(file.absPath)
        const drivePath = '/' + relativePath.split(path.sep).join('/')

        const buffer = await fs.promises.readFile(file.absPath)
        await this.driveWrite.put(drivePath, buffer, drive)

        job.processedFiles++
        job.processedBytes += buffer.byteLength
        job.progress = Math.round((job.processedBytes / (totalBytes || 1)) * 100)
        update({})
      }

      update({
        status: 'completed',
        mountedPath: driveRoot,
        currentFilePath: null,
        progress: 100,
        result: { publication: { id: pubId } },
      })

      this.logger.log(`挂载任务完成: ${job.id}（共 ${files.length} 个文件）`)
    } catch (err) {
      update({
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      })
      this.logger.error(`挂载任务失败: ${job.id}`, err)
    }
  }


  private async collectFiles(
    rootPath: string,
    isDirectory: boolean,
  ): Promise<Array<{ absPath: string; size: number }>> {
    if (!isDirectory) {
      const stat = await fs.promises.stat(rootPath)
      return [{ absPath: rootPath, size: stat.size }]
    }

    const result: Array<{ absPath: string; size: number }> = []

    const walk = async (dir: string) => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          await walk(full)
        } else if (entry.isFile()) {
          const stat = await fs.promises.stat(full)
          result.push({ absPath: full, size: stat.size })
        }
      }
    }

    await walk(rootPath)
    return result
  }
}
