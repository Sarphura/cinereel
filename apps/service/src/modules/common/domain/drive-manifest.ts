export type DriveContentType = 'movie' | 'series' | 'music' | 'generic'

export const DRIVE_DESCRIPTOR_PATH = '/descriptor.json'
export const PROFILE_DOCUMENT_PATH = '/profile.json'

/**
 * 资源 Drive 对外公开的元数据。
 *
 * ownerProfileKey 指向发布节点的主 Drive（Profile Drive）。
 */
export interface DriveDescriptor {
  name: string
  type: DriveContentType
  ownerProfileKey: string
}

export interface ProfileCollection {
  driveKey: string
  name: string
  addedAt: number
  updatedAt: number
}

/**
 * Profile Drive 中持久化的公开主页文档。
 *
 * Profile Drive 自身的 driveKey 由 API 根据 Hyperdrive 实例补充，
 * avatarUrl 同样由传输/API 层生成，因此不写入该文档。
 */
export interface ProfileDocument {
  name: string
  bio: string
  avatarPath: string | null
  updatedAt: number
  collections: ProfileCollection[]
}
