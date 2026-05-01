import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import type {
  MediaAudioRecord,
  MediaIndexEntry,
  MediaSubtitleRecord,
  MediaVideoRecord,
} from './store'

const execFileAsync = promisify(execFile)

interface FfprobeResponse {
  streams?: Array<Record<string, unknown>>
  format?: Record<string, unknown>
}

export async function probeMediaFile(filePath: string, resourcePath: string): Promise<MediaIndexEntry> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_streams',
    '-show_format',
    '-of', 'json',
    filePath,
  ])
  const payload = JSON.parse(stdout) as FfprobeResponse
  const streams = Array.isArray(payload.streams) ? payload.streams : []
  const format = payload.format ?? {}
  const scannedAt = Date.now()

  return {
    path: resourcePath,
    fileName: path.basename(resourcePath),
    container: readString(format.format_name),
    size: readNumber(format.size),
    durationSeconds: readNumber(format.duration),
    bitRate: readNumber(format.bit_rate),
    video: streams.filter((stream) => stream.codec_type === 'video').map(normalizeVideoStream),
    audio: streams.filter((stream) => stream.codec_type === 'audio').map(normalizeAudioStream),
    subtitles: streams.filter((stream) => stream.codec_type === 'subtitle').map(normalizeSubtitleStream),
    scannedAt,
  }
}

function normalizeVideoStream(stream: Record<string, unknown>): MediaVideoRecord {
  return {
    codec: readString(stream.codec_name),
    profile: readString(stream.profile),
    language: readString((stream.tags as Record<string, unknown> | undefined)?.language),
    title: readString((stream.tags as Record<string, unknown> | undefined)?.title),
    bitRate: readNumber(stream.bit_rate),
    width: readNumber(stream.width),
    height: readNumber(stream.height),
    frameRate: parseFrameRate(stream.avg_frame_rate ?? stream.r_frame_rate),
    level: readNumber(stream.level),
    bitDepth: readNumber(stream.bits_per_raw_sample ?? stream.bits_per_sample),
    hdr: normalizeHdr(stream),
    colorPrimaries: readString(stream.color_primaries),
    colorTransfer: readString(stream.color_transfer),
    colorSpace: readString(stream.color_space),
  }
}

function normalizeAudioStream(stream: Record<string, unknown>): MediaAudioRecord {
  return {
    codec: readString(stream.codec_name),
    profile: readString(stream.profile),
    language: readString((stream.tags as Record<string, unknown> | undefined)?.language),
    title: readString((stream.tags as Record<string, unknown> | undefined)?.title),
    bitRate: readNumber(stream.bit_rate),
    channels: readNumber(stream.channels),
    channelLayout: readString(stream.channel_layout),
    sampleRate: readNumber(stream.sample_rate),
  }
}

function normalizeSubtitleStream(stream: Record<string, unknown>): MediaSubtitleRecord {
  const disposition = stream.disposition as Record<string, unknown> | undefined

  return {
    codec: readString(stream.codec_name),
    profile: readString(stream.profile),
    language: readString((stream.tags as Record<string, unknown> | undefined)?.language),
    title: readString((stream.tags as Record<string, unknown> | undefined)?.title),
    default: disposition?.default === 1,
    forced: disposition?.forced === 1,
  }
}

function normalizeHdr(stream: Record<string, unknown>) {
  const colorTransfer = readString(stream.color_transfer)
  const colorPrimaries = readString(stream.color_primaries)

  if (colorTransfer === 'smpte2084' || colorPrimaries === 'bt2020') {
    return 'hdr10'
  }

  return null
}

function parseFrameRate(value: unknown) {
  const raw = readString(value)

  if (!raw) {
    return null
  }

  if (!raw.includes('/')) {
    return readNumber(raw)
  }

  const [numeratorRaw, denominatorRaw] = raw.split('/')
  const numerator = Number.parseFloat(numeratorRaw)
  const denominator = Number.parseFloat(denominatorRaw)

  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null
  }

  return numerator / denominator
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}
