import { Module } from '@nestjs/common'
import { DriveBaseModule } from '@/modules/base/drive/drive.base.module'
import { SwarmModule } from '@/modules/base/swarm/swarm.module'
import { PublishModule } from '@/modules/publish/publish.module'
import { ProfileModule } from '@/modules/profile/profile.module'
import { SubscribeService } from './service/subscribe.service'
import { SubscribeController } from './controller/subscribe.controller'

/**
 * SubscribeModule
 *
 * 职责：管理对远端 Hyperdrive 的订阅关系。
 *
 * 分层职责：
 *   - DriveBaseModule   → 底层读写原语（读取远端 descriptor.json）
 *   - SwarmModule       → P2P 网络（挂载/卸载远端 drive）
 *   - PublishModule     → 共享 DriveService（存储订阅记录）
 *   - ProfileModule     → 解析并读取所有者 Profile
 *   - SubscribeService  → 订阅业务逻辑
 *
 * 导出 SubscribeService，供 DownloadModule 等模块复用。
 */
@Module({
  imports: [DriveBaseModule, SwarmModule, PublishModule, ProfileModule],
  controllers: [SubscribeController],
  providers: [SubscribeService],
  exports: [SubscribeService],
})
export class SubscribeModule {}
