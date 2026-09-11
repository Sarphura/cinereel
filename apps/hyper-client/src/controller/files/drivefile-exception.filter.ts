import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import { DriveFileError } from '../../service/file/drivefile.service.js'

/**
 * 全局业务异常过滤器。
 *
 * 把 service 抛出的 DriveFileError 统一转成 { statusCode, code, message }
 * 形状的 HTTP 错误响应，与 file-response.writer.ts / download.controller.ts
 * 现有手写转换保持同一格式，避免破坏 C# / Web 的既有契约。
 */
@Catch(DriveFileError)
export class DriveFileExceptionFilter implements ExceptionFilter {
  catch(exception: DriveFileError, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>()
    void reply.status(exception.status).send({
      statusCode: exception.status,
      code: exception.code,
      message: exception.message,
    })
  }
}
