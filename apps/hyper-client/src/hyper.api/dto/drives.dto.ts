/**
 * Drives DTOs — Zod schema is the single source of truth, fed to both
 * nestjs-zod runtime validation and @nestjs/swagger OpenAPI emission.
 *
 * The `createZodDto(...)` wrapper turns each Zod schema into a class
 * that can be referenced from `@Body`, `@Param`, `@Query`, and OpenAPI
 * decorators. `createZodDto` only accepts object-shaped schemas, so
 * primitive schemas (e.g. Hex64 path param) are wrapped in
 * `z.object({ value: ... })`.
 */
import { z, createZodDto } from '../../hyper.api/zod/schema-registry.js'

// ─── DriveType enum (shared) ─────────────────────────────────────────
export const DriveTypeSchema = z.enum(['metadata', 'blob'])
export type DriveTypeZod = z.infer<typeof DriveTypeSchema>

// ─── DriveDescriptor (response) ──────────────────────────────────────
export const DriveDescriptorSchema = z.object({
  driveKey: z.string(),
  name: z.string(),
  type: DriveTypeSchema,
  isLocal: z.boolean(),
  createdAt: z.string().optional(),
})
export class DriveDescriptorDto extends createZodDto(DriveDescriptorSchema) {}

// ─── CreateDriveBody ────────────────────────────────────────────────
export const CreateDriveBodySchema = z.object({
  name: z.string().min(1),
  type: DriveTypeSchema,
})
export class CreateDriveBodyDto extends createZodDto(CreateDriveBodySchema) {}

// ─── PathQuery (GET /v1/drives/:key/entry + /file) ──────────────────
export const PathQuerySchema = z.object({
  path: z.string(),
  wait: z.coerce.boolean().optional().default(true),
})
export class PathQueryDto extends createZodDto(PathQuerySchema) {}

// ─── FileWriteQuery (PUT /v1/drives/:key/file — needs only path) ─────
export const FileWriteQuerySchema = z.object({
  path: z.string(),
})
export class FileWriteQueryDto extends createZodDto(FileWriteQuerySchema) {}

// ─── TreeQuery (GET /v1/drives/:key/tree) ────────────────────────────
export const TreeQuerySchema = z.object({
  prefix: z.string().optional().default(''),
  wait: z.coerce.boolean().optional().default(true),
})
export class TreeQueryDto extends createZodDto(TreeQuerySchema) {}

// ─── FileDeleteQuery ────────────────────────────────────────────────
export const FileDeleteQuerySchema = z.object({
  path: z.string(),
  recursive: z.coerce.boolean().optional().default(false),
})
export class FileDeleteQueryDto extends createZodDto(FileDeleteQuerySchema) {}

// ─── HyperdriveEntry (response) ─────────────────────────────────────
export const HyperdriveEntrySchema = z.object({
  key: z.string(),
  seq: z.number(),
  value: z
    .object({
      type: z.enum(['file', 'directory', 'symlink']),
      metadata: z.unknown(),
    })
    .nullable(),
})
export class HyperdriveEntryDto extends createZodDto(HyperdriveEntrySchema) {}
