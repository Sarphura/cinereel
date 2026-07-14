import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DriveService } from './drive.service'
import { DRIVE_DESCRIPTOR_PATH } from '@/modules/common/domain/drive-manifest'

describe('DriveService publish manifests', () => {
  const profileDrive = { key: Buffer.from('profile') }
  const resourceDrive = {
    key: Buffer.from('a'.repeat(64), 'hex'),
    close: vi.fn().mockResolvedValue(undefined),
  }

  let driveQuery: { getJson: ReturnType<typeof vi.fn> }
  let driveWrite: { putJson: ReturnType<typeof vi.fn> }
  let driveRepo: {
    findById: ReturnType<typeof vi.fn>
    save: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
  let hyper: any
  let swarm: any
  let profile: any
  let service: DriveService

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(Date, 'now').mockReturnValue(1_000)

    driveQuery = {
      getJson: vi.fn().mockResolvedValue(null),
    }
    driveWrite = {
      putJson: vi.fn().mockResolvedValue(undefined),
    }
    driveRepo = {
      findById: vi.fn(),
      save: vi.fn((record) => record),
      delete: vi.fn().mockReturnValue(true),
    }
    hyper = {
      drive: profileDrive,
      driveKey: 'profile-key',
      swarm: { connections: new Set() },
      createLocalDrive: vi.fn().mockResolvedValue(resourceDrive),
      getLocalDrive: vi.fn().mockReturnValue(resourceDrive),
    }
    swarm = {
      announceLocalDrive: vi.fn().mockResolvedValue(undefined),
    }
    profile = {
      upsertCollection: vi.fn().mockResolvedValue(undefined),
      removeCollection: vi.fn().mockResolvedValue(undefined),
    }

    service = new DriveService(
      hyper,
      driveQuery as any,
      driveWrite as any,
      swarm,
      driveRepo as any,
      profile,
    )
  })

  it('创建资源 Drive 时写入 descriptor 并登记到 Profile collections', async () => {
    await service.create({ name: '电影库', type: 'movie' })

    expect(driveWrite.putJson).toHaveBeenNthCalledWith(
      1,
      DRIVE_DESCRIPTOR_PATH,
      {
        name: '电影库',
        type: 'movie',
        ownerProfileKey: 'profile-key',
      },
      resourceDrive,
    )
    expect(profile.upsertCollection).toHaveBeenCalledWith({
      driveKey: resourceDrive.key.toString('hex'),
      name: '电影库',
      addedAt: 1_000,
      updatedAt: 1_000,
    })
    expect(driveRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      ownerProfileKey: 'profile-key',
    }))
    expect(swarm.announceLocalDrive).toHaveBeenCalledWith(resourceDrive)
    expect(profile.upsertCollection.mock.invocationCallOrder[0])
      .toBeLessThan(swarm.announceLocalDrive.mock.invocationCallOrder[0])
  })

  it('更新本地资源的公开字段时同步 descriptor 和 Profile collection', async () => {
    const record = {
      id: resourceDrive.key.toString('hex'),
      name: '旧名称',
      type: 'movie',
      isLocal: true,
      namespace: 'namespace',
      ownerProfileKey: 'profile-key',
      createdAt: 100,
      updatedAt: 100,
    }
    driveRepo.findById.mockReturnValue(record)
    await service.update(record.id, { name: '新名称', type: 'series' })

    expect(driveWrite.putJson).toHaveBeenNthCalledWith(
      1,
      DRIVE_DESCRIPTOR_PATH,
      {
        name: '新名称',
        type: 'series',
        ownerProfileKey: 'profile-key',
      },
      resourceDrive,
    )
    expect(profile.upsertCollection).toHaveBeenCalledWith({
      driveKey: record.id,
      name: '新名称',
      addedAt: 100,
      updatedAt: 1_000,
    })
    expect(driveRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      name: '新名称',
      type: 'series',
      updatedAt: 1_000,
    }))
  })

  it('删除本地资源 Drive 时从 Profile collections 移除', async () => {
    const record = {
      id: resourceDrive.key.toString('hex'),
      name: '电影库',
      type: 'movie',
      isLocal: true,
      namespace: 'namespace',
      ownerProfileKey: 'profile-key',
      createdAt: 100,
      updatedAt: 100,
    }
    driveRepo.findById.mockReturnValue(record)
    await service.delete(record.id)

    expect(profile.removeCollection).toHaveBeenCalledWith(record.id)
    expect(resourceDrive.close).toHaveBeenCalled()
    expect(driveRepo.delete).toHaveBeenCalledWith(record.id)
  })
})
