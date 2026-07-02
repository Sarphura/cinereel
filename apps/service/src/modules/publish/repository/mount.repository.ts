import * as path from 'node:path'
import { Injectable, Inject } from '@nestjs/common'
import { HYPER_MODULE_CONFIG, HyperModuleConfig } from '@/modules/base/hyper/hyper.types'
import { JsonFileStore } from '@/common/storage/json-file.store'
import type { MountJob } from '../domain/dto/mount.dto'

/**
 * MountRepository
 *
 * 挂载任务持久化仓库。
 * 当前实现：JSON 文件存储（{cacheDir}/mount-jobs.json）。
 * 未来：替换为 SQLite 实现，接口保持不变。
 */
@Injectable()
export class MountRepository {
  private readonly store: JsonFileStore<MountJob>

  constructor(
    @Inject(HYPER_MODULE_CONFIG)
    private readonly config: HyperModuleConfig,
  ) {
    const filePath = path.join(config.cacheDir, 'mount-jobs.json')
    this.store = new JsonFileStore<MountJob>(filePath)
  }

  findAll(): MountJob[] {
    return this.store.findAll()
  }

  findById(id: string): MountJob | null {
    return this.store.findById(id)
  }

  save(job: MountJob): MountJob {
    return this.store.save(job)
  }

  delete(id: string): boolean {
    return this.store.delete(id)
  }
}
