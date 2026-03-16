import { INTERNAL_PREFIX } from '../profile/schema'

export const DESCRIPTOR_PATH = `${INTERNAL_PREFIX}/descriptor.json`

export type DriveKind = 'profile' | 'collection'
export type CollectionDriveContentType = 'movie' | 'series' | 'music' | 'generic'

interface BaseDriveDescriptor {
  schemaVersion: 1
  kind: DriveKind
  name: string
  updatedAt: number
}

export interface ProfileDriveDescriptor extends BaseDriveDescriptor {
  kind: 'profile'
}

export interface CollectionDriveDescriptor extends BaseDriveDescriptor {
  kind: 'collection'
  type: CollectionDriveContentType
  ownerProfileDriveKey: string
}

export type DriveDescriptor = ProfileDriveDescriptor | CollectionDriveDescriptor
