/**
 * Katalog-Vertrag auf App-Seite.
 *
 * Bewusst eine eigene Definition statt geteilter Typen mit dem NAS-Dienst:
 * Beide werden unabhängig voneinander ausgeliefert. Die App kann jederzeit auf
 * einen Dienst treffen, der älter oder neuer ist als sie selbst – deshalb wird
 * jede Antwort geprüft, statt ihr zu vertrauen. Ein einzelnes kaputtes Buch
 * darf die Bibliothek nicht leeren.
 *
 * Schema: docs/DATENMODELL.md §2
 */
export const SUPPORTED_SCHEMA_VERSION = 2

export interface BookFile {
  idx: number
  durationSec: number
  bytes: number
  mime: string
}

export interface Chapter {
  idx: number
  title: string
  fileIdx: number
  /** Globale Sekunden im gesamten Buch. */
  startSec: number
  endSec: number
}

export interface Book {
  id: string
  /** Aufbereitet für die Anzeige – siehe `titles.ts`. */
  title: string
  /**
   * Der Ordnername auf dem NAS, unverändert – im Adminbereich sichtbar.
   *
   * Ältere Dienste liefern ihn nicht; dann steht hier der Titel, und das ist
   * das Nächstbeste, was es gibt.
   */
  folderName: string
  /** Oberster Ordner: die Reihe, nach der die Bibliothek gliedert. */
  series: string | null
  /** Ordner zwischen Reihe und Buch, etwa „Mini-Fälle“ – sonst null. */
  group: string | null
  seriesIndex: number | null
  author: string | null
  narrator: string | null
  durationSec: number
  cover: string | null
  coverColor: string
  tags: string[]
  addedAt: string
  filesHash: string
  files: BookFile[]
  chapters: Chapter[]
}

export interface Catalog {
  schemaVersion: number
  generatedAt: string
  books: Book[]
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseFile(raw: unknown): BookFile | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  const idx = num(record.idx)
  const durationSec = num(record.durationSec)
  if (idx === null || idx < 0 || durationSec === null) return null

  return {
    idx,
    durationSec: Math.max(0, durationSec),
    bytes: Math.max(0, num(record.bytes) ?? 0),
    mime: str(record.mime) ?? 'audio/mpeg',
  }
}

function parseChapter(raw: unknown, fallbackIdx: number): Chapter | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  const startSec = num(record.startSec)
  const endSec = num(record.endSec)
  const fileIdx = num(record.fileIdx)
  if (startSec === null || endSec === null || fileIdx === null) return null
  if (endSec < startSec) return null

  return {
    idx: num(record.idx) ?? fallbackIdx,
    title: str(record.title) ?? `Kapitel ${String(fallbackIdx + 1)}`,
    fileIdx,
    startSec,
    endSec,
  }
}

export function parseBook(raw: unknown): Book | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>

  const id = str(record.id)
  const title = str(record.title)
  if (id === null || title === null) return null

  const files = Array.isArray(record.files)
  ? record.files.map(parseFile).filter((file): file is BookFile => file !== null)
    : []
  // Ein Buch ohne abspielbare Datei ist kein Buch.
  if (files.length === 0) return null

  const chapters = Array.isArray(record.chapters)
    ? record.chapters
        .map((entry, index) => parseChapter(entry, index))
        .filter((chapter): chapter is Chapter => chapter !== null)
    : []

  const durationSec =
    num(record.durationSec) ?? files.reduce((sum, file) => sum + file.durationSec, 0)

  return {
    id,
    title,
    folderName: str(record.folderName) ?? title,
    series: str(record.series),
    group: str(record.group),
    seriesIndex: num(record.seriesIndex),
    author: str(record.author),
    narrator: str(record.narrator),
    durationSec: Math.max(0, durationSec),
    cover: str(record.cover),
    coverColor: str(record.coverColor) ?? '#6d28d9',
    tags: Array.isArray(record.tags)
      ? record.tags.filter((tag): tag is string => typeof tag === 'string')
      : [],
    addedAt: str(record.addedAt) ?? '',
    filesHash: str(record.filesHash) ?? '',
    files,
    // Ohne brauchbare Kapitel ist jede Datei eines.
    chapters: chapters.length > 0 ? chapters : chaptersFromFiles(files),
  }
}

function chaptersFromFiles(files: readonly BookFile[]): Chapter[] {
  let elapsed = 0
  return files.map((file, index) => {
    const chapter: Chapter = {
      idx: index,
      title: `Kapitel ${String(index + 1)}`,
      fileIdx: file.idx,
      startSec: elapsed,
      endSec: elapsed + file.durationSec,
    }
    elapsed += file.durationSec
    return chapter
  })
}

export type CatalogResult =
  | { ok: true; catalog: Catalog; skipped: number }
  | { ok: false; reason: 'malformed' | 'unsupported-version' }

export function parseCatalog(raw: unknown): CatalogResult {
  if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'malformed' }
  const record = raw as Record<string, unknown>

  const schemaVersion = num(record.schemaVersion)
  if (schemaVersion === null) return { ok: false, reason: 'malformed' }
  if (schemaVersion > SUPPORTED_SCHEMA_VERSION) {
    // Der Dienst ist neuer als die App. Lieber ehrlich melden als raten.
    return { ok: false, reason: 'unsupported-version' }
  }
  if (!Array.isArray(record.books)) return { ok: false, reason: 'malformed' }

  const books = record.books.map(parseBook)
  const usable = books.filter((book): book is Book => book !== null)

  return {
    ok: true,
    catalog: {
      schemaVersion,
      generatedAt: str(record.generatedAt) ?? '',
      books: usable,
    },
    skipped: books.length - usable.length,
  }
}

/** Findet die Datei und den Versatz darin zu einer globalen Sekunde. */
export function resolvePosition(
  book: Book,
  positionSec: number,
): { fileIdx: number; offsetSec: number } {
  const target = Math.max(0, positionSec)
  let elapsed = 0

  for (const file of book.files) {
    if (target < elapsed + file.durationSec) {
      return { fileIdx: file.idx, offsetSec: target - elapsed }
    }
    elapsed += file.durationSec
  }

  const last = book.files.at(-1)
  return last
    ? { fileIdx: last.idx, offsetSec: last.durationSec }
    : { fileIdx: 0, offsetSec: 0 }
}

/** Globale Sekunde, an der eine Datei im Buch beginnt. */
export function fileStartSec(book: Book, fileIdx: number): number {
  let elapsed = 0
  for (const file of book.files) {
    if (file.idx === fileIdx) return elapsed
    elapsed += file.durationSec
  }
  return 0
}

/**
 * Globale Sekunde aus Datei und Position darin.
 *
 * Der Player kennt immer nur die laufende Datei; alles andere – Fortschritt,
 * Kapitelanzeige, gespeicherte Stelle – rechnet in globalen Sekunden.
 */
export function globalPosition(book: Book, fileIdx: number, offsetSec: number): number {
  const start = fileStartSec(book, fileIdx)
  return Math.min(book.durationSec, Math.max(0, start + Math.max(0, offsetSec)))
}

/** Welches Kapitel gehört zu dieser globalen Sekunde? */
export function chapterAt(book: Book, positionSec: number): Chapter | null {
  const target = Math.max(0, positionSec)
  return (
    book.chapters.find((chapter) => target >= chapter.startSec && target < chapter.endSec) ??
    book.chapters.at(-1) ??
    null
  )
}

/** Sortiert so, wie Menschen es erwarten: `2` vor `10`. */
function naturalCompare(a: string, b: string): number {
  const chunks = (value: string): (string | number)[] =>
    value
      .split(/(\d+)/)
      .filter((part) => part !== '')
      .map((part) => (/^\d+$/.test(part) ? Number(part) : part.toLowerCase()))

  const left = chunks(a)
  const right = chunks(b)

  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const l = left[i]
    const r = right[i]
    if (l === undefined) return -1
    if (r === undefined) return 1
    if (typeof l === 'number' && typeof r === 'number') {
      if (l !== r) return l - r
      continue
    }
    const ls = String(l)
    const rs = String(r)
    if (ls !== rs) return ls.localeCompare(rs, 'de')
  }
  return 0
}

/**
 * Wonach ein Buch in seiner Reihe einsortiert wird.
 *
 * Bewusst dasselbe, was auch auf der Kachel steht: „1 Die Handy-Falle".
 * Verglichen wurde früher die erkannte Nummer und sonst der Titel – aber der
 * Titel eines erkannten Buchs hat seine Nummer nicht mehr, der eines nicht
 * erkannten schon. „50A - Freundinnen in Gefahr" landete damit vor „01 - Die
 * Handy-Falle", weil eine Ziffer vor jedem Buchstaben steht.
 */
function orderKey(book: Book): string {
  return book.seriesIndex === null ? book.title : `${String(book.seriesIndex)} ${book.title}`
}

/** Reihen zusammen, darin nach Gruppe und Nummer – wie im Dienst, aber die App verlässt sich nicht darauf. */
export function sortBooks(books: readonly Book[]): Book[] {
  return [...books].sort((a, b) => {
    const series = (a.series ?? '').localeCompare(b.series ?? '', 'de')
    if (series !== 0) return series
    const group = (a.group ?? '').localeCompare(b.group ?? '', 'de')
    if (group !== 0) return group
    // Natürlich, nicht alphabetisch: Sonst stünde Folge 10 vor Folge 2 und
    // Folge 100 vor Folge 20.
    return naturalCompare(orderKey(a), orderKey(b))
  })
}

const LEADING_ARTICLES = ['der', 'die', 'das', 'ein', 'eine', 'the', 'a']

/**
 * Buchstabe für die Ersatzkachel, wenn ein Buch kein Cover hat.
 *
 * Führende Artikel werden übersprungen: Sonst trügen „Der Super-Papagei",
 * „Die Olchis" und „Das Bergmonster" alle dieselbe Kachel – und genau daran
 * erkennt ein Kind, das noch nicht liest, sein Hörbuch wieder.
 */
export function coverLetter(title: string): string {
  const words = title.trim().split(/\s+/).filter((word) => word !== '')
  const meaningful =
    words.find((word) => !LEADING_ARTICLES.includes(word.toLowerCase())) ?? words[0]

  const letter = meaningful === undefined ? '' : ([...meaningful][0] ?? '')
  return letter === '' ? '?' : letter.toUpperCase()
}
