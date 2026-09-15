import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, sep } from 'node:path'

import { parseFile } from 'music-metadata'
import sharp from 'sharp'

import { type ProbedFile, buildBook, coverPath, parseOverride } from './build.js'
import { bookId } from './ids.js'
import { audioMime, isCoverFile, naturalCompare } from './naming.js'
import type { Book, BookLocation, ScanResult } from './types.js'
import { SCHEMA_VERSION } from './types.js'

const MAX_DEPTH = 4
const ADDED_AT_FILE = 'added-at.json'
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

/**
 * Fingerabdruck der Cover-Quelle.
 *
 * Bewusst die Quelle und nicht das erzeugte JPEG: Das wird bei jedem Scan neu
 * geschrieben und bekäme jedes Mal eine neue Änderungszeit – die Adresse würde
 * sich dann grundlos ändern und jeden Browser-Cache verwerfen.
 */
async function coverVersionOf(sourcePath: string): Promise<string | null> {
  try {
    const stats = await stat(sourcePath)
    return createHash('sha1')
      .update(`${String(stats.size)}:${String(stats.mtimeMs)}`, 'utf8')
      .digest('hex')
      .slice(0, 8)
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

/**
 * Ordnernamen, die nichts über den Inhalt sagen: `CD1`, `Teil 2`, `01`.
 *
 * Vierstellige Zahlen bleiben aussen vor – `2019` unter „Adventskalender" ist
 * eine Jahresangabe und damit sehr wohl eine Aussage.
 */
function isDiscFolder(name: string): boolean {
  return /^(cd|disc|disk|teil|part|folge|track)?[\s._-]*\d{1,3}$/i.test(name.trim())
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
  knownAddedAt: ReadonlyMap<string, string>,
  /**
   * Der Ordner, unter dessen Namen das Buch erscheint.
   *
   * Normalerweise der Ordner mit den Dateien selbst. Steckt das Buch aber in
   * einem nichtssagenden Unterordner („CD1"), ist es der Ordner darüber –
   * sonst hiesse die Folge in der Bibliothek „CD1".
   */
  presentedAs: string = folder,
): Promise<{ book: Book; location: BookLocation } | null> {
  const { mediaRoot, cacheDir } = options
  const relativePath = relative(mediaRoot, folder)
  const anzeigePfad = relative(mediaRoot, presentedAs)
  const parent = dirname(anzeigePfad)
  // Alle Ordner über dem Buch: der oberste ist die Reihe, alles darunter eine
  // Gruppe darin („Adventskalender", „Mini-Fälle").
  const folderChain = parent === '.' || parent === '' ? [] : parent.split(sep)

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

  const id = bookId(relativePath)

  // Ein bereits bekanntes Buch behält seinen Zeitpunkt. Sonst würde jeder
  // Sechs-Stunden-Scan die ganze Bibliothek als „neu dazugekommen" markieren
  // und die Sortierung auf dem Startbildschirm wertlos machen.
  const addedAt =
    knownAddedAt.get(id) ??
    (await stat(folder)
      .then((stats) => new Date(stats.mtimeMs).toISOString())
      .catch(() => (options.now?.() ?? new Date()).toISOString()))

  // Erst ohne Cover bauen, um die ID zu bekommen – der Cover-Dateiname hängt
  // daran.
  const withoutCover = buildBook({
    // Die Kennung hängt am echten Ordner, nicht am angezeigten: Sie muss über
    // Scans hinweg gleich bleiben, sonst verliert jedes Kind seinen
    // Fortschritt.
    relativePath,
    folderName: basename(presentedAs),
    folderChain,
    files,
    coverAvailable: false,
    coverVersion: null,
    override,
    addedAt,
  })

  let writtenCover: string | null = null
  let coverVersion: string | null = null

  if (contents.cover !== null) {
    const source = join(folder, contents.cover)
    writtenCover = await writeCover(withoutCover.id, cacheDir, source)
    coverVersion = await coverVersionOf(source)
  } else if (embeddedPictureFrom !== null) {
    try {
      const metadata = await parseFile(embeddedPictureFrom)
      const picture = metadata.common.picture?.[0]
      if (picture) {
        writtenCover = await writeCover(withoutCover.id, cacheDir, Buffer.from(picture.data))
        coverVersion = await coverVersionOf(embeddedPictureFrom)
      }
    } catch {
      writtenCover = null
    }
  }

  const book: Book =
    writtenCover === null
      ? withoutCover
      : { ...withoutCover, cover: coverPath(withoutCover.id, coverVersion) }

  return { book, location: { id: book.id, filePaths, coverPath: writtenCover } }
}

async function walk(
  folder: string,
  depth: number,
  options: ScanOptions,
  collected: { books: Book[]; locations: Map<string, BookLocation> },
  knownAddedAt: ReadonlyMap<string, string>,
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
    const result = await scanBook(folder, contents, options, knownAddedAt)
    if (result) {
      collected.books.push(result.book)
      collected.locations.set(result.book.id, result.location)
    }
    return
  }

  // Ein einzelner Unterordner ohne eigene Aussage („CD1", „Teil 2", „01")
  // gehört nicht in die Bibliothek: Die Folge heisst nach dem Ordner darüber.
  if (contents.subdirectories.length === 1 && isDiscFolder(contents.subdirectories[0]!)) {
    const innerPath = join(folder, contents.subdirectories[0]!)
    try {
      const inner = await readFolder(innerPath)
      if (inner.audio.length > 0) {
        const result = await scanBook(innerPath, inner, options, knownAddedAt, folder)
        if (result) {
          collected.books.push(result.book)
          collected.locations.set(result.book.id, result.location)
        }
        return
      }
    } catch {
      // Nicht lesbar: dann eben den gewöhnlichen Weg weiter unten.
    }
  }

  for (const name of contents.subdirectories) {
    await walk(join(folder, name), depth + 1, options, collected, knownAddedAt)
  }
}

/** Sortiert für die Anzeige: Reihen zusammen, darin nach Gruppe und Nummer, sonst nach Titel. */
export function sortBooks(books: readonly Book[]): Book[] {
  return [...books].sort((a, b) => {
    const seriesCompare = (a.series ?? '').localeCompare(b.series ?? '', 'de')
    if (seriesCompare !== 0) return seriesCompare
    const groupCompare = (a.group ?? '').localeCompare(b.group ?? '', 'de')
    if (groupCompare !== 0) return groupCompare
    if (a.seriesIndex !== null && b.seriesIndex !== null && a.seriesIndex !== b.seriesIndex) {
      return a.seriesIndex - b.seriesIndex
    }
    return a.title.localeCompare(b.title, 'de')
  })
}

/**
 * Wann ein Buch zum ersten Mal im Katalog auftauchte.
 *
 * Liegt im Cache-Volume und überlebt damit Neustarts – ohne das bekäme nach
 * jedem Container-Neustart die ganze Bibliothek denselben Zeitpunkt.
 */
async function readKnownAddedAt(cacheDir: string): Promise<Map<string, string>> {
  try {
    const raw: unknown = JSON.parse(await readFile(join(cacheDir, ADDED_AT_FILE), 'utf8'))
    if (typeof raw !== 'object' || raw === null) return new Map()
    return new Map(
      Object.entries(raw as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    )
  } catch {
    return new Map()
  }
}

export async function scanLibrary(options: ScanOptions): Promise<ScanResult> {
  await mkdir(join(options.cacheDir, 'meta'), { recursive: true })
  await mkdir(join(options.cacheDir, 'covers'), { recursive: true })

  const knownAddedAt = await readKnownAddedAt(options.cacheDir)
  const collected = { books: [] as Book[], locations: new Map<string, BookLocation>() }
  await walk(options.mediaRoot, 0, options, collected, knownAddedAt)

  await writeFile(
    join(options.cacheDir, ADDED_AT_FILE),
    JSON.stringify(Object.fromEntries(collected.books.map((book) => [book.id, book.addedAt]))),
    'utf8',
  ).catch(() => {
    // Ohne die Datei wirken beim nächsten Start alle Bücher gleich alt –
    // ärgerlich, aber kein Grund, den Scan scheitern zu lassen.
  })

  return {
    catalog: {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: (options.now?.() ?? new Date()).toISOString(),
      books: sortBooks(collected.books),
    },
    locations: collected.locations,
  }
}
