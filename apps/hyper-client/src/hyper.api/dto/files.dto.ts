import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'
import {
  DEFAULT_DIRECTORY_PAGE_SIZE,
  isDriveDirectoryPath,
  isDriveFilePath,
  isDrivePathSegment,
  MAX_DIRECTORY_PAGE_SIZE,
  MAX_DRIVE_FILE_PATH_LENGTH,
} from '../../hyper.implementation/file.service.js'

function emptyStringToUndefined(value: unknown): unknown {
  return value === '' ? undefined : value
}

export const AddFileQuerySchema = z.object({
  path: z
    .string()
    .max(MAX_DRIVE_FILE_PATH_LENGTH)
    .refine(isDriveFilePath, 'path 必须是规范的 Drive 绝对文件路径。')
    .describe('要写入的规范 Drive 绝对文件路径，例如 /movies/file.txt'),
})
export class AddFileQueryDto extends createZodDto(AddFileQuerySchema) {}

export const DriveKeyParamsSchema = z.object({
  driveKey: z
    .string()
    .regex(/^[0-9a-f]{64}$/iu, 'driveKey 必须是 64 位十六进制字符串。')
    .describe('64 位十六进制 Drive key'),
})
export class DriveKeyParamsDto extends createZodDto(DriveKeyParamsSchema) {}

export const ListDirectoryQuerySchema = z.object({
  path: z
    .string()
    .max(MAX_DRIVE_FILE_PATH_LENGTH)
    .refine(isDriveDirectoryPath, 'path 必须是规范的 Drive 绝对目录路径。')
    .describe('要列出的规范 Drive 绝对目录路径，例如 /movies'),
  cursor: z
    .preprocess(
      emptyStringToUndefined,
      z
        .string()
        .refine(isDrivePathSegment, 'cursor 必须是有效的目录子项名称。')
        .optional(),
    )
    .optional()
    .describe('上一页最后一个子项的名称'),
  limit: z
    .preprocess(
      emptyStringToUndefined,
      z.coerce
        .number()
        .int()
        .min(1)
        .max(MAX_DIRECTORY_PAGE_SIZE)
        .default(DEFAULT_DIRECTORY_PAGE_SIZE),
    )
    .default(DEFAULT_DIRECTORY_PAGE_SIZE)
    .describe('单页子项数量'),
})
export class ListDirectoryQueryDto extends createZodDto(
  ListDirectoryQuerySchema,
) {}

export const DirectoryEntryResponseSchema = z.object({
  path: z.string(),
  name: z.string(),
  type: z.enum(['file', 'directory', 'symlink']),
  size: z.number().nullable(),
})

export const ListDirectoryResponseSchema = z.object({
  path: z.string(),
  driveVersion: z.number().int(),
  entries: z.array(DirectoryEntryResponseSchema),
  nextCursor: z.string().nullable(),
})
export class ListDirectoryResponseDto extends createZodDto(
  ListDirectoryResponseSchema,
) {}

export const AddFileResponseSchema = z.object({
  ok: z.literal(true),
})
export class AddFileResponseDto extends createZodDto(AddFileResponseSchema) {}

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
