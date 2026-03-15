import Hyperdrive from 'hyperdrive'

export const INTERNAL_PREFIX = '/.cinereel'
export const DESCRIPTOR_PATH = `${INTERNAL_PREFIX}/descriptor.json`
export const PROFILE_PATH = `${INTERNAL_PREFIX}/profile.json`
export const PROFILE_COLLECTIONS_PATH = `${INTERNAL_PREFIX}/collections.json`

export type DriveKind = 'profile' | 'collection'

export interface DriveDescriptor {
  schemaVersion: 1
  kind: DriveKind
  name: string
  updatedAt: number
  ownerProfileDriveKey?: string
}

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

export function normalizeOptionalText(value?: string | null) {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

export async function writeDriveDescriptor(
  drive: Hyperdrive,
  descriptor: Omit<DriveDescriptor, 'schemaVersion' | 'updatedAt'> & {
    updatedAt?: number
  },
) {
  const payload: DriveDescriptor = {
    schemaVersion: 1,
    updatedAt: descriptor.updatedAt ?? Date.now(),
    ...descriptor,
  }

  await drive.put(DESCRIPTOR_PATH, Buffer.from(JSON.stringify(payload, null, 2)))
}

export async function readDriveDescriptor(
  drive: Hyperdrive,
): Promise<DriveDescriptor | null> {
  try {
    const entry = await drive.entry(DESCRIPTOR_PATH)

    if (!entry?.value.blob) {
      return null
    }

    const buffer = await drive.get(DESCRIPTOR_PATH)

    if (!buffer) {
      return null
    }

    const parsed = JSON.parse(buffer.toString()) as Partial<DriveDescriptor>

    if (
      parsed.schemaVersion !== 1
      || (parsed.kind !== 'profile' && parsed.kind !== 'collection')
      || typeof parsed.name !== 'string'
      || typeof parsed.updatedAt !== 'number'
    ) {
      return null
    }

    const name = parsed.name.trim()

    if (!name) {
      return null
    }

    const ownerProfileDriveKey = normalizeOptionalText(parsed.ownerProfileDriveKey)

    return {
      schemaVersion: 1,
      kind: parsed.kind,
      name,
      updatedAt: parsed.updatedAt,
      ownerProfileDriveKey,
    }
  } catch {
    return null
  }
}

export async function readProfileDocument(
  drive: Hyperdrive,
): Promise<ProfileDocument | null> {
  try {
    const buffer = await drive.get(PROFILE_PATH)

    if (!buffer) {
      return null
    }

    const parsed = JSON.parse(buffer.toString()) as Partial<ProfileDocument>

    return {
      name: typeof parsed.name === 'string' && parsed.name.trim()
        ? parsed.name.trim()
        : '',
      bio: typeof parsed.bio === 'string' ? parsed.bio : '',
      avatarPath: typeof parsed.avatarPath === 'string' ? parsed.avatarPath : null,
    }
  } catch {
    return null
  }
}

export async function writeProfileDocument(
  drive: Hyperdrive,
  profile: ProfileDocument,
) {
  await drive.put(PROFILE_PATH, Buffer.from(JSON.stringify(profile, null, 2)))
}

export async function readProfileCollectionsDocument(
  drive: Hyperdrive,
): Promise<ProfileCollectionsDocument | null> {
  try {
    const buffer = await drive.get(PROFILE_COLLECTIONS_PATH)

    if (!buffer) {
      return null
    }

    const parsed = JSON.parse(buffer.toString()) as Partial<ProfileCollectionsDocument>
    const items = Array.isArray(parsed.items) ? parsed.items : []

    return {
      items: items.flatMap((item) => {
        if (!item || typeof item !== 'object') {
          return []
        }

        const record = item as Partial<ProfileCollectionRecord>
        const driveKey = normalizeOptionalText(record.driveKey)
        const name = normalizeOptionalText(record.name)
        const addedAt = typeof record.addedAt === 'number' ? record.addedAt : undefined
        const updatedAt = typeof record.updatedAt === 'number' ? record.updatedAt : undefined

        if (!driveKey || !name || addedAt === undefined || updatedAt === undefined) {
          return []
        }

        return [{
          driveKey,
          name,
          addedAt,
          updatedAt,
        }]
      }),
    }
  } catch {
    return null
  }
}

export async function writeProfileCollectionsDocument(
  drive: Hyperdrive,
  document: ProfileCollectionsDocument,
) {
  await drive.put(PROFILE_COLLECTIONS_PATH, Buffer.from(JSON.stringify(document, null, 2)))
}
