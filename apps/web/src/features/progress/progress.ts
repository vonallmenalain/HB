import { type Book, globalPosition } from '@/features/library/catalog'
import { isFinished } from '@/lib/format'
import { RESUME_REWIND_SEC } from '@/features/player/audioEngine'

/**
 * Gespeicherter Hörfortschritt eines Profils für ein Buch.
 *
 * Die Position liegt doppelt vor, und das ist Absicht:
 * `positionSec` ist die globale Sekunde im Buch und überlebt auch, wenn die
 * Dateien auf dem NAS neu sortiert oder neu kodiert werden. `fileIdx` und
 * `offsetSec` sind die exakte Stelle – gültig nur, solange `filesHash` zum
 * Katalog passt. Fällt die exakte Stelle weg, bleibt immer noch die globale
 * Sekunde. Verloren geht nie etwas.
 */
export interface Progress {
  bookId: string
  positionSec: number
  fileIdx: number
  offsetSec: number
  filesHash: string
  durationSec: number
  finished: boolean
  /** ISO-Zeitstempel; entscheidet beim Abgleich zwischen Geräten (M6). */
  updatedAt: string
}

export function makeProgress(
  book: Book,
  positionSec: number,
  fileIdx: number,
  offsetSec: number,
  now: () => Date = () => new Date(),
): Progress {
  return {
    bookId: book.id,
    positionSec: Math.max(0, Math.min(book.durationSec, positionSec)),
    fileIdx,
    offsetSec: Math.max(0, offsetSec),
    filesHash: book.filesHash,
    durationSec: book.durationSec,
    finished: isFinished(positionSec, book.durationSec),
    updatedAt: now().toISOString(),
  }
}

export interface Resume {
  positionSec: number
  /** Kam die Stelle aus der exakten Angabe oder aus der globalen Sekunde? */
  exact: boolean
}

/**
 * Wo soll die Wiedergabe einsetzen?
 *
 * Springt ein Stück zurück, damit man den letzten Satz noch einmal hört statt
 * mitten hineinzufallen. Ein zu Ende gehörtes Buch beginnt wieder von vorn.
 */
export function resolveResume(book: Book, progress: Progress | null): Resume {
  if (progress === null) return { positionSec: 0, exact: true }
  if (progress.finished) return { positionSec: 0, exact: true }

  const exact = progress.filesHash === book.filesHash && progress.filesHash !== ''
  const raw = exact
    ? globalPosition(book, progress.fileIdx, progress.offsetSec)
    : Math.min(book.durationSec, Math.max(0, progress.positionSec))

  return { positionSec: Math.max(0, raw - RESUME_REWIND_SEC), exact }
}

/** Anteil des Buchs, der schon gehört wurde – zwischen 0 und 1. */
export function progressRatio(progress: Progress | null): number {
  if (progress === null || progress.durationSec <= 0) return 0
  if (progress.finished) return 1
  return Math.min(1, Math.max(0, progress.positionSec / progress.durationSec))
}

/**
 * Was gehört auf die „Weiterhören"-Kachel?
 *
 * Das zuletzt angefasste Buch, das weder fertig noch ganz am Anfang ist. Ein
 * versehentlich angetipptes Buch taugt dafür nicht – sonst steht dort etwas,
 * das niemand hört.
 */
export const CONTINUE_MIN_SECONDS = 30
const CONTINUE_MIN_RATIO = 0.02

/**
 * Die Schwelle richtet sich nach der Länge.
 *
 * Feste 30 Sekunden passen für ein Hörbuch von einer Stunde, nicht aber für
 * eine Gutenachtgeschichte von drei Minuten – dort wären das schon ein
 * Sechstel, und die Kachel bliebe gefühlt immer leer.
 */
export function hasStarted(entry: Progress): boolean {
  if (entry.positionSec <= 0) return false
  return entry.positionSec >= Math.min(CONTINUE_MIN_SECONDS, entry.durationSec * CONTINUE_MIN_RATIO)
}

export function pickContinue(
  entries: readonly Progress[],
  hasBook: (bookId: string) => boolean,
): Progress | null {
  return pickRecent(entries, hasBook, 1)[0] ?? null
}

/**
 * Die zuletzt angefangenen Bücher, das jüngste zuerst.
 *
 * Auf der Startseite steht darüber „Weiterhören": das erste gross, der Rest als
 * Kacheln daneben. Fertig gehörte Bücher gehören nicht dazu – sie fingen wieder
 * von vorn an, und das will niemand angeboten bekommen.
 */
export function pickRecent(
  entries: readonly Progress[],
  hasBook: (bookId: string) => boolean,
  limit = 6,
): Progress[] {
  return entries
    .filter((entry) => !entry.finished && hasStarted(entry) && hasBook(entry.bookId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit)
}
