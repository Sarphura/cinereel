import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'

export const AnnounceRequestSchema = z.object({
  wait: z.boolean().optional(),
})
export class AnnounceRequestDto extends createZodDto(AnnounceRequestSchema) {}

export const AnnounceBodySchema = z.object({
  data: AnnounceRequestSchema.optional(),
})
export class AnnounceBodyDto extends createZodDto(AnnounceBodySchema) {}

export const GetPeerInfoResponseSchema = z.object({
  publicKey: z.string(),
  connectedAt: z.string(),
})
export class GetPeerInfoResponseDto extends createZodDto(GetPeerInfoResponseSchema) {}

// ─── IdentityInfo (response) ────────────────────────────────────────
export const IdentityInfoResponseSchema = z.object({
  mainDriveKey: z.string(),
  peerPublicKey: z.string(),
  swarmPort: z.number(),
  peerCount: z.number(),
})
export class IdentityInfoDto extends createZodDto(IdentityInfoResponseSchema) {}

// ─── PublicKey path param (Hex64, wrapped as object for nestjs-zod) ─
export const Hex64ParamSchema = z.object({
  value: z.string().regex(/^[0-9a-f]{64}$/),
})
export class Hex64ParamDto extends createZodDto(Hex64ParamSchema) {}
