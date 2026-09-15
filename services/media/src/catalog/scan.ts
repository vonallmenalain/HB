import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative } from 'node:path'

import { parseFile } from 'music-metadata'
import sharp from 'sharp'

import { type ProbedFile, buildBook, parseOverride } from './build.js'
import { audioMime, isCoverFile, naturalCompare } from './naming.js'
import type { Book, BookLocation, ScanResult } from './types.js'
import { SCHEMA_VERSION } from './types.js'

const MAX_DEPTH = 4
const COVER_MAX_PIXELS = 600
const OVERRIDE_FILE = 'buch.json'

export interface ScanOptions {
  mediaRoot: string
  cacheDir: string
  now?: () => Date
  /** Meldet Fortschritt und übersprungene Ordner. */
  onNotice?: (message: string) => void
}

interface ProbeCacheEntry {
  durationSec: number
  tagTitle: string | null
  tagArtist: string | null
  tagAlbumArtist: string | null
  hasPicture: boolean
}

/**
 * Liest die Metadaten einer Datei – gecacht nach Pfad, Grösse und Änderungszeit.
 *
 * Der Cache ist nicht optional: Bei MP3s ohne VBR-Header muss `music-metadata`
 * die ganze Datei lesen, um die Dauer zu bestimmen. Über eine gewachsene
 * Bibliothek summiert sich das zu vielen Minuten pro Scan.
 */
async function probe(
  path: string,
  size: number,
  mtimeMs: number,
  cacheDir: string,
): Promise<ProbeCacheEntry> {
  const key = createHash('sha1')
    .update(`${path}:${String(size)}:${String(mtimeMs)}`, 'utf8')
    .digest('hex')
  const cacheFile = join(cacheDir, 'meta', `${key}.json`)

  try {
    return JSON.parse(await readFile(cacheFile, 'utf8')) as ProbeCacheEntry
  } catch {
    // Kein Cache-Treffer – jetzt wirklich lesen.
  }

  const metadata = await parseFile(path, { duration: true })
  const entry: ProbeCacheEntry = {
    durationSec: metadata.format.duration ?? 0,
    tagTitle: metadata.common.title ?? null,
    tagArtist: metadata.common.artist ?? null,
    tagAlbumArtist: metadata.common.albumartist ?? null,
    hasPicture: (metadata.common.picture?.length ?? 0) > 0,
  }

  await writeFile(cacheFile, JSON.stringify(entry), 'utf8').catch(() => {
    // Ohne Cache ist der Scan nur langsamer, nicht kaputt.
  })
  return entry
}

async function readOverride(folder: string): Promise<ReturnType<typeof parseOverride>> {
  try {
    return parseOverride(JSON.parse(await readFile(join(folder, OVERRIDE_FILE), 'utf8')))
  } catch {
    return null
  }
}

/** Aufbereitetes Cover in den Cache schreiben. Liefert den Pfad oder null. */
async function writeCover(
  bookId: string,
  cacheDir: string,
  source: Buffer | string,
): Promise<string | null> {
  const target = join(cacheDir, 'covers', `${bookId}.jpg`)
  try {
    await sharp(source)
      .resize(COVER_MAX_PIXELS, COVER_MAX_PIXELS, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toFile(target)
    return target
  } catch {
    return null
  }
}

interface FolderContents {
  audio: string[]
  cover: string | null
  subdirectories: string[]
}

async function readFolder(folder: string): Promise<FolderContents> {
  const entries = await readdir(folder, { withFileTypes: true })
  const audio: string[] = []
  const subdirectories: string[] = []
  let cover: string | null = null

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (entry.isDirectory()) {
      subdirectories.push(entry.name)
    } else if (entry.isFile()) {
      if (audioMime(entry.name) !== null) audio.push(entry.name)
      else if (cover === null && isCoverFile(entry.name)) cover = entry.name
    }
  }

  audio.sort(naturalCompare)
  subdirectories.sort(naturalCompare)
  return { audio, cover, subdirectories }
}

async function scanBook(
  folder: string,
  contents: FolderContents,
  options: ScanOptions,
): Promise<{ book: Book; location: BookLocation } | null> {
  const { mediaRoot, cacheDir } = options
  const relativePath = relative(mediaRoot, folder)
  const parent = dirname(relativePath)
  const seriesFromParent = parent === '.' || parent === '' ? null : basename(parent)

  const files: ProbedFile[] = []
  const filePaths: string[] = []
  let embeddedPictureFrom: string | null = null

  for (const name of contents.audio) {
    const path = join(folder, name)
    try {
      const stats = await stat(path)
      const entry = await probe(path, stats.size, stats.mtimeMs, cacheDir)
      files.push({
        fileName: name,
        bytes: stats.size,
        durationSec: entry.durationSec,
        mime: audioMime(name) ?? 'application/octet-stream',
        tagTitle: entry.tagTitle,
        tagArtist: entry.tagArtist,
        tagAlbumArtist: entry.tagAlbumArtist,
      })
      filePaths.push(path)
      if (entry.hasPicture && embeddedPictureFrom === null) embeddedPictureFrom = path
    } catch (error) {
      options.onNotice?.(
        `Übersprungen: ${path} (${error instanceof Error ? error.message : 'Lesefehler'})`,
      )
    }
  }

  if (files.length === 0) return null

  const override = await readOverride(folder)
  if (override?.hidden === true) return null

  // Erst ohne Cover bauen, um die ID zu bekommen – der Cover-Dateiname hängt
  // daran.
  const withoutCover = buildBook({
    relativePath,
    folderName: basename(folder),
    seriesFromParent,
    files,
    coverAvailable: false,
    override,
    addedAt: (options.now?.() ?? new Date()).toISOString(),
  })

  let coverPath: string | null = null
  if (contents.cover !== null) {
    coverPath = await writeCover(withoutCover.id, cacheDir, join(folder, contents.cover))
  } else if (embeddedPictureFrom !== null) {
    try {
      const metadata = await parseFile(embeddedPictureFrom)
      const picture = metadata.common.picture?.[0]
      if (picture) {
        coverPath = await writeCover(withoutCover.id, cacheDir, Buffer.from(picture.data))
      }
    } catch {
      coverPath = null
    }
  }

  const book: Book =
    coverPath === null
      ? withoutCover
      : { ...withoutCover, cover: `/cover/${withoutCover.id}.jpg` }

  return { book, location: { id: book.id, filePaths, coverPath } }
}

async function walk(
  folder: string,
  depth: number,
  options: ScanOptions,
  collected: { books: Book[]; locations: Map<string, BookLocation> },
): Promise<void> {
  if (depth > MAX_DEPTH) return

  let contents: FolderContents
  try {
    contents = await readFolder(folder)
  } catch (error) {
    options.onNotice?.(
      `Ordner nicht lesbar: ${folder} (${error instanceof Error ? error.message : 'Fehler'})`,
    )
    return
  }

  // Ein Ordner mit Audiodateien ist ein Buch. Einer ohne ist eine Reihe oder
  // schlicht Ablage – dann weiter nach unten.
  if (contents.audio.length > 0) {
    const result = await scanBook(folder, contents, options)
    if (result) {
      collected.books.push(result.book)
      collected.locations.set(result.book.id, result.location)
    }
    return
  }

  for (const name of contents.subdirectories) {
    await walk(join(folder, name), depth + 1, options, collected)
  }
}

/** Sortiert für die Anzeige: Reihen zusammen, darin nach Nummer, sonst nach Titel. */
export function sortBooks(books: readonly Book[]): Book[] {
  return [...books].sort((a, b) => {
    const seriesCompare = (a.series ?? '').localeCompare(b.series ?? '', 'de')
    if (seriesCompare !== 0) return seriesCompare
    if (a.seriesIndex !== null && b.seriesIndex !== null && a.seriesIndex !== b.seriesIndex) {
      return a.seriesIndex - b.seriesIndex
    }
    return a.title.localeCompare(b.title, 'de')
  })
}

export async function scanLibrary(options: ScanOptions): Promise<ScanResult> {
  await mkdir(join(options.cacheDir, 'meta'), { recursive: true })
  await mkdir(join(options.cacheDir, 'covers'), { recursive: true })

  const collected = { books: [] as Book[], locations: new Map<string, BookLocation>() }
  await walk(options.mediaRoot, 0, options, collected)

  return {
    catalog: {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: (options.now?.() ?? new Date()).toISOString(),
      books: sortBooks(collected.books),
    },
    locations: collected.locations,
  }
}
