/**
 * Health DTOs.
 */
import { z, createZodDto } from '../../hyper.api/zod/schema-registry.js'

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  uptime: z.number(),
})
export class HealthResponseDto extends createZodDto(HealthResponseSchema) {}
