import { Module } from '@nestjs/common'
import { HyperModule } from '../hyper/hyper.module'
import { DriveQueryService } from './service/drive.query.service'
import { DriveWriteService } from './service/drive.write.service'

/**
 * DriveBaseModule
 *
 * 提供最底层的 Hyperdrive（v13）增删改查能力。
 *
 * 分层职责（单一职责原则）：
 *   - HyperModule    → 管理 Corestore / Hyperdrive / Hyperswarm 生命周期
 *   - DriveQueryService → 只读操作（存在性检测、读取文件/JSON、列举条目）
 *   - DriveWriteService → 写入操作（put/JSON、del、clearAndDel、递归 delTree）
 *
 * 使用方式：在 Feature Module 的 imports 数组中声明本模块即可。
 * 若 HyperModule 已以 isGlobal: true 注册，则本模块内的 HyperModule
 * import 会被 NestJS 静默跳过，无副作用。
 */
@Module({
  imports: [HyperModule],
  providers: [DriveQueryService, DriveWriteService],
  exports: [DriveQueryService, DriveWriteService],
})
export class DriveBaseModule {}
