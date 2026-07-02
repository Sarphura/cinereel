import { Test, TestingModule } from '@nestjs/testing'
import { FileUploadService } from './file.upload.service'
import { DriveWriteService } from '@/modules/base/drive/service/drive.write.service'
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('FileUploadService', () => {
  let service: FileUploadService
  let driveWriteMock: any

  beforeEach(async () => {
    driveWriteMock = {
      put: vi.fn().mockResolvedValue(undefined),
      putJson: vi.fn().mockResolvedValue(undefined),
      del: vi.fn().mockResolvedValue(undefined),
      delTree: vi.fn().mockResolvedValue(undefined),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileUploadService,
        {
          provide: DriveWriteService,
          useValue: driveWriteMock,
        },
      ],
    }).compile()

    service = module.get<FileUploadService>(FileUploadService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('upload()', () => {
    it('应该调用 DriveWriteService.put 并返回路径与字节数', async () => {
      const buffer = Buffer.from('hello world')
      const result = await service.upload({ path: '/test.txt', buffer })

      expect(driveWriteMock.put).toHaveBeenCalledWith('/test.txt', buffer, undefined)
      expect(result).toEqual({ path: '/test.txt', byteLength: buffer.byteLength })
    })

    it('应该将可选 drive 参数透传给 DriveWriteService.put', async () => {
      const buffer = Buffer.from('data')
      const fakeDrive = {} as any
      await service.upload({ path: '/a.txt', buffer, drive: fakeDrive })

      expect(driveWriteMock.put).toHaveBeenCalledWith('/a.txt', buffer, fakeDrive)
    })
  })

  describe('uploadJson()', () => {
    it('应该调用 DriveWriteService.putJson', async () => {
      const data = { name: 'cinereel' }
      await service.uploadJson('/meta.json', data)

      expect(driveWriteMock.putJson).toHaveBeenCalledWith('/meta.json', data, undefined)
    })
  })

  describe('delete()', () => {
    it('应该调用 DriveWriteService.del', async () => {
      await service.delete('/old.txt')

      expect(driveWriteMock.del).toHaveBeenCalledWith('/old.txt', undefined)
    })

    it('路径不存在时不应抛出错误（由 DriveWriteService 保证）', async () => {
      driveWriteMock.del.mockResolvedValueOnce(undefined)

      await expect(service.delete('/missing.txt')).resolves.not.toThrow()
    })
  })

  describe('deleteTree()', () => {
    it('应该调用 DriveWriteService.delTree', async () => {
      await service.deleteTree('/movies')

      expect(driveWriteMock.delTree).toHaveBeenCalledWith('/movies', undefined)
    })
  })
})
