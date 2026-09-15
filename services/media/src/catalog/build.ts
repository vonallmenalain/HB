import { chapterTitle, parseBookFolder, tileColor } from './naming.js'
import { bookId, filesHash } from './ids.js'
import type { Book, BookFile, Chapter } from './types.js'

export interface ProbedFile {
  fileName: string
  bytes: number
  durationSec: number
  mime: string
  tagTitle: string | null
  tagArtist: string | null
  tagAlbumArtist: string | null
}

/** Inhalt einer optionalen `buch.json` – alle Felder freiwillig. */
export interface BookOverride {
  title?: string
  series?: string
  seriesIndex?: number
  author?: string
  narrator?: string
  tags?: string[]
  hidden?: boolean
}

export interface BookInput {
  /** Pfad relativ zum Medien-Stamm. Bestimmt die dauerhafte ID. */
  relativePath: string
  folderName: string
  seriesFromParent: string | null
  /** Bereits natürlich sortiert. */
  files: ProbedFile[]
  coverAvailable: boolean
  /** Ändert sich, sobald die Cover-Quelle wechselt – hängt in der Adresse. */
  coverVersion: string | null
  override: BookOverride | null
  addedAt: string
}

export function coverPath(bookId: string, version: string | null): string {
  const base = `/cover/${bookId}.jpg`
  return version === null ? base : `${base}?v=${version}`
}

function firstNonEmpty(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    const trimmed = value?.trim() ?? ''
    if (trimmed !== '') return trimmed
  }
  return null
}

/**
 * Baut einen Katalogeintrag aus den ausgelesenen Dateien.
 *
 * Reine Funktion ohne Dateizugriff – damit lässt sich das Zusammenspiel von
 * Ordnernamen, ID3-Tags und `buch.json` prüfen, ohne eine Bibliothek anzulegen.
 */
export function buildBook(input: BookInput): Book {
  const { override } = input
  const parsed = parseBookFolder(input.folderName)

  const title = firstNonEmpty(override?.title, parsed.title) ?? input.folderName
  const id = bookId(input.relativePath)

  const files: BookFile[] = input.files.map((file, idx) => ({
    idx,
    durationSec: Math.round(file.durationSec),
    bytes: file.bytes,
    mime: file.mime,
  }))

  // Ein Ordner mit MP3s heisst: jede Datei ist ein Kapitel. Die Grenzen sind
  // globale Sekunden im Buch, nicht relativ zur Datei – so rechnet der Player
  // später mit einer einzigen Formel.
  const chapters: Chapter[] = []
  let elapsed = 0
  input.files.forEach((file, idx) => {
    const duration = Math.round(file.durationSec)
    chapters.push({
      idx,
      title: chapterTitle(file.fileName, file.tagTitle, idx + 1),
      fileIdx: idx,
      startSec: elapsed,
      endSec: elapsed + duration,
    })
    elapsed += duration
  })

  const author =
    firstNonEmpty(override?.author) ??
    firstNonEmpty(
      ...input.files.map((file) => file.tagAlbumArtist),
      ...input.files.map((file) => file.tagArtist),
    )

  return {
    id,
    title,
    series: firstNonEmpty(override?.series, input.seriesFromParent),
    seriesIndex: override?.seriesIndex ?? parsed.seriesIndex,
    author,
    narrator: firstNonEmpty(override?.narrator),
    durationSec: elapsed,
    // Die Version hängt an der Adresse, damit das Cover ein Jahr lang als
    // unveränderlich ausgeliefert werden darf und trotzdem sofort umschlägt,
    // wenn auf dem NAS ein anderes Bild liegt.
    cover: input.coverAvailable ? coverPath(id, input.coverVersion) : null,
    coverColor: tileColor(title),
    tags: override?.tags?.filter((tag) => tag.trim() !== '') ?? [],
    addedAt: input.addedAt,
    filesHash: filesHash(input.files),
    files,
    chapters,
  }
}

/** Liest eine `buch.json` defensiv ein – der Inhalt kommt von Hand. */
export function parseOverride(raw: unknown): BookOverride | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  const override: BookOverride = {}

  if (typeof record.title === 'string') override.title = record.title
  if (typeof record.series === 'string') override.series = record.series
  if (typeof record.author === 'string') override.author = record.author
  if (typeof record.narrator === 'string') override.narrator = record.narrator
  if (typeof record.seriesIndex === 'number' && Number.isFinite(record.seriesIndex)) {
    override.seriesIndex = record.seriesIndex
  }
  if (Array.isArray(record.tags)) {
    override.tags = record.tags.filter((tag): tag is string => typeof tag === 'string')
  }
  if (record.hidden === true) override.hidden = true

  return override
}
