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
  const pattern = /[\p{L}\p{N}]+|\?{2,}/gu
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

const MAX_LEAD_WORDS = 3

function stripOnePrefix(name: string, prefix: string): string | null {
  const wanted = tokenize(prefix)
    .map((token) => token.value)
    .filter((value) => !FILLER_WORDS.has(value))
  if (wanted.length === 0) return null

  const tokens = tokenize(name)

  for (let start = 0; start < Math.min(tokens.length, MAX_LEAD_WORDS); start += 1) {
    let index = start
    let matched = 0

    while (matched < wanted.length && index < tokens.length) {
      const token = tokens[index]!
      if (token.value === wanted[matched]) {
        matched += 1
        index += 1
      } else if (FILLER_WORDS.has(token.value)) {
        index += 1
      } else {
        break
      }
    }

    if (matched === wanted.length) {
      const cleaned = name
        .slice(tokens[index - 1]!.end)
        .replace(/^[\s\p{P}]+/u, '')
        .trim()
      if (cleaned !== '') return cleaned
    }
  }

  return null
}

/** Nimmt den Reihennamen vorn aus einem Titel heraus – oder lässt ihn stehen. */
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
 * Nur mit Trennzeichen dahinter: „1984“ ist ein Titel und „5 Freunde“ eine
 * Reihe – beide dürfen ihre Zahl behalten.
 */
export function splitNumber(raw: string): NumberedTitle {
  const tidy = tidyName(raw)
  const match = /^(?:(?:folge|teil|nr|episode|kapitel)\.?\s*)?(\d{1,3})\s*[-–—.)_:]\s*(.+)$/i.exec(
    tidy,
  )
  if (!match) return { number: null, title: tidy === '' ? raw.trim() : tidy }

  const [, index = '', title = ''] = match
  return { number: Number(index), title: tidyName(title) }
}

/** `5` → `05` – zweistellig liest sich in einer Liste ruhiger. */
export function formatSeriesIndex(index: number): string {
  return index >= 0 && index < 10 ? `0${String(index)}` : String(index)
}

/**
 * Räumt einen Katalogeintrag für die Anzeige auf.
 *
 * Ein von Hand gesetzter Titel gewinnt über alles Erkannte. Er wird genauso
 * zerlegt wie ein erkannter: Wer im Adminbereich „05 - Chaos im Dunkeln“
 * hinschreibt, bekommt genau das zu lesen – und nicht „05 - 05 - Chaos“.
 */
export function tidyBook(book: Book, override?: string | null): Book {
  const eigener = override?.trim() ?? ''
  const roh = eigener === '' ? stripSeriesPrefix(book.sourceTitle, [book.series, book.group]) : eigener
  const { number, title } = splitNumber(roh)

  return {
    ...book,
    title: title === '' ? book.sourceTitle : title,
    // Die erkannte Nummer gewinnt: Sie steht im Titel und muss zu ihm passen.
    seriesIndex: number ?? book.seriesIndex,
  }
}

/** „05 - Chaos im Dunkeln“ – der Titel, wie er in einer Reihe untereinander steht. */
export function bookLabel(book: Book): string {
  if (book.seriesIndex === null) return book.title
  return `${formatSeriesIndex(book.seriesIndex)} - ${book.title}`
}

/** Wendet die im Adminbereich gesetzten Titel auf den ganzen Katalog an. */
export function tidyBooks(
  books: readonly Book[],
  overrides: ReadonlyMap<string, string> = new Map(),
): Book[] {
  return books.map((book) => tidyBook(book, overrides.get(book.id)))
}
