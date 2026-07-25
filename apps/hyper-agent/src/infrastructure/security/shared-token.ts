/**
 * Shared-secret bearer token (ticket 09).
 *
 * The Hyper Agent authenticates every request — including `/healthz` —
 * with a single shared secret. The secret lives in
 * `<CINEREEL_DATA_DIR>/sidecar.token` (the filename is preserved for
 * backward compatibility with operator scripts; see ADR 0065 and the
 * renaming spec). On startup the Hyper Agent reads the file, mints a
 * new 32-byte random hex string with mode `0600` if it is missing, and
 * stores the value in process memory. Every HTTP request is matched
 * against that constant via `verifySharedToken`.
 *
 * The Application Server reads the same file and passes the token on
 * every outbound request. There is no JWT exchange, no `kid → key`
 * registry, and no `SIDECAR_API_KEYS` parsing — the loopback shared
 * secret is the only thing the Hyper Agent will accept.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const SHARED_TOKEN_FILENAME = 'sidecar.token' as const
/** 32 random bytes encoded as 64 lowercase hex chars. */
export const SHARED_TOKEN_LENGTH = 64 as const
export const SHARED_TOKEN_MIN_LEN = 16 as const

export class SharedTokenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SharedTokenError'
  }
}

/**
 * Read `<dataDir>/sidecar.token` and return its trimmed contents. If
 * the file is missing, generate a new 32-byte hex token, write it with
 * mode `0600`, and return the new value.
 *
 * Throws `SharedTokenError` when the directory cannot be created or
 * the file exists but cannot be read. The caller is expected to treat
 * any throw here as a fatal startup error.
 */
export async function loadOrMintSharedToken(dataDir: string): Promise<string> {
  if (!dataDir) {
    throw new SharedTokenError('loadOrMintSharedToken: dataDir is required')
  }
  await mkdir(dataDir, { recursive: true, mode: 0o700 })

  const filePath = path.join(dataDir, SHARED_TOKEN_FILENAME)

  let raw: string
  try {
    raw = await readFile(filePath, 'utf8')
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      throw new SharedTokenError(
        `Failed to read ${filePath}: ${(err as Error).message}`,
      )
    }
    // Mint a fresh token.
    const minted = randomBytes(32).toString('hex')
    await writeFile(filePath, minted + '\n', { mode: 0o600 })
    // chmod explicitly in case the umask softened the writeFile mode.
    await chmod(filePath, 0o600)
    return minted
  }

  const trimmed = raw.trim()
  if (trimmed.length < SHARED_TOKEN_MIN_LEN) {
    throw new SharedTokenError(
      `Shared token in ${filePath} is too short (${trimmed.length} < ${SHARED_TOKEN_MIN_LEN})`,
    )
  }
  return trimmed
}

/**
 * Constant-time comparison of two token strings. Returns false on any
 * mismatch (length, encoding, content) without leaking which side
 * failed first.
 */
export function verifySharedToken(expected: string, presented: string): boolean {
  if (typeof expected !== 'string' || typeof presented !== 'string') return false
  if (expected.length === 0 || presented.length === 0) return false
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(presented, 'utf8')
  if (a.length !== b.length) {
    // Still run the comparator against a same-length scratch buffer so
    // the time-to-return does not leak the length difference.
    timingSafeEqual(a, Buffer.alloc(a.length))
    return false
  }
  return timingSafeEqual(a, b)
}
