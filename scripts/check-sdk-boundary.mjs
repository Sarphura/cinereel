#!/usr/bin/env node
/**
 * check-sdk-boundary.mjs — guardrail that enforces the Hyper SDK
 * boundary from ADR 0002 across the entire repository.
 *
 * Rules:
 *   1. No file under `apps/`, `packages/`, or `libs/` may import
 *      `hyper-sdk`, `hypercore`, `hyperdrive`, `hyperswarm`, or
 *      `corestore` directly unless it lives under
 *      `apps/hyper-agent/src/infrastructure/sdk/`.
 *   2. `apps/hyper-agent/src/infrastructure/sdk/index.ts` is the
 *      **only** file that may `import 'hyper-sdk'`. Everything else
 *      inside `apps/hyper-agent` must reach the SDK through that
 *      re-export module.
 *
 * The script exits non-zero on a violation (CI fails). The error
 * message points at the offending file and references ADR 0002 so
 * newcomers can fix the violation without archaeology.
 *
 * Run as `pnpm check:sdk-boundary` (wired in the root package.json).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const HERE = join(__dirname, '..')

// ── allowlist ────────────────────────────────────────────────────
const ALLOWED_PACKAGE = 'apps/hyper-agent'
const ALLOWED_SDK_FILE = join(
  ALLOWED_PACKAGE,
  'src',
  'infrastructure',
  'sdk',
  'index.ts',
)

const ROOT_DIRS = ['apps', 'packages', 'libs']
const IGNORE_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  'bin',
  'obj',
  'coverage',
  '.next',
  '.turbo',
])

const FORBIDDEN_PKGS = ['hypercore', 'hyperdrive', 'hyperswarm', 'corestore']
const EXTS = new Set(['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs', '.tsx', '.jsx'])

const IMPORT_RE =
  /(?:from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\))/

// ── walk ─────────────────────────────────────────────────────────

function* walk(dir) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry)) continue
    const full = join(dir, entry)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      yield* walk(full)
    } else if (EXTS.has(extname(entry))) {
      yield full
    }
  }
}

// ── check ────────────────────────────────────────────────────────

const violations = []
const rel = (p) => relative(HERE, p).split(sep).join('/')

for (const root of ROOT_DIRS) {
  const abs = join(HERE, root)
  if (!existsSync(abs)) continue
  for (const file of walk(abs)) {
    const r = rel(file)
    const src = readFileSync(file, 'utf8')

    for (const [lineno, line] of src.split('\n').entries()) {
      const m = line.match(IMPORT_RE)
      if (!m) continue
      const modRaw = m[1] ?? m[2] ?? m[3] ?? ''
      const modName = modRaw.split('/')[0]
      if (!modName) continue

      const isForbidden = FORBIDDEN_PKGS.includes(modName)
      const isHyperSdk = modName === 'hyper-sdk'

      if (isForbidden) {
        violations.push({
          file: r,
          line: lineno + 1,
          mod: modName,
          reason: 'forbidden',
        })
      } else if (isHyperSdk) {
        // Allow only the single SDK bootstrap file. Anywhere else — even
        // inside apps/hyper-agent — must go through the SDK port.
        if (r !== ALLOWED_SDK_FILE) {
          violations.push({
            file: r,
            line: lineno + 1,
            mod: 'hyper-sdk',
            reason: 'sdk-direct',
          })
        }
      }
    }
  }
}

// ── report ───────────────────────────────────────────────────────

if (violations.length > 0) {
  console.error('')
  console.error(
    'Hyper SDK imports are only allowed under apps/hyper-agent (see ADR 0002)',
  )
  console.error('')
  for (const v of violations) {
    const why =
      v.reason === 'sdk-direct'
        ? 'imports "hyper-sdk" directly — go through apps/hyper-agent/src/infrastructure/sdk/index.ts'
        : `imports "${v.mod}" — use hyper-sdk instead`
    console.error(`  ${v.file}:${v.line}  ${why}`)
  }
  console.error('')
  console.error(`✖ ${violations.length} SDK boundary violation(s).`)
  process.exit(1)
}

console.log('✓ SDK boundary OK (repo-wide)')
