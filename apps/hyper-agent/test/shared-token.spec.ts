/**
 * Ticket 09 — shared-token.spec.ts.
 *
 * Pins the on-disk and in-memory behaviour of the shared-secret
 * bearer: file creation with 0600, idempotent reads, mismatch paths.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  loadOrMintSharedToken,
  verifySharedToken,
  SHARED_TOKEN_FILENAME,
  SHARED_TOKEN_LENGTH,
  SharedTokenError,
} from '../src/infrastructure/security/shared-token.js'

describe('shared-token module', () => {
  let tmpDir: string
  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'shared-token-'))
  })
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates sidecar.token with mode 0600 if missing', async () => {
    const token = await loadOrMintSharedToken(tmpDir)
    const file = path.join(tmpDir, SHARED_TOKEN_FILENAME)
    expect(existsSync(file)).toBe(true)
    expect(token).toHaveLength(SHARED_TOKEN_LENGTH)
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    // mode 0600 → only owner read+write
    const stat = statSync(file)
    // node returns only permission bits, masked by 0o777
    expect(stat.mode & 0o777).toBe(0o600)
    const onDisk = readFileSync(file, 'utf8').trim()
    expect(onDisk).toBe(token)
  })

  it('returns the existing token on a second call without rewriting', async () => {
    const first = await loadOrMintSharedToken(tmpDir)
    const second = await loadOrMintSharedToken(tmpDir)
    expect(second).toBe(first)
  })

  it('rejects a too-short token on disk', async () => {
    const file = path.join(tmpDir, SHARED_TOKEN_FILENAME)
    const { writeFileSync } = await import('node:fs')
    writeFileSync(file, 'short\n', { mode: 0o600 })
    await expect(loadOrMintSharedToken(tmpDir)).rejects.toBeInstanceOf(SharedTokenError)
  })

  it('verifySharedToken returns true on exact match', () => {
    const token = 'a'.repeat(64)
    expect(verifySharedToken(token, token)).toBe(true)
  })

  it('verifySharedToken returns false on different content', () => {
    expect(verifySharedToken('a'.repeat(64), 'b'.repeat(64))).toBe(false)
  })

  it('verifySharedToken returns false on different length', () => {
    expect(verifySharedToken('a'.repeat(64), 'a'.repeat(32))).toBe(false)
  })

  it('verifySharedToken returns false on empty strings', () => {
    expect(verifySharedToken('', '')).toBe(false)
    expect(verifySharedToken('a'.repeat(64), '')).toBe(false)
    expect(verifySharedToken('', 'a'.repeat(64))).toBe(false)
  })

  it('verifySharedToken refuses non-string inputs', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(verifySharedToken(undefined as any, 'a')).toBe(false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(verifySharedToken('a', undefined as any)).toBe(false)
  })

  it('loadOrMintSharedToken rejects an empty dataDir', async () => {
    await expect(loadOrMintSharedToken('')).rejects.toBeInstanceOf(SharedTokenError)
  })
})
