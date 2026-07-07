import { BadRequestException } from '@nestjs/common'

/**
 * 空目录占位文件名。
 *
 * Hyperdrive 没有原生目录概念——目录仅是从文件路径前缀中推断出来的。
 * 为了让"新建空目录"在刷新/重启后依然可见，我们在目录内写入一个隐藏的
 * 占位文件；构建文件树时会将其从结果中过滤掉（见 tree.util.ts）。
 */
export const DRIVE_FOLDER_MARKER_NAME = '.cinereel-keep'

/**
 * 校验并规范化 drive 内的绝对路径：
 *   - 必须以 `/` 开头（自动补齐）
 *   - 折叠重复的斜杠
 *   - 拒绝 `.` / `..` 路径段（防止越界）
 *   - 去除末尾斜杠（根路径除外）
 *
 * @throws BadRequestException 路径为空或包含非法段
 */
export function normalizeDrivePath(path: string): string {
  if (typeof path !== 'string' || path.trim().length === 0) {
    throw new BadRequestException('路径不能为空')
  }

  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`
  const segments = withLeadingSlash.split('/').filter((segment) => segment.length > 0)

  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new BadRequestException(`非法路径: ${path}`)
  }

  if (segments.length === 0) {
    return '/'
  }

  return `/${segments.join('/')}`
}

/** 判断（规范化后的）路径是否为根路径 */
export function isRootPath(path: string): boolean {
  return normalizeDrivePath(path) === '/'
}

/** 计算路径的父目录路径 */
export function getDrivePathParent(path: string): string {
  const normalized = normalizeDrivePath(path)
  const lastSlash = normalized.lastIndexOf('/')
  return lastSlash <= 0 ? '/' : normalized.slice(0, lastSlash)
}

/** 拼接目录路径与子名称 */
export function joinDrivePath(dir: string, name: string): string {
  const normalizedDir = normalizeDrivePath(dir)
  return normalizedDir === '/' ? `/${name}` : `${normalizedDir}/${name}`
}

/**
 * 判断 `path` 是否等于 `ancestor`，或位于 `ancestor` 目录树之内。
 * 用于禁止"将目录移动/复制到其自身子目录中"。
 */
export function isPathWithin(path: string, ancestor: string): boolean {
  const normalizedPath = normalizeDrivePath(path)
  const normalizedAncestor = normalizeDrivePath(ancestor)

  if (normalizedAncestor === '/') {
    return true
  }

  return normalizedPath === normalizedAncestor || normalizedPath.startsWith(`${normalizedAncestor}/`)
}

/** 判断条目 key 是否为空目录占位文件 */
export function isFolderMarkerKey(key: string): boolean {
  return key === DRIVE_FOLDER_MARKER_NAME || key.endsWith(`/${DRIVE_FOLDER_MARKER_NAME}`)
}
