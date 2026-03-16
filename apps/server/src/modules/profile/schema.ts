export const INTERNAL_PREFIX = '/.cinereel'
export const PROFILE_PATH = `${INTERNAL_PREFIX}/profile.json`
export const PROFILE_COLLECTIONS_PATH = `${INTERNAL_PREFIX}/collections.json`

export interface ProfileDocument {
  name: string
  bio: string
  avatarPath: string | null
}

export interface ProfileCollectionRecord {
  driveKey: string
  name: string
  addedAt: number
  updatedAt: number
}

export interface ProfileCollectionsDocument {
  items: ProfileCollectionRecord[]
}
