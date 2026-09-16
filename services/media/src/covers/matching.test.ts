import { describe, expect, it } from 'vitest'

import { SICHER_AB, VORSCHLAG_AB, scoreHit, searchTerm } from './matching.js'

const KARPATENHUND = {
  series: 'Die drei ???',
  seriesIndex: 3,
  title: 'Der Karpatenhund',
}

describe('searchTerm', () => {
  it('sucht nach Reihe und Titel', () => {
    expect(searchTerm(KARPATENHUND)).toBe('Die drei ??? Der Karpatenhund')
  })

  it('schreibt die Reihe nicht doppelt hin', () => {
    expect(
      searchTerm({
        series: 'Bibi Blocksberg',
        seriesIndex: 1,
        title: 'Bibi Blocksberg und das Hexenkraut',
      }),
    ).toBe('Bibi Blocksberg und das Hexenkraut')
  })

  it('lässt die Folgennummer weg', () => {
    // Die Quellen schreiben sie mal „Folge 3", mal „003", mal gar nicht – als
    // Suchwort schadet sie mehr, als sie nützt. Geprüft wird sie danach.
    expect(searchTerm(KARPATENHUND)).not.toContain('3 ')
  })
})

describe('scoreHit', () => {
  it('erkennt denselben Titel in anderer Schreibweise', () => {
    // „Die drei ???" und „Die 3 Fragezeichen" sind dieselbe Reihe.
    const wert = scoreHit(KARPATENHUND, {
      title: 'Die drei Fragezeichen, Folge 3: Der Karpatenhund',
      artist: 'Die drei ???',
    })
    expect(wert).toBeGreaterThanOrEqual(SICHER_AB)
  })

  it('verwirft eine andere Folge derselben Reihe', () => {
    // Der eigentliche Riegel: Ohne ihn bekäme Folge 3 das Bild von Folge 30 –
    // die Reihe stimmt ja, und der Titel ist ähnlich lang.
    expect(
      scoreHit(KARPATENHUND, { title: 'Die drei ??? - Folge 30: Der rote Pirat', artist: null }),
    ).toBe(0)
  })

  it('bleibt unter der sicheren Schwelle, wenn der Treffer keine Nummer nennt', () => {
    // Dann lässt sich nicht bestätigen, dass es die richtige Folge ist – das
    // reicht für einen Vorschlag, nicht fürs stille Setzen.
    const wert = scoreHit(KARPATENHUND, {
      title: 'Der Karpatenhund',
      artist: 'Die drei Fragezeichen',
    })
    expect(wert).toBeGreaterThanOrEqual(VORSCHLAG_AB)
    expect(wert).toBeLessThan(SICHER_AB)
  })

  it('gibt einem fremden Hörspiel nichts', () => {
    expect(
      scoreHit(KARPATENHUND, { title: 'Bibi Blocksberg: Das Hexenkraut', artist: 'Kiddinx' }),
    ).toBeLessThan(VORSCHLAG_AB)
  })

  it('stört sich nicht an Anhängseln der Quelle', () => {
    // Verlag, „(Hörspiel)", „Remastered" – das darf nicht als Fehler zählen.
    const wert = scoreHit(KARPATENHUND, {
      title: 'Die drei ??? (Folge 3) - Der Karpatenhund [Hörspiel] (Remastered 2019)',
      artist: 'Europa / Sony Music',
    })
    expect(wert).toBeGreaterThanOrEqual(SICHER_AB)
  })

  it('kommt ohne Folgennummer im Buch aus', () => {
    const wert = scoreHit(
      { series: null, seriesIndex: null, title: 'Der Hobbit' },
      { title: 'Der Hobbit', artist: 'J.R.R. Tolkien' },
    )
    expect(wert).toBe(1)
  })
})
