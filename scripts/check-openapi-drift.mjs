#!/usr/bin/env node
/**
 * check-openapi-drift.mjs — fails if the App Server's OpenAPI schema
 * (as served by `Program` at `/api/openapi/v1.json`) drifts from the
 * canonical fixture committed at
 * `apps/web/src/api/__fixtures__/openapi.json`.
 *
 * The drift detector itself lives in C# at
 * `apps/service/tests/CineReel.Service.Tests/OpenApiDriftTests.cs`
 * (ADR 0042, ticket 34). This script is a thin wrapper that runs the
 * xUnit test from CI:
 *
 *   pnpm check:openapi-drift
 *
 * Devs run `pnpm regen:openapi-fixture` to refresh the fixture after
 * a deliberate change to a feature endpoint.
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const HERE = join(__dirname, '..')

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
process.exit(result.status ?? 1)