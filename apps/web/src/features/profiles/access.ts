/**
 * Wer darf welches Hörbuch hören?
 *
 * Zwei Schrauben, und sie greifen unabhängig voneinander:
 *
 * - Die **Altersfreigabe** hängt am Hörbuch und gilt für die ganze Familie.
 *   Sie wird im Adminbereich gesetzt, weil sie zur Bibliothek gehört und nicht
 *   zu einem Gerät: „Der Feuerkelch ist ab 12" ist eine Aussage über das Buch.
 * - Die **Sperre** hängt am Profil und gilt nur für dieses Kind. Sie ist für
 *   die Ausnahme, für die kein Alter etwas hergibt: eine Folge, die diesem
 *   einen Kind Angst macht.
 *
 * Reine Funktionen ohne Datenbank und ohne React – so lässt sich die
 * Entscheidung prüfen, ohne ein Konto und eine Bibliothek anzulegen.
 */
import { type Book } from '@/features/library/catalog'

/**
 * Altersstufen, wie sie auf Hörspielen stehen.
 *
 * Bewusst eine kurze Leiter und kein Zahlenfeld: Eine Freigabe „ab 7" gibt es
 * auf keiner Hülle, und eine Liste zum Antippen ist im Adminbereich schneller
 * als ein Eingabefeld, in dem sich ein Tippfehler versteckt.
 */
export const AGE_STEPS = [0, 3, 6, 8, 10, 12, 14, 16] as const

/** Alter eines Kindes, wie es sich im Elternbereich einstellen lässt. */
export const PROFILE_AGE_MIN = 2
export const PROFILE_AGE_MAX = 17

/** Buch-ID → Altersfreigabe in Jahren. Fehlt ein Eintrag, ist das Buch frei. */
export type BookAges = ReadonlyMap<string, number>

/** Was an Zugangsregeln an einem Profil hängt. */
export interface AccessProfile {
  /** Alter des Kindes in Jahren, oder null – dann ist keins gesetzt. */
  ageYears: number | null
  /** Einzeln gesperrte Hörbücher. */
  blockedBooks: readonly string[]
}

/** Eine Zahl aus der Datenbank als Altersfreigabe – oder 0, wenn sie nichts taugt. */
export function parseMinAge(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0
  const gerundet = Math.round(raw)
  return gerundet > 0 && gerundet <= PROFILE_AGE_MAX ? gerundet : 0
}

/** Eine Zahl aus der Datenbank als Alter eines Kindes – oder null. */
export function parseAgeYears(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
  const gerundet = Math.round(raw)
  if (gerundet < PROFILE_AGE_MIN || gerundet > PROFILE_AGE_MAX) return null
  return gerundet
}

/** `0` → „ohne Altersfreigabe“, `12` → „ab 12 Jahren“. */
export function ageLabel(minAge: number): string {
  return minAge <= 0 ? 'Ohne Altersfreigabe' : `Ab ${String(minAge)} Jahren`
}

export function minAgeOf(ages: BookAges, bookId: string): number {
  return ages.get(bookId) ?? 0
}

/**
 * Darf dieses Profil dieses Hörbuch hören?
 *
 * Ohne gesetztes Alter bleibt ein Buch mit Altersfreigabe verborgen, und das
 * ist die vorsichtige Richtung: Wer eine Folge auf „ab 12" setzt, will sie vor
 * den Kleinen verbergen – und nicht erst noch bei jedem Profil eine Zahl
 * nachtragen müssen, damit die Freigabe überhaupt greift. Freigeben heisst
 * hier also: das Alter des Kindes eintragen.
 */
export function mayListen(bookId: string, profile: AccessProfile, ages: BookAges): boolean {
  if (profile.blockedBooks.includes(bookId)) return false
  const minAge = minAgeOf(ages, bookId)
  if (minAge <= 0) return true
  return profile.ageYears !== null && profile.ageYears >= minAge
}

/**
 * Die Hörbücher, die dieses Profil sehen darf.
 *
 * `null` heisst „ohne Profil" und gibt alles heraus – so lesen der Eltern- und
 * der Adminbereich die Bibliothek, denn dort wird ja gerade eingestellt, was
 * ein Kind sehen soll.
 */
export function visibleBooks(
  books: readonly Book[],
  profile: AccessProfile | null,
  ages: BookAges,
): Book[] {
  if (profile === null) return [...books]

  // Einmal ein Set, nicht neunhundertmal durch eine Liste suchen.
  const gesperrt = new Set(profile.blockedBooks)
  return books.filter((book) => {
    if (gesperrt.has(book.id)) return false
    const minAge = minAgeOf(ages, book.id)
    if (minAge <= 0) return true
    return profile.ageYears !== null && profile.ageYears >= minAge
  })
}
