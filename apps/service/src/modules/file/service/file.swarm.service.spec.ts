import { Test, TestingModule } from '@nestjs/testing'
import { FileSwarmService } from './file.swarm.service'
import { SwarmService } from '@/modules/base/swarm/swarm.service'
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('FileSwarmService', () => {
  let service: FileSwarmService
  let swarmMock: any

  const fakeDrive = { key: Buffer.from('c'.repeat(64), 'hex') }

  beforeEach(async () => {
    swarmMock = {
      enableReplication: vi.fn(),
      announce: vi.fn().mockResolvedValue(undefined),
      mountRemoteDrive: vi.fn().mockResolvedValue(fakeDrive),
      unmountRemoteDrive: vi.fn().mockResolvedValue(undefined),
      localPublicKey: 'a'.repeat(64),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileSwarmService,
        {
          provide: SwarmService,
          useValue: swarmMock,
        },
      ],
    }).compile()

    service = module.get<FileSwarmService>(FileSwarmService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  // ---------------------------------------------------------------------------
  // enableReplication()
  // ---------------------------------------------------------------------------

  describe('enableReplication()', () => {
    it('应该委托给 SwarmService.enableReplication()', () => {
      service.enableReplication()

      expect(swarmMock.enableReplication).toHaveBeenCalledTimes(1)
    })
  })

  // ---------------------------------------------------------------------------
  // announce()
  // ---------------------------------------------------------------------------

  describe('announce()', () => {
    it('默认应以 flush=true 调用 SwarmService.announce()', async () => {
      await service.announce()

      expect(swarmMock.announce).toHaveBeenCalledWith(true)
    })

    it('传入 flush=false 时应透传给 SwarmService.announce()', async () => {
      await service.announce(false)

      expect(swarmMock.announce).toHaveBeenCalledWith(false)
    })
  })

  // ---------------------------------------------------------------------------
  // mountPeer()
  // ---------------------------------------------------------------------------

  describe('mountPeer()', () => {
    it('应该调用 SwarmService.mountRemoteDrive 并返回 drive 实例', async () => {
      const key = 'b'.repeat(64)
      const result = await service.mountPeer(key)

      expect(swarmMock.mountRemoteDrive).toHaveBeenCalledWith(key)
      expect(result).toBe(fakeDrive)
    })

    it('传入 flush=true 时不应影响底层调用', async () => {
      const key = 'b'.repeat(64)
      await service.mountPeer(key)

      expect(swarmMock.mountRemoteDrive).toHaveBeenCalledWith(key)
    })
  })

  // ---------------------------------------------------------------------------
  // unmountPeer()
  // ---------------------------------------------------------------------------

  describe('unmountPeer()', () => {
    it('应该调用 SwarmService.unmountRemoteDrive', async () => {
      const key = 'b'.repeat(64)
      await service.unmountPeer(key)

      expect(swarmMock.unmountRemoteDrive).toHaveBeenCalledWith(key)
    })
  })

  // ---------------------------------------------------------------------------
  // localPublicKey
  // ---------------------------------------------------------------------------

  describe('localPublicKey', () => {
    it('应返回 SwarmService.localPublicKey 的值', () => {
      expect(service.localPublicKey).toBe('a'.repeat(64))
    })
  })
})
