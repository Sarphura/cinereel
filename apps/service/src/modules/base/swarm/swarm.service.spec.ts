import { Test, TestingModule } from '@nestjs/testing'
import { SwarmService } from './swarm.service'
import { HyperService } from '@/modules/base/hyper/hyper.service'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hyperdrive 构造函数需在顶层 mock，否则静态 import 无法被拦截。
// 使用 class 形式以支持 `new Hyperdrive()` 调用。
const fakeDriveInstance = {
  ready: vi.fn().mockResolvedValue(undefined),
  update: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  discoveryKey: Buffer.from('d'.repeat(64), 'hex'),
  key: Buffer.from('e'.repeat(64), 'hex'),
}
vi.mock('hyperdrive', () => {
  const MockHyperdrive = vi.fn().mockImplementation(function () {
    return fakeDriveInstance
  })
  return { default: MockHyperdrive }
})

describe('SwarmService', () => {
  let service: SwarmService
  let hyperServiceMock: any

  const fakeDiscovery = {
    flushed: vi.fn().mockResolvedValue(undefined),
  }

  beforeEach(async () => {
    hyperServiceMock = {
      swarm: {
        on: vi.fn(),
        once: vi.fn(),
        off: vi.fn(),
        join: vi.fn().mockReturnValue(fakeDiscovery),
        connections: { size: 1 }, // 模拟已有活跃连接，跳过等待 peer
      },
      store: {
        replicate: vi.fn(),
        session: vi.fn().mockReturnValue({}), // 模拟 Corestore.session()
      },
      drive: {
        discoveryKey: Buffer.from('a'.repeat(64), 'hex'),
        key: Buffer.from('b'.repeat(64), 'hex'),
      },
      driveKey: 'b'.repeat(64),
      getAllLocalDrives: vi.fn().mockReturnValue(new Map()),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SwarmService,
        {
          provide: HyperService,
          useValue: hyperServiceMock,
        },
      ],
    }).compile()

    service = module.get<SwarmService>(SwarmService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  // ---------------------------------------------------------------------------
  // enableReplication()
  // ---------------------------------------------------------------------------

  describe('enableReplication()', () => {
    it('应该监听 swarm 的 connection 事件', () => {
      service.enableReplication()

      expect(hyperServiceMock.swarm.on).toHaveBeenCalledWith('connection', expect.any(Function))
    })

    it('连接建立时应调用 store.replicate(conn)', () => {
      service.enableReplication()

      // 取出注册的 connection 回调并手动触发
      const connectionHandler = hyperServiceMock.swarm.on.mock.calls[0][1]
      const fakeConn = {}
      connectionHandler(fakeConn)

      expect(hyperServiceMock.store.replicate).toHaveBeenCalledWith(fakeConn)
    })
  })

  // ---------------------------------------------------------------------------
  // announceLocalDrive()
  // ---------------------------------------------------------------------------

  describe('announceLocalDrive()', () => {
    it('应该调用 swarm.join 并传入指定 drive 的 discoveryKey', async () => {
      const fakeDrive = { discoveryKey: Buffer.from('c'.repeat(64), 'hex') } as any
      await service.announceLocalDrive(fakeDrive)

      expect(hyperServiceMock.swarm.join).toHaveBeenCalledWith(fakeDrive.discoveryKey)
    })

    it('flush=true 时应等待 discovery.flushed()', async () => {
      const fakeDrive = { discoveryKey: Buffer.from('c'.repeat(64), 'hex') } as any
      fakeDiscovery.flushed.mockClear()
      await service.announceLocalDrive(fakeDrive, true)

      expect(fakeDiscovery.flushed).toHaveBeenCalled()
    })

    it('flush=false 时不应调用 discovery.flushed()', async () => {
      const fakeDrive = { discoveryKey: Buffer.from('c'.repeat(64), 'hex') } as any
      fakeDiscovery.flushed.mockClear()
      await service.announceLocalDrive(fakeDrive, false)

      expect(fakeDiscovery.flushed).not.toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------------------
  // announce()（向后兼容 — 宣告主 Drive）
  // ---------------------------------------------------------------------------

  describe('announce()', () => {
    it('应该调用 swarm.join 并传入主 drive 的 discoveryKey', async () => {
      await service.announce()

      expect(hyperServiceMock.swarm.join).toHaveBeenCalledWith(
        hyperServiceMock.drive.discoveryKey,
      )
    })

    it('flush=true 时应等待 discovery.flushed()', async () => {
      fakeDiscovery.flushed.mockClear()
      await service.announce(true)

      expect(fakeDiscovery.flushed).toHaveBeenCalled()
    })

    it('flush=false 时不应调用 discovery.flushed()', async () => {
      fakeDiscovery.flushed.mockClear()
      await service.announce(false)

      expect(fakeDiscovery.flushed).not.toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------------------
  // announceAll()
  // ---------------------------------------------------------------------------

  describe('announceAll()', () => {
    it('无额外本地 Drive 时只宣告主 Drive', async () => {
      hyperServiceMock.getAllLocalDrives.mockReturnValue(new Map())
      await service.announceAll(false)

      expect(hyperServiceMock.swarm.join).toHaveBeenCalledTimes(1)
      expect(hyperServiceMock.swarm.join).toHaveBeenCalledWith(
        hyperServiceMock.drive.discoveryKey,
      )
    })

    it('有额外本地 Drive 时应宣告所有 Drive', async () => {
      const extraDrive = { discoveryKey: Buffer.from('f'.repeat(64), 'hex'), key: Buffer.from('f'.repeat(64), 'hex') } as any
      hyperServiceMock.getAllLocalDrives.mockReturnValue(new Map([['ns-1', extraDrive]]))

      await service.announceAll(false)

      expect(hyperServiceMock.swarm.join).toHaveBeenCalledTimes(2)
    })
  })

  // ---------------------------------------------------------------------------
  // mountRemoteDrive()
  // ---------------------------------------------------------------------------

  describe('mountRemoteDrive()', () => {
    it('应该构造并返回就绪的远端 Hyperdrive 实例', async () => {
      const remoteKey = 'c'.repeat(64)

      const drive = await service.mountRemoteDrive(remoteKey)

      // 应调用 swarm.join 加入远端发现频道
      expect(hyperServiceMock.swarm.join).toHaveBeenCalled()
      expect(drive).toBeDefined()
    })

    it('相同 publicKey 应返回缓存实例而非重复创建', async () => {
      const remoteKey = 'e'.repeat(64)

      const first = await service.mountRemoteDrive(remoteKey)
      const second = await service.mountRemoteDrive(remoteKey)

      // 第二次调用应返回相同实例
      expect(first).toBe(second)
    })
  })

  // ---------------------------------------------------------------------------
  // unmountRemoteDrive()
  // ---------------------------------------------------------------------------

  describe('unmountRemoteDrive()', () => {
    it('未挂载的 publicKey 调用时应静默忽略', async () => {
      await expect(service.unmountRemoteDrive('0'.repeat(64))).resolves.not.toThrow()
    })
  })

  // ---------------------------------------------------------------------------
  // localPublicKey
  // ---------------------------------------------------------------------------

  describe('localPublicKey', () => {
    it('应返回 HyperService.driveKey 的值', () => {
      expect(service.localPublicKey).toBe('b'.repeat(64))
    })
  })

  // ---------------------------------------------------------------------------
  // localPublicKeys
  // ---------------------------------------------------------------------------

  describe('localPublicKeys', () => {
    it('无额外本地 Drive 时应只包含主 Drive 的 key', () => {
      hyperServiceMock.getAllLocalDrives.mockReturnValue(new Map())

      const keys = service.localPublicKeys
      expect(keys).toEqual(['b'.repeat(64)])
    })

    it('有额外本地 Drive 时应包含所有 key', () => {
      const extraDrive = { key: Buffer.from('f'.repeat(64), 'hex') } as any
      hyperServiceMock.getAllLocalDrives.mockReturnValue(new Map([['ns-1', extraDrive]]))

      const keys = service.localPublicKeys
      expect(keys).toContain('b'.repeat(64))
      expect(keys).toContain('f'.repeat(64))
      expect(keys).toHaveLength(2)
    })
  })
})
