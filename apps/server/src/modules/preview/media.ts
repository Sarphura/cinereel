import { spawn } from 'node:child_process'
import fs from 'node:fs'
import type { FastifyBaseLogger } from 'fastify'

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'])
const VIDEO_MIME_TYPES = new Map([
  ['.mp4', 'video/mp4'],
  ['.mkv', 'video/x-matroska'],
  ['.mov', 'video/quicktime'],
  ['.avi', 'video/x-msvideo'],
  ['.webm', 'video/webm'],
  ['.m4v', 'video/x-m4v'],
])
const AUDIO_MIME_TYPES = new Map([
  ['.mp3', 'audio/mpeg'],
  ['.flac', 'audio/flac'],
  ['.wav', 'audio/wav'],
  ['.aac', 'audio/aac'],
  ['.ogg', 'audio/ogg'],
  ['.m4a', 'audio/mp4'],
])
const STREAM_TRANSCODE_PREVIEW_EXTENSIONS = new Set(['.mkv'])

export function getPreviewContentType(extension: string) {
  if (IMAGE_EXTENSIONS.has(extension)) {
    if (extension === '.svg') return 'image/svg+xml'
    if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
    return `image/${extension.slice(1)}`
  }

  if (extension === '.pdf') {
    return 'application/pdf'
  }

  if (VIDEO_MIME_TYPES.has(extension)) {
    return VIDEO_MIME_TYPES.get(extension) ?? null
  }

  if (AUDIO_MIME_TYPES.has(extension)) {
    return AUDIO_MIME_TYPES.get(extension) ?? null
  }

  return null
}

export function shouldStreamTranscodePreview(extension: string) {
  return STREAM_TRANSCODE_PREVIEW_EXTENSIONS.has(extension)
}

export function isRangePreviewableMedia(extension: string) {
  return VIDEO_MIME_TYPES.has(extension) || AUDIO_MIME_TYPES.has(extension)
}

export function buildRangePayload(
  targetPath: string,
  fileSize: number,
  contentType: string,
  rangeHeader?: string,
) {
  if (!rangeHeader) {
    return {
      statusCode: 200,
      headers: {
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
        'Content-Length': String(fileSize),
        'Content-Type': contentType,
      },
      stream: fs.createReadStream(targetPath),
    }
  }

  const matched = /bytes=(\d*)-(\d*)/.exec(rangeHeader)

  if (!matched) {
    throw new Error('Range 头格式无效。')
  }

  const [, startRaw, endRaw] = matched
  const start = startRaw ? Number.parseInt(startRaw, 10) : 0
  const end = endRaw ? Number.parseInt(endRaw, 10) : fileSize - 1

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end >= fileSize) {
    throw new Error('Range 超出文件范围。')
  }

  return {
    statusCode: 206,
    headers: {
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Content-Type': contentType,
    },
    stream: fs.createReadStream(targetPath, { start, end }),
  }
}

export function buildTranscodeStreamPayload(
  targetPath: string,
  log: FastifyBaseLogger,
  onFatalError: () => void,
) {
  const ffmpeg = spawn('ffmpeg', [
    '-v', 'error',
    '-analyzeduration', '128M',
    '-probesize', '128M',
    '-i', targetPath,
    '-map', '0:v:0',
    '-map', '0:a:0?',
    '-map', '-0:s',
    '-map', '-0:d',
    '-map', '-0:t',
    '-sn',
    '-dn',
    '-map_metadata', '-1',
    '-map_chapters', '-1',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-pix_fmt', 'yuv420p',
    '-profile:v', 'high',
    '-level', '4.1',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ac', '2',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    '-f', 'mp4',
    'pipe:1',
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stderr = ''
  ffmpeg.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString()
  })

  ffmpeg.once('error', (error) => {
    log.error({ error, targetPath }, 'ffmpeg 预览流启动失败')
    onFatalError()
  })

  ffmpeg.once('close', (code, signal) => {
    if (code && code !== 0) {
      log.error({
        code,
        signal,
        stderr: stderr.trim(),
        targetPath,
      }, 'ffmpeg 预览流转码失败')
      onFatalError()
    }
  })

  return {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'video/mp4',
    },
    stream: ffmpeg.stdout,
    close: () => {
      if (!ffmpeg.killed) {
        ffmpeg.kill('SIGKILL')
      }
    },
  }
}
