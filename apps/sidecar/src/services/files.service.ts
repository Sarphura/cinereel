/**
 * FileService — drive-keyed file operations over a mounted Hyperdrive.
 *
 * Resolves `driveKey → HyperdriveLike` via `DriveRegistry`. Writes/deletes
 * are restricted to local drives; `isRemote(driveKey)` is the gate that
 * enforces that business rule.
 */
import { Inject, Injectable } from '@nestjs/common'
import type { Readable } from 'node:stream'
import type {
  HyperdriveEntry,
  HyperdriveLike,
  ReadStream,
  TreeNode,
} from '../infrastructure/index.js'
import { HEX64 } from '../infrastructure/types/key.js'
import { InMemoryDriveRegistry, type DriveRegistry } from '../bootstrap/drive-registry.js'

function adaptEntry(
  raw: { key: string; seq: number; value: unknown } | null,
): HyperdriveEntry | null {
  if (!raw) return null
  const value = raw.value as
    | { type?: 'file' | 'directory' | 'symlink'; metadata?: unknown }
    | null
  return {
    key: raw.key,
    seq: raw.seq,
    value:
      value && typeof value === 'object' && 'type' in value
        ? { type: value.type as 'file' | 'directory' | 'symlink', metadata: value.metadata }
        : null,
  }
}

function normalizePath(p: string): string {
  if (!p || p === '/') return '/'
  return '/' + p.replace(/^\/+/, '').replace(/\/+$/, '')
}

function joinPath(parent: string, child: string): string {
  if (parent === '/') return '/' + child.replace(/^\/+/, '')
  return parent + '/' + child.replace(/^\/+/, '')
}

export class DriveNotMountedError extends Error {
  constructor(readonly driveKey: string) {
    super(`drive not mounted: ${driveKey}`)
    this.name = 'DriveNotMountedError'
  }
}

@Injectable()
export class FileService {
  constructor(@Inject(InMemoryDriveRegistry) private readonly registry: DriveRegistry) {}

  private get(driveKey: string): HyperdriveLike {
    if (!HEX64.test(driveKey)) {
      throw new Error(`invalid driveKey: ${driveKey.slice(0, 80)}`)
    }
    const drive = this.registry.byKey(driveKey)
    if (!drive) {
      throw new DriveNotMountedError(driveKey)
    }
    return drive
  }

  async getEntry(
    driveKey: string,
    path: string,
    wait: boolean = true,
  ): Promise<HyperdriveEntry | null> {
    const drive = this.get(driveKey)
    const raw = await drive.entry(path, { wait })
    return adaptEntry(raw)
  }

  async getTree(
    driveKey: string,
    prefix: string = '',
    wait: boolean = true,
  ): Promise<TreeNode> {
    const drive = this.get(driveKey)
    const root = normalizePath(prefix || '/')
    const entries: TreeNode[] = []
    const iterable = drive.readdir(root, { wait })
    if (
      iterable &&
      typeof (iterable as AsyncIterable<string>)[Symbol.asyncIterator] === 'function'
    ) {
      for await (const name of iterable as AsyncIterable<string>) {
        const full = joinPath(root, name)
        const stat = await drive.stat(full, { wait })
        const node: TreeNode = stat?.isDirectory?.()
          ? { name, type: 'directory' }
          : {
              name,
              type: 'file',
              size: typeof stat?.size === 'number' ? stat.size : undefined,
            }
        entries.push(node)
      }
    }
    return {
      name: root === '/' ? '/' : root.split('/').pop() ?? root,
      type: 'directory',
      children: entries,
    }
  }

  async readStream(
    driveKey: string,
    path: string,
    wait: boolean = true,
  ): Promise<Readable> {
    const drive = this.get(driveKey)
    return drive.createReadStream(path, { wait })
  }

  async write(
    driveKey: string,
    path: string,
    body: Buffer,
    _metadata?: unknown,
  ): Promise<{ ok: true; byteLength: number }> {
    const drive = this.get(driveKey)
    if (this.registry.isRemote(driveKey)) {
      throw new Error(`cannot write to remote drive ${driveKey}`)
    }
    const ws = drive.createWriteStream(path)
    const finished = new Promise<{ byteLength: number }>((resolve, reject) => {
      const w = ws as unknown as NodeJS.WriteStream
      w.on('finish', () => resolve({ byteLength: body.byteLength }))
      w.on('error', reject)
    })
    ;(ws as unknown as NodeJS.WriteStream).end(body)
    const { byteLength } = await finished
    return { ok: true, byteLength }
  }

  async deleteEntry(
    driveKey: string,
    path: string,
    recursive: boolean = false,
  ): Promise<{ ok: true }> {
    const drive = this.get(driveKey)
    const target = normalizePath(path)
    if (this.registry.isRemote(driveKey)) {
      throw new Error(`cannot delete from remote drive ${driveKey}`)
    }
    const stat = await drive.stat(target)
    if (stat?.isDirectory?.()) {
      if (!recursive) {
        throw new Error(`directory not empty: ${target} (pass recursive=true)`)
      }
      const children = drive.readdir(target)
      if (
        children &&
        typeof (children as AsyncIterable<string>)[Symbol.asyncIterator] === 'function'
      ) {
        for await (const name of children as AsyncIterable<string>) {
          await this.deleteEntry(driveKey, joinPath(target, name), true)
        }
      }
      await drive.del(target)
    } else {
      await drive.del(target)
    }
    return { ok: true }
  }

  /** Re-export ReadStream for callers that want the type. */
  static readonly ReadStream = undefined as unknown as ReadStream
}
