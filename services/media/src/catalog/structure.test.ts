import { describe, expect, it } from 'vitest'

import {
  isDiscFolder,
  isPartFolder,
  isSplitAcrossParts,
  overrideForEpisode,
  splitsIntoEpisodes,
} from './structure.js'

describe('isDiscFolder', () => {
  it('erkennt Ordner, die nichts über den Inhalt sagen', () => {
    for (const name of ['CD1', 'CD 2', 'Disc 03', 'Teil 2', 'Folge 4', '01', 'track_5']) {
      expect(isDiscFolder(name)).toBe(true)
    }
  })

  it('lässt Jahreszahlen und Titel in Ruhe', () => {
    // „2019" unter „Adventskalender" ist eine Jahresangabe und damit sehr wohl
    // eine Aussage.
    for (const name of ['2019', 'Der Super-Papagei', '01 - Der Super-Papagei', 'Mini-Fälle']) {
      expect(isDiscFolder(name)).toBe(false)
    }
  })
})

describe('isPartFolder', () => {
  it('erkennt benannte Teile eines Werks', () => {
    for (const name of ['CD1', 'CD 2', 'cd_03', 'Disc 4', 'Teil 2', 'Part 7']) {
      expect(isPartFolder(name)).toBe(true)
    }
  })

  it('zählt blosse Nummern und Folgen nicht dazu', () => {
    // Daraus wird ein Buch gemacht – bei „01", „02" oder „Folge 3" wären das
    // zwanzig Folgen, die zu einem einzigen Buch verschmelzen.
    for (const name of ['01', '2', 'Folge 3', 'track 4', '2019']) {
      expect(isPartFolder(name)).toBe(false)
    }
  })
})

describe('isSplitAcrossParts', () => {
  it('fasst CD-Ordner nebeneinander zu einem Buch zusammen', () => {
    expect(isSplitAcrossParts(['CD 1', 'CD 2', 'CD 10'])).toBe(true)
  })

  it('braucht mindestens zwei Teile', () => {
    // Ein einzelner CD-Ordner ist der andere Fall: Er wird übersprungen, das
    // Buch heisst nach dem Ordner darüber.
    expect(isSplitAcrossParts(['CD 1'])).toBe(false)
  })

  it('lässt gemischte Ordner in Ruhe', () => {
    expect(isSplitAcrossParts(['CD 1', 'CD 2', 'Bonus'])).toBe(false)
    expect(isSplitAcrossParts(['Folge 1', 'Folge 2'])).toBe(false)
    expect(isSplitAcrossParts([])).toBe(false)
  })
})

describe('splitsIntoEpisodes', () => {
  it('trennt nur, wenn es in der buch.json steht', () => {
    expect(splitsIntoEpisodes({ einzelfolgen: true })).toBe(true)
  })

  it('bleibt im Zweifel beim einen Buch', () => {
    // Geraten wird hier nichts: Ein Roman mit langen, benannten Kapiteln sähe
    // von aussen aus wie neunzig Folgen – aus einem Buch würden zwölf, und
    // jede gemerkte Stelle zeigte ins Leere.
    expect(splitsIntoEpisodes(null)).toBe(false)
    expect(splitsIntoEpisodes({})).toBe(false)
    expect(splitsIntoEpisodes({ einzelfolgen: false })).toBe(false)
  })
})

describe('overrideForEpisode', () => {
  it('lässt gelten, was für alle Folgen gilt', () => {
    expect(
      overrideForEpisode({ series: 'Die Drei Ausrufezeichen', author: 'EUROPA', hidden: true }),
    ).toEqual({ series: 'Die Drei Ausrufezeichen', author: 'EUROPA', hidden: true })
  })

  it('nimmt Titel und Nummer heraus', () => {
    // Sie stünden sonst neunzigmal gleich da; sie kommen aus dem Dateinamen.
    expect(overrideForEpisode({ title: 'Die Handy-Falle', seriesIndex: 1, group: 'Sonderfolgen' })).toEqual(
      { group: 'Sonderfolgen' },
    )
  })

  it('kommt ohne buch.json aus', () => {
    expect(overrideForEpisode(null)).toBeNull()
  })
})
