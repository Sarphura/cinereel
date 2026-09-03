import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'

// ─── DriveType enum (shared) ─────────────────────────────────────────
export const DriveTypeSchema = z.enum(['metadata', 'blob'])
export type DriveTypeZod = z.infer<typeof DriveTypeSchema>

export const DriveResponseSchema = z.object({
  driveKey: z.string(),
  namespace: z.string(),
  name: z.string(),
  isLocal: z.boolean(),
  createdAt: z.string().optional(),
})
export class DriveResponseDto extends createZodDto(DriveResponseSchema) {}
export class DriveDto extends createZodDto(DriveResponseSchema) {} // 向后兼容别名
export class DriveDescriptorDto extends createZodDto(DriveResponseSchema) {} // 向后兼容别名

export const CreateDriveRequestSchema = z.object({
  namespace: z.string().min(1).describe('Drive 命名空间'),
  name: z.string().min(1).describe('Drive 名称'),
})
export class CreateDriveRequestDto extends createZodDto(CreateDriveRequestSchema) {
  namespace!: string
  name!: string
}

export const DriveEntryResponseSchema = z.object({
  key: z.string(),
  seq: z.number(),
  value: z
    .object({
      type: z.enum(['file', 'directory', 'symlink']),
      metadata: z.unknown(),
    })
    .nullable(),
})
export class DriveEntryResponseDto extends createZodDto(DriveEntryResponseSchema) {}
