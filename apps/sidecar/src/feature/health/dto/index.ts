/**
 * Health DTOs.
 */
import { z, createZodDto } from '../../../core/common/zod/schema-registry.js'

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  uptime: z.number(),
})
export class HealthResponseDto extends createZodDto(HealthResponseSchema) {}
