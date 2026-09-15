/**
 * Vorschläge auf der Startseite.
 *
 * Bewusst nichts Gelerntes, nichts Gerechnetes: Wer Folge 5 hört, bekommt 6, 7
 * und 8 vorgeschlagen. Das ist die Antwort, die ein Kind sowieso erwartet – und
 * die einzige, die man ohne Erklärung versteht.
 */
import { type Progress, hasStarted } from '@/features/progress/progress'

import { type Book } from './catalog'

/** Fach innerhalb der Bibliothek: Reihe plus Unterordner. */
function shelf(book: Book): string {
  return `${book.series ?? ''}|${book.group ?? ''}`
}

export interface SuggestionInput {
  books: readonly Book[]
  /** Hörfortschritt des aktiven Profils. */
  entries: readonly Progress[]
  /** Bücher, die anderswo auf der Startseite schon stehen. */
  exclude?: ReadonlySet<string>
  limit?: number
}

/**
 * Was als Nächstes passt.
 *
 * Zuerst die Fortsetzungen aus dem Fach, in dem am meisten gehört wurde, dann
 * weitere Fächer, zum Schluss – wenn das nichts hergibt – das zuletzt
 * Dazugekommene. So steht dort auch am ersten Tag etwas.
 */
export function suggestBooks({
  books,
  entries,
  exclude = new Set(),
  limit = 6,
}: SuggestionInput): Book[] {
  const byId = new Map(books.map((book) => [book.id, book]))

  // Angefangen heisst: wirklich gehört. Ein versehentlicher Tap zählt nicht,
  // sonst schlägt die Startseite Folgen zu einer Reihe vor, die niemand mag.
  const gehoert = entries.filter((entry) => entry.finished || hasStarted(entry))

  const sekundenProFach = new Map<string, number>()
  const hoechsteFolge = new Map<string, number>()
  const angefasst = new Set<string>()

  for (const entry of gehoert) {
    const book = byId.get(entry.bookId)
    if (!book) continue
    angefasst.add(book.id)

    const fach = shelf(book)
    sekundenProFach.set(fach, (sekundenProFach.get(fach) ?? 0) + entry.positionSec)
    if (book.seriesIndex !== null) {
      hoechsteFolge.set(fach, Math.max(hoechsteFolge.get(fach) ?? 0, book.seriesIndex))
    }
  }

  const offen = (book: Book): boolean => !angefasst.has(book.id) && !exclude.has(book.id)

  const vorschlaege: Book[] = []
  const nimm = (book: Book): void => {
    if (vorschlaege.length >= limit) return
    if (vorschlaege.some((other) => other.id === book.id)) return
    vorschlaege.push(book)
  }

  const faecher = [...sekundenProFach.entries()].sort((a, b) => b[1] - a[1])

  for (const [fach] of faecher) {
    const weiter = hoechsteFolge.get(fach)
    const imFach = books.filter((book) => shelf(book) === fach && offen(book))

    // Höchstens drei aus einem Fach: Sonst besteht die ganze Zeile aus einer
    // einzigen Reihe, und die anderen acht kommen nie vor.
    const naechste =
      weiter === undefined
        ? imFach
        : imFach
            .filter((book) => book.seriesIndex !== null && book.seriesIndex > weiter)
            .sort((a, b) => (a.seriesIndex ?? 0) - (b.seriesIndex ?? 0))

    for (const book of (naechste.length > 0 ? naechste : imFach).slice(0, 3)) nimm(book)
    if (vorschlaege.length >= limit) return vorschlaege
  }

  // Noch Platz: das zuletzt Dazugekommene, das niemand angefasst hat.
  for (const book of [...books]
    .filter(offen)
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt))) {
    nimm(book)
    if (vorschlaege.length >= limit) break
  }

  return vorschlaege
}
