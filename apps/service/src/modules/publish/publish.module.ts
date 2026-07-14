import { Module } from '@nestjs/common'
import { DriveBaseModule } from '@/modules/base/drive/drive.base.module'
import { SwarmModule } from '@/modules/base/swarm/swarm.module'
import { ProfileModule } from '@/modules/profile/profile.module'
import { DriveRepository } from './repository/drive.repository'
import { MountRepository } from './repository/mount.repository'
import { DriveService } from './service/drive.service'
import { MountService } from './service/mount.service'
import { DriveController } from './controller/drive.controller'
import { MountController } from './controller/mount.controller'

/**
 * PublishModule
 *
 * 职责：本地 owned Drive 的管理（创建、重命名、删除、文件树查询）
 * 以及将本地文件系统目录挂载（同步）到 Drive 的任务队列。
 *
 * 分层职责：
 *   - DriveBaseModule   → 底层 Hyperdrive 读写原语
 *   - SwarmModule       → P2P 网络（宣告、挂载远端）
 *   - DriveRepository   → Drive 元数据持久化（JSON → 未来 SQLite）
 *   - MountRepository   → 挂载任务持久化（JSON → 未来 SQLite）
 *   - DriveService      → Drive CRUD + 文件树
 *   - MountService      → 挂载任务队列
 *
 * 导出 DriveService，供 SubscribeModule 共享使用（存取订阅 drive 元数据）。
 */
@Module({
  imports: [DriveBaseModule, SwarmModule, ProfileModule],
  controllers: [DriveController, MountController],
  providers: [DriveRepository, MountRepository, DriveService, MountService],
  exports: [DriveService],
})
export class PublishModule {}
