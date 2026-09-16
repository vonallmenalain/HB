import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, sep } from 'node:path'

import { parseFile } from 'music-metadata'
import sharp from 'sharp'

import { type BookOverride, type ProbedFile, buildBook, coverPath, parseOverride } from './build.js'
import { bookId } from './ids.js'
import { audioMime, isCoverFile, naturalCompare } from './naming.js'
import {
  isDiscFolder,
  isSplitAcrossParts,
  overrideForEpisode,
  splitsIntoEpisodes,
} from './structure.js'
import type { Book, BookLocation, ScanResult } from './types.js'
import { SCHEMA_VERSION } from './types.js'

const MAX_DEPTH = 4
const ADDED_AT_FILE = 'added-at.json'
const COVER_MAX_PIXELS = 600
const OVERRIDE_FILE = 'buch.json'
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']

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

async function readOverride(folder: string): Promise<BookOverride | null> {
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

interface FolderContents {
  audio: string[]
  cover: string | null
  /** Alle Bilddateien im Ordner – auch die, die keine `cover.jpg` sind. */
  images: string[]
  subdirectories: string[]
}

async function readFolder(folder: string): Promise<FolderContents> {
  const entries = await readdir(folder, { withFileTypes: true })
  const audio: string[] = []
  const images: string[] = []
  const subdirectories: string[] = []
  let cover: string | null = null

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (entry.isDirectory()) {
      subdirectories.push(entry.name)
    } else if (entry.isFile()) {
      if (audioMime(entry.name) !== null) audio.push(entry.name)
      else {
        const dot = entry.name.lastIndexOf('.')
        if (dot >= 0 && IMAGE_EXTENSIONS.includes(entry.name.slice(dot).toLowerCase())) {
          images.push(entry.name)
        }
        if (cover === null && isCoverFile(entry.name)) cover = entry.name
      }
    }
  }

  audio.sort(naturalCompare)
  images.sort(naturalCompare)
  subdirectories.sort(naturalCompare)
  return { audio, cover, images, subdirectories }
}

function withoutExtension(fileName: string): string {
  return fileName.replace(/\.[a-z0-9]+$/i, '')
}

/**
 * Das Bild, das neben einer Audiodatei liegt und genauso heisst.
 *
 * `001 - Die Handy-Falle.mp3` neben `001 - Die Handy-Falle.jpg`: So lässt sich
 * einer einzelnen Folge ein Cover mitgeben, ohne die Datei selbst anzufassen –
 * für Ordner, in denen jede Datei ein eigenes Hörbuch ist.
 */
function coverBeside(fileName: string, images: readonly string[]): string | null {
  const base = withoutExtension(fileName).toLowerCase()
  return images.find((image) => withoutExtension(image).toLowerCase() === base) ?? null
}

/** Eine Audiodatei, wie der Scanner sie gefunden hat. */
interface AudioEntry {
  /** Absoluter Pfad. */
  path: string
  fileName: string
  /** Teil-Ordner, aus dem sie stammt („CD 3"), sonst null. */
  discName: string | null
}

/** Ein Buch, bevor es gelesen ist: woher es kommt und wie es heissen soll. */
interface BookSource {
  /** Ordner, aus dem `buch.json` und der Zeitpunkt kommen. */
  folder: string
  /** Pfad relativ zum Stamm, aus dem die dauerhafte ID entsteht. */
  idPath: string
  /** Name, unter dem das Buch in der Bibliothek erscheint. */
  displayName: string
  /** Ordner darüber, von oben nach unten – der oberste ist die Reihe. */
  folderChain: string[]
  audio: AudioEntry[]
  /** Absoluter Pfad eines Bildes, das als Cover dienen soll. */
  coverFile: string | null
  override: BookOverride | null
  /** Was den Zeitpunkt „dazugekommen" bestimmt, wenn er noch nicht bekannt ist. */
  addedAtFrom: string
}

/** Die Ordner über einem Pfad, vom Medien-Stamm abwärts. */
function chainOf(mediaRoot: string, path: string): string[] {
  const parent = dirname(relative(mediaRoot, path))
  return parent === '.' || parent === '' ? [] : parent.split(sep)
}

async function scanBook(
  source: BookSource,
  options: ScanOptions,
  knownAddedAt: ReadonlyMap<string, string>,
): Promise<{ book: Book; location: BookLocation } | null> {
  const { cacheDir } = options

  const files: ProbedFile[] = []
  const filePaths: string[] = []
  let embeddedPictureFrom: string | null = null

  for (const entry of source.audio) {
    try {
      const stats = await stat(entry.path)
      const probed = await probe(entry.path, stats.size, stats.mtimeMs, cacheDir)
      files.push({
        fileName: entry.fileName,
        bytes: stats.size,
        durationSec: probed.durationSec,
        mime: audioMime(entry.fileName) ?? 'application/octet-stream',
        tagTitle: probed.tagTitle,
        tagArtist: probed.tagArtist,
        tagAlbumArtist: probed.tagAlbumArtist,
        discName: entry.discName,
      })
      filePaths.push(entry.path)
      if (probed.hasPicture && embeddedPictureFrom === null) embeddedPictureFrom = entry.path
    } catch (error) {
      options.onNotice?.(
        `Übersprungen: ${entry.path} (${error instanceof Error ? error.message : 'Lesefehler'})`,
      )
    }
  }

  if (files.length === 0) return null
  if (source.override?.hidden === true) return null

  const id = bookId(source.idPath)

  // Ein bereits bekanntes Buch behält seinen Zeitpunkt. Sonst würde jeder
  // Sechs-Stunden-Scan die ganze Bibliothek als „neu dazugekommen" markieren
  // und die Sortierung auf dem Startbildschirm wertlos machen.
  const addedAt =
    knownAddedAt.get(id) ??
    (await stat(source.addedAtFrom)
      .then((stats) => new Date(stats.mtimeMs).toISOString())
      .catch(() => (options.now?.() ?? new Date()).toISOString()))

  // Erst ohne Cover bauen, um die ID zu bekommen – der Cover-Dateiname hängt
  // daran.
  const withoutCover = buildBook({
    // Die Kennung hängt am echten Pfad, nicht am angezeigten Namen: Sie muss
    // über Scans hinweg gleich bleiben, sonst verliert jedes Kind seinen
    // Fortschritt.
    relativePath: source.idPath,
    folderName: source.displayName,
    folderChain: source.folderChain,
    files,
    coverAvailable: false,
    coverVersion: null,
    override: source.override,
    addedAt,
  })

  let writtenCover: string | null = null
  let coverVersion: string | null = null

  if (source.coverFile !== null) {
    writtenCover = await writeCover(withoutCover.id, cacheDir, source.coverFile)
    coverVersion = await coverVersionOf(source.coverFile)
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

interface Collected {
  books: Book[]
  locations: Map<string, BookLocation>
}

async function collect(
  source: BookSource,
  options: ScanOptions,
  collected: Collected,
  knownAddedAt: ReadonlyMap<string, string>,
): Promise<void> {
  const result = await scanBook(source, options, knownAddedAt)
  if (!result) return
  collected.books.push(result.book)
  collected.locations.set(result.book.id, result.location)
}

/**
 * Jede Datei im Ordner wird ein eigenes Hörbuch.
 *
 * Der Ordner selbst rückt dabei eine Ebene hoch: Aus „Die Drei
 * Ausrufezeichen/001 - Die Handy-Falle.mp3" wird die Folge „Die Handy-Falle"
 * in der Reihe „Die Drei Ausrufezeichen". Titel und Nummer kommen aus dem
 * Dateinamen – nach denselben Regeln, nach denen sonst Ordnernamen gelesen
 * werden.
 */
async function collectEpisodes(
  folder: string,
  contents: FolderContents,
  override: BookOverride | null,
  options: ScanOptions,
  collected: Collected,
  knownAddedAt: ReadonlyMap<string, string>,
): Promise<void> {
  const relativeFolder = relative(options.mediaRoot, folder)
  const folderChain = relativeFolder === '' ? [] : relativeFolder.split(sep)
  const forEpisode = overrideForEpisode(override)

  for (const fileName of contents.audio) {
    const path = join(folder, fileName)
    const eigenes = coverBeside(fileName, contents.images)
    await collect(
      {
        folder,
        idPath: join(relativeFolder, fileName),
        displayName: withoutExtension(fileName),
        folderChain,
        audio: [{ path, fileName, discName: null }],
        // Erst das Bild mit demselben Namen, dann das Cover des Ordners: Ein
        // gemeinsames `cover.jpg` ist für neunzig Folgen besser als nichts,
        // aber schlechter als das Bild der Folge.
        coverFile: eigenes !== null ? join(folder, eigenes) : coverOf(folder, contents),
        override: forEpisode,
        // Jede Folge kommt dann dazu, wenn ihre Datei dazukommt – nicht, wenn
        // sich sonst etwas im Ordner ändert.
        addedAtFrom: path,
      },
      options,
      collected,
      knownAddedAt,
    )
  }

  options.onNotice?.(
    `Einzelfolgen: ${relativeFolder} – ${String(contents.audio.length)} Hörbücher`,
  )
}

function coverOf(folder: string, contents: FolderContents): string | null {
  return contents.cover === null ? null : join(folder, contents.cover)
}

async function walk(
  folder: string,
  depth: number,
  options: ScanOptions,
  collected: Collected,
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
    const override = await readOverride(folder)

    if (splitsIntoEpisodes(override)) {
      await collectEpisodes(folder, contents, override, options, collected, knownAddedAt)
      return
    }

    await collect(
      {
        folder,
        idPath: relative(options.mediaRoot, folder),
        displayName: basename(folder),
        folderChain: chainOf(options.mediaRoot, folder),
        audio: contents.audio.map((fileName) => ({
          path: join(folder, fileName),
          fileName,
          discName: null,
        })),
        coverFile: coverOf(folder, contents),
        override,
        addedAtFrom: folder,
      },
      options,
      collected,
      knownAddedAt,
    )
    return
  }

  // Ein Buch, das über `CD 1` … `CD 20` verteilt liegt, ist ein Buch und nicht
  // zwanzig. Zusammengefasst wird nur, wo alle Unterordner benannte Teile sind
  // – blosse Zahlen (`01`, `02`) und `Folge 3` bleiben eigene Bücher, so legen
  // manche Sammlungen ihre Folgen ab.
  if (isSplitAcrossParts(contents.subdirectories)) {
    const audio: AudioEntry[] = []
    let coverFile = coverOf(folder, contents)

    for (const teil of contents.subdirectories) {
      const innerPath = join(folder, teil)
      try {
        const inner = await readFolder(innerPath)
        for (const fileName of inner.audio) {
          audio.push({ path: join(innerPath, fileName), fileName, discName: teil })
        }
        coverFile ??= coverOf(innerPath, inner)
      } catch {
        // Nicht lesbar: Dann fehlt dieser Teil, der Rest bleibt ein Buch.
      }
    }

    if (audio.length > 0) {
      await collect(
        {
          folder,
          idPath: relative(options.mediaRoot, folder),
          displayName: basename(folder),
          folderChain: chainOf(options.mediaRoot, folder),
          audio,
          coverFile,
          override: await readOverride(folder),
          addedAtFrom: folder,
        },
        options,
        collected,
        knownAddedAt,
      )
      return
    }
  }

  // Ein einzelner Unterordner ohne eigene Aussage („CD1", „Teil 2", „01")
  // gehört nicht in die Bibliothek: Die Folge heisst nach dem Ordner darüber.
  if (contents.subdirectories.length === 1 && isDiscFolder(contents.subdirectories[0]!)) {
    const teil = contents.subdirectories[0]!
    const innerPath = join(folder, teil)
    try {
      const inner = await readFolder(innerPath)
      if (inner.audio.length > 0) {
        await collect(
          {
            folder: innerPath,
            // Die ID hängt am Ordner mit den Dateien, der Name am Ordner
            // darüber: Sonst hiesse die Folge in der Bibliothek „CD1".
            idPath: relative(options.mediaRoot, innerPath),
            displayName: basename(folder),
            folderChain: chainOf(options.mediaRoot, folder),
            audio: inner.audio.map((fileName) => ({
              path: join(innerPath, fileName),
              fileName,
              discName: null,
            })),
            coverFile: coverOf(folder, contents) ?? coverOf(innerPath, inner),
            override: (await readOverride(innerPath)) ?? (await readOverride(folder)),
            addedAtFrom: innerPath,
          },
          options,
          collected,
          knownAddedAt,
        )
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
  const collected: Collected = { books: [], locations: new Map() }
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
