import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { StoredDownloadTaskSchema, type StoredDownloadTask } from './download-task.types.js'

const StoreSchema = z.object({
  schemaVersion: z.literal(1),
  tasks: z.array(StoredDownloadTaskSchema),
}).strict().superRefine((store, context) => {
  if (new Set(store.tasks.map((task) => task.id)).size !== store.tasks.length ||
      new Set(store.tasks.map((task) => task.idempotencyKey)).size !== store.tasks.length) {
    context.addIssue({ code: 'custom', message: '任务标识和幂等键不能重复。' })
  }
})

export class DownloadTaskStore {
  constructor(readonly path: string) {}

  async read(): Promise<StoredDownloadTask[]> {
    let content: string
    try {
      content = await readFile(this.path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    try {
      return StoreSchema.parse(JSON.parse(content)).tasks
    } catch (cause) {
      throw new Error(`离线任务存储无效，已保留原文件：${this.path}`, { cause })
    }
  }

  async write(tasks: StoredDownloadTask[]): Promise<void> {
    const data = StoreSchema.parse({ schemaVersion: 1, tasks })
    await mkdir(dirname(this.path), { recursive: true })
    const temporary = `${this.path}.${randomUUID()}.tmp`
    try {
      const file = await open(temporary, 'wx', 0o600)
      try {
        await file.writeFile(JSON.stringify(data, null, 2), 'utf8')
        await file.sync()
      } finally {
        await file.close()
      }
      await rename(temporary, this.path)
      const directory = await open(dirname(this.path), 'r')
      try {
        await directory.sync()
      } finally {
        await directory.close()
      }
    } finally {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error
      })
    }
  }
}
