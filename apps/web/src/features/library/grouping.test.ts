import { describe, expect, it } from 'vitest'

import { makeBook } from '@/test/renderWithProfiles'

import { OHNE_REIHE, buildSeries, findSeries, groupBooks, seriesSlug } from './grouping'

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
      'Die drei ??? Kids',
      OHNE_REIHE,
    ])
    expect(series.find((entry) => entry.name === 'Die drei ??? Kids')?.books).toHaveLength(2)
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
