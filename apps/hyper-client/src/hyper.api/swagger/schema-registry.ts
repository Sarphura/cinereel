/**
 * nestjs-zod ⇄ @nestjs/swagger bridge.
 *
 * `patchNestJsSwagger()` patches @nestjs/swagger's `SchemaObjectFactory`
 * to understand Zod-typed DTOs. **Important**: in nestjs-zod@4.3, the
 * patch reaches into `@nestjs/swagger/dist/services/schema-object-factory`
 * (a private subpath), and ESM package exports forbid that access. So
 * `patchNestJsSwagger()` is NOT called at module-load time here — it's
 * called lazily inside `ensureSwaggerPatch()` from main.ts and from the
 * OpenAPI snapshot test, AFTER the swagger module is importable in a
 * CommonJS-friendly way.
 *
 * For tests that don't care about OpenAPI metadata (e.g. wire-equivalence),
 * importing this module does NOT trigger swagger patching and therefore
 * does not hit the ESM-exports wall.
 */
import { z } from 'zod'
import { createRequire } from 'node:module'
import { createZodDto, ZodValidationPipe } from 'nestjs-zod'
import type { ZodDto } from 'nestjs-zod'

export { z, createZodDto, ZodValidationPipe }
export type { ZodDto }

const requireESM = createRequire(import.meta.url)

/**
 * Idempotent — calling multiple times is safe.
 *
 * nestjs-zod 4.3's `patchNestJsSwagger()` reaches into
 * `@nestjs/swagger/dist/services/schema-object-factory` (a private
 * subpath), which is NOT in @nestjs/swagger's `exports` map and therefore
 * fails under strict ESM resolution — both in production (tsx + Node ESM)
 * and in vitest. The DTO classes still validate at runtime via Zod and
 * still expose OpenAPI metadata via `@ApiOkResponse({ type: Dto })` →
 * Swagger's normal inspection of class shapes; the patch only adds
 * Zod-schema-derived metadata (object/minLength/etc.).
 *
 * Strategy: skip the patch entirely if it fails, and log once. The wire
 * contract is preserved via test/openapi.snapshot.json, which catches any
 * accidental drift.
 */
let patched = false
let attempted = false
export function ensureSwaggerPatch(): void {
  if (patched || attempted) return
  attempted = true
  try {
    const { patchNestJsSwagger } = requireESM('nestjs-zod') as typeof import('nestjs-zod')
    patchNestJsSwagger()
    patched = true
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[swagger] nestjs-zod patch skipped (subpath not exported): ` +
        `${(err as Error).message}`,
    )
  }
}