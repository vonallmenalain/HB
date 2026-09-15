/**
 * Hörhistorie: wer hat was wie oft gehört.
 *
 * Bewusst getrennt vom Hörfortschritt. Der Fortschritt beantwortet „wo war
 * ich?" und gehört dem Kind – er liegt unter `users/{uid}` und ist für sonst
 * niemanden lesbar. Die Historie beantwortet „was läuft hier eigentlich?" und
 * gehört den Eltern; sie liegt deshalb in einer eigenen Kollektion, die nur der
 * Administrator lesen darf.
 *
 * Gezählt wird grob und ehrlich: ein Aufruf ist ein Start, dazu die tatsächlich
 * abgespielten Sekunden. Kein Profil, kein Verhalten, keine Uhrzeiten – nur,
 * was auf die Frage „wie oft?" eine Antwort gibt.
 */
export interface HistoryEntry {
  id: string
  uid: string
  profileId: string
  profileName: string
  bookId: string
  bookTitle: string
  /** Wie oft das Buch geöffnet und gestartet wurde. */
  plays: number
  /** Tatsächlich abgespielte Sekunden, aufsummiert über alle Male. */
  secondsListened: number
  lastPlayedAt: string
}

/**
 * Ein Eintrag je (Konto, Profil, Buch).
 *
 * Die Kennung enthält alle drei Teile: So schreibt jedes Gerät in dasselbe
 * Dokument, und aus zwei Tablets wird kein doppelter Zähler.
 */
export function historyId(uid: string, profileId: string, bookId: string): string {
  return `${uid}_${profileId}_${bookId}`
}

export function parseHistoryEntry(id: string, data: unknown): HistoryEntry | null {
  if (typeof data !== 'object' || data === null) return null
  const record = data as Record<string, unknown>

  const text = (value: unknown, fallback = ''): string =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback
  const zahl = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0

  const uid = text(record.uid)
  const bookId = text(record.bookId)
  if (uid === '' || bookId === '') return null

  return {
    id,
    uid,
    profileId: text(record.profileId),
    profileName: text(record.profileName, 'Ohne Namen'),
    bookId,
    bookTitle: text(record.bookTitle, 'Unbekanntes Hörbuch'),
    plays: Math.round(zahl(record.plays)),
    secondsListened: Math.round(zahl(record.secondsListened)),
    lastPlayedAt: text(record.lastPlayedAt),
  }
}

export interface ProfileSummary {
  profileId: string
  profileName: string
  plays: number
  secondsListened: number
  /** Wie viele verschiedene Hörbücher. */
  books: number
  lastPlayedAt: string
  /** Die meistgehörten Bücher dieses Profils, das häufigste zuerst. */
  top: HistoryEntry[]
}

/** Fasst die Einträge je Profil zusammen – die fleissigsten Hörer zuerst. */
export function summarizeByProfile(
  entries: readonly HistoryEntry[],
  topCount = 5,
): ProfileSummary[] {
  const byProfile = new Map<string, HistoryEntry[]>()
  for (const entry of entries) {
    const key = `${entry.uid}_${entry.profileId}`
    const list = byProfile.get(key)
    if (list) list.push(entry)
    else byProfile.set(key, [entry])
  }

  const summaries: ProfileSummary[] = []
  for (const list of byProfile.values()) {
    const sorted = [...list].sort(
      (a, b) => b.plays - a.plays || b.secondsListened - a.secondsListened,
    )
    summaries.push({
      profileId: list[0]!.profileId,
      // Der Name kommt vom zuletzt geschriebenen Eintrag – umbenannte Profile
      // stehen sonst mit ihrem alten Namen da.
      profileName: neuester(list).profileName,
      plays: list.reduce((sum, entry) => sum + entry.plays, 0),
      secondsListened: list.reduce((sum, entry) => sum + entry.secondsListened, 0),
      books: list.length,
      lastPlayedAt: neuester(list).lastPlayedAt,
      top: sorted.slice(0, topCount),
    })
  }

  return summaries.sort(
    (a, b) => b.secondsListened - a.secondsListened || b.plays - a.plays,
  )
}

function neuester(entries: readonly HistoryEntry[]): HistoryEntry {
  return entries.reduce((latest, entry) =>
    entry.lastPlayedAt.localeCompare(latest.lastPlayedAt) > 0 ? entry : latest,
  )
}

/** Die meistgehörten Bücher über alle Profile hinweg. */
export function topBooks(entries: readonly HistoryEntry[], limit = 10): HistoryEntry[] {
  return [...entries]
    .sort((a, b) => b.plays - a.plays || b.secondsListened - a.secondsListened)
    .slice(0, limit)
}
