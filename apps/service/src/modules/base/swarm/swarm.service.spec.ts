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
  // announce()
  // ---------------------------------------------------------------------------

  describe('announce()', () => {
    it('应该调用 swarm.join 并传入本地 drive 的 discoveryKey', async () => {
      await service.announce()

      expect(hyperServiceMock.swarm.join).toHaveBeenCalledWith(
        hyperServiceMock.drive.discoveryKey,
      )
    })

    it('flush=true 时应等待 discovery.flushed()', async () => {
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
})
