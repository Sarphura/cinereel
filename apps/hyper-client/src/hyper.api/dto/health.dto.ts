import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  uptime: z.number(),
})
export class HealthResponseDto extends createZodDto(HealthResponseSchema) {}
