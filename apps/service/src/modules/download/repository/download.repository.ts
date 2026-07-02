import * as path from 'node:path'
import { Injectable, Inject } from '@nestjs/common'
import { HYPER_MODULE_CONFIG, HyperModuleConfig } from '@/modules/base/hyper/hyper.types'
import { JsonFileStore } from '@/common/storage/json-file.store'
import type { DownloadJob } from '../domain/dto/download.dto'

/**
 * DownloadRepository
 *
 * 下载任务持久化仓库。
 * 当前实现：JSON 文件存储（{cacheDir}/download-jobs.json）。
 * 未来：替换为 SQLite 实现，接口保持不变。
 */
@Injectable()
export class DownloadRepository {
  private readonly store: JsonFileStore<DownloadJob>

  constructor(
    @Inject(HYPER_MODULE_CONFIG)
    private readonly config: HyperModuleConfig,
  ) {
    const filePath = path.join(config.cacheDir, 'download-jobs.json')
    this.store = new JsonFileStore<DownloadJob>(filePath)
  }

  findAll(): DownloadJob[] {
    return this.store.findAll()
  }

  findById(id: string): DownloadJob | null {
    return this.store.findById(id)
  }

  save(job: DownloadJob): DownloadJob {
    return this.store.save(job)
  }

  delete(id: string): boolean {
    return this.store.delete(id)
  }
}
