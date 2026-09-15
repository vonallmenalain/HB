import { describe, expect, it } from 'vitest'

import { makeBook } from '@/test/renderWithProfiles'

import { bookLabel, splitNumber, stripSeriesPrefix, tidyBook, tidyName } from './titles'

describe('tidyName', () => {
  it('macht aus jeder Schreibweise denselben Trenner', () => {
    expect(tidyName('Kids-68-Chaos Im Dunkeln')).toBe('Kids - 68 - Chaos Im Dunkeln')
    expect(tidyName('05 -Mini-Fall - Alarm, die Ritter kommen!')).toBe(
      '05 - Mini-Fall - Alarm, die Ritter kommen!',
    )
  })

  it('lässt Bindestriche in Wörtern stehen', () => {
    expect(tidyName('Der Super-Papagei')).toBe('Der Super-Papagei')
  })
})

describe('stripSeriesPrefix', () => {
  it('nimmt den Reihennamen vorn heraus', () => {
    expect(stripSeriesPrefix('Die Drei Fragezeichen Kids - 05 - Alarm', ['Fragezeichen Kids'])).toBe(
      '05 - Alarm',
    )
    expect(stripSeriesPrefix('Die drei ??? - 01 - Der Super-Papagei', ['Die 3 Fragezeichen'])).toBe(
      '01 - Der Super-Papagei',
    )
  })

  it('lässt einen Titel stehen, der nur zufällig so anfängt', () => {
    expect(stripSeriesPrefix('Der Fall der Kids', ['Kids'])).toBe('Der Fall der Kids')
  })
})

describe('splitNumber', () => {
  it('trennt die Folgennummer ab', () => {
    expect(splitNumber('68 - Chaos Im Dunkeln')).toEqual({ number: 68, title: 'Chaos Im Dunkeln' })
  })

  it('lässt Zahlen in Ruhe, die zum Titel gehören', () => {
    expect(splitNumber('1984')).toEqual({ number: null, title: '1984' })
    expect(splitNumber('5 Freunde erforschen die Schatzinsel')).toEqual({
      number: null,
      title: '5 Freunde erforschen die Schatzinsel',
    })
  })
})

describe('tidyBook', () => {
  it('räumt den Titel auf, den der Dienst geliefert hat', () => {
    // Genau der Fall aus der gewachsenen Sammlung: Die Reihe steht im
    // Ordnernamen jeder Folge noch einmal drin.
    const book = tidyBook(
      makeBook({
        sourceTitle: 'Die Drei Fragezeichen Kids-68-Chaos Im Dunkeln',
        title: 'Die Drei Fragezeichen Kids-68-Chaos Im Dunkeln',
        series: 'Fragezeichen Kids',
        group: null,
        seriesIndex: null,
      }),
    )

    expect(book.title).toBe('Chaos Im Dunkeln')
    expect(book.seriesIndex).toBe(68)
    expect(bookLabel(book)).toBe('68 - Chaos Im Dunkeln')
  })

  it('nimmt auch den Namen des Unterordners heraus', () => {
    const book = tidyBook(
      makeBook({
        sourceTitle: 'Mini-Fälle - 05 - Alarm, die Ritter kommen!',
        series: 'Fragezeichen Kids',
        group: 'Mini-Fälle',
        seriesIndex: null,
      }),
    )

    expect(bookLabel(book)).toBe('05 - Alarm, die Ritter kommen!')
  })

  it('lässt einen von Hand gesetzten Titel gewinnen', () => {
    const book = tidyBook(
      makeBook({ sourceTitle: 'Kids-68-Chaos', seriesIndex: 68 }),
      '68 - Chaos im Dunkeln',
    )

    expect(book.title).toBe('Chaos im Dunkeln')
    // Die Nummer steht nur einmal da, nicht zweimal.
    expect(bookLabel(book)).toBe('68 - Chaos im Dunkeln')
  })

  it('behält den Titel, wenn nichts aufzuräumen ist', () => {
    const book = tidyBook(
      makeBook({ sourceTitle: 'Der Super-Papagei', series: 'Die drei ???', seriesIndex: 1 }),
    )
    expect(bookLabel(book)).toBe('01 - Der Super-Papagei')
  })
})
