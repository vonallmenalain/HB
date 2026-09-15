import { describe, expect, it } from 'vitest'

import { type Book, chapterAt, parseBook, parseCatalog, resolvePosition, sortBooks } from './catalog'

const FILE = { idx: 0, durationSec: 600, bytes: 1000, mime: 'audio/mpeg' }

function rawBook(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'b_1',
    title: 'Der Super-Papagei',
    series: 'Die drei ???',
    seriesIndex: 1,
    author: 'Robert Arthur',
    narrator: null,
    durationSec: 600,
    cover: '/cover/b_1.jpg',
    coverColor: '#6d28d9',
    tags: ['Krimi'],
    addedAt: '2026-01-01T00:00:00.000Z',
    filesHash: 'abc',
    files: [FILE],
    chapters: [{ idx: 0, title: 'Kapitel 1', fileIdx: 0, startSec: 0, endSec: 600 }],
    ...overrides,
  }
}

function book(overrides: Partial<Book> = {}): Book {
  return { ...parseBook(rawBook())!, ...overrides }
}

describe('parseCatalog', () => {
  it('liest einen gültigen Katalog', () => {
    const result = parseCatalog({
      schemaVersion: 1,
      generatedAt: '2026-01-01T00:00:00.000Z',
      books: [rawBook()],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.catalog.books).toHaveLength(1)
    expect(result.skipped).toBe(0)
  })

  it('überspringt einzelne kaputte Bücher, statt alles zu verwerfen', () => {
    // Ein defekter Eintrag darf dem Kind nicht die ganze Bibliothek nehmen.
    const result = parseCatalog({
      schemaVersion: 1,
      books: [rawBook(), { id: 'b_2' }, null, rawBook({ id: 'b_3' })],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.catalog.books.map((b) => b.id)).toEqual(['b_1', 'b_3'])
    expect(result.skipped).toBe(2)
  })

  it('meldet einen zu neuen Dienst, statt zu raten', () => {
    const result = parseCatalog({ schemaVersion: 99, books: [] })
    expect(result).toEqual({ ok: false, reason: 'unsupported-version' })
  })

  it('erkennt Unsinn', () => {
    expect(parseCatalog(null).ok).toBe(false)
    expect(parseCatalog('kaputt').ok).toBe(false)
    expect(parseCatalog({ books: [] }).ok).toBe(false)
    expect(parseCatalog({ schemaVersion: 1 }).ok).toBe(false)
  })
})

describe('parseBook', () => {
  it('verwirft Bücher ohne abspielbare Datei', () => {
    expect(parseBook(rawBook({ files: [] }))).toBeNull()
    expect(parseBook(rawBook({ files: 'keine Liste' }))).toBeNull()
    expect(parseBook(rawBook({ files: [{ kaputt: true }] }))).toBeNull()
  })

  it('verwirft Bücher ohne Kennung oder Titel', () => {
    expect(parseBook(rawBook({ id: null }))).toBeNull()
    expect(parseBook(rawBook({ title: '   ' }))).toBeNull()
  })

  it('erfindet Kapitel aus den Dateien, wenn keine geliefert werden', () => {
    const parsed = parseBook(
      rawBook({
        chapters: [],
        files: [FILE, { idx: 1, durationSec: 300, bytes: 500, mime: 'audio/mpeg' }],
      }),
    )

    expect(parsed?.chapters).toEqual([
      { idx: 0, title: 'Kapitel 1', fileIdx: 0, startSec: 0, endSec: 600 },
      { idx: 1, title: 'Kapitel 2', fileIdx: 1, startSec: 600, endSec: 900 },
    ])
  })

  it('rechnet eine fehlende Gesamtdauer aus den Dateien', () => {
    const parsed = parseBook(
      rawBook({
        durationSec: null,
        files: [FILE, { idx: 1, durationSec: 300, bytes: 500, mime: 'audio/mpeg' }],
      }),
    )
    expect(parsed?.durationSec).toBe(900)
  })

  it('siebt widersprüchliche Kapitel aus', () => {
    const parsed = parseBook(
      rawBook({
        chapters: [
          { idx: 0, title: 'Gut', fileIdx: 0, startSec: 0, endSec: 600 },
          { idx: 1, title: 'Rückwärts', fileIdx: 0, startSec: 600, endSec: 100 },
        ],
      }),
    )
    expect(parsed?.chapters.map((c) => c.title)).toEqual(['Gut'])
  })

  it('setzt Vorgaben für fehlende Nebenfelder', () => {
    const parsed = parseBook({ id: 'b_1', title: 'T', files: [FILE] })
    expect(parsed?.coverColor).toBe('#6d28d9')
    expect(parsed?.cover).toBeNull()
    expect(parsed?.tags).toEqual([])
    expect(parsed?.series).toBeNull()
  })
})

describe('resolvePosition', () => {
  const dreiTeile = book({
    files: [
      { idx: 0, durationSec: 600, bytes: 0, mime: 'audio/mpeg' },
      { idx: 1, durationSec: 700, bytes: 0, mime: 'audio/mpeg' },
      { idx: 2, durationSec: 500, bytes: 0, mime: 'audio/mpeg' },
    ],
  })

  it('findet die Datei zur globalen Sekunde', () => {
    expect(resolvePosition(dreiTeile, 0)).toEqual({ fileIdx: 0, offsetSec: 0 })
    expect(resolvePosition(dreiTeile, 599)).toEqual({ fileIdx: 0, offsetSec: 599 })
    expect(resolvePosition(dreiTeile, 600)).toEqual({ fileIdx: 1, offsetSec: 0 })
    expect(resolvePosition(dreiTeile, 1000)).toEqual({ fileIdx: 1, offsetSec: 400 })
    expect(resolvePosition(dreiTeile, 1300)).toEqual({ fileIdx: 2, offsetSec: 0 })
  })

  it('bleibt am Ende stehen, statt ins Leere zu laufen', () => {
    expect(resolvePosition(dreiTeile, 99999)).toEqual({ fileIdx: 2, offsetSec: 500 })
  })

  it('behandelt negative Werte als Anfang', () => {
    expect(resolvePosition(dreiTeile, -50)).toEqual({ fileIdx: 0, offsetSec: 0 })
  })
})

describe('chapterAt', () => {
  const zweiKapitel = book({
    chapters: [
      { idx: 0, title: 'Eins', fileIdx: 0, startSec: 0, endSec: 600 },
      { idx: 1, title: 'Zwei', fileIdx: 1, startSec: 600, endSec: 1300 },
    ],
  })

  it('findet das laufende Kapitel', () => {
    expect(chapterAt(zweiKapitel, 0)?.title).toBe('Eins')
    expect(chapterAt(zweiKapitel, 599)?.title).toBe('Eins')
    expect(chapterAt(zweiKapitel, 600)?.title).toBe('Zwei')
  })

  it('fällt am Ende auf das letzte Kapitel zurück', () => {
    expect(chapterAt(zweiKapitel, 99999)?.title).toBe('Zwei')
  })
})

describe('sortBooks', () => {
  it('gruppiert Reihen und sortiert darin nach Nummer', () => {
    const books = [
      book({ id: 'a', title: 'Zehn', series: 'Reihe', seriesIndex: 10 }),
      book({ id: 'b', title: 'Zwei', series: 'Reihe', seriesIndex: 2 }),
      book({ id: 'c', title: 'Einzeln', series: null, seriesIndex: null }),
    ]
    expect(sortBooks(books).map((b) => b.title)).toEqual(['Einzeln', 'Zwei', 'Zehn'])
  })
})

describe('coverLetter', () => {
  it('überspringt führende Artikel', async () => {
    const { coverLetter } = await import('./catalog')
    // Ohne das trügen „Der …", „Die …" und „Das …" alle dieselbe Kachel.
    expect(coverLetter('Der Super-Papagei')).toBe('S')
    expect(coverLetter('Die Olchis')).toBe('O')
    expect(coverLetter('Das Bergmonster')).toBe('B')
    expect(coverLetter('Ein Fall für zwei')).toBe('F')
    expect(coverLetter('The Hobbit')).toBe('H')
  })

  it('nimmt den ersten Buchstaben, wenn kein Artikel davorsteht', async () => {
    const { coverLetter } = await import('./catalog')
    expect(coverLetter('Bibi Blocksberg')).toBe('B')
    expect(coverLetter('  ronja  ')).toBe('R')
  })

  it('kommt mit Titeln klar, die nur aus einem Artikel bestehen', async () => {
    const { coverLetter } = await import('./catalog')
    expect(coverLetter('Die')).toBe('D')
    expect(coverLetter('')).toBe('?')
    expect(coverLetter('   ')).toBe('?')
  })

  it('zerschneidet keine Emoji', async () => {
    const { coverLetter } = await import('./catalog')
    expect(coverLetter('🦊 Fuchs')).toBe('🦊')
  })
})

describe('fileStartSec / globalPosition', () => {
  const dreiTeile = book({
    files: [
      { idx: 0, durationSec: 600, bytes: 0, mime: 'audio/mpeg' },
      { idx: 1, durationSec: 700, bytes: 0, mime: 'audio/mpeg' },
      { idx: 2, durationSec: 500, bytes: 0, mime: 'audio/mpeg' },
    ],
    durationSec: 1800,
  })

  it('kennt den Anfang jeder Datei im Buch', async () => {
    const { fileStartSec } = await import('./catalog')
    expect(fileStartSec(dreiTeile, 0)).toBe(0)
    expect(fileStartSec(dreiTeile, 1)).toBe(600)
    expect(fileStartSec(dreiTeile, 2)).toBe(1300)
  })

  it('rechnet Datei und Versatz in eine globale Sekunde um', async () => {
    const { globalPosition } = await import('./catalog')
    expect(globalPosition(dreiTeile, 0, 0)).toBe(0)
    expect(globalPosition(dreiTeile, 1, 100)).toBe(700)
    expect(globalPosition(dreiTeile, 2, 500)).toBe(1800)
  })

  it('ist die Umkehrung von resolvePosition', async () => {
    const { globalPosition, resolvePosition } = await import('./catalog')
    for (const position of [0, 1, 599, 600, 1000, 1299, 1300, 1799]) {
      const { fileIdx, offsetSec } = resolvePosition(dreiTeile, position)
      expect(globalPosition(dreiTeile, fileIdx, offsetSec)).toBe(position)
    }
  })

  it('bleibt in den Grenzen des Buchs', async () => {
    const { globalPosition } = await import('./catalog')
    expect(globalPosition(dreiTeile, 0, -100)).toBe(0)
    expect(globalPosition(dreiTeile, 2, 99999)).toBe(1800)
  })
})
