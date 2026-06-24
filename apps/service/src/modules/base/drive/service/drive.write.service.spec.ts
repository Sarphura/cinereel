import { Test, TestingModule } from '@nestjs/testing'
import { DriveWriteService } from './drive.write.service'
import { HyperService } from '@/modules/base/hyper/hyper.service'
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('DriveWriteService', () => {
  let service: DriveWriteService
  let hyperServiceMock: any

  beforeEach(async () => {
    hyperServiceMock = {
      drive: {
        put: vi.fn().mockResolvedValue(undefined),
        del: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn().mockResolvedValue(undefined),
        entry: vi.fn(),
        list: vi.fn(),
      },
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriveWriteService,
        {
          provide: HyperService,
          useValue: hyperServiceMock,
        },
      ],
    }).compile()

    service = module.get<DriveWriteService>(DriveWriteService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  it('put() 应该能正确写入 Buffer', async () => {
    const buffer = Buffer.from('hello world')
    await service.put('/test.txt', buffer)

    expect(hyperServiceMock.drive.put).toHaveBeenCalledWith('/test.txt', buffer)
  })

  it('putJson() 应该能正确序列化对象并写入', async () => {
    const data = { name: 'cinereel' }
    await service.putJson('/config.json', data)

    expect(hyperServiceMock.drive.put).toHaveBeenCalledWith(
      '/config.json',
      Buffer.from(JSON.stringify(data, null, 2))
    )
  })

  it('del() 应该能静默忽略不存在的条目而不抛出错误', async () => {
    hyperServiceMock.drive.del.mockRejectedValueOnce(new Error('not found'))
    
    // 应该被 try/catch 捕获并忽略，不抛出异常
    await expect(service.del('/missing.txt')).resolves.not.toThrow()
  })

  it('clearAndDel() 应该能正确调用清理和删除操作', async () => {
    await service.clearAndDel('/file.txt')

    expect(hyperServiceMock.drive.clear).toHaveBeenCalledWith('/file.txt')
    expect(hyperServiceMock.drive.del).toHaveBeenCalledWith('/file.txt')
  })

  it('delTree() 应该递归调用 clear 和 del', async () => {
    hyperServiceMock.drive.entry.mockResolvedValueOnce({ key: '/folder' })
    hyperServiceMock.drive.list.mockReturnValueOnce(
      (async function* () {
        yield { key: '/folder/1.txt' }
        yield { key: '/folder/sub/2.txt' }
      })()
    )

    await service.delTree('/folder')

    // 按路径长度倒序删除
    expect(hyperServiceMock.drive.clear).toHaveBeenNthCalledWith(1, '/folder/sub/2.txt')
    expect(hyperServiceMock.drive.del).toHaveBeenNthCalledWith(1, '/folder/sub/2.txt')
    
    expect(hyperServiceMock.drive.clear).toHaveBeenNthCalledWith(2, '/folder/1.txt')
    expect(hyperServiceMock.drive.del).toHaveBeenNthCalledWith(2, '/folder/1.txt')

    expect(hyperServiceMock.drive.clear).toHaveBeenNthCalledWith(3, '/folder')
    expect(hyperServiceMock.drive.del).toHaveBeenNthCalledWith(3, '/folder')
  })
})
