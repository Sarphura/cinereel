/**
 * HyperModuleConfig
 *
 * 运行时配置，由宿主应用通过 HyperModule.register() 传入。
 * 职责：纯数据契约，不包含任何逻辑。
 */
export interface HyperModuleConfig {
  /**
   * Corestore 持久化目录（本地文件路径）。
   * 可通过环境变量 `CORESTORE_DIR` 提供。
   */
  storeDir: string

  /**
   * 缓存目录（供扩展功能使用，如镜像驱动缓存）。
   * 可通过环境变量 `CINEREEL_CACHE_DIR` 提供。
   */
  cacheDir: string
}

/**
 * HyperModuleOptions
 *
 * HyperModule.register() 的入参。
 * 在 config 基础上附加模块级选项（如是否注册为全局模块）。
 */
export interface HyperModuleOptions {
  /**
   * 若为 true，HyperModule 将注册为全局模块，
   * 其他模块无需在 imports 中重复声明即可注入 HyperService。
   */
  isGlobal?: boolean

  /**
   * 运行时配置。
   */
  config: HyperModuleConfig
}

/**
 * DI Token — 用于将 HyperModuleConfig 注入到 HyperService。
 */
export const HYPER_MODULE_CONFIG = Symbol('HYPER_MODULE_CONFIG')
