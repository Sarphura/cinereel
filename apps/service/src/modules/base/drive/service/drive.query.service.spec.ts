import { Test, TestingModule } from '@nestjs/testing'
import { DriveQueryService } from './drive.query.service'
import { HyperService } from '@/modules/base/hyper/hyper.service'
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('DriveQueryService', () => {
  let service: DriveQueryService
  let hyperServiceMock: any

  beforeEach(async () => {
    hyperServiceMock = {
      drive: {
        get: vi.fn(),
        entry: vi.fn(),
        list: vi.fn(),
      },
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriveQueryService,
        {
          provide: HyperService,
          useValue: hyperServiceMock,
        },
      ],
    }).compile()

    service = module.get<DriveQueryService>(DriveQueryService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  it('exists() 如果条目存在应返回 true', async () => {
    hyperServiceMock.drive.entry.mockResolvedValue({ seq: 1 })
    const result = await service.exists('/test.txt')
    expect(result).toBe(true)
  })

  it('exists() 如果条目不存在应返回 false', async () => {
    hyperServiceMock.drive.entry.mockResolvedValue(null)
    const result = await service.exists('/missing.txt')
    expect(result).toBe(false)
  })

  it('exists() 当发生 BLOCK_NOT_AVAILABLE 时应返回 false', async () => {
    hyperServiceMock.drive.entry.mockRejectedValue({ code: 'BLOCK_NOT_AVAILABLE' })
    const result = await service.exists('/remote.txt')
    expect(result).toBe(false)
  })

  it('get() 如果获取到内容应返回 Buffer', async () => {
    const buf = Buffer.from('hello')
    hyperServiceMock.drive.get.mockResolvedValue(buf)
    const result = await service.get('/test.txt')
    expect(result).toEqual(buf)
  })

  it('getJson() 应该解析 JSON Buffer 为对象', async () => {
    const mockData = { test: 123 }
    hyperServiceMock.drive.get.mockResolvedValue(Buffer.from(JSON.stringify(mockData)))

    const result = await service.getJson('/test.json')
    expect(result).toEqual(mockData)
  })

  it('getJson() 如果数据损坏应返回 null', async () => {
    hyperServiceMock.drive.get.mockResolvedValue(Buffer.from('invalid json'))

    const result = await service.getJson('/test.json')
    expect(result).toBeNull()
  })

  it('list() 应该返回数组形式的所有条目', async () => {
    const mockEntries = [{ key: '/1.txt' }, { key: '/2.txt' }]
    hyperServiceMock.drive.list.mockReturnValue(
      (async function* () {
        yield mockEntries[0]
        yield mockEntries[1]
      })()
    )

    const result = await service.list('/')
    expect(result).toEqual(mockEntries)
  })

  it('walk() 应该流式遍历所有条目并在返回 false 时中止', async () => {
    const mockEntries = [{ key: '/1.txt' }, { key: '/2.txt' }, { key: '/3.txt' }]
    hyperServiceMock.drive.list.mockReturnValue(
      (async function* () {
        yield mockEntries[0]
        yield mockEntries[1]
        yield mockEntries[2]
      })()
    )

    const visited: string[] = []
    await service.walk('/', (entry: any) => {
      visited.push(entry.key)
      if (entry.key === '/2.txt') {
        return false // 中止
      }
    })

    expect(visited).toEqual(['/1.txt', '/2.txt'])
  })
})
