import * as path from 'node:path'
import * as fs from 'node:fs'
import { Injectable, Inject } from '@nestjs/common'
import { HYPER_MODULE_CONFIG, HyperModuleConfig } from '@/modules/base/hyper/hyper.types'
import { JsonFileStore } from '@/common/storage/json-file.store'
import type { DriveRecord } from '../domain/dto/drive.dto'

/**
 * DriveRepository
 *
 * Drive 元数据持久化仓库。
 * 当前实现：JSON 文件存储（{cacheDir}/drives.json）。
 * 未来：替换为 SQLite 实现，接口保持不变。
 *
 * 注意：DriveRecord.id === Drive 公钥（十六进制字符串）。
 */
@Injectable()
export class DriveRepository {
  private readonly store: JsonFileStore<DriveRecord>

  constructor(
    @Inject(HYPER_MODULE_CONFIG)
    private readonly config: HyperModuleConfig,
  ) {
    const filePath = path.join(config.cacheDir, 'drives.json')
    this.store = new JsonFileStore<DriveRecord>(filePath)
  }

  findAll(): DriveRecord[] {
    return this.store.findAll()
  }

  findById(driveKey: string): DriveRecord | null {
    return this.store.findById(driveKey)
  }

  findAllLocal(): DriveRecord[] {
    return this.store.findAll().filter((d) => d.isLocal)
  }

  findAllSubscribed(): DriveRecord[] {
    return this.store.findAll().filter((d) => !d.isLocal)
  }

  save(record: DriveRecord): DriveRecord {
    return this.store.save(record)
  }

  delete(driveKey: string): boolean {
    return this.store.delete(driveKey)
  }

  exists(driveKey: string): boolean {
    return this.store.exists(driveKey)
  }
}
