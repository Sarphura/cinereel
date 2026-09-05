import { describe, expect, it, vi } from 'vitest'
import type { SDK } from 'hyper-sdk'
import { DriveActivity } from '../src/hyper.infrastructure/sdk/drive-activity.js'
import { DriveService } from '../src/hyper.implementation/drives.service.js'

const key = 'a'.repeat(64)

describe('DriveActivity', () => {
  it('登记与关闭互斥，大小写相同的 key 共享状态，释放幂等', async () => {
    const activity = new DriveActivity()
    const release = activity.acquire(key.toUpperCase())
    const close = vi.fn(async () => undefined)
    await expect(activity.withExclusive(key, close)).rejects.toMatchObject({ status: 409 })
    expect(close).not.toHaveBeenCalled()
    release()
    release()
    await activity.withExclusive(key, close)
    expect(close).toHaveBeenCalledOnce()
  })

  it('关闭执行期间拒绝新登记，关闭失败后仍可重新使用', async () => {
    const activity = new DriveActivity()
    await expect(activity.withExclusive(key, async () => {
      expect(() => activity.acquire(key)).toThrow()
      throw new Error('关闭失败')
    })).rejects.toThrow('关闭失败')
    activity.acquire(key)()
  })

  it('文件操作失败也释放登记', async () => {
    const activity = new DriveActivity()
    await expect(activity.withUse(key, async () => {
      throw new Error('读取失败')
    })).rejects.toThrow('读取失败')
    await activity.withExclusive(key, async () => undefined)
  })

  it.each(['unmountDrive', 'deleteDrive', 'purgeDriveForTest', 'clearDriveBlobs'] as const)(
    '%s 在 Drive 被使用时不触碰 SDK', async (method) => {
      const activity = new DriveActivity()
      const getDrive = vi.fn()
      const service = new DriveService({ getDrive } as unknown as SDK, activity)
      const release = activity.acquire(key)
      await expect(service[method](key)).rejects.toMatchObject({ status: 409 })
      expect(getDrive).not.toHaveBeenCalled()
      release()
    },
  )
})
