import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'
import {
  DEFAULT_DIRECTORY_PAGE_SIZE,
  isDriveDirectoryPath,
  isDriveFilePath,
  isDrivePathSegment,
  MAX_DIRECTORY_PAGE_SIZE,
  MAX_DRIVE_FILE_PATH_LENGTH,
} from '@hyper.implementation/file.service.js'

function emptyStringToUndefined(value: unknown): unknown {
  return value === '' ? undefined : value
}

export const AddFileQuerySchema = z.object({
  path: z
    .string()
    .max(MAX_DRIVE_FILE_PATH_LENGTH)
    .refine(isDriveFilePath, 'path 必须是规范的 Drive 绝对文件路径。'),
})
export class AddFileQueryDto extends createZodDto(AddFileQuerySchema) {}

export const ListDirectoryQuerySchema = z.object({
  path: z
    .string()
    .max(MAX_DRIVE_FILE_PATH_LENGTH)
    .refine(isDriveDirectoryPath, 'path 必须是规范的 Drive 绝对目录路径。'),
  cursor: z.preprocess(
    emptyStringToUndefined,
    z
      .string()
      .refine(isDrivePathSegment, 'cursor 必须是有效的目录子项名称。')
      .optional(),
  ),
  limit: z.preprocess(
    emptyStringToUndefined,
    z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_DIRECTORY_PAGE_SIZE)
      .default(DEFAULT_DIRECTORY_PAGE_SIZE),
  ),
})
export class ListDirectoryQueryDto extends createZodDto(
  ListDirectoryQuerySchema,
) {}

export const PathQueryRequestSchema = z.object({
    path: z.string(),
    wait: z.coerce.boolean().optional().default(true),
  })
export class PathQueryDto extends createZodDto(PathQueryRequestSchema) {}
  
export const WriteFileRequestSchema = z.object({
path: z.string(),
})
export class WriteFileRequestDto extends createZodDto(WriteFileRequestSchema) {}

export const GetTreeRequestSchema = z.object({
prefix: z.string().optional().default(''),
wait: z.coerce.boolean().optional().default(true),
})
export class GetTreeRequestDto extends createZodDto(GetTreeRequestSchema) {}

export const DeleteFileRequestSchema = z.object({
path: z.string(),
recursive: z.coerce.boolean().optional().default(false),
})
export class DeleteFileRequestDto extends createZodDto(DeleteFileRequestSchema) {}
