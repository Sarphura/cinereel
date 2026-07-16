import * as path from 'node:path'
import * as fs from 'node:fs'

/**
 * JsonFileStore
 *
 * 通用的 JSON 文件持久化存储。
 * 以记录数组的形式将数据持久化到单个 JSON 文件中，
 * 每条记录通过唯一的 `id` 字段进行标识。
 *
 * 说明：这是仓库层当前使用的简单持久化实现，
 * 未来可替换为 SQLite 等实现，接口保持不变。
 */
export class JsonFileStore<T extends { id: string }> {
  private records: T[] = []

  constructor(private readonly filePath: string) {
    this.load()
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8').trim()
        this.records = raw ? (JSON.parse(raw) as T[]) : []
      } else {
        this.records = []
      }
    } catch {
      // 文件损坏或无法解析时，退回到空集合，避免服务启动失败。
      this.records = []
    }
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    fs.writeFileSync(this.filePath, JSON.stringify(this.records, null, 2), 'utf-8')
  }

  findAll(): T[] {
    return [...this.records]
  }

  findById(id: string): T | null {
    return this.records.find((record) => record.id === id) ?? null
  }

  save(record: T): T {
    const index = this.records.findIndex((existing) => existing.id === record.id)
    if (index >= 0) {
      this.records[index] = record
    } else {
      this.records.push(record)
    }
    this.persist()
    return record
  }

  delete(id: string): boolean {
    const index = this.records.findIndex((record) => record.id === id)
    if (index < 0) {
      return false
    }
    this.records.splice(index, 1)
    this.persist()
    return true
  }

  exists(id: string): boolean {
    return this.records.some((record) => record.id === id)
  }
}
