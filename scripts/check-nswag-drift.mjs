#!/usr/bin/env node
/**
 * check-nswag-drift.mjs — fails if the regenerated
 * `HyperAgentClient.g.cs` differs from the committed copy.
 *
 * Workflow:
 *   1. Regenerate to a temp file from the committed OpenAPI snapshot.
 *   2. Diff the temp file against the committed one.
 *   3. If they differ, print the diff and exit non-zero (CI fails).
 *
 * The drift is checked on every PR that touches `apps/hyper-agent/`
 * (per ticket 14). Devs run `pnpm regen:hyper-agent-client` to update.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const HERE = join(__dirname, '..')

const SNAPSHOT = join(HERE, 'apps/hyper-agent/test/openapi.snapshot.json')
const COMMITTED = join(HERE, 'apps/service/src/HyperAgent/HyperAgentClient.g.cs')
const GEN = join(HERE, 'scripts/gen-hyper-agent-client.mjs')

if (!existsSync(SNAPSHOT)) {
  console.error(`[check-nswag-drift] missing snapshot: ${SNAPSHOT}`)
  process.exit(2)
}
if (!existsSync(COMMITTED)) {
  console.error(
    `[check-nswag-drift] missing committed client: ${COMMITTED}\n` +
      `    Run \`pnpm regen:hyper-agent-client\` to generate it, then commit.`,
  )
  process.exit(2)
}

const tmp = mkdtempSync(join(tmpdir(), 'nswag-drift-'))
const regenerated = join(tmp, 'HyperAgentClient.g.cs')

const res = spawnSync('node', [GEN, SNAPSHOT, regenerated], {
  stdio: 'inherit',
})
if (res.status !== 0) {
  console.error('[check-nswag-drift] generator failed')
  process.exit(res.status ?? 1)
}

const a = readFileSync(COMMITTED, 'utf8')
const b = readFileSync(regenerated, 'utf8')

rmSync(tmp, { recursive: true, force: true })

if (a === b) {
  console.log('\u2713 NSwag client drift check OK')
  process.exit(0)
}

// Compute a unified diff for the CI log.
writeFileSync(join(tmpdir(), 'nswag-drift-a.cs'), a)
writeFileSync(join(tmpdir(), 'nswag-drift-b.cs'), b)
const diff = spawnSync('diff', ['-u', 'committed', 'regenerated'], {
  input: a + b,
  encoding: 'utf8',
})
console.error('[check-nswag-drift] drift detected!')
console.error(
  '  Run `pnpm regen:hyper-agent-client` and commit the updated `apps/service/src/HyperAgent/HyperAgentClient.g.cs`.',
)
if (diff.stdout) console.error(diff.stdout)
process.exit(1)
