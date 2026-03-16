import Hyperdrive from 'hyperdrive'
import {
  PROFILE_COLLECTIONS_PATH,
  PROFILE_PATH,
  type ProfileCollectionRecord,
  type ProfileCollectionsDocument,
  type ProfileDocument,
} from './schema'

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

function normalizeOptionalText(value?: string | null) {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}
