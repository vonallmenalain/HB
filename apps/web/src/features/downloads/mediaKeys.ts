/**
 * Die Schlüssel, unter denen heruntergeladene Dateien liegen.
 *
 * Diese Datei kennt weder React noch das DOM: Sie wird von der App **und**
 * vom Service Worker benutzt, und der läuft in einer anderen Welt. Gäbe es
 * zwei Fassungen davon, legte der eine ab, was der andere nicht findet.
 */
export const MEDIA_CACHE = 'hb-media-v1'

/** Der Name des Ticket-Parameters in den Medien-Adressen. */
export const TICKET_PARAM = 't'

/**
 * Die Adresse ohne Ticket – der Schlüssel im Cache.
 *
 * Das Ticket wechselt alle paar Stunden. Wäre es Teil des Schlüssels, wäre
 * jeder Download am nächsten Tag wertlos. Geladen wird deshalb mit Ticket,
 * abgelegt wird ohne.
 *
 * Andere Parameter bleiben stehen: Das `?v=` an einem Cover gehört zur Sache
 * und soll sich ändern, wenn sich das Bild ändert.
 */
export function canonicalKey(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.searchParams.delete(TICKET_PARAM)
    return parsed.toString()
  } catch {
    // Keine gültige Adresse – dann eben unverändert; der Cache findet sie
    // ohnehin nicht, und ein Absturz wäre die schlechtere Antwort.
    return url
  }
}

/** Die Kennung, unter der ein Buch beim Betriebssystem in der Warteschlange steht. */
export function fetchIdFor(bookId: string): string {
  return `hb:${bookId}`
}

export function bookIdFromFetchId(fetchId: string): string | null {
  return fetchId.startsWith('hb:') ? fetchId.slice(3) : null
}
