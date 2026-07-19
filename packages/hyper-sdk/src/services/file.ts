import { Readable } from 'node:stream';
import type { Drive } from '../types/hyperdrive.js';
import type { StoreRuntime } from '../runtime/corestore.js';
import type { HyperdriveEntry, TreeNode } from '../types/types.js';

export interface FileService {
  getEntry: (driveKey: string, path: string, wait?: boolean) => Promise<HyperdriveEntry | null>;
  getTree: (
    driveKey: string,
    prefix?: string,
    waitOrOpts?: boolean | { wait?: boolean; recursive?: boolean },
  ) => Promise<TreeNode>;
  readStream: (driveKey: string, path: string, wait?: boolean) => Promise<Readable>;
  write: (driveKey: string, path: string, body: Buffer, metadata?: unknown) => Promise<{ ok: true; byteLength: number }>;
  deleteEntry: (driveKey: string, path: string, recursive?: boolean) => Promise<{ ok: true }>;
}

/**
 * Adapt hyperdrive v13's async iterator surface to the { key, seq, value } shape
 * the rest of the SDK (and the HTTP layer) already speaks. `value.type` is
 * inferred from `value.blob === null` (a directory entry has no blob in v13).
 */
function adaptEntry(node: unknown | null): HyperdriveEntry | null {
  if (!node) return null;
  const n = node as {
    key: unknown;
    seq: number;
    value?: {
      executable?: boolean;
      linkname?: string | null;
      blob?: unknown;
      metadata?: unknown;
    } | null;
  };
  const value = n.value ?? null;
  const type: 'file' | 'directory' =
    value && value.blob === null ? 'directory' : 'file';
  return {
    key: n.key instanceof Buffer ? n.key.toString('hex') : String(n.key),
    seq: n.seq,
    value: value
      ? {
          type,
          metadata: value.metadata ?? null,
        }
      : null,
  };
}

function normalizePath(p: string): string {
  if (!p || p === '/') return '/';
  const cleaned = p.replace(/^\/+/, '');
  return `/${cleaned}`;
}

interface ChildEntry {
  name: string;
  type: 'file' | 'directory';
}

async function listChildren(
  drive: Drive,
  folder: string,
  wait: boolean,
  recursive: boolean,
): Promise<ChildEntry[]> {
  if (recursive) {
    const stream = drive.list(folder, { wait, recursive: true }) as unknown as Readable;
    const names = new Set<string>();
    const directories = new Set<string>();
    for await (const node of stream) {
      const raw = node as { key?: unknown };
      const keyStr =
        raw.key instanceof Buffer ? raw.key.toString('utf8') : String(raw.key);
      const rel = keyStr.startsWith(folder)
        ? keyStr.slice(folder.length).replace(/^\/+/, '')
        : keyStr.replace(/^\/+/, '');
      const segments = rel.split('/').filter(Boolean);
      const top = segments[0];
      if (!top) continue;
      names.add(top);
      if (segments.length > 1) directories.add(top);
    }
    return Array.from(names)
      .sort()
      .map((name) => ({ name, type: directories.has(name) ? 'directory' : 'file' }));
  }
  const stream = drive.readdir(folder, { wait }) as unknown as Readable;
  const names: string[] = [];
  for await (const name of stream) {
    if (typeof name === 'string' && name !== '.' && name !== '..') {
      names.push(name);
    }
  }
  return names.sort().map((name) => ({ name, type: 'file' as const }));
}

export function makeFileService(runtime: StoreRuntime): FileService {
  async function getEntry(
    driveKey: string,
    pathStr: string,
    wait = true,
  ): Promise<HyperdriveEntry | null> {
    const drive = await runtime.resolveByKey(driveKey);
    const drivePath = normalizePath(pathStr);
    const node = await drive.entry(drivePath, { wait });
    return adaptEntry(node as Parameters<typeof adaptEntry>[0]);
  }

  async function getTree(
    driveKey: string,
    prefix = '',
    waitOrOpts: boolean | { wait?: boolean; recursive?: boolean } = true,
  ): Promise<TreeNode> {
    const opts = typeof waitOrOpts === 'boolean' ? { wait: waitOrOpts } : waitOrOpts;
    const wait = opts.wait ?? true;
    const recursive = opts.recursive ?? false;
    const drive = await runtime.resolveByKey(driveKey);
    const rootPath = normalizePath(prefix);
    const tree: TreeNode = {
      name: rootPath === '/' ? '/' : rootPath.split('/').filter(Boolean).pop() ?? '/',
      type: 'directory',
      children: [],
    };

    const children = await listChildren(drive, rootPath, wait, recursive);
    tree.children = children;
    return tree;
  }

  async function readStream(
    driveKey: string,
    pathStr: string,
    wait = true,
  ): Promise<Readable> {
    const drive = await runtime.resolveByKey(driveKey);
    const drivePath = normalizePath(pathStr);
    return drive.createReadStream(drivePath, { wait }) as unknown as Readable;
  }

  async function write(
    driveKey: string,
    pathStr: string,
    body: Buffer,
    metadata?: unknown,
  ): Promise<{ ok: true; byteLength: number }> {
    const drive = await runtime.resolveByKey(driveKey);
    const drivePath = normalizePath(pathStr);
    await new Promise<void>((resolve, reject) => {
      const ws = drive.createWriteStream(drivePath, {
        ...(metadata !== undefined ? { metadata: JSON.parse(JSON.stringify(metadata)) } : {}),
      });
      ws.on('error', reject);
      ws.on('finish', () => resolve());
      ws.end(body);
    });
    return { ok: true, byteLength: body.length };
  }

  async function deleteEntry(
    driveKey: string,
    pathStr: string,
    recursive = false,
  ): Promise<{ ok: true }> {
    const drive = await runtime.resolveByKey(driveKey);
    const drivePath = normalizePath(pathStr);

    if (!recursive) {
      await drive.del(drivePath);
      return { ok: true };
    }

    // v13 has no native recursive delete; walk the subtree and del each
    // leaf then the parent directory entry.
    const stream = drive.list(drivePath, { wait: true, recursive: true }) as unknown as Readable;
    const paths: string[] = [];
    for await (const node of stream) {
      const raw = node as { key?: unknown };
      const keyStr =
        raw.key instanceof Buffer ? raw.key.toString('utf8') : String(raw.key);
      if (keyStr && keyStr !== drivePath) paths.push(keyStr);
    }
    // deepest first
    paths.sort((a, b) => b.length - a.length);
    for (const p of paths) {
      await drive.del(p);
    }
    await drive.del(drivePath);
    return { ok: true };
  }

  return { getEntry, getTree, readStream, write, deleteEntry };
}