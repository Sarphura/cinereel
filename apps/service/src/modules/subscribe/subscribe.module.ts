import { Module } from '@nestjs/common'
import { DriveBaseModule } from '@/modules/base/drive/drive.base.module'
import { SwarmModule } from '@/modules/base/swarm/swarm.module'
import { PublishModule } from '@/modules/publish/publish.module'
import { SubscribedDriveService } from './service/subscribed-drive.service'
import { SubscribedDriveController } from './controller/subscribed-drive.controller'

/**
 * SubscribeModule
 *
 * 职责：管理对远端 Hyperdrive 的订阅关系。
 *
 * 分层职责：
 *   - DriveBaseModule         → 底层读写原语（读取远端 descriptor.json）
 *   - SwarmModule             → P2P 网络（挂载/卸载远端 drive）
 *   - PublishModule           → 共享 DriveService（存储订阅记录）
 *   - SubscribedDriveService  → 订阅业务逻辑
 *
 * 导出 SubscribedDriveService，供 DownloadModule 获取已挂载的远端 drive 实例。
 */
@Module({
  imports: [DriveBaseModule, SwarmModule, PublishModule],
  controllers: [SubscribedDriveController],
  providers: [SubscribedDriveService],
  exports: [SubscribedDriveService],
})
export class SubscribeModule {}
