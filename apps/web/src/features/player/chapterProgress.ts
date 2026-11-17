import { type Book, chapterAt } from '@/features/library/catalog'

/** Wo im laufenden Kapitel man gerade ist. */
export interface ChapterProgress {
  /** Sekunde im Buch, an der das Kapitel beginnt. */
  startSec: number
  /** Länge des Kapitels in Sekunden. */
  lengthSec: number
  /** Gehört im Kapitel, zwischen 0 und `lengthSec`. */
  positionSec: number
  /** Das wievielte Kapitel, ab 1 – so, wie es dasteht. */
  number: number
  count: number
}

/**
 * Die Stelle, auf das laufende Kapitel bezogen.
 *
 * Der Balken im Player ging früher über das ganze Buch. Bei neun Stunden ist
 * ein Millimeter darauf eine Viertelstunde: Zum Spulen taugt das nicht, und
 * „1:09 … -9:05:48" sagt nichts darüber, wann das Kapitel zu Ende ist – und
 * das ist die Frage vor dem Einschlafen. Also misst der Balken das Kapitel,
 * und die Restzeit des Buchs steht für sich daneben.
 *
 * Ein Buch ohne Kapitel ist ein einziges Kapitel über die ganze Länge.
 */
export function chapterProgress(book: Book, positionSec: number): ChapterProgress {
  // `NaN` kommt aus dem Audio-Element, bevor die Metadaten da sind. Ungeprüft
  // fände `chapterAt` damit kein Kapitel und nähme das letzte.
  const stelle = Number.isFinite(positionSec) ? positionSec : 0
  const chapter = chapterAt(book, stelle)
  const count = Math.max(1, book.chapters.length)

  const startSec = chapter?.startSec ?? 0
  const lengthSec = Math.max(0, (chapter?.endSec ?? book.durationSec) - startSec)

  return {
    startSec,
    lengthSec,
    positionSec: Math.min(lengthSec, Math.max(0, stelle - startSec)),
    number: chapter === null ? 1 : book.chapters.indexOf(chapter) + 1,
    count,
  }
}
