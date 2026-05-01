import type Hyperdrive from 'hyperdrive'
import path from 'node:path'
import type { LibraryEntry } from '../../base/hyper/types'
import { isInternalLibraryPath } from '../publication/service'

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.mov', '.avi', '.webm', '.m4v'])
const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.wav', '.aac', '.ogg', '.m4a'])

export async function listLibraryEntries(drive: Hyperdrive): Promise<LibraryEntry[]> {
  const entries: LibraryEntry[] = []

  for await (const entry of drive.list('/')) {
    if (!entry.value.blob) continue
    if (isInternalLibraryPath(entry.key)) continue

    const extension = path.posix.extname(entry.key).toLowerCase()
    entries.push({
      path: entry.key,
      name: path.posix.basename(entry.key),
      extension,
      size: entry.value.blob.byteLength,
      updatedAt: entry.mtime ?? Date.now(),
      kind: VIDEO_EXTENSIONS.has(extension)
        ? 'video'
        : AUDIO_EXTENSIONS.has(extension)
          ? 'audio'
          : 'other',
    })
  }

  entries.sort((left, right) => right.updatedAt - left.updatedAt)
  return entries
}

export async function getStreamPayload(
  drive: Hyperdrive,
  filepath: string,
  rangeHeader?: string,
) {
  const entry = await drive.entry(filepath)

  if (!entry?.value.blob) {
    return null
  }

  const fileSize = entry.value.blob.byteLength
  const contentType = filepath.endsWith('.mkv')
    ? 'video/x-matroska'
    : filepath.endsWith('.webm')
      ? 'video/webm'
      : filepath.endsWith('.mp4') || filepath.endsWith('.m4v') || filepath.endsWith('.mov') || filepath.endsWith('.avi')
        ? 'video/mp4'
        : filepath.endsWith('.mp3')
          ? 'audio/mpeg'
          : filepath.endsWith('.flac')
            ? 'audio/flac'
            : filepath.endsWith('.wav')
              ? 'audio/wav'
              : filepath.endsWith('.ogg')
                ? 'audio/ogg'
                : filepath.endsWith('.m4a')
                  ? 'audio/mp4'
                  : filepath.endsWith('.png')
                    ? 'image/png'
                    : filepath.endsWith('.jpg') || filepath.endsWith('.jpeg')
                      ? 'image/jpeg'
                      : filepath.endsWith('.webp')
                        ? 'image/webp'
                        : filepath.endsWith('.gif')
                          ? 'image/gif'
                          : filepath.endsWith('.svg')
                            ? 'image/svg+xml'
                            : 'application/octet-stream'

  if (!rangeHeader) {
    return {
      statusCode: 200,
      headers: {
        'Content-Length': fileSize,
        'Content-Type': contentType,
      },
      stream: drive.createReadStream(filepath),
    }
  }

  const [startRaw, endRaw] = rangeHeader.replace(/bytes=/, '').split('-')
  const start = Number.parseInt(startRaw, 10)
  const end = endRaw ? Number.parseInt(endRaw, 10) : fileSize - 1
  const length = end - start + 1

  return {
    statusCode: 206,
    headers: {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': length,
      'Content-Type': contentType,
    },
    stream: drive.createReadStream(filepath, { start, length }),
  }
}
