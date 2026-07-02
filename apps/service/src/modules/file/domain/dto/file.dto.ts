/**
 * FileUploadDto
 *
 * 文件上传入参。职责：纯数据契约，不包含任何逻辑。
 */
export interface FileUploadDto {
  /**
   * 写入 Hyperdrive 的绝对路径（例如 `/movies/poster.jpg`）。
   */
  path: string

  /**
   * 要写入的原始字节内容。
   */
  buffer: Buffer

  /**
   * 可选：操作哪个 drive 实例。
   * 不传则默认使用本地 HyperService.drive。
   */
  drive?: import('hyperdrive').default
}

/**
 * FileUploadResultDto
 *
 * 文件上传结果。
 */
export interface FileUploadResultDto {
  /**
   * 成功写入的 drive 绝对路径。
   */
  path: string

  /**
   * 写入的字节数。
   */
  byteLength: number
}

/**
 * FileDownloadDto
 *
 * 文件下载入参。
 */
export interface FileDownloadDto {
  /**
   * 要读取的 Hyperdrive 绝对路径（例如 `/movies/poster.jpg`）。
   */
  path: string

  /**
   * 是否等待远端数据块可用；默认 false（仅读本地缓存）。
   */
  wait?: boolean

  /**
   * 可选：操作哪个 drive 实例。
   * 不传则默认使用本地 HyperService.drive。
   */
  drive?: import('hyperdrive').default
}

/**
 * FileDownloadResultDto
 *
 * 文件下载结果。
 */
export interface FileDownloadResultDto {
  /**
   * 文件内容；路径不存在或数据不可用时为 null。
   */
  buffer: Buffer | null

  /**
   * 读取的 drive 绝对路径（与入参一致，方便调用方无需自己保存）。
   */
  path: string
}
