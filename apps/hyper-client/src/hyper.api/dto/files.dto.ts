import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'

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
