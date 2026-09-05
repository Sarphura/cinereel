import {
  Body, Controller, Get, Headers, HttpException, HttpStatus, Inject, Param, Post, Query,
} from '@nestjs/common'
import {
  ApiBadRequestResponse, ApiConflictResponse, ApiHeader, ApiNotFoundResponse,
  ApiOperation, ApiServiceUnavailableResponse, ApiTags,
} from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import {
  DownloadTaskError, DownloadTaskService,
} from '../../../hyper.implementation/download-task.service.js'
import {
  CreateDownloadTaskDto, DownloadTaskParamsDto, DownloadTaskResponseDto,
  ListDownloadTasksQueryDto, ListDownloadTasksResponseDto,
} from '../../dto/downloads.dto.js'

@ApiTags('downloads')
@ApiBadRequestResponse({ description: '任务参数、任务标识、分页参数或幂等请求头无效。' })
@Controller('v1/downloads')
export class DownloadTaskController {
  constructor(@Inject(DownloadTaskService) private readonly downloads: DownloadTaskService) {}

  @Post()
  @ApiOperation({ operationId: 'createDownloadTask', summary: '创建固定版本的离线缓存任务' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, schema: { type: 'string', minLength: 1, maxLength: 200 } })
  @ApiConflictResponse({ description: '幂等键已用于不同参数，或 Drive 正在关闭。' })
  @ApiServiceUnavailableResponse({ description: '任务服务正在关闭或持久化存储不可用。' })
  @ZodResponse({ status: HttpStatus.ACCEPTED, type: DownloadTaskResponseDto })
  create(@Body() body: CreateDownloadTaskDto, @Headers('idempotency-key') key?: string) {
    return this.respond(() => this.downloads.createTask(body, key ?? ''))
  }

  @Get()
  @ApiOperation({ operationId: 'listDownloadTasks', summary: '分页列出离线缓存任务' })
  @ZodResponse({ status: HttpStatus.OK, type: ListDownloadTasksResponseDto })
  list(@Query() query: ListDownloadTasksQueryDto) {
    return this.respond(() => this.downloads.listTasks(query.cursor, query.limit))
  }

  @Get(':id')
  @ApiOperation({ operationId: 'getDownloadTask', summary: '查询离线缓存任务与内容处理进度' })
  @ApiNotFoundResponse({ description: '离线任务不存在。' })
  @ZodResponse({ status: HttpStatus.OK, type: DownloadTaskResponseDto })
  get(@Param() params: DownloadTaskParamsDto) {
    return this.respond(() => this.downloads.getTask(params.id))
  }

  @Post(':id/pause')
  @ApiOperation({ operationId: 'pauseDownloadTask', summary: '暂停任务并保留缓存' })
  @ApiNotFoundResponse({ description: '离线任务不存在。' })
  @ApiConflictResponse({ description: '当前任务状态不能暂停。' })
  @ApiServiceUnavailableResponse({ description: '任务服务正在关闭或持久化存储不可用。' })
  @ZodResponse({ status: HttpStatus.OK, type: DownloadTaskResponseDto })
  pause(@Param() params: DownloadTaskParamsDto) {
    return this.respond(() => this.downloads.pauseTask(params.id))
  }

  @Post(':id/resume')
  @ApiOperation({ operationId: 'resumeDownloadTask', summary: '继续已暂停的任务' })
  @ApiNotFoundResponse({ description: '离线任务不存在。' })
  @ApiConflictResponse({ description: '当前任务状态不能继续。' })
  @ApiServiceUnavailableResponse({ description: '任务服务正在关闭或持久化存储不可用。' })
  @ZodResponse({ status: HttpStatus.OK, type: DownloadTaskResponseDto })
  resume(@Param() params: DownloadTaskParamsDto) {
    return this.respond(() => this.downloads.resumeTask(params.id))
  }

  @Post(':id/cancel')
  @ApiOperation({ operationId: 'cancelDownloadTask', summary: '取消任务并保留已缓存的块' })
  @ApiNotFoundResponse({ description: '离线任务不存在。' })
  @ApiConflictResponse({ description: '已经完成的任务不能取消。' })
  @ApiServiceUnavailableResponse({ description: '任务服务正在关闭或持久化存储不可用。' })
  @ZodResponse({ status: HttpStatus.OK, type: DownloadTaskResponseDto })
  cancel(@Param() params: DownloadTaskParamsDto) {
    return this.respond(() => this.downloads.cancelTask(params.id))
  }

  @Post(':id/retry')
  @ApiOperation({ operationId: 'retryDownloadTask', summary: '按原版本重试失败任务' })
  @ApiNotFoundResponse({ description: '离线任务不存在。' })
  @ApiConflictResponse({ description: '任务不是失败状态，或 Drive 正在关闭。' })
  @ApiServiceUnavailableResponse({ description: '任务服务正在关闭或持久化存储不可用。' })
  @ZodResponse({ status: HttpStatus.OK, type: DownloadTaskResponseDto })
  retry(@Param() params: DownloadTaskParamsDto) {
    return this.respond(() => this.downloads.retryTask(params.id))
  }

  private async respond<T>(action: () => T | Promise<T>): Promise<T> {
    try {
      return await action()
    } catch (error) {
      if (error instanceof DownloadTaskError) {
        throw new HttpException({ statusCode: error.status, code: error.code, message: error.message }, error.status)
      }
      throw error
    }
  }
}
