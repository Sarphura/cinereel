import { ApiProperty } from '@nestjs/swagger'

export class HttpUploadDto {
  @ApiProperty({ description: '写入的绝对路径', example: '/hello.txt' })
  path: string

  @ApiProperty({ description: '文件内容（由于当前未配置 multipart，测试使用纯文本）', example: 'Hello Cinereel!' })
  content: string
}

/**
 * 真正的 multipart/form-data 文件上传 DTO（供 Swagger UI 渲染文件选择器）。
 * 字段仅用于文档展示，实际文件流由 Fastify multipart 解析，不经过这个类。
 */
export class HttpUploadFileDto {
  @ApiProperty({
    description: 'drive 内的目录路径（可选），最终写入路径为 {path}/{文件名}，留空则写入根目录',
    example: '/videos',
    required: false,
  })
  path?: string

  @ApiProperty({ type: 'string', format: 'binary', description: '要上传的文件' })
  file: any
}

export class HttpListDto {
  @ApiProperty({ description: '要列举的路径前缀', example: '/' })
  prefix: string

  @ApiProperty({ description: '是否等待网络同步数据块', required: false, default: true })
  wait?: boolean

  @ApiProperty({ description: '要读取的远端 Drive 公钥（留空则读取本地）', required: false })
  publicKey?: string
}

export class HttpDownloadDto {
  @ApiProperty({ description: '读取的绝对路径', example: '/hello.txt' })
  path: string

  @ApiProperty({ description: '是否等待网络同步数据块', required: false, default: true })
  wait?: boolean

  @ApiProperty({ description: '要读取的远端 Drive 公钥（留空则读取本地）', required: false })
  publicKey?: string
}

export class HttpMountDto {
  @ApiProperty({ description: '对等节点的公钥 (Hex 字符串)' })
  publicKey: string
}
