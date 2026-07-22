/**
 * Auth DTOs.
 */
import { z, createZodDto } from '../../../core/common/zod/schema-registry.js'

// ─── TokenRequest ──────────────────────────────────────────────────
export const TokenRequestSchema = z.object({
  apiKey: z.string().min(1),
})
export class TokenRequestDto extends createZodDto(TokenRequestSchema) {}

// ─── TokenResponse ─────────────────────────────────────────────────
export const TokenResponseSchema = z.object({
  token: z.string(),
  expiresIn: z.number(),
  tokenType: z.literal('Bearer'),
})
export class TokenResponseDto extends createZodDto(TokenResponseSchema) {}
