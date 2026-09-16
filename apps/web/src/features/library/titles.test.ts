import { describe, expect, it } from 'vitest'

import { makeBook } from '@/test/renderWithProfiles'

import { sortBooks } from './catalog'
import { bookLabel, splitNumber, stripSeriesPrefix, tidyBook, tidyBooks, tidyName } from './titles'

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

  it('erkennt die Reihe auch ohne Leerzeichen', () => {
    expect(stripSeriesPrefix('5Freunde - 001 - beim Wanderzirkus', ['5 Freunde'])).toBe(
      '001 - beim Wanderzirkus',
    )
  })

  it('lässt einen Titel stehen, der nur zufällig so anfängt', () => {
    expect(stripSeriesPrefix('Der Fall der Kids', ['Kids'])).toBe('Der Fall der Kids')
    expect(stripSeriesPrefix('Abenteuer mit Bibi Blocksberg - Hexerei', ['Bibi Blocksberg'])).toBe(
      'Abenteuer mit Bibi Blocksberg - Hexerei',
    )
    // Der Reihenname gehört hier zum Satz – „auf der Felseninsel" wäre ein
    // Fragment.
    expect(stripSeriesPrefix('5 Freunde auf der Felseninsel', ['5 Freunde'])).toBe(
      '5 Freunde auf der Felseninsel',
    )
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

  it('erkennt die Nummer auch ohne Trennzeichen dahinter', () => {
    expect(splitNumber('79 Achtung, Abenteuer!')).toEqual({
      number: 79,
      title: 'Achtung, Abenteuer!',
    })
    expect(splitNumber('Folge 103 SOS im Bike-Park')).toEqual({
      number: 103,
      title: 'SOS im Bike-Park',
    })
  })

  it('zählt einen angehängten Buchstaben zur Nummer', () => {
    // „50A", „50B", „50C" sind die drei Teile von Fall 50 und gehören
    // zwischen 49 und 51.
    expect(splitNumber('50A - Freundinnen in Gefahr I')).toEqual({
      number: 50,
      title: 'Freundinnen in Gefahr I',
    })
  })
})

describe('tidyBooks und sortBooks zusammen', () => {
  it('stellt Folge 01 nach oben, egal wie die Nummer geschrieben ist', () => {
    // Genau die Reihenfolge aus der Bibliothek: „50A" und „75A" standen vor
    // „01", weil ihre Nummer im Titel steckenblieb und eine Ziffer vor jedem
    // Buchstaben steht.
    const books = sortBooks(tidyBooks([
      makeBook({ id: 'b_1', title: '50A - Freundinnen in Gefahr I', seriesIndex: null }),
      makeBook({ id: 'b_2', title: '125 - Spurlos', seriesIndex: null }),
      makeBook({ id: 'b_3', title: '02 - Betrug beim Casting', seriesIndex: null }),
      makeBook({ id: 'b_4', title: '01 - Die Handy-Falle', seriesIndex: null }),
      makeBook({ id: 'b_5', title: 'Folge 103 SOS im Bike-Park', seriesIndex: null }),
    ]))

    expect(books.map((book) => book.seriesIndex)).toEqual([1, 2, 50, 103, 125])
  })

  it('stellt Bücher ohne Nummer hinter die nummerierten', () => {
    const books = sortBooks(tidyBooks([
      makeBook({ id: 'b_1', title: 'Der Anfang', seriesIndex: null }),
      makeBook({ id: 'b_2', title: '02 - Zwei', seriesIndex: null }),
    ]))

    expect(books.map((book) => book.title)).toEqual(['Zwei', 'Der Anfang'])
  })

  it('hält Reihen zusammen', () => {
    const books = sortBooks(tidyBooks([
      makeBook({ id: 'b_1', title: '02 - Zwei', series: 'Zweite Reihe', seriesIndex: null }),
      makeBook({ id: 'b_2', title: '01 - Eins', series: 'Erste Reihe', seriesIndex: null }),
      makeBook({ id: 'b_3', title: '01 - Eins', series: 'Zweite Reihe', seriesIndex: null }),
    ]))

    expect(books.map((book) => book.id)).toEqual(['b_2', 'b_3', 'b_1'])
  })
})

describe('tidyBook', () => {
  it('räumt den Titel auf, den der Dienst geliefert hat', () => {
    // Genau der Fall aus der gewachsenen Sammlung: Die Reihe steht im
    // Ordnernamen jeder Folge noch einmal drin.
    const book = tidyBook(
      makeBook({
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
        title: 'Mini-Fälle - 05 - Alarm, die Ritter kommen!',
        series: 'Fragezeichen Kids',
        group: 'Mini-Fälle',
        seriesIndex: null,
      }),
    )

    expect(bookLabel(book)).toBe('05 - Alarm, die Ritter kommen!')
  })

  it('lässt einen von Hand gesetzten Titel gewinnen', () => {
    const book = tidyBook(
      makeBook({ title: 'Kids-68-Chaos', seriesIndex: 68 }),
      '68 - Chaos im Dunkeln',
    )

    expect(book.title).toBe('Chaos im Dunkeln')
    // Die Nummer steht nur einmal da, nicht zweimal.
    expect(bookLabel(book)).toBe('68 - Chaos im Dunkeln')
  })

  it('behält die Nummer, wenn sie vor dem Reihennamen steht', () => {
    // Sonst wäre die Folge namenlos: „068 - …" fiele beim Kürzen weg.
    const book = tidyBook(
      makeBook({
        title: '068 - Bibi Blocksberg - Der Schulausflug',
        series: 'Bibi Blocksberg',
        seriesIndex: null,
      }),
    )

    expect(bookLabel(book)).toBe('68 - Der Schulausflug')
  })

  it('überspringt keine echten Wörter vor dem Reihennamen', () => {
    const book = tidyBook(
      makeBook({
        title: 'Abenteuer mit Bibi Blocksberg - Hexerei',
        series: 'Bibi Blocksberg',
        seriesIndex: null,
      }),
    )

    expect(book.title).toBe('Abenteuer mit Bibi Blocksberg - Hexerei')
  })

  it('nimmt das Bindewort hinter dem Reihennamen mit', () => {
    const book = tidyBook(
      makeBook({
        title: 'Die drei Fragezeichen und der Karpatenhund',
        series: 'Die 3 Fragezeichen',
        group: null,
        seriesIndex: 3,
      }),
    )

    expect(bookLabel(book)).toBe('03 - Der Karpatenhund')
  })

  it('lässt eine Präposition stehen – das ist ein Satz, keine Aufzählung', () => {
    const book = tidyBook(
      makeBook({
        title: '5 Freunde auf der Felseninsel',
        series: '5 Freunde',
        group: null,
        seriesIndex: null,
      }),
    )

    expect(book.title).toBe('5 Freunde auf der Felseninsel')
  })

  it('behält den Titel, wenn nichts aufzuräumen ist', () => {
    const book = tidyBook(
      makeBook({ title: 'Der Super-Papagei', series: 'Die drei ???', seriesIndex: 1 }),
    )
    expect(bookLabel(book)).toBe('01 - Der Super-Papagei')
  })
})
