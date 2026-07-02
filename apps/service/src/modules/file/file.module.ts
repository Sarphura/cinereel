import { Module } from '@nestjs/common'
import { DriveBaseModule } from '@/modules/base/drive/drive.base.module'
import { SwarmModule } from '@/modules/base/swarm/swarm.module'
import { FileUploadService } from './service/file.upload.service'
import { FileDownloadService } from './service/file.download.service'
import { FileSwarmService } from './service/file.swarm.service'
import { FileController } from './file.controller'
import { FileSwarmController } from './file.swarm.controller'

/**
 * FileModule
 *
 * 提供业务级文件上传/下载与 P2P 网络能力。
 *
 * 分层职责（单一职责原则）：
 *   - DriveBaseModule    → 底层 Hyperdrive 读写原语
 *   - SwarmModule        → Hyperswarm P2P 网络封装（节点发现、数据复制、远端 drive 挂载）
 *   - FileUploadService  → 只写：上传 Buffer/JSON、删除文件/目录树
 *   - FileDownloadService→ 只读：下载 Buffer/JSON、存在性检测、列举路径
 *   - FileSwarmService   → P2P：启用复制、宣告本地 drive、挂载/卸载远端 drive
 *
 * 使用方式：在上层 Feature Module 的 imports 数组中声明本模块即可。
 */
@Module({
  imports: [DriveBaseModule, SwarmModule],
  controllers: [FileController, FileSwarmController],
  providers: [FileUploadService, FileDownloadService, FileSwarmService],
  exports: [FileUploadService, FileDownloadService, FileSwarmService],
})
export class FileModule {}
