import Hyperdrive from 'hyperdrive'
import { z } from 'zod'
import {
  DESCRIPTOR_PATH,
  type CollectionDriveContentType,
  type CollectionDriveDescriptor,
  type DriveDescriptor,
  type ProfileDriveDescriptor,
} from './schema'

type WritableProfileDriveDescriptor = {
  kind: 'profile'
  name: string
  updatedAt?: number
}

type WritableCollectionDriveDescriptor = {
  kind: 'collection'
  name: string
  type: CollectionDriveContentType
  ownerProfileDriveKey: string
  updatedAt?: number
}

type WritableDriveDescriptor =
  | WritableProfileDriveDescriptor
  | WritableCollectionDriveDescriptor

const baseDriveDescriptorSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string().trim().min(1),
  updatedAt: z.number(),
})

const profileDriveDescriptorSchema = baseDriveDescriptorSchema.extend({
  kind: z.literal('profile'),
})

const collectionDriveDescriptorSchema = baseDriveDescriptorSchema.extend({
  kind: z.literal('collection'),
  type: z.enum(['movie', 'series', 'music', 'generic']),
  ownerProfileDriveKey: z.string().trim().min(1),
})

const driveDescriptorSchema = z.union([
  profileDriveDescriptorSchema,
  collectionDriveDescriptorSchema,
])

export async function writeDriveDescriptor(
  drive: Hyperdrive,
  descriptor: WritableDriveDescriptor,
) {
  const payload = {
    schemaVersion: 1,
    ...descriptor,
    updatedAt: descriptor.updatedAt ?? Date.now(),
  } as DriveDescriptor

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

    const result = driveDescriptorSchema.safeParse(JSON.parse(buffer.toString()))

    if (!result.success) {
      return null
    }

    const parsed = result.data
    const base = {
      schemaVersion: 1 as const,
      name: parsed.name,
      updatedAt: parsed.updatedAt,
    }

    switch (parsed.kind) {
      case 'profile':
        return {
          ...base,
          kind: 'profile',
        }
      case 'collection':
        return {
          ...base,
          kind: 'collection',
          type: normalizeCollectionDriveContentType(parsed.type),
          ownerProfileDriveKey: parsed.ownerProfileDriveKey,
        }
    }
  } catch {
    return null
  }
}

export async function readProfileDriveDescriptor(
  drive: Hyperdrive,
): Promise<ProfileDriveDescriptor | null> {
  const descriptor = await readDriveDescriptor(drive)
  return descriptor?.kind === 'profile' ? descriptor : null
}

export async function readCollectionDriveDescriptor(
  drive: Hyperdrive,
): Promise<CollectionDriveDescriptor | null> {
  const descriptor = await readDriveDescriptor(drive)
  return descriptor?.kind === 'collection' ? descriptor : null
}

function normalizeCollectionDriveContentType(value?: string | null): CollectionDriveContentType {
  return value === 'movie' || value === 'series' || value === 'music'
    ? value
    : 'generic'
}
