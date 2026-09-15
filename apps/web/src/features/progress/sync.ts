import { type Progress } from './progress'

/**
 * Abgleich des Hörfortschritts zwischen Geräten.
 *
 * Alles in dieser Datei ist reine Rechnung ohne Firestore – die Regeln, nach
 * denen zwei Stände zusammenfinden, sollen ohne Netz und ohne Mock prüfbar
 * sein.
 *
 * Die Grundregel ist bewusst einfach: **der jüngere Stand gewinnt.** Nicht der
 * zuletzt beim Server eingetroffene. Das ist der Unterschied, auf den es bei
 * einer App ankommt, die auch offline läuft: Ein Tablet, das eine Woche im
 * Flugmodus lag, schiebt seine gepufferten Schreibvorgänge beim nächsten
 * Einschalten hinaus – nach Server-Ankunft wären das die „neuesten", obwohl
 * dort seit einer Woche niemand zugehört hat.
 */

/**
 * Welcher von zwei Ständen desselben Buchs gilt?
 *
 * Absichtlich vertauschbar: `pick(a, b)` und `pick(b, a)` liefern denselben
 * Stand. Nur so landen zwei Geräte, die gleichzeitig abgleichen, am Ende beim
 * gleichen Ergebnis statt sich gegenseitig zu überschreiben.
 */
export function pick(a: Progress, b: Progress): Progress {
  const byTime = a.updatedAt.localeCompare(b.updatedAt)
  if (byTime !== 0) return byTime > 0 ? a : b

  // Gleicher Zeitstempel (in aller Regel derselbe Schreibvorgang, einmal lokal
  // und einmal aus der Cloud): erst „fertig gehört", dann die weitere Stelle.
  if (a.finished !== b.finished) return a.finished ? a : b
  if (a.positionSec !== b.positionSec) return a.positionSec > b.positionSec ? a : b

  // Bleibt auch das gleich, sind die beiden Stände für alles, was die App
  // damit tut, austauschbar.
  return a
}

export interface MergeResult {
  entries: ReadonlyMap<string, Progress>
  /** Stände, die lokal fehlen oder veraltet sind – gehören nach IndexedDB. */
  toStore: Progress[]
  /** Stände, die in der Cloud fehlen oder veraltet sind – gehören zu Firestore. */
  toPush: Progress[]
  /** Hat sich am lokalen Bild überhaupt etwas geändert? */
  changed: boolean
}

/**
 * Führt den lokalen Stand mit dem aus der Cloud zusammen.
 *
 * `toPush` ist mehr als das Nachreichen fehlender Bücher: Überschreibt ein
 * spät eintreffender alter Schreibvorgang das Dokument in Firestore, sieht das
 * Gerät mit dem jüngeren Stand hier, dass die Cloud hinterherhinkt, und legt
 * ihn wieder hin. Der Abgleich repariert sich damit von selbst.
 *
 * `remoteComplete` sagt, ob die Cloud-Seite vollständig ist. Beim ersten
 * Zuhören ohne Netz meldet Firestore einen leeren Stand aus seinem eigenen
 * Zwischenspeicher – daraus darf nicht geschlossen werden, dass dort nichts
 * liegt, sonst würde bei jedem Kaltstart die ganze Bibliothek hochgeschoben.
 */
export function mergeRemote(
  local: ReadonlyMap<string, Progress>,
  remote: ReadonlyMap<string, Progress>,
  { remoteComplete }: { remoteComplete: boolean },
): MergeResult {
  const entries = new Map(local)
  const toStore: Progress[] = []
  const toPush: Progress[] = []

  for (const [bookId, fromCloud] of remote) {
    const here = local.get(bookId)
    if (here === undefined) {
      entries.set(bookId, fromCloud)
      toStore.push(fromCloud)
      continue
    }

    const winner = pick(here, fromCloud)
    if (winner === here && here.updatedAt !== fromCloud.updatedAt) {
      toPush.push(here)
    } else if (winner === fromCloud) {
      entries.set(bookId, fromCloud)
      toStore.push(fromCloud)
    }
  }

  if (remoteComplete) {
    for (const [bookId, here] of local) {
      if (!remote.has(bookId)) toPush.push(here)
    }
  }

  return { entries, toStore, toPush, changed: toStore.length > 0 }
}

/**
 * Liest ein Firestore-Dokument in einen Fortschritt ein.
 *
 * Genauso misstrauisch wie beim Profil: Dort kann ein halb geschriebenes
 * Dokument stehen, eines aus einer früheren Version oder eines, das jemand von
 * Hand in der Konsole angefasst hat. Ein unbrauchbares darf den Abgleich nicht
 * anhalten – es wird übersprungen, und der lokale Stand bleibt stehen.
 */
export function parseRemoteProgress(bookId: string, data: unknown): Progress | null {
  if (bookId === '' || typeof data !== 'object' || data === null) return null
  const record = data as Record<string, unknown>

  const updatedAt = parseInstant(record.updatedAt)
  if (updatedAt === null) return null

  const durationSec = finite(record.durationSec, 0)
  const positionSec = Math.max(0, finite(record.positionSec, 0))

  return {
    bookId,
    positionSec: durationSec > 0 ? Math.min(durationSec, positionSec) : positionSec,
    fileIdx: Math.max(0, Math.floor(finite(record.fileIdx, 0))),
    offsetSec: Math.max(0, finite(record.offsetSec, 0)),
    filesHash: typeof record.filesHash === 'string' ? record.filesHash : '',
    durationSec: Math.max(0, durationSec),
    finished: record.finished === true,
    updatedAt,
  }
}

/** Das, was in Firestore landet. Die Buch-Kennung ist die Dokument-ID. */
export function toRemoteDoc(
  progress: Progress,
  deviceId: string,
): Record<string, unknown> {
  const { bookId: _bookId, ...fields } = progress
  // `deviceId` dient allein der Fehlersuche: Wenn eine Stelle springt, steht
  // damit in der Konsole, welches Gerät sie geschrieben hat.
  return { ...fields, deviceId }
}

/**
 * Bringt einen Zeitstempel auf eine einheitliche Form.
 *
 * Verglichen wird später als Zeichenkette – das geht nur auf, wenn alle
 * Zeitstempel dieselbe Schreibweise haben. Firestore liefert je nach
 * Schreibweg eine Zeichenkette oder ein `Timestamp`-Objekt.
 */
function parseInstant(value: unknown): string | null {
  if (typeof value === 'string') {
    const ms = Date.parse(value)
    return Number.isNaN(ms) ? null : new Date(ms).toISOString()
  }
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const { toDate } = value
    if (typeof toDate === 'function') {
      try {
        const date: unknown = toDate.call(value)
        if (date instanceof Date && !Number.isNaN(date.getTime())) return date.toISOString()
      } catch {
        return null
      }
    }
  }
  return null
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
