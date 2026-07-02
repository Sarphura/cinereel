import * as fs from 'node:fs'
import * as path from 'node:path'
import { Injectable, NotFoundException, Logger } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { SwarmService } from '@/modules/base/swarm/swarm.service'
import { DriveQueryService } from '@/modules/base/drive/service/drive.query.service'
import { DownloadRepository } from '../repository/download.repository'
import type { DownloadJob, CreateDownloadJobDto } from '../domain/dto/download.dto'

/**
 * DownloadService
 *
 * 职责：从已挂载的远端 Drive 拉取文件/目录到本地文件系统。
 *
 * 下载流程（异步队列执行）：
 * 1. 接收 CreateDownloadJobDto，创建任务（status: queued）
 * 2. 通过 SwarmService 获取已挂载的远端 drive 实例
 * 3. 遍历 resourcePath 下的所有条目（若为目录则递归）
 * 4. 逐文件从 Drive 读取 Buffer 并写入本地文件系统
 * 5. 完成后置 status: completed；出错置 status: failed
 *
 * 移除下载：删除本地文件并保留任务记录（status 不变）。
 */
@Injectable()
export class DownloadService {
  private readonly logger = new Logger(DownloadService.name)

  constructor(
    private readonly swarm: SwarmService,
    private readonly driveQuery: DriveQueryService,
    private readonly downloadRepo: DownloadRepository,
  ) {}

  // ---------------------------------------------------------------------------
  // 查询
  // ---------------------------------------------------------------------------

  listJobs(): DownloadJob[] {
    return this.downloadRepo.findAll().sort((a, b) => b.createdAt - a.createdAt)
  }

  getJob(id: string): DownloadJob {
    const job = this.downloadRepo.findById(id)
    if (!job) throw new NotFoundException(`DownloadJob 不存在: ${id}`)
    return job
  }

  // ---------------------------------------------------------------------------
  // 创建下载任务
  // ---------------------------------------------------------------------------

  async createJob(dto: CreateDownloadJobDto): Promise<DownloadJob> {
    const fileName = dto.targetName ?? path.basename(dto.resourcePath)
    const targetPath = path.join(dto.targetDir, fileName)
    const now = Date.now()

    const job: DownloadJob = {
      id: randomUUID(),
      driveKey: dto.driveKey,
      resourcePath: dto.resourcePath,
      targetDir: dto.targetDir,
      targetPath,
      kind: 'file', // 将在异步阶段确定实际类型
      fileName,
      totalFiles: 0,
      downloadedFiles: 0,
      totalBytes: 0,
      downloadedBytes: 0,
      currentFileName: null,
      progress: 0,
      status: 'queued',
      error: null,
      createdAt: now,
      updatedAt: now,
    }

    this.downloadRepo.save(job)
    this.logger.log(`下载任务已创建: ${job.id} → ${dto.resourcePath}`)

    // 异步执行，不阻塞 HTTP 响应
    void this.runJob(job)

    return job
  }

  // ---------------------------------------------------------------------------
  // 移除已下载资源
  // ---------------------------------------------------------------------------

  async removeDownload(driveKey: string, resourcePath: string): Promise<void> {
    const jobs = this.downloadRepo.findAll().filter(
      (j) => j.driveKey === driveKey && j.resourcePath === resourcePath,
    )

    for (const job of jobs) {
      if (job.targetPath && fs.existsSync(job.targetPath)) {
        await fs.promises.rm(job.targetPath, { recursive: true, force: true })
        this.logger.log(`已删除本地文件: ${job.targetPath}`)
      }
      this.downloadRepo.delete(job.id)
    }
  }

  // ---------------------------------------------------------------------------
  // 异步执行下载
  // ---------------------------------------------------------------------------

  private async runJob(job: DownloadJob): Promise<void> {
    const update = (patch: Partial<DownloadJob>) => {
      Object.assign(job, { ...patch, updatedAt: Date.now() })
      this.downloadRepo.save(job)
    }

    update({ status: 'downloading' })

    try {
      const remoteDrive = await this.swarm.mountRemoteDrive(job.driveKey)

      // 判断是文件还是目录
      const isDir = await this.isDirectory(job.resourcePath, remoteDrive)
      update({ kind: isDir ? 'directory' : 'file' })

      if (isDir) {
        await this.downloadDirectory(job, remoteDrive, update)
      } else {
        await this.downloadFile(job, remoteDrive, update)
      }

      update({
        status: 'completed',
        currentFileName: null,
        progress: 100,
      })

      this.logger.log(`下载任务完成: ${job.id}`)
    } catch (err) {
      update({
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      })
      this.logger.error(`下载任务失败: ${job.id}`, err)
    }
  }

  private async isDirectory(resourcePath: string, drive: import('hyperdrive').default): Promise<boolean> {
    // 尝试直接读取，若找不到文件则视为目录
    const entry = await drive.entry(resourcePath, { wait: false }).catch(() => null)
    return entry === null || entry === undefined
  }

  private async downloadFile(
    job: DownloadJob,
    drive: import('hyperdrive').default,
    update: (patch: Partial<DownloadJob>) => void,
  ): Promise<void> {
    const buffer = await this.driveQuery.get(job.resourcePath, true, drive)

    if (!buffer) {
      throw new Error(`文件不存在或数据块尚未同步: ${job.resourcePath}`)
    }

    update({
      totalFiles: 1,
      totalBytes: buffer.byteLength,
      currentFileName: job.fileName,
    })

    await this.writeFile(job.targetPath, buffer)

    update({
      downloadedFiles: 1,
      downloadedBytes: buffer.byteLength,
    })
  }

  private async downloadDirectory(
    job: DownloadJob,
    drive: import('hyperdrive').default,
    update: (patch: Partial<DownloadJob>) => void,
  ): Promise<void> {
    const entries = await this.driveQuery.list(job.resourcePath, true, drive)

    update({ totalFiles: entries.length })

    for (const entry of entries) {
      const relativePath = entry.key.startsWith(job.resourcePath)
        ? entry.key.slice(job.resourcePath.length)
        : entry.key
      const localPath = path.join(job.targetPath, relativePath)
      const fileName = path.basename(entry.key)

      update({ currentFileName: fileName })

      const buffer = await this.driveQuery.get(entry.key, true, drive)

      if (buffer) {
        await this.writeFile(localPath, buffer)
        job.downloadedFiles++
        job.downloadedBytes += buffer.byteLength
        job.progress = Math.round((job.downloadedFiles / (job.totalFiles || 1)) * 100)
        update({})
      }
    }
  }

  private async writeFile(filePath: string, buffer: Buffer): Promise<void> {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
    await fs.promises.writeFile(filePath, buffer)
  }
}
