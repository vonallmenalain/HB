import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, sep } from 'node:path'

import { parseFile } from 'music-metadata'

import { type BookOverride, type ProbedFile, buildBook, coverPath, parseOverride } from './build.js'
import {
  coverVersionOf,
  manualCoverPath,
  onlineCoverPath,
  scannedCoverPath,
  writeCover,
} from './cover.js'
import { bookId } from './ids.js'
import { audioMime, formatSeriesIndex, isCoverFile, naturalCompare } from './naming.js'
import { type Structure, readStructure } from './settings.js'
import {
  isDiscFolder,
  overrideForEpisode,
  partsOfOneBook,
  splitsIntoEpisodes,
} from './structure.js'
import type { Book, BookLocation, ScanResult } from './types.js'
import { SCHEMA_VERSION } from './types.js'

const MAX_DEPTH = 4
const ADDED_AT_FILE = 'added-at.json'
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
  /**
   * Liegt das Buch unmittelbar in `folder` – und lässt es sich damit umstellen?
   *
   * Nur der Zweig für Ordner mit eigenen Audiodateien liest die Einstellung
   * aus dem Adminbereich. Für ein Buch aus CD-Ordnern wäre der Knopf dort eine
   * Zusage, die niemand einlöst.
   */
  switchable: boolean
}

/** Die Ordner über einem Pfad, vom Medien-Stamm abwärts. */
function chainOf(mediaRoot: string, path: string): string[] {
  const parent = dirname(relative(mediaRoot, path))
  return parent === '.' || parent === '' ? [] : parent.split(sep)
}

async function scanBook(
  source: BookSource,
  run: ScanRun,
): Promise<{ book: Book; location: BookLocation } | null> {
  const { options, knownAddedAt } = run
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
  const target = scannedCoverPath(cacheDir, withoutCover.id)

  if (source.coverFile !== null) {
    writtenCover = await writeCover(target, source.coverFile)
    coverVersion = await coverVersionOf(source.coverFile)
  } else if (embeddedPictureFrom !== null) {
    try {
      const metadata = await parseFile(embeddedPictureFrom)
      const picture = metadata.common.picture?.[0]
      if (picture) {
        writtenCover = await writeCover(target, Buffer.from(picture.data))
        coverVersion = await coverVersionOf(embeddedPictureFrom)
      }
    } catch {
      writtenCover = null
    }
  }

  const scannedCover =
    writtenCover === null ? null : coverPath(withoutCover.id, coverVersion)

  // Drei Stufen, in dieser Reihenfolge: von Hand hochgeladen, online gefunden,
  // auf dem NAS gefunden. Wer von Hand etwas hinlegt, hat sich das Buch
  // angesehen – eine Suche hat nur gerechnet, und der Ordner hatte seine
  // Gelegenheit. Beide oberen Stufen liegen in eigenen Ordnern und überleben
  // den Scan, der `covers/` bei jedem Lauf neu schreibt.
  const manualVersion = await coverVersionOf(manualCoverPath(cacheDir, withoutCover.id))
  const onlineVersion =
    manualVersion === null
      ? await coverVersionOf(onlineCoverPath(cacheDir, withoutCover.id))
      : null
  const eigene = manualVersion ?? onlineVersion
  const cover = eigene === null ? scannedCover : coverPath(withoutCover.id, eigene)

  const book: Book = cover === null ? withoutCover : { ...withoutCover, cover }

  return {
    book,
    location: {
      id: book.id,
      folder: relative(options.mediaRoot, source.folder),
      switchable: source.switchable,
      filePaths,
      coverPath: writtenCover,
      scannedCover,
    },
  }
}

interface Collected {
  books: Book[]
  locations: Map<string, BookLocation>
}

/**
 * Was während eines Scans überall gebraucht wird.
 *
 * Gebündelt statt einzeln durchgereicht: Sonst trüge jede Funktion hier unten
 * fünf Parameter, von denen sie vier nur weitergibt.
 */
interface ScanRun {
  options: ScanOptions
  collected: Collected
  knownAddedAt: ReadonlyMap<string, string>
  /** Was der Adminbereich über einzelne Ordner sagt. */
  structure: Structure
}

async function collect(source: BookSource, run: ScanRun): Promise<void> {
  const result = await scanBook(source, run)
  if (!result) return
  run.collected.books.push(result.book)
  run.collected.locations.set(result.book.id, result.location)
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
  run: ScanRun,
): Promise<void> {
  const { options } = run
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
        switchable: true,
      },
      run,
    )
  }

  options.onNotice?.(
    `Einzelfolgen: ${relativeFolder} – ${String(contents.audio.length)} Hörbücher`,
  )
}

function coverOf(folder: string, contents: FolderContents): string | null {
  return contents.cover === null ? null : join(folder, contents.cover)
}

/**
 * Liest die Unterordner eines Ordners ein.
 *
 * Einmal, nicht zweimal: Ob ein Werk über CD-Ordner verteilt liegt, hängt
 * daran, wo Ton liegt – und danach wird in dieselben Ordner hinabgestiegen.
 * Ohne das Zwischenergebnis läse der Scanner jeden Ordner der Bibliothek
 * doppelt.
 */
async function readChildren(
  folder: string,
  names: readonly string[],
  run: ScanRun,
): Promise<Map<string, FolderContents>> {
  const children = new Map<string, FolderContents>()
  for (const name of names) {
    try {
      children.set(name, await readFolder(join(folder, name)))
    } catch (error) {
      run.options.onNotice?.(
        `Ordner nicht lesbar: ${join(folder, name)} (${
          error instanceof Error ? error.message : 'Fehler'
        })`,
      )
    }
  }
  return children
}

async function walk(
  folder: string,
  depth: number,
  run: ScanRun,
  /** Schon gelesen, wenn der Aufrufer den Ordner für seine Entscheidung brauchte. */
  known?: FolderContents,
): Promise<void> {
  const { options } = run
  if (depth > MAX_DEPTH) return

  let contents: FolderContents
  if (known) {
    contents = known
  } else {
    try {
      contents = await readFolder(folder)
    } catch (error) {
      options.onNotice?.(
        `Ordner nicht lesbar: ${folder} (${error instanceof Error ? error.message : 'Fehler'})`,
      )
      return
    }
  }

  const override = contents.audio.length > 0 ? await readOverride(folder) : null

  // Neunzig Folgen als neunzig Dateien: Das ist angesagt, nicht geraten – und
  // die Ansage gilt für die Dateien in genau diesem Ordner.
  if (
    contents.audio.length > 0 &&
    splitsIntoEpisodes(override, run.structure.get(relative(options.mediaRoot, folder)))
  ) {
    await collectEpisodes(folder, contents, override, run)
    return
  }

  const children =
    depth < MAX_DEPTH
      ? await readChildren(folder, contents.subdirectories, run)
      : new Map<string, FolderContents>()
  const mitTon = [...children].filter(([, inner]) => inner.audio.length > 0).map(([name]) => name)

  /** Was bleibt, nachdem ein Zweig ein paar Unterordner für sich beansprucht hat. */
  const weiterUnten = async (verbraucht: readonly string[]): Promise<void> => {
    for (const name of contents.subdirectories) {
      if (verbraucht.includes(name)) continue
      await walk(join(folder, name), depth + 1, run, children.get(name))
    }
  }

  // Ein Buch, das über `CD 1` … `CD 20` verteilt liegt, ist ein Buch und nicht
  // zwanzig. Was daneben liegt, bleibt davon unberührt.
  const teile = partsOfOneBook(mitTon)
  if (teile.length > 0) {
    // Was lose im Ordner liegt, gehört zum selben Buch – sonst fiele es hier
    // stillschweigend heraus.
    const audio: AudioEntry[] = contents.audio.map((fileName) => ({
      path: join(folder, fileName),
      fileName,
      discName: null,
    }))
    let coverFile = coverOf(folder, contents)

    for (const teil of teile) {
      const inner = children.get(teil)!
      const innerPath = join(folder, teil)
      for (const fileName of inner.audio) {
        audio.push({ path: join(innerPath, fileName), fileName, discName: teil })
      }
      coverFile ??= coverOf(innerPath, inner)
    }

    await collect(
      {
        folder,
        idPath: relative(options.mediaRoot, folder),
        displayName: basename(folder),
        folderChain: chainOf(options.mediaRoot, folder),
        audio,
        coverFile,
        override: override ?? (await readOverride(folder)),
        addedAtFrom: folder,
        // Der Zweig hier liest keine Einstellung aus dem Adminbereich; ein Knopf
        // dort wäre eine Zusage, die niemand einlöst.
        switchable: false,
      },
      run,
    )
    await weiterUnten(teile)
    return
  }

  // Ein Ordner mit Audiodateien ist ein Buch. Einer ohne ist eine Reihe oder
  // schlicht Ablage – dann weiter nach unten.
  if (contents.audio.length > 0) {
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
        switchable: true,
      },
      run,
    )
    return
  }

  // Ein einzelner Unterordner ohne eigene Aussage („CD1", „Teil 2", „01")
  // gehört nicht in die Bibliothek: Die Folge heisst nach dem Ordner darüber.
  const einziger = mitTon.length === 1 ? mitTon[0] : undefined
  if (einziger !== undefined && isDiscFolder(einziger)) {
    const innen = children.get(einziger)!
    const innerPath = join(folder, einziger)
    await collect(
      {
        folder: innerPath,
        // Die ID hängt am Ordner mit den Dateien, der Name am Ordner
        // darüber: Sonst hiesse die Folge in der Bibliothek „CD1".
        idPath: relative(options.mediaRoot, innerPath),
        displayName: basename(folder),
        folderChain: chainOf(options.mediaRoot, folder),
        audio: innen.audio.map((fileName) => ({
          path: join(innerPath, fileName),
          fileName,
          discName: null,
        })),
        coverFile: coverOf(folder, contents) ?? coverOf(innerPath, innen),
        override: (await readOverride(innerPath)) ?? (await readOverride(folder)),
        addedAtFrom: innerPath,
        switchable: false,
      },
      run,
    )
    await weiterUnten([einziger])
    return
  }

  await weiterUnten([])
}

/**
 * Wonach ein Buch in seiner Reihe einsortiert wird.
 *
 * Bewusst dasselbe, was auch auf der Kachel steht: „01 - Die Handy-Falle".
 * Verglichen wurde früher die erkannte Nummer und sonst der Titel – aber der
 * Titel eines erkannten Buchs hat seine Nummer nicht mehr, der eines nicht
 * erkannten schon. „50A - Freundinnen in Gefahr" landete damit vor „01 - Die
 * Handy-Falle", weil eine Ziffer vor einem Buchstaben steht.
 */
function orderKey(book: Book): string {
  return book.seriesIndex === null
    ? book.title
    : `${formatSeriesIndex(book.seriesIndex)} ${book.title}`
}

/** Sortiert für die Anzeige: Reihen zusammen, darin nach Gruppe und Nummer, sonst nach Titel. */
export function sortBooks(books: readonly Book[]): Book[] {
  return [...books].sort((a, b) => {
    const seriesCompare = (a.series ?? '').localeCompare(b.series ?? '', 'de')
    if (seriesCompare !== 0) return seriesCompare
    const groupCompare = (a.group ?? '').localeCompare(b.group ?? '', 'de')
    if (groupCompare !== 0) return groupCompare
    // Natürlich, nicht alphabetisch: Sonst stünde Folge 10 vor Folge 2 und
    // Folge 100 vor Folge 20.
    return naturalCompare(orderKey(a), orderKey(b))
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
  // Hochgeladene und online gefundene Cover liegen getrennt von den erzeugten:
  // Der Scan schreibt `covers/` bei jedem Lauf neu.
  await mkdir(join(options.cacheDir, 'manual'), { recursive: true })
  await mkdir(join(options.cacheDir, 'online'), { recursive: true })

  const collected: Collected = { books: [], locations: new Map() }
  const run: ScanRun = {
    options,
    collected,
    knownAddedAt: await readKnownAddedAt(options.cacheDir),
    structure: await readStructure(options.cacheDir),
  }
  await walk(options.mediaRoot, 0, run)

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
