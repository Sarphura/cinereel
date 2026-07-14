import { BadRequestException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PROFILE_DOCUMENT_PATH } from '@/modules/common/domain/drive-manifest'
import { ProfileService } from './profile.service'

describe('ProfileService', () => {
  const profileDrive = {}
  let hyper: any
  let driveQuery: any
  let driveWrite: any
  let swarm: any
  let service: ProfileService

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(Date, 'now').mockReturnValue(1_000)

    hyper = {
      drive: profileDrive,
      driveKey: 'profile-key',
    }
    driveQuery = {
      getJson: vi.fn(),
      get: vi.fn(),
    }
    driveWrite = {
      put: vi.fn().mockResolvedValue(undefined),
      putJson: vi.fn().mockResolvedValue(undefined),
      clearAndDel: vi.fn().mockResolvedValue(undefined),
    }
    swarm = {
      mountRemoteDrive: vi.fn(),
    }
    service = new ProfileService(hyper, driveQuery, driveWrite, swarm)
  })

  it('启动时在主 Drive 中创建空 profile.json', async () => {
    driveQuery.getJson.mockResolvedValue(null)

    await service.onModuleInit()

    expect(driveWrite.putJson).toHaveBeenCalledWith(
      PROFILE_DOCUMENT_PATH,
      {
        name: '',
        bio: '',
        avatarPath: null,
        updatedAt: 1_000,
        collections: [],
      },
      profileDrive,
    )
  })

  it('读取 Profile 时补充 driveKey 与可访问的头像 URL', async () => {
    driveQuery.getJson.mockResolvedValue({
      name: 'Alice',
      bio: 'Bio',
      avatarPath: '/avatar.webp',
      updatedAt: 900,
      collections: [],
    })

    await expect(service.getCurrent()).resolves.toEqual({
      driveKey: 'profile-key',
      name: 'Alice',
      bio: 'Bio',
      avatarPath: '/avatar.webp',
      avatarUrl: '/api/profile/avatar?v=900',
      updatedAt: 900,
      collections: [],
    })
  })

  it('更新主页时写入头像并保留 collections', async () => {
    const png = Buffer.from('89504e470d0a1a0a', 'hex')
    driveQuery.getJson.mockResolvedValue({
      name: 'Old',
      bio: '',
      avatarPath: null,
      updatedAt: 100,
      collections: [{
        driveKey: 'resource-key',
        name: '电影库',
        addedAt: 10,
        updatedAt: 20,
      }],
    })

    const result = await service.update({
      name: 'Alice',
      avatarDataUrl: `data:image/png;base64,${png.toString('base64')}`,
    })

    expect(driveWrite.put).toHaveBeenCalledWith('/avatar.png', png, profileDrive)
    expect(driveWrite.putJson).toHaveBeenCalledWith(
      PROFILE_DOCUMENT_PATH,
      {
        name: 'Alice',
        bio: '',
        avatarPath: '/avatar.png',
        updatedAt: 1_000,
        collections: [{
          driveKey: 'resource-key',
          name: '电影库',
          addedAt: 10,
          updatedAt: 20,
        }],
      },
      profileDrive,
    )
    expect(result.avatarUrl).toBe('/api/profile/avatar?v=1000')
  })

  it('删除头像时先更新 profile，再删除旧头像文件', async () => {
    driveQuery.getJson.mockResolvedValue({
      name: 'Alice',
      bio: '',
      avatarPath: '/avatar.jpg',
      updatedAt: 100,
      collections: [],
    })

    await service.update({ avatarDataUrl: null })

    expect(driveWrite.putJson).toHaveBeenCalledWith(
      PROFILE_DOCUMENT_PATH,
      expect.objectContaining({ avatarPath: null }),
      profileDrive,
    )
    expect(driveWrite.clearAndDel).toHaveBeenCalledWith('/avatar.jpg', profileDrive)
    expect(driveWrite.putJson.mock.invocationCallOrder[0])
      .toBeLessThan(driveWrite.clearAndDel.mock.invocationCallOrder[0])
  })

  it('拒绝声明格式与文件内容不匹配的头像', async () => {
    driveQuery.getJson.mockResolvedValue({
      name: '',
      bio: '',
      avatarPath: null,
      updatedAt: 0,
      collections: [],
    })

    await expect(service.update({
      avatarDataUrl: `data:image/png;base64,${Buffer.from('not-png').toString('base64')}`,
    })).rejects.toBeInstanceOf(BadRequestException)
  })

  it('从主 Drive 返回头像内容与 MIME', async () => {
    const avatar = Buffer.from('avatar')
    driveQuery.getJson.mockResolvedValue({
      name: '',
      bio: '',
      avatarPath: '/avatar.webp',
      updatedAt: 0,
      collections: [],
    })
    driveQuery.get.mockResolvedValue(avatar)

    await expect(service.getAvatar()).resolves.toEqual({
      buffer: avatar,
      contentType: 'image/webp',
    })
  })

  it('登记 collection 时保留原 addedAt 并更新主页时间', async () => {
    driveQuery.getJson.mockResolvedValue({
      name: 'Alice',
      bio: '',
      avatarPath: null,
      updatedAt: 100,
      collections: [{
        driveKey: 'resource-key',
        name: '旧名称',
        addedAt: 10,
        updatedAt: 20,
      }],
    })

    await service.upsertCollection({
      driveKey: 'resource-key',
      name: '新名称',
      addedAt: 999,
      updatedAt: 1_000,
    })

    expect(driveWrite.putJson).toHaveBeenCalledWith(
      PROFILE_DOCUMENT_PATH,
      expect.objectContaining({
        updatedAt: 1_000,
        collections: [{
          driveKey: 'resource-key',
          name: '新名称',
          addedAt: 10,
          updatedAt: 1_000,
        }],
      }),
      profileDrive,
    )
  })

  it('删除 collection 时保留其余索引', async () => {
    driveQuery.getJson.mockResolvedValue({
      name: 'Alice',
      bio: '',
      avatarPath: null,
      updatedAt: 100,
      collections: [
        { driveKey: 'remove', name: '删除', addedAt: 10, updatedAt: 20 },
        { driveKey: 'keep', name: '保留', addedAt: 30, updatedAt: 40 },
      ],
    })

    await service.removeCollection('remove')

    expect(driveWrite.putJson).toHaveBeenCalledWith(
      PROFILE_DOCUMENT_PATH,
      expect.objectContaining({
        collections: [
          { driveKey: 'keep', name: '保留', addedAt: 30, updatedAt: 40 },
        ],
      }),
      profileDrive,
    )
  })

  it('按远端 profileKey 读取主页并生成带 key 的头像 URL', async () => {
    const remoteKey = 'b'.repeat(64)
    const remoteDrive = { id: 'remote' }
    swarm.mountRemoteDrive.mockResolvedValue(remoteDrive)
    driveQuery.getJson.mockResolvedValue({
      name: 'Bob',
      bio: 'Remote',
      avatarPath: '/avatar.webp',
      updatedAt: 55,
      collections: [],
    })

    await expect(service.getByDriveKey(remoteKey)).resolves.toEqual({
      driveKey: remoteKey,
      name: 'Bob',
      bio: 'Remote',
      avatarPath: '/avatar.webp',
      avatarUrl: `/api/profile/${remoteKey}/avatar?v=55`,
      updatedAt: 55,
      collections: [],
    })
    expect(swarm.mountRemoteDrive).toHaveBeenCalledWith(remoteKey)
  })

  it('拒绝非法 profileKey', async () => {
    await expect(service.getByDriveKey('not-a-key')).rejects.toBeInstanceOf(BadRequestException)
  })
})
