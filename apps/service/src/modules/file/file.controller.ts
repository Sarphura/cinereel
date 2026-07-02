import { Controller, Post, Body, Get, Query, NotFoundException, Req, BadRequestException } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody, ApiExcludeController } from '@nestjs/swagger'
import { FileUploadService } from './service/file.upload.service'
import { FileDownloadService } from './service/file.download.service'
import { FileSwarmService } from './service/file.swarm.service'
import { HttpUploadDto, HttpUploadFileDto, HttpListDto, HttpDownloadDto } from './domain/dto/http.dto'

@ApiExcludeController()
@ApiTags('file')
@Controller('file')
export class FileController {
  constructor(
    private readonly fileUpload: FileUploadService,
    private readonly fileDownload: FileDownloadService,
    private readonly fileSwarm: FileSwarmService,
  ) {}

  @Post('upload')
  @ApiOperation({ summary: '上传测试文件（JSON 文本）' })
  async upload(@Body() dto: HttpUploadDto) {
    const buffer = Buffer.from(dto.content, 'utf-8')
    return this.fileUpload.upload({
      path: dto.path,
      buffer,
    })
  }

  @Post('upload-file')
  @ApiOperation({ summary: '上传单个文件（multipart/form-data）' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: HttpUploadFileDto })
  async uploadFile(@Req() req: import('fastify').FastifyRequest) {
    const data = await req.file()

    if (!data) {
      throw new BadRequestException('未收到文件，请检查 Content-Type 是否为 multipart/form-data')
    }

    // 清洗文件名：去掉可能存在的前置斜杠
    const filename = data.filename?.trim().replace(/^\/+/, '')

    if (!filename) {
      throw new BadRequestException('无法确定写入路径：上传文件必须具有有效文件名')
    }

    // 从 multipart 字段中获取目录路径（可选），最终路径始终以原始文件名结尾
    const pathField = (data.fields as Record<string, { value?: string }>)?.path
    const dir = pathField?.value?.trim().replace(/\/+$/, '') ?? ''
    const drivePath = `${dir}/${filename}`

    // 将文件流读入内存
    const chunks: Buffer[] = []
    for await (const chunk of data.file) {
      chunks.push(chunk as Buffer)
    }
    const buffer = Buffer.concat(chunks)

    return this.fileUpload.upload({ path: drivePath, buffer })
  }

  @Post('list')
  @ApiOperation({ summary: '列举指定路径下的文件' })
  async listFiles(@Body() dto: HttpListDto) {
    let drive
    if (dto.publicKey) {
      // 若提供了远端公钥，则挂载远端 Drive 读取
      drive = await this.fileSwarm.mountPeer(dto.publicKey)
    }

    const files = await this.fileDownload.listFiles(dto.prefix, dto.wait ?? false, drive)
    return { files }
  }

  @Post('download')
  @ApiOperation({ summary: '下载/读取测试文件' })
  async download(@Body() dto: HttpDownloadDto) {
    let drive
    if (dto.publicKey) {
      drive = await this.fileSwarm.mountPeer(dto.publicKey)
    }

    const result = await this.fileDownload.download({
      path: dto.path,
      wait: dto.wait ?? false,
      drive,
    })

    if (!result.buffer) {
      throw new NotFoundException('文件不存在或数据块尚未同步')
    }

    return {
      path: result.path,
      content: result.buffer.toString('utf-8'),
    }
  }
}
