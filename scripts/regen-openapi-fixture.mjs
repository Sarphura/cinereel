#!/usr/bin/env node
/**
 * regen-openapi-fixture.mjs — regenerates the OpenAPI fixture at
 * `apps/web/src/api/__fixtures__/openapi.json`. Run after a
 * deliberate change to a feature endpoint's response DTO.
 *
 * Implementation: runs the C# drift test with the fixture file
 * missing so the test bootstraps a fresh baseline and FAILS with
 * an explicit "no fixture found, created one" message. The dev
 * then re-runs `check-openapi-drift.mjs` to confirm the new
 * baseline is committed.
 *
 * Usage: pnpm regen:openapi-fixture
 */
import { spawnSync } from 'node:child_process'
import { existsSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const HERE = join(__dirname, '..')

const fixture = join(HERE, 'apps', 'web', 'src', 'api', '__fixtures__', 'openapi.json')

if (existsSync(fixture)) {
  console.log(`[regen-openapi-fixture] removing existing fixture ${fixture}`)
  unlinkSync(fixture)
}

const project = join(HERE, 'apps/service/tests/CineReel.Service.Tests/CineReel.Service.Tests.csproj')

const result = spawnSync('dotnet', [
  'test',
  project,
  '--filter',
  'FullyQualifiedName~OpenApiDriftTests',
], {
  stdio: 'inherit',
  cwd: HERE,
})

if (existsSync(fixture)) {
  console.log(`\n[regen-openapi-fixture] wrote ${fixture}; commit the new baseline.`)
  process.exit(0)
}

console.error('[regen-openapi-fixture] fixture was not regenerated; check test output above')
process.exit(result.status ?? 1)