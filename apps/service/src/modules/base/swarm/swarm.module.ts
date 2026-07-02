import { Module } from '@nestjs/common'
import { HyperModule } from '../hyper/hyper.module'
import { SwarmService } from './swarm.service'

/**
 * SwarmModule
 *
 * 职责（单一）：封装 Hyperswarm P2P 网络层，提供节点发现、数据复制与远端 drive 挂载能力。
 *
 * 分层职责：
 *   - HyperModule   → 管理 Corestore / Hyperdrive / Hyperswarm 实例生命周期（基础设施）
 *   - SwarmService  → Hyperswarm 上层业务封装（P2P 复制、DHT 宣告、远端 drive 挂载）
 *
 * 使用方式：在需要 P2P 能力的 Feature Module 的 imports 数组中声明本模块。
 * 若 HyperModule 已以 isGlobal: true 注册，本模块内的 HyperModule import
 * 会被 NestJS 静默跳过，无副作用。
 */
@Module({
  imports: [HyperModule],
  providers: [SwarmService],
  exports: [SwarmService],
})
export class SwarmModule {}
