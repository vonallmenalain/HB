/**
 * Passt dieses Suchergebnis zu diesem Hörbuch?
 *
 * Die Frage entscheidet mehr, als sie aussieht: Ein Kind, das noch nicht liest,
 * findet sein Hörbuch am Bild wieder. Ein falsches Cover ist deshalb schlechter
 * als gar keines – die Kachel mit dem Buchstaben sagt wenigstens nichts
 * Falsches. Darum wird hier lieber einmal zu wenig zugeordnet.
 */
import { comparableWords, isFillerWord } from '../catalog/naming.js'

/** Das Hörbuch, für das ein Bild gesucht wird. */
export interface CoverSubject {
  series: string | null
  seriesIndex: number | null
  title: string
}

/** Was eine Online-Quelle gefunden hat. */
export interface CoverHit {
  title: string
  artist: string | null
}

/**
 * Ab hier wird ein Bild ohne Rückfrage gesetzt.
 *
 * Bewusst hoch: Darunter landet der Treffer als Vorschlag im Adminbereich und
 * wartet auf einen Tap. Lieber zwanzig Bücher von Hand bestätigen als eines
 * still falsch bebildern.
 */
export const SICHER_AB = 0.8

/** Darunter ist ein Treffer nicht einmal einen Vorschlag wert. */
export const VORSCHLAG_AB = 0.4

/** Wörter, die in jedem zweiten Hörspieltitel stehen und nichts unterscheiden. */
const RAUSCHEN = new Set([
  'folge',
  'teil',
  'kapitel',
  'hoerspiel',
  'horspiel',
  'hoerbuch',
  'horbuch',
  'cd',
  'und',
  'von',
  'mit',
  'im',
  'in',
  'auf',
  'zum',
  'zur',
])

function bedeutsam(text: string): string[] {
  return comparableWords(text).filter(
    (word) => !isFillerWord(word) && !RAUSCHEN.has(word) && word.length > 1,
  )
}

/** Die Zahlen, die in einem Text vorkommen. */
function zahlen(text: string): number[] {
  return [...text.matchAll(/\d{1,4}/g)].map((treffer) => Number(treffer[0]))
}

/**
 * Der Suchbegriff für die Online-Quelle.
 *
 * Reihe und Titel, ohne Nummer: Die Quellen schreiben die Folgennummer mal
 * „Folge 3", mal „003", mal gar nicht – als Suchwort schadet sie mehr, als sie
 * nützt. Zum Prüfen des Treffers wird sie danach sehr wohl herangezogen.
 */
export function searchTerm(subject: CoverSubject): string {
  const reihe = subject.series?.trim() ?? ''
  const titel = subject.title.trim()
  // Steht die Reihe schon im Titel, nicht doppelt suchen.
  const doppelt = reihe !== '' && titel.toLowerCase().includes(reihe.toLowerCase())
  return (doppelt || reihe === '' ? titel : `${reihe} ${titel}`).replace(/\s+/g, ' ').trim()
}

/**
 * Wie gut passt der Treffer? 0 heisst gar nicht, 1 heisst Wort für Wort.
 *
 * Gewertet wird, wie viel vom gesuchten Namen im Treffer wiederkommt – nicht
 * umgekehrt. Eine Quelle hängt gern „(Hörspiel)" oder den Verlag an den Titel;
 * das darf nicht als Fehler zählen.
 *
 * Die Folgennummer ist der Riegel davor, dass Folge 3 das Bild von Folge 30
 * bekommt: Nennt der Treffer Zahlen und ist die gesuchte nicht darunter, ist er
 * hinfällig. Nennt er gar keine, bleibt ein Rest Zweifel – und der reicht
 * gerade nicht mehr fürs stille Setzen.
 */
export function scoreHit(subject: CoverSubject, hit: CoverHit): number {
  const gesucht = bedeutsam(`${subject.series ?? ''} ${subject.title}`)
  if (gesucht.length === 0) return 0

  const gefunden = new Set(bedeutsam(`${hit.title} ${hit.artist ?? ''}`))
  const treffer = gesucht.filter((word) => gefunden.has(word)).length
  const deckung = treffer / gesucht.length

  if (subject.seriesIndex === null) return deckung

  const imTreffer = zahlen(hit.title)
  if (imTreffer.length === 0) return deckung * 0.7
  return imTreffer.includes(subject.seriesIndex) ? deckung : 0
}
