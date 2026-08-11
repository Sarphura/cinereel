/**
 * Swarm DTOs.
 *
 * `createZodDto` only accepts object-shaped schemas, so the AnnounceBody
 * (which is itself `.optional()`) is wrapped to expose a `data` field,
 * and the Hex64 path param is wrapped to expose `value`.
 */
import { z, createZodDto } from '../../hyper.api/zod/schema-registry.js'

// ─── AnnounceBody (optional body — `anyOf: [object, null]` semantics) ─
// Wrap with `data` so the dto class is object-shaped for nestjs-zod.
// At runtime the request body may itself be missing or {} — the
// `@BodyOptional()` decorator is responsible for that path-level choice;
// this DTO only validates the inner shape when present.
export const AnnounceInnerSchema = z.object({
  wait: z.boolean().optional(),
})
export const AnnounceBodySchema = z.object({
  data: AnnounceInnerSchema.optional(),
})
export class AnnounceBodyDto extends createZodDto(AnnounceBodySchema) {}

// ─── PeerInfo (response) ────────────────────────────────────────────
export const PeerInfoSchema = z.object({
  publicKey: z.string(),
  connectedAt: z.string(),
})
export class PeerInfoDto extends createZodDto(PeerInfoSchema) {}

// ─── IdentityInfo (response) ────────────────────────────────────────
export const IdentityInfoSchema = z.object({
  mainDriveKey: z.string(),
  peerPublicKey: z.string(),
  swarmPort: z.number(),
  peerCount: z.number(),
})
export class IdentityInfoDto extends createZodDto(IdentityInfoSchema) {}

// ─── PublicKey path param (Hex64, wrapped as object for nestjs-zod) ─
export const Hex64ParamSchema = z.object({
  value: z.string().regex(/^[0-9a-f]{64}$/),
})
export class Hex64ParamDto extends createZodDto(Hex64ParamSchema) {}
