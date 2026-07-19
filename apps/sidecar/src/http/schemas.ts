// Raw JSON Schema (draft-07) for Fastify 5 strict validation.
// zod is intentionally not used here — fastify-type-provider-zod@4.0
// translates `z.object` to JSON Schema without a `required: [...]` array,
// which Fastify 5.10 strict serialization rejects.

export const DriveTypeSchema = {
  type: 'string',
  enum: ['metadata', 'blob'],
} as const;

export const Hex64 = {
  type: 'string',
  pattern: '^[0-9a-f]{64}$',
} as const;

export const DriveDescriptorSchema = {
  type: 'object',
  required: ['driveKey', 'name', 'type', 'isLocal'],
  properties: {
    driveKey: { type: 'string' },
    name: { type: 'string' },
    type: DriveTypeSchema,
    isLocal: { type: 'boolean' },
    createdAt: { type: 'string' },
  },
} as const;

export const PeerInfoSchema = {
  type: 'object',
  required: ['publicKey', 'connectedAt'],
  properties: {
    publicKey: { type: 'string' },
    connectedAt: { type: 'string' },
  },
} as const;

export const IdentityInfoSchema = {
  type: 'object',
  required: ['mainDriveKey', 'peerPublicKey', 'swarmPort', 'peerCount'],
  properties: {
    mainDriveKey: { type: 'string' },
    peerPublicKey: { type: 'string' },
    swarmPort: { type: 'integer' },
    peerCount: { type: 'integer' },
  },
} as const;

export const HyperdriveEntrySchema = {
  type: 'object',
  required: ['key', 'seq', 'value'],
  properties: {
    key: { type: 'string' },
    seq: { type: 'integer' },
    value: {
      type: 'object',
      nullable: true,
      required: ['type', 'metadata'],
      properties: {
        type: { type: 'string', enum: ['file', 'directory'] },
        metadata: {},
      },
    },
  },
} as const;

export const HealthResponseSchema = {
  type: 'object',
  required: ['status', 'uptime'],
  properties: {
    status: { type: 'string' },
    uptime: { type: 'number' },
  },
} as const;

export const CreateDriveBody = {
  type: 'object',
  required: ['name', 'type'],
  properties: {
    name: { type: 'string', minLength: 1 },
    type: DriveTypeSchema,
  },
} as const;

export const PathQuery = {
  type: 'object',
  required: ['path'],
  properties: {
    path: { type: 'string' },
    wait: { type: 'boolean', default: true },
  },
} as const;

export const TreeQuery = {
  type: 'object',
  properties: {
    prefix: { type: 'string', default: '' },
    wait: { type: 'boolean', default: true },
  },
} as const;

export const FileDeleteQuery = {
  type: 'object',
  required: ['path'],
  properties: {
    path: { type: 'string' },
    recursive: { type: 'boolean', default: false },
  },
} as const;

export const AnnounceBody = {
  // Announce is a POST with an optional body: callers may omit the body
  // entirely (curl without -d, Apifox without payload, idempotent retries).
  // Allow `null` for the body so missing payloads don't 400; the handler
  // applies the documented `wait: true` default.
  //
  // Naming: the field is `wait` (not the legacy `flush`) because the
  // hyper-sdk fix made `drive.update({ wait: true })` the canonical signal
  // for "block until at least one peer has been observed". The old `flush`
  // option was silently ignored by hyperdrive v13 and caused announce(true)
  // to return before any peer was seen.
  //
  // NOTE: do not declare `default` here — Fastify 5 strict schema mode
  // rejects it ("default is ignored for: data.wait").
  anyOf: [
    {
      type: 'object',
      properties: {
        wait: { type: 'boolean' },
      },
    },
    { type: 'null' },
  ],
} as const;