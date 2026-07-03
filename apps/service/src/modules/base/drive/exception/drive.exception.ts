/**
 * 判断是否为远端节点数据块暂不可用的错误（对等节点尚未同步）。
 */
export function isBlockNotAvailableError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as Record<string, unknown>).code === 'BLOCK_NOT_AVAILABLE'
  )
}
