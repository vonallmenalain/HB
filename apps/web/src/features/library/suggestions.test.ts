import { describe, expect, it } from 'vitest'

import { makeBook, makeProgressEntry } from '@/test/renderWithProfiles'

import { suggestBooks } from './suggestions'

const kids = (index: number, group: string | null = null) =>
  makeBook({
    id: `kids_${String(index)}`,
    title: `Folge ${String(index)}`,
    series: 'Fragezeichen Kids',
    group,
    seriesIndex: index,
    addedAt: '2026-01-01T00:00:00.000Z',
  })

describe('suggestBooks', () => {
  it('schlägt die nächsten Folgen derselben Reihe vor', () => {
    const books = [kids(4), kids(5), kids(6), kids(7), kids(8), kids(9)]
    const entries = [makeProgressEntry({ bookId: 'kids_5', positionSec: 400 })]

    const vorschlaege = suggestBooks({ books, entries, limit: 3 })

    expect(vorschlaege.map((book) => book.id)).toEqual(['kids_6', 'kids_7', 'kids_8'])
  })

  it('bleibt im Fach, in dem gehört wurde', () => {
    // Mini-Fälle sind eine eigene Ablage in derselben Reihe – wer dort hört,
    // will dort weiterhören.
    const books = [kids(6), kids(2, 'Mini-Fälle'), kids(3, 'Mini-Fälle')]
    const entries = [makeProgressEntry({ bookId: 'kids_2', positionSec: 400 })]

    const vorschlaege = suggestBooks({ books, entries, limit: 2 })

    expect(vorschlaege[0]?.id).toBe('kids_3')
  })

  it('lässt weg, was schon gehört oder anderswo zu sehen ist', () => {
    const books = [kids(5), kids(6), kids(7)]
    const entries = [makeProgressEntry({ bookId: 'kids_5', positionSec: 400 })]

    const vorschlaege = suggestBooks({
      books,
      entries,
      exclude: new Set(['kids_6']),
      limit: 5,
    })

    expect(vorschlaege.map((book) => book.id)).toEqual(['kids_7'])
  })

  it('zählt einen versehentlichen Tap nicht als gehört', () => {
    const books = [kids(5), kids(6)]
    const entries = [makeProgressEntry({ bookId: 'kids_5', positionSec: 2, durationSec: 3600 })]

    // Ohne echtes Hören gibt es keine Fortsetzung, sondern nur Neues.
    const vorschlaege = suggestBooks({ books, entries, limit: 5 })
    expect(vorschlaege.map((book) => book.id).sort()).toEqual(['kids_5', 'kids_6'])
  })

  it('zeigt am ersten Tag das zuletzt Dazugekommene', () => {
    const books = [
      makeBook({ id: 'b_alt', addedAt: '2026-01-01T00:00:00.000Z' }),
      makeBook({ id: 'b_neu', addedAt: '2026-05-01T00:00:00.000Z' }),
    ]

    const vorschlaege = suggestBooks({ books, entries: [], limit: 1 })
    expect(vorschlaege.map((book) => book.id)).toEqual(['b_neu'])
  })

  it('reiht Fächer nach der gehörten Zeit', () => {
    const books = [
      kids(5),
      kids(6),
      makeBook({ id: 'bibi_1', series: 'Bibi', seriesIndex: 1 }),
      makeBook({ id: 'bibi_2', series: 'Bibi', seriesIndex: 2 }),
    ]
    const entries = [
      makeProgressEntry({ bookId: 'kids_5', positionSec: 100 }),
      makeProgressEntry({ bookId: 'bibi_1', positionSec: 3000 }),
    ]

    const vorschlaege = suggestBooks({ books, entries, limit: 2 })
    expect(vorschlaege[0]?.id).toBe('bibi_2')
  })
})
