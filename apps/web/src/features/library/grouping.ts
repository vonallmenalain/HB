/**
 * Die Bibliothek in Fächer sortieren.
 *
 * Neun Reihen mit je zwanzig bis hundert Folgen sind als eine Liste unbrauchbar
 * – man scrollt an allem vorbei, was man sucht. „Alle Hörbücher“ zeigt deshalb
 * erst die Reihen und danach die Folgen einer Reihe, darin nach Unterordnern
 * gruppiert.
 *
 * Ein Hörbuch, das zu keiner Reihe gehört, ist davon ausgenommen: Es steht als
 * eigene Kachel zwischen den Reihen.
 */
import { type Book } from './catalog'

/** Die Reihe eines Buchs, oder null – dann steht es für sich. */
export function seriesName(book: Book): string | null {
  const name = book.series?.trim() ?? ''
  return name === '' ? null : name
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
 * Fasst die Bücher zu Reihen zusammen – ein Eintrag je Kachel der Übersicht.
 *
 * Ein Buch ohne Reihe bildet seinen eigenen Eintrag mit genau einem Buch und
 * erscheint damit als gewöhnliche Buchkachel, alphabetisch zwischen den Reihen.
 * Früher lagen diese Bücher zusammen in einem Fach „Einzelne Hörbücher": Wer
 * „Die unendliche Geschichte" suchte, musste erst wissen, dass sie in der
 * Restekiste liegt, und dann noch einen Tap dafür bezahlen. Etwas gemeinsam
 * haben die Bücher darin ohnehin nicht – ausser dass ihr Ordner eine Ebene
 * höher liegt als bei den anderen.
 *
 * Kollidieren zwei Namen im Kürzel (etwa „Mini-Fälle“ und „Mini Fälle“), gewinnt
 * der erste und der zweite bekommt eine Ziffer angehängt – sonst zeigte eine
 * Adresse zwei verschiedene Reihen.
 */
export function buildSeries(books: readonly Book[]): Series[] {
  // Die Liste führt die Reihenfolge, die Map findet die Reihe wieder: Ein Buch
  // ohne Reihe steht in der Liste, gehört aber in keine Map – sonst fielen zwei
  // gleichnamige Einzelbücher zusammen.
  const eintraege: { name: string; books: Book[] }[] = []
  const nachReihe = new Map<string, Book[]>()

  for (const book of books) {
    const name = seriesName(book)
    if (name === null) {
      eintraege.push({ name: book.title, books: [book] })
      continue
    }

    const vorhanden = nachReihe.get(name)
    if (vorhanden) {
      vorhanden.push(book)
      continue
    }
    const neu = [book]
    nachReihe.set(name, neu)
    eintraege.push({ name, books: neu })
  }

  const slugs = new Set<string>()
  const series: Series[] = []

  // Erst sortieren, dann Kürzel vergeben: Sonst hinge das „-2" an der Reihe,
  // die im Katalog zufällig später kommt – und damit an einer anderen, sobald
  // ein Buch dazukommt.
  for (const eintrag of [...eintraege].sort((a, b) => a.name.localeCompare(b.name, 'de'))) {
    let slug = seriesSlug(eintrag.name)
    for (let suffix = 2; slugs.has(slug); suffix += 1) {
      slug = `${seriesSlug(eintrag.name)}-${String(suffix)}`
    }
    slugs.add(slug)

    // Ein Cover ist besser als eine Buchstabenkachel – also das erste Buch der
    // Reihe nehmen, das eins hat.
    const cover = eintrag.books.find((book) => book.cover !== null) ?? eintrag.books[0]!
    series.push({ slug, name: eintrag.name, books: eintrag.books, cover })
  }

  return series
}

/** Wie viele echte Reihen die Bibliothek hat – Einzelbücher zählen nicht mit. */
export function countSeries(books: readonly Book[]): number {
  const namen = new Set<string>()
  for (const book of books) {
    const name = seriesName(book)
    if (name !== null) namen.add(name)
  }
  return namen.size
}

export function findSeries(books: readonly Book[], slug: string): Series | null {
  return buildSeries(books).find((series) => series.slug === slug) ?? null
}

/**
 * Die Reihe, in der ein Buch steht – für den Weg zurück von der Buchseite.
 *
 * Gesucht wird über die Zugehörigkeit, nicht über den Namen: Ein Einzelbuch
 * trägt seinen Titel als Namen, und der kann derselbe sein wie der einer Reihe.
 */
export function seriesOf(books: readonly Book[], book: Book): Series | null {
  return (
    buildSeries(books).find((series) => series.books.some((entry) => entry.id === book.id)) ??
    null
  )
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
 *
 * Ein Unterordner mit einem einzigen Hörbuch ist kein Fach: Seine Überschrift
 * sagt dasselbe wie die Kachel darunter, und bei hundert solchen Ordnern
 * besteht die Reihe aus hundert Überschriften mit je einer Kachel – eine pro
 * Zeile, statt so vieler, wie nebeneinander Platz haben. Die Bücher stehen
 * dann in der Hauptreihe, wo sie hingehören.
 */
export function groupBooks(books: readonly Book[]): BookGroup[] {
  const groesse = new Map<string, number>()
  for (const book of books) {
    const name = book.group?.trim() ?? ''
    if (name !== '') groesse.set(name, (groesse.get(name) ?? 0) + 1)
  }

  const gruppen = new Map<string, Book[]>()
  const ohne: Book[] = []

  for (const book of books) {
    const name = book.group?.trim() ?? ''
    if (name === '' || groesse.get(name) === 1) {
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
