import path from 'node:path'
import type { HyperModuleConfig, ProfileSummaryRecord } from '../../infra/hyper/types'
import { openReadableDrive } from '../drive/service'
import {
  type ProfileCollectionRecord,
  type ProfileDocument,
  DESCRIPTOR_PATH,
  PROFILE_COLLECTIONS_PATH,
  PROFILE_PATH,
  normalizeOptionalText,
  readDriveDescriptor,
  readProfileCollectionsDocument,
  readProfileDocument,
  writeDriveDescriptor,
  writeProfileCollectionsDocument,
  writeProfileDocument,
} from './schema'

const DEFAULT_PROFILE_NAME = '我的主页'

export async function ensureProfileIdentity(
  hyper: HyperModuleConfig,
) {
  const descriptor = await readDriveDescriptor(hyper.drive)

  if (!descriptor || descriptor.kind !== 'profile') {
    await writeDriveDescriptor(hyper.drive, {
      kind: 'profile',
      name: descriptor?.name ?? DEFAULT_PROFILE_NAME,
    })
  }

  const profile = await readProfileDocument(hyper.drive)

  if (!profile) {
    await writeProfileDocument(hyper.drive, {
      name: descriptor?.name ?? DEFAULT_PROFILE_NAME,
      bio: '',
      avatarPath: null,
    })
  }

  const collections = await readProfileCollectionsDocument(hyper.drive)

  if (!collections) {
    await writeProfileCollectionsDocument(hyper.drive, {
      items: [],
    })
  }
}

export async function getCurrentProfile(
  hyper: HyperModuleConfig,
): Promise<ProfileSummaryRecord> {
  await ensureProfileIdentity(hyper)

  const descriptor = await readDriveDescriptor(hyper.drive)
  const profile = await readProfileDocument(hyper.drive)
  const collections = await readProfileCollectionsDocument(hyper.drive)

  if (!descriptor || descriptor.kind !== 'profile') {
    throw new Error('当前账号 profile 初始化失败。')
  }

  return {
    driveKey: hyper.driveKey,
    name: profile?.name || descriptor.name,
    bio: profile?.bio ?? '',
    avatarPath: profile?.avatarPath ?? null,
    updatedAt: descriptor.updatedAt,
    collections: (collections?.items ?? []).sort((left, right) => right.updatedAt - left.updatedAt),
  }
}

export async function getCurrentProfileDocument(
  hyper: HyperModuleConfig,
) {
  await ensureProfileIdentity(hyper)
  const descriptor = await readDriveDescriptor(hyper.drive)
  const profile = await readProfileDocument(hyper.drive)

  if (!descriptor || descriptor.kind !== 'profile') {
    throw new Error('当前账号 profile 初始化失败。')
  }

  return {
    name: profile?.name || descriptor.name,
    bio: profile?.bio ?? '',
    avatarPath: profile?.avatarPath ?? null,
  }
}

export async function getCurrentProfileCollections(
  hyper: HyperModuleConfig,
) {
  await ensureProfileIdentity(hyper)
  const collections = await readProfileCollectionsDocument(hyper.drive)

  return {
    items: (collections?.items ?? []).sort((left, right) => right.updatedAt - left.updatedAt),
  }
}

export async function getProfileDocumentByDriveKey(
  hyper: HyperModuleConfig,
  driveKey: string,
) {
  const { drive, close } = await openReadableDrive(hyper, driveKey)

  try {
    const descriptor = await readDriveDescriptor(drive)
    const profile = await readProfileDocument(drive)

    if (!descriptor || descriptor.kind !== 'profile') {
      throw new Error('当前 Drive 不是 profile drive。')
    }

    return {
      name: profile?.name || descriptor.name,
      bio: profile?.bio ?? '',
      avatarPath: profile?.avatarPath ?? null,
    }
  } finally {
    await close()
  }
}

export async function getProfileCollectionsByDriveKey(
  hyper: HyperModuleConfig,
  driveKey: string,
) {
  const { drive, close } = await openReadableDrive(hyper, driveKey)

  try {
    const descriptor = await readDriveDescriptor(drive)

    if (!descriptor || descriptor.kind !== 'profile') {
      throw new Error('当前 Drive 不是 profile drive。')
    }

    const collections = await readProfileCollectionsDocument(drive)

    return {
      items: (collections?.items ?? []).sort((left, right) => right.updatedAt - left.updatedAt),
    }
  } finally {
    await close()
  }
}

export async function updateCurrentProfile(
  hyper: HyperModuleConfig,
  input: {
    name?: string
    bio?: string
    avatarDataUrl?: string | null
  },
): Promise<ProfileSummaryRecord> {
  await ensureProfileIdentity(hyper)

  const descriptor = await readDriveDescriptor(hyper.drive)
  const currentProfile = (await readProfileDocument(hyper.drive)) ?? {
    name: descriptor?.name ?? DEFAULT_PROFILE_NAME,
    bio: '',
    avatarPath: null,
  }

  if (!descriptor || descriptor.kind !== 'profile') {
    throw new Error('当前账号 profile 初始化失败。')
  }

  const nextName = normalizeOptionalText(input.name) ?? descriptor.name
  const nextProfile: ProfileDocument = {
    name: nextName,
    bio: typeof input.bio === 'string' ? input.bio : currentProfile.bio,
    avatarPath: currentProfile.avatarPath,
  }

  if (Object.prototype.hasOwnProperty.call(input, 'avatarDataUrl')) {
    nextProfile.avatarPath = await writeProfileAvatar(hyper, input.avatarDataUrl ?? null)
  }

  await writeDriveDescriptor(hyper.drive, {
    kind: 'profile',
    name: nextName,
  })
  await writeProfileDocument(hyper.drive, nextProfile)

  return getCurrentProfile(hyper)
}

export async function upsertProfileCollection(
  hyper: HyperModuleConfig,
  collection: ProfileCollectionRecord,
) {
  await ensureProfileIdentity(hyper)
  const current = (await readProfileCollectionsDocument(hyper.drive)) ?? { items: [] }
  const existingIndex = current.items.findIndex((item) => item.driveKey === collection.driveKey)

  if (existingIndex === -1) {
    current.items.unshift(collection)
  } else {
    current.items[existingIndex] = {
      ...current.items[existingIndex],
      ...collection,
      addedAt: current.items[existingIndex].addedAt,
    }
  }

  current.items.sort((left, right) => right.updatedAt - left.updatedAt)
  await writeProfileCollectionsDocument(hyper.drive, current)
}

export async function removeProfileCollection(
  hyper: HyperModuleConfig,
  driveKey: string,
) {
  await ensureProfileIdentity(hyper)
  const current = (await readProfileCollectionsDocument(hyper.drive)) ?? { items: [] }
  const nextItems = current.items.filter((item) => item.driveKey !== driveKey.toLowerCase())

  if (nextItems.length === current.items.length) {
    return
  }

  await writeProfileCollectionsDocument(hyper.drive, {
    items: nextItems,
  })
}

async function writeProfileAvatar(
  hyper: HyperModuleConfig,
  avatarDataUrl: string | null,
) {
  const currentProfile = await readProfileDocument(hyper.drive)
  const currentAvatarPath = currentProfile?.avatarPath ?? null

  if (!avatarDataUrl) {
    if (currentAvatarPath) {
      await hyper.drive.del(currentAvatarPath).catch(() => {})
    }

    return null
  }

  const parsed = parseDataUrl(avatarDataUrl)

  if (!parsed) {
    throw new Error('头像数据格式无效。')
  }

  const avatarPath = `/avatar${parsed.extension}`

  if (currentAvatarPath && currentAvatarPath !== avatarPath) {
    await hyper.drive.del(currentAvatarPath).catch(() => {})
  }

  await hyper.drive.put(avatarPath, parsed.buffer)
  return avatarPath
}

function parseDataUrl(value: string) {
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)

  if (!match) {
    return null
  }

  const mimeType = match[1].toLowerCase()
  const extension = mimeType === 'image/png'
    ? '.png'
    : mimeType === 'image/jpeg'
      ? '.jpg'
      : mimeType === 'image/webp'
        ? '.webp'
        : null

  if (!extension) {
    return null
  }

  try {
    return {
      buffer: Buffer.from(match[2], 'base64'),
      extension,
    }
  } catch {
    return null
  }
}

export function resolveProfileAvatarUrl(
  avatarPath: string | null,
  updatedAt?: number,
) {
  if (!avatarPath) {
    return null
  }

  const normalized = path.posix.normalize(avatarPath.startsWith('/') ? avatarPath : `/${avatarPath}`)
  return updatedAt
    ? `/api/stream${normalized}?t=${updatedAt}`
    : `/api/stream${normalized}`
}

export function getProfileInternalPaths() {
  return {
    descriptorPath: DESCRIPTOR_PATH,
    profilePath: PROFILE_PATH,
    collectionsPath: PROFILE_COLLECTIONS_PATH,
  }
}
