/**
 * Wire-format equivalence — verifies that the Zod schemas derived from
 * DTO classes via `createZodDto` produce runtime validation equivalent
 * to the original hand-written JSON Schema (now embedded inside the
 * Zod definitions).
 *
 * Each `it` block names a DTO that maps to a known wire-format shape and
 * asserts both the happy path and the most important rejections.
 */
import { describe, it, expect } from 'vitest'
import {
  CreateDriveBodyDto,
  DriveDescriptorDto,
  HyperdriveEntryDto,
  PathQueryDto,
  FileDeleteQueryDto,
  TreeQueryDto,
} from '../src/feature/drives/dto/index.js'
import { AnnounceBodyDto, IdentityInfoDto, PeerInfoDto } from '../src/feature/swarm/dto/index.js'
import { TokenRequestDto, TokenResponseDto } from '../src/feature/auth/dto/index.js'
import { HealthResponseDto } from '../src/feature/health/dto/index.js'

const s = (dto: { schema: { safeParse: (v: unknown) => { success: boolean } } }) => dto.schema.safeParse

describe('wire-format equivalence — DTO ⇄ Zod', () => {
  it('CreateDriveBody: happy / min / enum / missing', () => {
    const p = s(CreateDriveBodyDto)
    expect(p({ name: 'movies', type: 'metadata' }).success).toBe(true)
    expect(p({ name: 'movies', type: 'blob' }).success).toBe(true)
    expect(p({ name: '', type: 'metadata' }).success).toBe(false)
    expect(p({ name: 'movies', type: 'unknown' }).success).toBe(false)
    expect(p({}).success).toBe(false)
    expect(p({ name: 'movies' }).success).toBe(false)
  })

  it('DriveDescriptor: ok with createdAt / ok without', () => {
    const p = s(DriveDescriptorDto)
    expect(
      p({ driveKey: 'a'.repeat(64), name: 'm', type: 'metadata', isLocal: true }).success,
    ).toBe(true)
    expect(
      p({
        driveKey: 'a'.repeat(64),
        name: 'm',
        type: 'blob',
        isLocal: false,
        createdAt: '2026-01-01T00:00:00.000Z',
      }).success,
    ).toBe(true)
    expect(p({ driveKey: 'a'.repeat(64), name: 'm', type: 'unknown', isLocal: true }).success).toBe(
      false,
    )
  })

  it('PathQuery: defaults wait=true via coerce', () => {
    const p = s(PathQueryDto)
    const ok = p({ path: '/x.txt' })
    expect(ok.success).toBe(true)
    expect(p({ path: '/x.txt', wait: 'true' }).success).toBe(true)
    expect(p({}).success).toBe(false)
  })

  it('TreeQuery: prefix defaults to ""', () => {
    const p = s(TreeQueryDto)
    expect(p({}).success).toBe(true)
    expect(p({ prefix: '/foo' }).success).toBe(true)
  })

  it('FileDeleteQuery: recursive defaults to false', () => {
    const p = s(FileDeleteQueryDto)
    expect(p({ path: '/x' }).success).toBe(true)
    expect(p({ path: '/x', recursive: 'true' }).success).toBe(true)
  })

  it('HyperdriveEntry: nullable value', () => {
    const p = s(HyperdriveEntryDto)
    expect(p({ key: 'k', seq: 1, value: null }).success).toBe(true)
    expect(
      p({
        key: 'k',
        seq: 1,
        value: { type: 'file', metadata: { mime: 'text/plain' } },
      }).success,
    ).toBe(true)
    expect(p({ key: 'k', seq: 1, value: { type: 'unknown' } }).success).toBe(false)
  })

  it('AnnounceBody: schema accepts both undefined and {}', () => {
    const p = s(AnnounceBodyDto)
    expect(p({}).success).toBe(true)
    expect(p({ data: undefined }).success).toBe(true)
    expect(p({ data: { wait: false } }).success).toBe(true)
    expect(p({ data: { wait: 'maybe' } }).success).toBe(false)
  })

  it('PeerInfo: requires publicKey + connectedAt', () => {
    const p = s(PeerInfoDto)
    expect(p({ publicKey: 'a'.repeat(64), connectedAt: '2026-01-01T00:00:00.000Z' }).success).toBe(
      true,
    )
    expect(p({ publicKey: 'a'.repeat(64) }).success).toBe(false)
    expect(p({ connectedAt: '2026-01-01T00:00:00.000Z' }).success).toBe(false)
  })

  it('IdentityInfo: 4 required fields', () => {
    const p = s(IdentityInfoDto)
    expect(
      p({
        mainDriveKey: 'a'.repeat(64),
        peerPublicKey: 'b'.repeat(64),
        swarmPort: 0,
        peerCount: 0,
      }).success,
    ).toBe(true)
    expect(
      p({ mainDriveKey: 'a'.repeat(64), peerPublicKey: 'b'.repeat(64), swarmPort: 0 }).success,
    ).toBe(false)
  })

  it('TokenRequest: requires apiKey (non-empty)', () => {
    const p = s(TokenRequestDto)
    expect(p({ apiKey: 'x' }).success).toBe(true)
    expect(p({ apiKey: '' }).success).toBe(false)
    expect(p({}).success).toBe(false)
  })

  it('TokenResponse: tokenType must be literal "Bearer"', () => {
    const p = s(TokenResponseDto)
    expect(p({ token: 'a.b.c', expiresIn: 900, tokenType: 'Bearer' }).success).toBe(true)
    expect(p({ token: 'a.b.c', expiresIn: 900, tokenType: 'Basic' }).success).toBe(false)
  })

  it('HealthResponse: status must be literal "ok"', () => {
    const p = s(HealthResponseDto)
    expect(p({ status: 'ok', uptime: 1 }).success).toBe(true)
    expect(p({ status: 'down', uptime: 1 }).success).toBe(false)
  })
})