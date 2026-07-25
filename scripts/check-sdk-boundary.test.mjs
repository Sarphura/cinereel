#!/usr/bin/env node
/**
 * check-sdk-boundary.test.mjs — verifies the repo-wide SDK boundary
 * guard. Spawns the check with a temporary file that imports
 * `hyper-sdk` from a forbidden location and asserts the script exits
 * non-zero with the expected error message.
 *
 * Run via `node scripts/check-sdk-boundary.test.mjs`.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const HERE = join(__dirname, '..')

const sdkBoundary = join(HERE, 'scripts', 'check-sdk-boundary.mjs')

let pass = true
function expect(name, ok) {
  console.log(`${ok ? '\u2713' : '\u2716'} ${name}`)
  if (!ok) pass = false
}

// ── 1. happy path: clean repo ──────────────────────────────────────
const okClean = spawnSync('node', [sdkBoundary], {
  cwd: HERE,
  encoding: 'utf8',
})
expect(
  'clean repo passes boundary check',
  okClean.status === 0 && okClean.stdout.includes('SDK boundary OK'),
)

// ── 2. negative: forbidden import inside apps/service ──────────────
//
// The check walks the `apps/` root relative to HERE. We drop a sentinel
// file inside `apps/service/` that imports `hyper-sdk`, then run the
// check and assert it exits non-zero with the right error message.
const tmp = mkdtempSync(join(tmpdir(), 'sdk-boundary-test-'))
void tmp
const sentinel = join(HERE, 'apps', 'service', '__sdk_boundary_tmp.ts')
writeFileSync(
  sentinel,
  `// temporary boundary-check fixture\nimport { x } from 'hyper-sdk'\nexport const y = x\n`,
)

const okBad = spawnSync('node', [sdkBoundary], {
  cwd: HERE,
  encoding: 'utf8',
})

try {
  rmSync(sentinel)
} catch {
  /* ignore */
}

expect(
  'importing hyper-sdk from apps/service fails the check',
  okBad.status !== 0,
)
expect(
  'error message names the offending path',
  okBad.stderr.includes('apps/service/__sdk_boundary_tmp.ts'),
)
expect(
  'error message references ADR 0002',
  okBad.stderr.includes('ADR 0002'),
)
expect(
  'error message names the forbidden package',
  okBad.stderr.includes('hyper-sdk'),
)

void relative
void sep
process.exit(pass ? 0 : 1)
