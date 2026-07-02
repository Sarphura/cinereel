import { Controller, Post, Body, Get } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiExcludeController } from '@nestjs/swagger'
import { FileSwarmService } from './service/file.swarm.service'
import { HttpMountDto } from './domain/dto/http.dto'

@ApiExcludeController()
@ApiTags('drive')
@Controller('swarm')
export class FileSwarmController {
  constructor(private readonly fileSwarm: FileSwarmService) {}

  @Get('public-key')
  @ApiOperation({ summary: '获取当前节点的 Drive 公钥' })
  getPublicKey() {
    return {
      publicKey: this.fileSwarm.localPublicKey,
    }
  }

  @Post('replication/enable')
  @ApiOperation({ summary: '启动 P2P 数据复制通道' })
  enableReplication() {
    this.fileSwarm.enableReplication()
    return { success: true }
  }

  @Post('announce')
  @ApiOperation({ summary: '宣告本地 Drive 到 DHT 网络' })
  async announce() {
    await this.fileSwarm.announce(true)
    return { success: true }
  }

  @Post('mount')
  @ApiOperation({ summary: '挂载远端节点的 Drive' })
  async mountPeer(@Body() dto: HttpMountDto) {
    await this.fileSwarm.mountPeer(dto.publicKey)
    return { success: true, message: `Mounted ${dto.publicKey}` }
  }

  @Post('unmount')
  @ApiOperation({ summary: '卸载远端节点的 Drive' })
  async unmountPeer(@Body() dto: HttpMountDto) {
    await this.fileSwarm.unmountPeer(dto.publicKey)
    return { success: true }
  }
}
