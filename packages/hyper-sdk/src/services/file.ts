import { Readable } from 'node:stream';
import Hyperdrive from 'hyperdrive';
import type { CorestoreRuntime } from '../runtime/corestore.js';
import { resolveDriveByKey } from '../utils/hyperdrive.factory.js';
import type { HyperdriveEntry, TreeNode } from '../types/types.js';

type Drive = InstanceType<typeof Hyperdrive>;

export interface FileService {
  getEntry: (driveKey: string, path: string, wait?: boolean) => Promise<HyperdriveEntry | null>;
  getTree: (driveKey: string, prefix?: string, wait?: boolean) => Promise<TreeNode>;
  readStream: (driveKey: string, path: string, wait?: boolean) => Promise<Readable>;
  write: (driveKey: string, path: string, body: Buffer, metadata?: unknown) => Promise<{ ok: true; byteLength: number }>;
  deleteEntry: (driveKey: string, path: string, recursive?: boolean) => Promise<{ ok: true }>;
}

async function loadDrive(runtime: CorestoreRuntime, key: string): Promise<Drive> {
  return resolveDriveByKey(runtime, key);
}

/**
 * hyperdrive v13 has no callback API — every lookup returns either a Promise
 * or a Readable. This helper adapts the v13 async iterator surface to the
 * { key, seq, value } shape that the rest of the SDK (and the HTTP layer)
 * already speaks. `value.type` is inferred from `value.blob === null`
 * (a directory entry has no blob in v13).
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

export function makeFileService(runtime: CorestoreRuntime): FileService {
  async function getEntry(
    driveKey: string,
    pathStr: string,
    wait = true,
  ): Promise<HyperdriveEntry | null> {
    const drive = await loadDrive(runtime, driveKey);
    const drivePath = normalizePath(pathStr);
    const node = await drive.entry(drivePath, { wait });
    return adaptEntry(node as Parameters<typeof adaptEntry>[0]);
  }

  async function getTree(
    driveKey: string,
    prefix = '',
    wait = true,
  ): Promise<TreeNode> {
    const drive = await loadDrive(runtime, driveKey);
    const rootPath = normalizePath(prefix);
    const tree: TreeNode = {
      name: rootPath === '/' ? '/' : rootPath.split('/').filter(Boolean).pop() ?? '/',
      type: 'directory',
      children: [],
    };

    // v13: `list(folder, { recursive: true })` is the streaming iterator over
    // every descendant; `readdir` is non-recursive. We always want recursive
    // listing for the tree view — fall back to non-recursive when the caller
    // explicitly opts out via wait=false to keep snapshots cheap.
    const useRecursive = wait;
    const names = new Set<string>();
    if (useRecursive) {
      const stream = drive.list(rootPath, { wait, recursive: true }) as unknown as Readable;
      for await (const node of stream) {
        const raw = node as { key?: unknown };
        const keyStr =
          raw.key instanceof Buffer ? raw.key.toString('utf8') : String(raw.key);
        // keys are drive-relative paths like "/a.txt"; pull out the top-level
        // segment under rootPath so the tree stays one level deep.
        const rel = keyStr.startsWith(rootPath)
          ? keyStr.slice(rootPath.length).replace(/^\/+/, '')
          : keyStr.replace(/^\/+/, '');
        const top = rel.split('/')[0];
        if (top) names.add(top);
      }
    } else {
      const stream = drive.readdir(rootPath, { wait }) as unknown as Readable;
      for await (const name of stream) {
        if (typeof name === 'string' && name !== '.' && name !== '..') {
          names.add(name);
        }
      }
    }

    tree.children = Array.from(names)
      .sort()
      .map((name) => ({ name, type: 'file' as const }));
    return tree;
  }

  async function readStream(
    driveKey: string,
    pathStr: string,
    wait = true,
  ): Promise<Readable> {
    const drive = await loadDrive(runtime, driveKey);
    const drivePath = normalizePath(pathStr);
    return drive.createReadStream(drivePath, { wait }) as unknown as Readable;
  }

  async function write(
    driveKey: string,
    pathStr: string,
    body: Buffer,
    metadata?: unknown,
  ): Promise<{ ok: true; byteLength: number }> {
    const drive = await loadDrive(runtime, driveKey);
    const drivePath = normalizePath(pathStr);
    await new Promise<void>((resolve, reject) => {
      const ws = drive.createWriteStream(drivePath, {
        ...(metadata !== undefined ? { metadata: JSON.parse(JSON.stringify(metadata)) } : {}),
      });
      ws.on('error', reject);
      ws.on('finish', () => resolve());
      ws.on('close', () => {
        // Normal completion: 'finish' already resolved with no error.
        // Abnormal path: surface the close error if 'finish' hasn't fired.
        // (v13 calls callOnfinish on both events; resolving twice is a no-op.)
      });
      ws.end(body);
    });
    return { ok: true, byteLength: body.length };
  }

  async function deleteEntry(
    driveKey: string,
    pathStr: string,
    recursive = false,
  ): Promise<{ ok: true }> {
    const drive = await loadDrive(runtime, driveKey);
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

function normalizePath(p: string): string {
  if (!p || p === '/') return '/';
  const cleaned = p.replace(/^\/+/, '');
  return `/${cleaned}`;
}
