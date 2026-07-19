import type { FastifyInstance } from 'fastify';
import type { FileService } from '@cinereel/hyper-sdk';
import type { SidecarDriveService } from '../../drive-service';
import {
  CreateDriveBody,
  DriveDescriptorSchema,
  Hex64,
  PathQuery,
} from '../schemas.js';

/**
 * All `/v1/drives*` routes:
 *   - CRUD:         GET / POST / DELETE /v1/drives[/:key]
 *   - drive/files:  GET/PUT/DELETE /v1/drives/:key/file
 *   - drive/entry:  GET /v1/drives/:key/entry
 *   - drive/tree:   GET /v1/drives/:key/tree
 *
 * `drives` covers CRUD; `files` covers every operation that takes a drive key
 * plus a path into that drive.
 */
export interface DriveRouteServices {
  drives: SidecarDriveService;
  files: FileService;
}

export async function registerDriveRoutes(
  app: FastifyInstance,
  uc: DriveRouteServices,
): Promise<void> {
  const { drives, files } = uc;

  // ---------- CRUD ----------

  app.get('/v1/drives', {
    schema: {
      response: { 200: { type: 'array', items: DriveDescriptorSchema } },
    },
  }, async () => drives.list());

  app.post('/v1/drives', {
    schema: {
      body: CreateDriveBody,
      response: { 200: DriveDescriptorSchema },
    },
  }, async (req) => {
    const { name, type } = req.body as { name: string; type: 'metadata' | 'blob' };
    return drives.create(name, type);
  });

  app.delete('/v1/drives/:key', {
    schema: {
      params: { type: 'object', required: ['key'], properties: { key: Hex64 } },
      response: {
        200: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },
      },
    },
  }, async (req) => {
    const { key } = req.params as { key: string };
    await drives.remove(key);
    return { ok: true };
  });

  // ---------- drive/<key>/tree ----------

  app.get('/v1/drives/:key/tree', {
    schema: {
      params: { type: 'object', required: ['key'], properties: { key: Hex64 } },
      querystring: {
        type: 'object',
        properties: {
          prefix: { type: 'string', default: '' },
          wait: { type: 'boolean', default: true },
        },
      },
    },
  }, async (req) => {
    const { key } = req.params as { key: string };
    const { prefix, wait } = req.query as { prefix: string; wait: boolean };
    return files.getTree(key, prefix, wait);
  });

  // ---------- drive/<key>/entry ----------

  app.get('/v1/drives/:key/entry', {
    schema: {
      params: { type: 'object', required: ['key'], properties: { key: Hex64 } },
      querystring: PathQuery,
    },
  }, async (req) => {
    const { key } = req.params as { key: string };
    const { path: p, wait } = req.query as { path: string; wait: boolean };
    return files.getEntry(key, p, wait);
  });

  // ---------- drive/<key>/file (GET / PUT / DELETE) ----------

  app.get('/v1/drives/:key/file', {
    schema: {
      params: { type: 'object', required: ['key'], properties: { key: Hex64 } },
      querystring: {
        type: 'object',
        required: ['path'],
        properties: {
          path: { type: 'string' },
          wait: { type: 'boolean', default: true },
        },
      },
    },
  }, async (req, reply) => {
    const { key } = req.params as { key: string };
    const { path: p, wait } = req.query as { path: string; wait: boolean };
    const stream = await files.readStream(key, p, wait);
    reply.header('content-type', 'application/octet-stream');
    return reply.send(stream);
  });

  app.put('/v1/drives/:key/file', {
    schema: {
      params: { type: 'object', required: ['key'], properties: { key: Hex64 } },
      querystring: {
        type: 'object',
        required: ['path'],
        properties: { path: { type: 'string' } },
      },
      consumes: ['application/octet-stream'],
      response: {
        200: {
          type: 'object',
          required: ['ok', 'byteLength'],
          properties: { ok: { type: 'boolean' }, byteLength: { type: 'integer' } },
        },
      },
    },
  }, async (req) => {
    const { key } = req.params as { key: string };
    const { path: p } = req.query as { path: string };
    const buf = (req as unknown as { body: Buffer }).body ?? (req.body as Buffer);
    const metaHdr = req.headers['x-metadata'];
    const metadata =
      typeof metaHdr === 'string' && metaHdr.length > 0
        ? JSON.parse(metaHdr)
        : undefined;
    if (!Buffer.isBuffer(buf)) {
      throw new Error('Expected Buffer body');
    }
    return files.write(key, p, buf, metadata);
  });

  app.delete('/v1/drives/:key/file', {
    schema: {
      params: { type: 'object', required: ['key'], properties: { key: Hex64 } },
      querystring: {
        type: 'object',
        required: ['path'],
        properties: {
          path: { type: 'string' },
          recursive: { type: 'boolean', default: false },
        },
      },
    },
  }, async (req) => {
    const { key } = req.params as { key: string };
    const { path: p, recursive } = req.query as { path: string; recursive: boolean };
    return files.deleteEntry(key, p, recursive);
  });
}
