/**
 * Die Bibliothek in Fächer sortieren.
 *
 * Neun Reihen mit je zwanzig bis hundert Folgen sind als eine Liste unbrauchbar
 * – man scrollt an allem vorbei, was man sucht. „Alle Hörbücher“ zeigt deshalb
 * erst die Reihen und danach die Folgen einer Reihe, darin nach Unterordnern
 * gruppiert.
 */
import { type Book } from './catalog'

/** Reihe für Bücher, die direkt im Stammordner liegen. */
export const OHNE_REIHE = 'Einzelne Hörbücher'

export function seriesName(book: Book): string {
  const name = book.series?.trim() ?? ''
  return name === '' ? OHNE_REIHE : name
}

/**
 * Kennung einer Reihe für die Adresszeile.
 *
 * Lesbar statt gehasht: `/bibliothek/die-drei-fragezeichen-kids` sagt jemandem,
 * der auf den Bildschirm schaut, wo er ist.
 */
export function seriesSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug === '' ? 'reihe' : slug
}

export interface Series {
  slug: string
  name: string
  books: Book[]
  /** Das Buch, dessen Cover die Reihe bebildert. */
  cover: Book
}

/**
 * Fasst die Bücher zu Reihen zusammen.
 *
 * Kollidieren zwei Namen im Kürzel (etwa „Mini-Fälle“ und „Mini Fälle“), gewinnt
 * der erste und der zweite bekommt eine Ziffer angehängt – sonst zeigte eine
 * Adresse zwei verschiedene Reihen.
 */
export function buildSeries(books: readonly Book[]): Series[] {
  const byName = new Map<string, Book[]>()
  for (const book of books) {
    const name = seriesName(book)
    const list = byName.get(name)
    if (list) list.push(book)
    else byName.set(name, [book])
  }

  const slugs = new Set<string>()
  const series: Series[] = []

  for (const [name, gruppe] of byName) {
    let slug = seriesSlug(name)
    for (let suffix = 2; slugs.has(slug); suffix += 1) slug = `${seriesSlug(name)}-${String(suffix)}`
    slugs.add(slug)

    // Ein Cover ist besser als eine Buchstabenkachel – also das erste Buch der
    // Reihe nehmen, das eins hat.
    const cover = gruppe.find((book) => book.cover !== null) ?? gruppe[0]!
    series.push({ slug, name, books: gruppe, cover })
  }

  // Einzelne Hörbücher ans Ende: Sie sind eine Restekiste, keine Reihe.
  return series.sort((a, b) => {
    if ((a.name === OHNE_REIHE) !== (b.name === OHNE_REIHE)) return a.name === OHNE_REIHE ? 1 : -1
    return a.name.localeCompare(b.name, 'de')
  })
}

export function findSeries(books: readonly Book[], slug: string): Series | null {
  return buildSeries(books).find((series) => series.slug === slug) ?? null
}

/** Die Reihe, in der ein Buch steht – für den Weg zurück von der Buchseite. */
export function seriesOf(books: readonly Book[], book: Book): Series | null {
  const name = seriesName(book)
  return buildSeries(books).find((series) => series.name === name) ?? null
}

export interface BookGroup {
  /** Name des Unterordners, oder null für die Folgen direkt in der Reihe. */
  name: string | null
  books: Book[]
}

/**
 * Teilt eine Reihe in ihre Unterordner auf: „Adventskalender“, „Mini-Fälle“.
 *
 * Die Folgen ohne Unterordner stehen oben – das ist die Hauptreihe, alles
 * andere ein Sonderfach.
 */
export function groupBooks(books: readonly Book[]): BookGroup[] {
  const gruppen = new Map<string, Book[]>()
  const ohne: Book[] = []

  for (const book of books) {
    const name = book.group?.trim() ?? ''
    if (name === '') {
      ohne.push(book)
      continue
    }
    const list = gruppen.get(name)
    if (list) list.push(book)
    else gruppen.set(name, [book])
  }

  const sortiert = [...gruppen.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'de'))
    .map(([name, gruppe]) => ({ name, books: gruppe }))

  return ohne.length > 0 ? [{ name: null, books: ohne }, ...sortiert] : sortiert
}
