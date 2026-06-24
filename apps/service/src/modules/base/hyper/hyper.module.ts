import { DynamicModule, Module } from '@nestjs/common'
import { HyperService } from './hyper.service'
import { HYPER_MODULE_CONFIG, HyperModuleOptions } from './hyper.types'

/**
 * HyperModule
 *
 * 职责（单一）：将 HyperModuleConfig 以 DI Token 的形式注入容器，
 * 并提供/导出 HyperService 供其他模块使用。
 *
 * 使用方式（在 AppModule 中注册）：
 *
 * ```ts
 * @Module({
 *   imports: [
 *     HyperModule.register({
 *       isGlobal: true,
 *       config: {
 *         storeDir: process.env.CORESTORE_DIR ?? './storage',
 *         cacheDir:  process.env.CINEREEL_CACHE_DIR ?? './cache',
 *       },
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * 注册为全局模块（`isGlobal: true`）后，所有 Feature Module
 * 无需在 imports 中重复声明即可注入 HyperService。
 */
@Module({})
export class HyperModule {
  /**
   * 同步注册。
   * 若需异步配置（如从远端获取），可扩展为 `registerAsync()`。
   */
  static register(options: HyperModuleOptions): DynamicModule {
    return {
      module: HyperModule,
      global: options.isGlobal ?? false,
      providers: [
        {
          provide: HYPER_MODULE_CONFIG,
          useValue: options.config,
        },
        HyperService,
      ],
      exports: [HyperService],
    }
  }
}
