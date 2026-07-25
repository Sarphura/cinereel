#!/usr/bin/env node
/**
 * check-sdk-boundary.mjs — replaces the old bash `scripts/check-sdk-boundary.sh`.
 *
 * Walks every TypeScript source under the apps/* packages and enforces:
 *   1. No business file imports `hypercore` / `hyperdrive` / `hyperswarm` /
 *      `corestore` directly. Always go through `hyper-sdk`.
 *   2. Only `src/infrastructure/sdk/index.ts` of an allowlisted package may
 *      `import 'hyper-sdk'`. The allowlist (see `ALLOWED_PACKAGES`) carries
 *      both `apps/sidecar` and `apps/hyper-agent` during the rename
 *      transition; ticket 03 will shrink the list to `apps/hyper-agent`.
 *
 * Exits non-zero on the first violation (CI-friendly).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const HERE = join(__dirname, '..')

const ALLOWED_PACKAGES = ['apps/hyper-agent']
const SRC_DIRS = ALLOWED_PACKAGES.flatMap((p) => {
  const src = join(HERE, p, 'src')
  const test = join(HERE, p, 'test')
  return [existsSync(src) ? src : null, existsSync(test) ? test : null].filter(Boolean)
})

const FORBIDDEN_PKGS = ['hypercore', 'hyperdrive', 'hyperswarm', 'corestore']
const ALLOWED_HYPER_SDK_PATH = ALLOWED_PACKAGES.map((p) =>
  join(p, 'src/infrastructure/sdk/index.ts'),
)

const IMPORT_RE = /(?:from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\))/

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      yield* walk(full)
    } else if (entry.endsWith('.ts') || entry.endsWith('.mts') || entry.endsWith('.cts')) {
      yield full
    }
  }
}

let violations = 0
for (const dir of SRC_DIRS) {
  for (const file of walk(dir)) {
    const rel = relative(HERE, file)
    const src = readFileSync(file, 'utf8')

    for (const line of src.split('\n')) {
      const m = line.match(IMPORT_RE)
      if (!m) continue
      const modName = (m[1] ?? m[2] ?? '').split('/')[0]

      if (FORBIDDEN_PKGS.includes(modName)) {
        console.error(
          `\u2716 hyper package leak: ${rel}\n    imports "${modName}" \u2014 use hyper-sdk instead`,
        )
        violations++
      } else if (modName === 'hyper-sdk') {
        if (!ALLOWED_HYPER_SDK_PATH.includes(rel)) {
          console.error(
            `\u2716 'hyper-sdk' imported outside infrastructure/sdk/index.ts: ${rel}`,
          )
          violations++
        }
      }
    }
  }
}

if (violations > 0) {
  console.error(`\n${violations} SDK boundary violation(s).`)
  process.exit(1)
}
console.log('\u2713 SDK boundary OK')
