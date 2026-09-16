/**
 * Titel, wie sie ein Kind lesen soll.
 *
 * Die Namen kommen aus gewachsenen Ordnern: „Die Drei Fragezeichen Kids-68-Chaos
 * Im Dunkeln“, „05 -Mini-Fall - Alarm“. In einer Reihe untereinander gelesen ist
 * der Reihenname in jeder Zeile nur Rauschen.
 *
 * Dieselbe Aufbereitung steckt im Scanner auf dem NAS – dort an der Quelle, hier
 * für den Fall, dass der Dienst noch der alte ist. Bewusst doppelt und nicht
 * geteilt: Beide Seiten werden unabhängig ausgeliefert, und die App darf nicht
 * darauf warten, dass jemand den Container neu baut.
 */
import { type Book } from './catalog'

const FILLER_WORDS = new Set(['der', 'die', 'das', 'den', 'ein', 'eine', 'the', 'a', 'an'])

const NUMBER_WORDS = new Map([
  ['eins', '1'],
  ['zwei', '2'],
  ['drei', '3'],
  ['vier', '4'],
  ['funf', '5'],
  ['sechs', '6'],
  ['sieben', '7'],
  ['acht', '8'],
  ['neun', '9'],
  ['zehn', '10'],
  ['elf', '11'],
  ['zwolf', '12'],
])

interface Token {
  value: string
  end: number
}

function normalizeWord(raw: string): string {
  // „Die drei ???“ und „Die 3 Fragezeichen“ sind dieselbe Reihe.
  if (/^\?{2,}$/.test(raw)) return 'fragezeichen'

  const plain = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
  return NUMBER_WORDS.get(plain) ?? plain
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  // Buchstaben und Ziffern getrennt: „5Freunde" ist derselbe Name wie
  // „5 Freunde", nur ohne Leerzeichen – und genau so stehen die Ordner da.
  const pattern = /\p{L}+|\p{N}+|\?{2,}/gu
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    tokens.push({ value: normalizeWord(match[0]), end: match.index + match[0].length })
  }
  return tokens
}

/**
 * Vereinheitlicht Trennzeichen und Abstände.
 *
 * Ein Strich zählt nur als Trenner, wenn Leerraum daneben steht oder auf einer
 * Seite eine Ziffer – sonst verlöre „Mini-Fall“ seinen Bindestrich.
 */
export function tidyName(raw: string): string {
  return raw
    .replace(/_+/g, ' ')
    .replace(/\s*[–—]\s*/g, ' - ')
    .replace(/\s+-\s*/g, ' - ')
    .replace(/\s*-\s+/g, ' - ')
    .replace(/(\d)\s*-\s*(\D)/g, '$1 - $2')
    .replace(/(\D)\s*-\s*(\d)/g, '$1 - $2')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–—.·:]+/, '')
    .replace(/[\s\-–—.·:]+$/, '')
    .trim()
}

/** Zahl als Ziffernfolge – Zahlwörter sind beim Vergleichen schon umgeschrieben. */
function isNumber(value: string): boolean {
  return /^\d+$/.test(value)
}

function stripOnePrefix(name: string, prefix: string): string | null {
  const wanted = tokenize(prefix)
    .map((token) => token.value)
    .filter((value) => !FILLER_WORDS.has(value))
  if (wanted.length === 0) return null

  const tokens = tokenize(name)
  let index = 0
  let matched = 0

  while (matched < wanted.length && index < tokens.length) {
    const token = tokens[index]!

    if (token.value === wanted[matched]) {
      matched += 1
      index += 1
      continue
    }

    // Vor dem Reihennamen dürfen Füllwörter und Zahlen stehen, zwischen seinen
    // Wörtern nur Füllwörter. Ein echtes Wort davor heisst: kein Präfix.
    const ueberspringbar =
      matched === 0
        ? FILLER_WORDS.has(token.value) || isNumber(token.value)
        : FILLER_WORDS.has(token.value)
    if (!ueberspringbar) return null
    index += 1
  }

  if (matched < wanted.length) return null

  const rest = name
    .slice(tokens[index - 1]!.end)
    .replace(/^[\s\p{P}]+/u, '')
    .trim()
  if (rest === '') return null

  // Geht es klein weiter, war der Reihenname Teil des Satzes und kein Präfix:
  // „5 Freunde auf der Felseninsel" darf nicht „auf der Felseninsel" heissen.
  if (/^\p{Ll}/u.test(rest)) return null

  return rest
}

/**
 * Nimmt den Reihennamen vorn aus einem Titel heraus – oder lässt ihn stehen.
 *
 * Nur Füllwörter und eine führende Zahl dürfen übersprungen werden, keine
 * echten Wörter: „Abenteuer mit Bibi Blocksberg - Hexerei" ist kein
 * „Bibi Blocksberg"-Präfix und bleibt deshalb stehen.
 */
export function stripSeriesPrefix(name: string, candidates: readonly (string | null)[]): string {
  let shortest = name
  for (const candidate of candidates) {
    if (candidate === null || candidate.trim() === '') continue
    const stripped = stripOnePrefix(name, candidate)
    if (stripped !== null && stripped.length < shortest.length) shortest = stripped
  }
  return shortest
}

export interface NumberedTitle {
  /** Folgennummer, wenn im Titel eine steckt. */
  number: number | null
  title: string
}

/**
 * Trennt eine führende Folgennummer ab.
 *
 * Drei Schreibweisen kommen auf einem gewachsenen NAS vor: mit Trennzeichen
 * („01 - Die Handy-Falle“), mit Wort davor („Folge 103 SOS im Bike-Park“) und
 * nur mit Leerzeichen („79 Achtung, Abenteuer!“). Ein angehängter Buchstabe
 * gehört zur Nummer: „50A“, „50B“ und „50C“ sind die drei Teile von Fall 50.
 *
 * Die dritte Schreibweise ist die heikle – sie unterscheidet sich von einem
 * Titel, der mit einer Zahl anfängt, nur durch die Absicht. Deshalb gilt sie
 * erst ab zwei Ziffern oder mit führender Null: „5 Freunde“ behält seine Fünf,
 * „01 Panik im Paradies“ wird Folge 1. Und ohne Leerraum dahinter zählt gar
 * nichts, sonst würde aus „1984“ die Folge 198.
 */
export function splitNumber(raw: string): NumberedTitle {
  const tidy = tidyName(raw)
  const match =
    /^(?:(folge|teil|nr|episode|kapitel)\.?\s*)?(\d{1,3})[a-z]?(\s*[-–—.)_:]\s*|\s+)(.+)$/i.exec(
      tidy,
    )
  if (!match) return { number: null, title: tidy === '' ? raw.trim() : tidy }

  const [, wort, ziffern = '', trenner = '', title = ''] = match
  const angesagt = wort !== undefined || /[-–—.)_:]/.test(trenner)
  if (!angesagt && ziffern.length < 2 && !ziffern.startsWith('0')) {
    return { number: null, title: tidy }
  }

  return { number: Number(ziffern), title: tidyName(title) }
}

/** `5` → `05` – zweistellig liest sich in einer Liste ruhiger. */
export function formatSeriesIndex(index: number): string {
  return index >= 0 && index < 10 ? `0${String(index)}` : String(index)
}

/**
 * Räumt den Titel aus dem Katalog auf.
 *
 * Erst die Nummer, dann die Reihe: Sonst verschwände eine Nummer, die vor dem
 * Reihennamen steht – „068 - Bibi Blocksberg - Der Schulausflug" soll Folge 68
 * bleiben. Stand sie dahinter, kommt sie danach zum Vorschein.
 */
function cleanCatalogTitle(book: Book): NumberedTitle {
  const zuerst = splitNumber(book.title)
  const ohneReihe = stripSeriesPrefix(zuerst.title, [book.series, book.group])

  return zuerst.number === null
    ? splitNumber(ohneReihe)
    : { number: zuerst.number, title: tidyName(ohneReihe) }
}

/**
 * Räumt einen Katalogeintrag für die Anzeige auf.
 *
 * Ein von Hand gesetzter Titel gewinnt über alles Erkannte und wird nicht
 * angerührt – nur die Nummer wird abgetrennt, damit sie nicht doppelt
 * erscheint: Wer „05 - Chaos im Dunkeln“ hinschreibt, liest genau das und
 * nicht „05 - 05 - Chaos im Dunkeln“.
 */
export function tidyBook(book: Book, override?: string | null): Book {
  const eigener = override?.trim() ?? ''
  const { number, title } = eigener === '' ? cleanCatalogTitle(book) : splitNumber(eigener)

  return {
    ...book,
    title: title === '' ? book.title : title,
    // Die erkannte Nummer gewinnt: Sie steht im Titel und muss zu ihm passen.
    seriesIndex: number ?? book.seriesIndex,
  }
}


/** „05 - Chaos im Dunkeln“ – der Titel, wie er in einer Reihe untereinander steht. */
export function bookLabel(book: Book): string {
  if (book.seriesIndex === null) return book.title
  return `${formatSeriesIndex(book.seriesIndex)} - ${book.title}`
}

/**
 * Wendet die im Adminbereich gesetzten Titel auf den ganzen Katalog an.
 *
 * Sortiert wird danach, nicht hier: `sortBooks` vergleicht die aufgeräumten
 * Titel samt Nummer, und die gibt es erst nach diesem Schritt.
 */
export function tidyBooks(
  books: readonly Book[],
  overrides: ReadonlyMap<string, string> = new Map(),
): Book[] {
  return books.map((book) => tidyBook(book, overrides.get(book.id)))
}
