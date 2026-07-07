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

  /**
   * Hyperswarm / HyperDHT 监听端口。
   * 同一台机器上运行多个节点时必须使用不同端口，否则 DHT 无法正常工作。
   * 可通过环境变量 `HYPERSWARM_PORT` 提供。
   */
  swarmPort?: number

  /**
   * DHT bootstrap 节点列表（本地多节点测试用）。
   * 格式：`host:port,host:port`，留空则使用公网默认 bootstrap。
   */
  dhtBootstrap?: Array<{ host: string; port: number }>
}

/** 解析 `DHT_BOOTSTRAP` 环境变量。 */
export function parseDhtBootstrapEnv(
  raw: string | undefined,
): Array<{ host: string; port: number }> | undefined {
  if (!raw) return undefined

  const nodes = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const lastColon = entry.lastIndexOf(':')
      return {
        host: entry.slice(0, lastColon),
        port: Number(entry.slice(lastColon + 1)),
      }
    })
    .filter((node) => node.host && Number.isFinite(node.port))

  return nodes.length > 0 ? nodes : undefined
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
