/**
 * Content-Type resolution for `/v1/files/:driveKey/*` (ticket 11).
 *
 * The Hyper Agent maps file extensions to MIME types so the browser
 * does not have to sniff. The table is small and intentionally
 * conservative — anything we don't recognise returns
 * `application/octet-stream`, which the browser can sniff safely.
 */
const EXT_TO_MIME: Record<string, string> = {
  // video
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',

  // audio
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
  '.wav': 'audio/wav',

  // images
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',

  // text / subtitles
  '.txt': 'text/plain; charset=utf-8',
  '.vtt': 'text/vtt; charset=utf-8',
  '.srt': 'application/x-subrip; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',

  // binary
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.tar': 'application/x-tar',
}

export function contentTypeForPath(path: string): string {
  const slash = path.lastIndexOf('/')
  const basename = slash >= 0 ? path.slice(slash + 1) : path
  const dot = basename.lastIndexOf('.')
  if (dot <= 0) return 'application/octet-stream'
  const ext = basename.slice(dot).toLowerCase()
  return EXT_TO_MIME[ext] ?? 'application/octet-stream'
}
