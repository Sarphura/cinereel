import { Test, TestingModule } from '@nestjs/testing'
import { FileDownloadService } from './file.download.service'
import { DriveQueryService } from '@/modules/base/drive/service/drive.query.service'
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('FileDownloadService', () => {
  let service: FileDownloadService
  let driveQueryMock: any

  beforeEach(async () => {
    driveQueryMock = {
      get: vi.fn(),
      getJson: vi.fn(),
      exists: vi.fn(),
      list: vi.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileDownloadService,
        {
          provide: DriveQueryService,
          useValue: driveQueryMock,
        },
      ],
    }).compile()

    service = module.get<FileDownloadService>(FileDownloadService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('download()', () => {
    it('文件存在时应返回 buffer 与路径', async () => {
      const buf = Buffer.from('movie data')
      driveQueryMock.get.mockResolvedValue(buf)

      const result = await service.download({ path: '/movies/a.mp4' })

      expect(driveQueryMock.get).toHaveBeenCalledWith('/movies/a.mp4', false, undefined)
      expect(result).toEqual({ path: '/movies/a.mp4', buffer: buf })
    })

    it('文件不存在时 buffer 应为 null', async () => {
      driveQueryMock.get.mockResolvedValue(null)

      const result = await service.download({ path: '/missing.mp4' })

      expect(result.buffer).toBeNull()
      expect(result.path).toBe('/missing.mp4')
    })

    it('应将 wait 参数透传给 DriveQueryService.get', async () => {
      driveQueryMock.get.mockResolvedValue(null)
      await service.download({ path: '/remote.mp4', wait: true })

      expect(driveQueryMock.get).toHaveBeenCalledWith('/remote.mp4', true, undefined)
    })

    it('应将可选 drive 参数透传给 DriveQueryService.get', async () => {
      driveQueryMock.get.mockResolvedValue(null)
      const fakeDrive = {} as any
      await service.download({ path: '/a.mp4', drive: fakeDrive })

      expect(driveQueryMock.get).toHaveBeenCalledWith('/a.mp4', false, fakeDrive)
    })
  })

  describe('downloadJson()', () => {
    it('应解析并返回 JSON 对象', async () => {
      const mockData = { title: 'Inception' }
      driveQueryMock.getJson.mockResolvedValue(mockData)

      const result = await service.downloadJson<typeof mockData>('/meta.json')

      expect(driveQueryMock.getJson).toHaveBeenCalledWith('/meta.json', false, undefined)
      expect(result).toEqual(mockData)
    })

    it('JSON 不存在时应返回 null', async () => {
      driveQueryMock.getJson.mockResolvedValue(null)

      const result = await service.downloadJson('/missing.json')

      expect(result).toBeNull()
    })
  })

  describe('exists()', () => {
    it('路径存在时应返回 true', async () => {
      driveQueryMock.exists.mockResolvedValue(true)

      const result = await service.exists('/movies/a.mp4')

      expect(driveQueryMock.exists).toHaveBeenCalledWith('/movies/a.mp4', false, undefined)
      expect(result).toBe(true)
    })

    it('路径不存在时应返回 false', async () => {
      driveQueryMock.exists.mockResolvedValue(false)

      const result = await service.exists('/missing.mp4')

      expect(result).toBe(false)
    })
  })

  describe('listFiles()', () => {
    it('应将条目列表映射为路径字符串数组', async () => {
      driveQueryMock.list.mockResolvedValue([
        { key: '/movies/a.mp4' },
        { key: '/movies/b.mp4' },
      ])

      const result = await service.listFiles('/movies')

      expect(driveQueryMock.list).toHaveBeenCalledWith('/movies', false, undefined)
      expect(result).toEqual(['/movies/a.mp4', '/movies/b.mp4'])
    })

    it('路径下无条目时应返回空数组', async () => {
      driveQueryMock.list.mockResolvedValue([])

      const result = await service.listFiles('/empty')

      expect(result).toEqual([])
    })
  })
})
