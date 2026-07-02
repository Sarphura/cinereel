import { Module } from '@nestjs/common'
import { HyperModule } from '@/modules/base/hyper/hyper.module'
import { PublishModule } from '@/modules/publish/publish.module'
import { SubscribeModule } from '@/modules/subscribe/subscribe.module'
import { DownloadModule } from '@/modules/download/download.module'

/**
 * AppModule
 *
 * 应用根模块。职责：
 *   - 全局注册 HyperModule（Corestore/Hyperdrive/Hyperswarm 生命周期）
 *   - 在此聚合所有 Feature Module
 *
 * 功能模块：
 *   - PublishModule   → 本地 Drive 管理 + 挂载任务（/api/drives, /api/mount）
 *   - SubscribeModule → 远端 Drive 订阅管理（/api/subscribed-drives）
 *   - DownloadModule  → 文件下载任务队列（/api/downloads）
 */
@Module({
  imports: [
    HyperModule.register({
      isGlobal: true,
      config: {
        storeDir: process.env.CORESTORE_DIR ?? './storage',
        cacheDir: process.env.CINEREEL_CACHE_DIR ?? './cache',
      },
    }),
    PublishModule,
    SubscribeModule,
    DownloadModule,
  ],
})
export class AppModule {}
