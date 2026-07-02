import { Module } from '@nestjs/common'
import { DriveBaseModule } from '@/modules/base/drive/drive.base.module'
import { SwarmModule } from '@/modules/base/swarm/swarm.module'
import { DownloadRepository } from './repository/download.repository'
import { DownloadService } from './service/download.service'
import { DownloadController } from './controller/download.controller'

/**
 * DownloadModule
 *
 * 职责：从已订阅的远端 Drive 拉取文件/目录到本地文件系统的任务队列。
 *
 * 分层职责：
 *   - DriveBaseModule    → 底层只读原语（list、get）
 *   - SwarmModule        → 获取已挂载的远端 drive 实例
 *   - DownloadRepository → 下载任务持久化（JSON → 未来 SQLite）
 *   - DownloadService    → 任务创建、异步执行、移除本地文件
 */
@Module({
  imports: [DriveBaseModule, SwarmModule],
  controllers: [DownloadController],
  providers: [DownloadRepository, DownloadService],
})
export class DownloadModule {}
