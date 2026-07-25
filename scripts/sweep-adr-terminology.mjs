#!/usr/bin/env node
/**
 * sweep-adr-terminology.mjs — one-off ADR vocabulary sweep.
 *
 * Rewrites "Sidecar" / "Hyper Sidecar" / "sidecar" → "Hyper Agent" /
 * "hyper-agent" across ADR bodies while preserving protected substrings
 * whose rename is handled in dedicated later tickets (or kept as-is by
 * ADR 0065's backward-compat rule):
 *
 *   - sidecar.token         (filename preserved by ADR 0065)
 *   - X-Sidecar-Token       (header preserved by ADR 0065)
 *   - SIDECAR_*  env vars   (kept for backward-compat / spawning)
 *   - SidecarClient / ISidecarClient (replaced in ticket 14)
 *   - SidecarError          (replaced in ticket 08)
 *   - apps/sidecar (path)   (kept in ADR 0065 narrative only)
 *
 * Usage:
 *   node scripts/sweep-adr-terminology.mjs docs/adr/*.md docs/spec/hyper-agent.md CONTEXT.md
 */
import { readFileSync, writeFileSync } from 'node:fs'

const PRESERVE = [
  ['sidecar.token', '\u0001TOKEN\u0001'],
  ['X-Sidecar-Token', '\u0001HEADER\u0001'],
  ['SIDECAR_PORT', '\u0001ENV_PORT\u0001'],
  ['SIDECAR_API_KEYS', '\u0001ENV_KEYS\u0001'],
  ['SIDECAR_HOST', '\u0001ENV_HOST\u0001'],
  ['SIDECAR_ENV_FILE', '\u0001ENV_FILE\u0001'],
  ['SIDECAR_LOG_LEVEL', '\u0001ENV_LOG\u0001'],
  ['SIDECAR_SWARM_PORT', '\u0001ENV_SWARM\u0001'],
  ['SIDECAR_STORE_DIR', '\u0001ENV_STORE\u0001'],
  ['SIDECAR_SHUTDOWN_TIMEOUT_MS', '\u0001ENV_TIMEOUT\u0001'],
  ['SIDECAR_DEBUG_CONFIG', '\u0001ENV_DEBUG\u0001'],
  ['SIDECAR_BOOTSTRAP', '\u0001ENV_BOOT\u0001'],
  ['SIDECAR_TOKEN_FILE', '\u0001ENV_TOKENFILE\u0001'],
  ['SidecarClient', '\u0001CLIENT\u0001'],
  ['ISidecarClient', '\u0001ICLIENT\u0001'],
  ['SidecarError', '\u0001ERRCLASS\u0001'],
  ['apps/sidecar', '\u0001APPPATH\u0001'],
]

function sweep(text) {
  // 1. Hide protected tokens.
  for (const [needle, placeholder] of PRESERVE) {
    text = text.split(needle).join(placeholder)
  }

  // 2. Replace the rest. Order matters: Hyper Sidecar before bare Sidecar.
  text = text.split('Hyper Sidecar').join('Hyper Agent')
  text = text.split('hyper sidecar').join('hyper agent')
  text = text.split('Hyper sidecar').join('Hyper Agent')
  text = text.split('Sidecar').join('Hyper Agent')
  text = text.split('sidecar').join('hyper-agent')

  // 3. Restore protected tokens.
  for (const [needle, placeholder] of PRESERVE) {
    text = text.split(placeholder).join(needle)
  }
  return text
}

const targets = process.argv.slice(2)
if (targets.length === 0) {
  console.error('usage: sweep-adr-terminology.mjs <files…>')
  process.exit(2)
}

for (const path of targets) {
  const before = readFileSync(path, 'utf8')
  const after = sweep(before)
  if (after !== before) {
    writeFileSync(path, after, 'utf8')
    console.log(`  swept ${path}`)
  } else {
    console.log(`  unchanged ${path}`)
  }
}
