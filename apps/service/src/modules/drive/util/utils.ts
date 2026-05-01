import path from 'node:path'
import { matchesRootPath, type MediaIndexEntry } from '../../scan/store'

export function normalizeOptionalText(value?: string) {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  fallback: T,
) {
  return Promise.race([
    operation,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), timeoutMs)
    }),
  ])
}

export function normalizeNodePath(input: string) {
  const normalized = path.posix.normalize(input.startsWith('/') ? input : `/${input}`)
  return normalized === '.' ? '/' : normalized
}

export function isInternalPath(entryPath: string) {
  return entryPath === '/.cinereel' || entryPath.startsWith('/.cinereel/')
}

export function matchesMediaIndexFilter(
  entry: MediaIndexEntry,
  resourcePath: string | null,
) {
  if (!resourcePath) {
    return true
  }

  return matchesRootPath(entry.path, resourcePath)
}
