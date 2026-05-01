import fs from 'node:fs/promises'
import path from 'node:path'
import type { HyperModuleConfig } from '../../base/hyper/types'
import { withConfigDatabase } from '../../base/config-store'
import { listDownloadedResourceRecordsForDrive } from '../download/service'

export interface MovieRecord {
  driveKey: string
  resourcePath: string
  title?: string
  originalTitle?: string
  plot?: string
  year?: number
  premiered?: string
  rating?: number
  posterPath?: string
  fanartPath?: string
  nfoPath?: string
  indexedAt: number
}

interface IndexedMovieRecord extends MovieRecord {
  sourceUpdatedAt: number
}

interface SidecarRecord {
  resourcePath: string
  targetPath: string
  updatedAt: number
}

export async function rebuildMovieIndexForDrive(
  hyper: HyperModuleConfig,
  driveKey: string,
) {
  const normalizedKey = driveKey.trim().toLowerCase()
  const records = await listDownloadedResourceRecordsForDrive(hyper, normalizedKey)
  const sidecarFiles = records.filter((record) => (
    record.kind === 'file'
    && isMovieSidecarPath(record.resourcePath)
  ))

  const grouped = new Map<string, SidecarRecord[]>()
  for (const record of sidecarFiles) {
    const directoryPath = path.posix.dirname(record.resourcePath)
    const list = grouped.get(directoryPath) ?? []
    list.push({
      resourcePath: record.resourcePath,
      targetPath: record.targetPath,
      updatedAt: record.updatedAt,
    })
    grouped.set(directoryPath, list)
  }

  const nextMovies = (await Promise.all(
    Array.from(grouped.entries()).map(async ([resourcePath, files]) => buildIndexedMovieRecord(normalizedKey, resourcePath, files)),
  )).filter((record): record is IndexedMovieRecord => Boolean(record))

  withConfigDatabase(hyper.storeDir, (db) => {
    const deleteExisting = db.prepare(`
      DELETE FROM movies
      WHERE drive_key = ?
    `)
    const insertMovie = db.prepare(`
      INSERT INTO movies (
        drive_key, resource_path, title, original_title, plot, year,
        premiered, rating, poster_path, fanart_path, nfo_path,
        source_updated_at, indexed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(drive_key, resource_path) DO UPDATE SET
        title = excluded.title,
        original_title = excluded.original_title,
        plot = excluded.plot,
        year = excluded.year,
        premiered = excluded.premiered,
        rating = excluded.rating,
        poster_path = excluded.poster_path,
        fanart_path = excluded.fanart_path,
        nfo_path = excluded.nfo_path,
        source_updated_at = excluded.source_updated_at,
        indexed_at = excluded.indexed_at
    `)

    deleteExisting.run(normalizedKey)

    for (const movie of nextMovies) {
      insertMovie.run(
        movie.driveKey,
        movie.resourcePath,
        movie.title ?? null,
        movie.originalTitle ?? null,
        movie.plot ?? null,
        movie.year ?? null,
        movie.premiered ?? null,
        movie.rating ?? null,
        movie.posterPath ?? null,
        movie.fanartPath ?? null,
        movie.nfoPath ?? null,
        movie.sourceUpdatedAt,
        movie.indexedAt,
      )
    }
  })

  return nextMovies
}

export async function deleteMoviesForDrive(
  hyper: HyperModuleConfig,
  driveKey: string,
) {
  const normalizedKey = driveKey.trim().toLowerCase()
  withConfigDatabase(hyper.storeDir, (db) => {
    db.prepare(`
      DELETE FROM movies
      WHERE drive_key = ?
    `).run(normalizedKey)
  })
}

export async function listMovies(
  hyper: HyperModuleConfig,
): Promise<MovieRecord[]> {
  return withConfigDatabase(hyper.storeDir, (db) => (
    db.prepare(`
      SELECT
        drive_key,
        resource_path,
        title,
        original_title,
        plot,
        year,
        premiered,
        rating,
        poster_path,
        fanart_path,
        nfo_path,
        indexed_at
      FROM movies
      ORDER BY indexed_at DESC, title COLLATE NOCASE ASC, resource_path ASC
    `).all().map((record) => ({
      driveKey: String((record as Record<string, unknown>).drive_key),
      resourcePath: String((record as Record<string, unknown>).resource_path),
      title: normalizeOptionalText((record as Record<string, unknown>).title),
      originalTitle: normalizeOptionalText((record as Record<string, unknown>).original_title),
      plot: normalizeOptionalText((record as Record<string, unknown>).plot),
      year: normalizeOptionalNumber((record as Record<string, unknown>).year),
      premiered: normalizeOptionalText((record as Record<string, unknown>).premiered),
      rating: normalizeOptionalNumber((record as Record<string, unknown>).rating),
      posterPath: normalizeOptionalText((record as Record<string, unknown>).poster_path),
      fanartPath: normalizeOptionalText((record as Record<string, unknown>).fanart_path),
      nfoPath: normalizeOptionalText((record as Record<string, unknown>).nfo_path),
      indexedAt: Number((record as Record<string, unknown>).indexed_at),
    }))
  ))
}

async function buildIndexedMovieRecord(
  driveKey: string,
  resourcePath: string,
  files: SidecarRecord[],
): Promise<IndexedMovieRecord | null> {
  const poster = files.find((file) => path.posix.basename(file.resourcePath).toLowerCase() === 'poster.jpg')
  const fanart = files.find((file) => path.posix.basename(file.resourcePath).toLowerCase() === 'fanart.jpg')
  const nfoCandidates = files
    .filter((file) => path.posix.basename(file.resourcePath).toLowerCase().endsWith('.nfo'))
    .sort((left, right) => {
      const leftName = path.posix.basename(left.resourcePath).toLowerCase()
      const rightName = path.posix.basename(right.resourcePath).toLowerCase()

      if (leftName === 'movie.nfo' && rightName !== 'movie.nfo') return -1
      if (rightName === 'movie.nfo' && leftName !== 'movie.nfo') return 1
      return leftName.localeCompare(rightName, 'zh-CN')
    })
  const nfo = nfoCandidates[0]

  if (!poster && !fanart && !nfo) {
    return null
  }

  const nfoMetadata = nfo ? await readNfoMetadata(nfo.targetPath) : null
  const sourceUpdatedAt = await getLatestUpdatedAt(files)
  const indexedAt = Date.now()

  return {
    driveKey,
    resourcePath,
    title: nfoMetadata?.title ?? path.posix.basename(resourcePath),
    originalTitle: nfoMetadata?.originalTitle,
    plot: nfoMetadata?.plot,
    year: nfoMetadata?.year,
    premiered: nfoMetadata?.premiered,
    rating: nfoMetadata?.rating,
    posterPath: poster?.resourcePath,
    fanartPath: fanart?.resourcePath,
    nfoPath: nfo?.resourcePath,
    sourceUpdatedAt,
    indexedAt,
  }
}

async function getLatestUpdatedAt(files: SidecarRecord[]) {
  const mtimes = await Promise.all(files.map(async (file) => {
    try {
      const stats = await fs.stat(file.targetPath)
      return Math.floor(stats.mtimeMs)
    } catch {
      return file.updatedAt
    }
  }))

  return mtimes.reduce((latest, value) => Math.max(latest, value), 0) || Date.now()
}

async function readNfoMetadata(nfoPath: string) {
  try {
    const raw = await fs.readFile(nfoPath, 'utf8')

    return {
      title: readNfoTag(raw, 'title'),
      originalTitle: readNfoTag(raw, 'originaltitle'),
      plot: readNfoTag(raw, 'plot'),
      premiered: readNfoTag(raw, 'premiered'),
      year: readNfoInteger(raw, 'year'),
      rating: readNfoFloat(raw, 'rating'),
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }

    throw error
  }
}

function readNfoTag(xml: string, tagName: string) {
  const matched = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'i').exec(xml)

  if (!matched?.[1]) {
    return undefined
  }

  const value = matched[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()

  return value || undefined
}

function readNfoInteger(xml: string, tagName: string) {
  const value = readNfoTag(xml, tagName)
  if (!value) {
    return undefined
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

function readNfoFloat(xml: string, tagName: string) {
  const value = readNfoTag(xml, tagName)
  if (!value) {
    return undefined
  }

  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function isMovieSidecarPath(resourcePath: string) {
  const baseName = path.posix.basename(resourcePath).toLowerCase()
  return baseName === 'poster.jpg' || baseName === 'fanart.jpg' || baseName.endsWith('.nfo')
}

function normalizeOptionalText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeOptionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
