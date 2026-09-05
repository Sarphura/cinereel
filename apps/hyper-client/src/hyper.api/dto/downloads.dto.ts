import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'
import {
  DownloadRequestSchema,
  DownloadTaskResponseSchema,
} from '../../hyper.implementation/download-task.types.js'

export class CreateDownloadTaskDto extends createZodDto(DownloadRequestSchema) {}
export class DownloadTaskResponseDto extends createZodDto(DownloadTaskResponseSchema) {}

export const DownloadTaskParamsSchema = z.object({ id: z.string().uuid() })
export class DownloadTaskParamsDto extends createZodDto(DownloadTaskParamsSchema) {}

export const ListDownloadTasksQuerySchema = z.object({
  cursor: z.preprocess((value) => value === '' ? undefined : value, z.string().uuid().optional()).optional(),
  limit: z.preprocess((value) => value === '' ? undefined : value,
    z.coerce.number().int().min(1).max(500).default(100)).default(100),
})
export class ListDownloadTasksQueryDto extends createZodDto(ListDownloadTasksQuerySchema) {}

export const ListDownloadTasksResponseSchema = z.object({
  tasks: z.array(DownloadTaskResponseSchema),
  nextCursor: z.string().uuid().nullable(),
})
export class ListDownloadTasksResponseDto extends createZodDto(ListDownloadTasksResponseSchema) {}
