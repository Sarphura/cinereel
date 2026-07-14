import { BadRequestException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DRIVE_DESCRIPTOR_PATH } from '@/modules/common/domain/drive-manifest'
import { SubscribeService } from './subscribe.service'

describe('SubscribeService', () => {
  const resourceKey = 'a'.repeat(64)
  const profileKey = 'b'.repeat(64)
  const remoteDrive = { id: 'resource' }

  let swarm: any
  let driveQuery: any
  let driveService: any
  let profile: any
  let service: SubscribeService

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(Date, 'now').mockReturnValue(1_000)

    swarm = {
      mountRemoteDrive: vi.fn().mockResolvedValue(remoteDrive),
      unmountRemoteDrive: vi.fn().mockResolvedValue(undefined),
    }
    driveQuery = {
      getJson: vi.fn(),
    }
    driveService = {
      findRecord: vi.fn().mockReturnValue(null),
      saveRecord: vi.fn((record) => record),
      deleteRecord: vi.fn(),
    }
    profile = {
      getOwnerSummary: vi.fn().mockResolvedValue({
        driveKey: profileKey,
        name: 'Alice',
        bio: 'Bio',
        avatarPath: '/avatar.webp',
        avatarUrl: `/api/profile/${profileKey}/avatar?v=1`,
        updatedAt: 1,
      }),
    }

    service = new SubscribeService(swarm, driveQuery, driveService, profile)
  })

  it('订阅资源 Drive 时解析 descriptor 并返回 owner 摘要', async () => {
    driveQuery.getJson.mockResolvedValue({
      name: ' 电影库 ',
      type: 'movie',
      ownerProfileKey: profileKey.toUpperCase(),
    })

    const result = await service.add(resourceKey)

    expect(swarm.mountRemoteDrive).toHaveBeenCalledWith(resourceKey)
    expect(driveQuery.getJson).toHaveBeenCalledWith(
      DRIVE_DESCRIPTOR_PATH,
      true,
      remoteDrive,
    )
    expect(profile.getOwnerSummary).toHaveBeenCalledWith(profileKey)
    expect(driveService.saveRecord).toHaveBeenCalledWith(expect.objectContaining({
      id: resourceKey,
      name: '电影库',
      type: 'movie',
      isLocal: false,
      ownerProfileKey: profileKey,
    }))
    expect(result).toEqual({
      driveKey: resourceKey,
      name: '电影库',
      type: 'movie',
      createdAt: 1_000,
      ownerProfileKey: profileKey,
      owner: {
        driveKey: profileKey,
        name: 'Alice',
        bio: 'Bio',
        avatarPath: '/avatar.webp',
        avatarUrl: `/api/profile/${profileKey}/avatar?v=1`,
        updatedAt: 1,
      },
    })
  })

  it('缺少 ownerProfileKey 时拒绝订阅', async () => {
    driveQuery.getJson.mockResolvedValue({
      name: '电影库',
      type: 'movie',
    })

    await expect(service.add(resourceKey)).rejects.toBeInstanceOf(BadRequestException)
    expect(driveService.saveRecord).not.toHaveBeenCalled()
  })

  it('对已订阅记录返回 owner 摘要', async () => {
    driveService.findRecord.mockReturnValue({
      id: resourceKey,
      name: '电影库',
      type: 'movie',
      isLocal: false,
      ownerProfileKey: profileKey,
      createdAt: 100,
      updatedAt: 100,
    })

    const result = await service.add(resourceKey)

    expect(swarm.mountRemoteDrive).not.toHaveBeenCalled()
    expect(profile.getOwnerSummary).toHaveBeenCalledWith(profileKey)
    expect(result.createdAt).toBe(100)
    expect(result.owner.name).toBe('Alice')
  })
})
