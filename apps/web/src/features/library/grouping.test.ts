import { describe, expect, it } from 'vitest'

import { makeBook } from '@/test/renderWithProfiles'

import {
  buildSeries,
  countSeries,
  findSeries,
  groupBooks,
  seriesOf,
  seriesSlug,
} from './grouping'

const BOOKS = [
  makeBook({ id: 'b_1', series: 'Die drei ??? Kids', group: null, title: 'Chaos' }),
  makeBook({ id: 'b_2', series: 'Die drei ??? Kids', group: 'Mini-Fälle', title: 'Alarm' }),
  makeBook({ id: 'b_3', series: 'Bibi Blocksberg', group: null, title: 'Hexerei' }),
  makeBook({ id: 'b_4', series: null, group: null, title: 'Der Weihnachtsmann' }),
]

describe('buildSeries', () => {
  it('fasst die Bücher zu Reihen zusammen', () => {
    const series = buildSeries(BOOKS)
    expect(series.map((entry) => entry.name)).toEqual([
      'Bibi Blocksberg',
      'Der Weihnachtsmann',
      'Die drei ??? Kids',
    ])
    expect(series.find((entry) => entry.name === 'Die drei ??? Kids')?.books).toHaveLength(2)
  })

  it('stellt ein Buch ohne Reihe einzeln zwischen die Reihen', () => {
    // Früher lagen alle diese Bücher in einem Fach „Einzelne Hörbücher". Wer
    // „Die unendliche Geschichte" suchte, musste erst wissen, dass sie in der
    // Restekiste liegt – und dann noch einen Tap dafür bezahlen.
    const series = buildSeries([
      makeBook({ id: 'b_1', series: 'Bibi Blocksberg', title: 'Hexerei' }),
      makeBook({ id: 'b_2', series: null, title: 'Englisch' }),
      makeBook({ id: 'b_3', series: null, title: 'Die unendliche Geschichte' }),
    ])

    expect(series.map((entry) => entry.name)).toEqual([
      'Bibi Blocksberg',
      'Die unendliche Geschichte',
      'Englisch',
    ])
    // Ein Eintrag mit genau einem Buch – die Übersicht zeigt dafür die
    // Buchkachel und führt direkt zum Buch.
    for (const eintrag of series.slice(1)) expect(eintrag.books).toHaveLength(1)
  })

  it('wirft zwei gleichnamige Einzelbücher nicht zusammen', () => {
    // Zwei Ordner, ein Titel: Das gibt es auf einem gewachsenen NAS. Fielen sie
    // zu einem Eintrag zusammen, wäre aus zwei Kacheln eine Reihe mit zwei
    // Folgen geworden – und ein Buch von der Startseite verschwunden.
    const series = buildSeries([
      makeBook({ id: 'b_1', series: null, title: 'Gute Nacht' }),
      makeBook({ id: 'b_2', series: null, title: 'Gute Nacht' }),
    ])

    expect(series).toHaveLength(2)
    expect(new Set(series.map((entry) => entry.slug)).size).toBe(2)
  })

  it('nimmt für die Kachel ein Buch mit Cover', () => {
    const series = buildSeries([
      makeBook({ id: 'b_1', series: 'Reihe', cover: null }),
      makeBook({ id: 'b_2', series: 'Reihe', cover: '/cover/b_2.jpg' }),
    ])
    expect(series[0]?.cover.id).toBe('b_2')
  })

  it('vergibt eindeutige Kürzel, auch wenn zwei Namen gleich aussehen', () => {
    const series = buildSeries([
      makeBook({ id: 'b_1', series: 'Mini-Fälle' }),
      makeBook({ id: 'b_2', series: 'Mini Fälle' }),
    ])
    const slugs = series.map((entry) => entry.slug)
    expect(new Set(slugs).size).toBe(2)
  })

  it('findet eine Reihe über ihr Kürzel wieder', () => {
    expect(findSeries(BOOKS, seriesSlug('Die drei ??? Kids'))?.books).toHaveLength(2)
    expect(findSeries(BOOKS, 'gibtesnicht')).toBeNull()
  })
})

describe('countSeries', () => {
  it('zählt nur echte Reihen', () => {
    // Im Elternbereich steht die Zahl als „N Reihen". Einzelne Hörbücher sind
    // keine Reihe, auch wenn die Übersicht sie gleichberechtigt zeigt.
    expect(countSeries(BOOKS)).toBe(2)
  })
})

describe('seriesOf', () => {
  it('findet die Reihe eines Buchs, auch wenn ein Einzelbuch so heisst', () => {
    // Gesucht wird über die Zugehörigkeit, nicht über den Namen: Ein Einzelbuch
    // trägt seinen Titel als Namen des Eintrags, und der kann derselbe sein wie
    // der einer Reihe. Über den Namen fände der Weg zurück sonst die Kachel
    // statt der Reihe – und führte in die Übersicht statt zu den Geschwistern.
    const einzeln = makeBook({ id: 'b_9', series: null, title: 'Bibi Blocksberg' })
    const inReihe = makeBook({ id: 'b_3', series: 'Bibi Blocksberg', title: 'Hexerei' })
    const books = [einzeln, inReihe, makeBook({ id: 'b_4', series: 'Bibi Blocksberg' })]

    expect(seriesOf(books, inReihe)?.books).toHaveLength(2)
    expect(seriesOf(books, einzeln)?.books).toHaveLength(1)
  })
})

describe('groupBooks', () => {
  it('stellt die Hauptreihe vor die Unterordner', () => {
    const groups = groupBooks([
      makeBook({ id: 'b_1', group: 'Mini-Fälle' }),
      makeBook({ id: 'b_2', group: null }),
      makeBook({ id: 'b_3', group: 'Adventskalender' }),
      makeBook({ id: 'b_4', group: 'Mini-Fälle' }),
      makeBook({ id: 'b_5', group: 'Adventskalender' }),
    ])

    expect(groups.map((group) => group.name)).toEqual([null, 'Adventskalender', 'Mini-Fälle'])
  })

  it('lässt die Gruppe weg, wenn es keine gibt', () => {
    const groups = groupBooks([makeBook({ id: 'b_1', group: null })])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.name).toBeNull()
  })

  it('macht aus einem Unterordner mit einem einzigen Buch keinen Abschnitt', () => {
    // Auf dem NAS liegt manches Buch in einem Ordner, der nur seinen eigenen
    // Namen trägt. Ungefiltert stünde über jeder einzelnen Kachel eine
    // Überschrift mit demselben Text – und das Raster bräche auf eine Kachel
    // pro Zeile.
    const groups = groupBooks([
      makeBook({ id: 'b_1', group: '5Freunde - 001 - beim Wanderzirkus' }),
      makeBook({ id: 'b_2', group: '5Freunde - 002 - im Zeltlager' }),
      makeBook({ id: 'b_3', group: null }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.name).toBeNull()
    expect(groups[0]?.books.map((book) => book.id)).toEqual(['b_1', 'b_2', 'b_3'])
  })
})
