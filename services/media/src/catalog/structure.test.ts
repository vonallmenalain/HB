import { describe, expect, it } from 'vitest'

import {
  isDiscFolder,
  overrideForEpisode,
  partName,
  partsOfOneBook,
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

describe('partName', () => {
  it('erkennt benannte Teile eines Werks', () => {
    for (const name of ['CD1', 'CD 2', 'cd_03', 'Disc 4', 'Teil 2', 'Part 7', 'Seite 1']) {
      expect(partName(name)?.number).toBeGreaterThan(0)
    }
  })

  it('liest die Nummer und lässt den Rest übrig', () => {
    expect(partName('CD 3')).toEqual({ rest: '', number: 3 })
    expect(partName('Feuerkelch CD 3')).toEqual({ rest: 'feuerkelch', number: 3 })
    // „von 20" sagt dasselbe wie die Zahl selbst und darf den Rest nicht
    // verändern – sonst hätte CD 1 einen anderen Rest als CD 2.
    expect(partName('CD 3 von 20')).toEqual({ rest: '', number: 3 })
    expect(partName('CD 3 - Der Wald')).toEqual({ rest: 'der wald', number: 3 })
  })

  it('zählt blosse Nummern und Folgen nicht dazu', () => {
    // Daraus wird ein Buch gemacht – bei „01", „02" oder „Folge 3" wären das
    // zwanzig Folgen, die zu einem einzigen Buch verschmelzen.
    for (const name of ['01', '2', 'Folge 3', 'track 4', '2019', 'Discworld 1']) {
      expect(partName(name)).toBeNull()
    }
  })
})

describe('partsOfOneBook', () => {
  it('fasst CD-Ordner nebeneinander zu einem Buch zusammen', () => {
    expect(partsOfOneBook(['CD 1', 'CD 2', 'CD 10'])).toEqual(['CD 1', 'CD 2', 'CD 10'])
  })

  it('nimmt den Namen des Werks vor der CD-Angabe hin', () => {
    // Auf dem NAS steht er oft in jedem Teil noch einmal drin.
    expect(partsOfOneBook(['Feuerkelch CD 1', 'Feuerkelch CD 2'])).toHaveLength(2)
    expect(partsOfOneBook(['CD 1 von 20', 'CD 2 von 20'])).toHaveLength(2)
  })

  it('lässt liegen, was daneben liegt', () => {
    // Genau daran scheiterte es auf dem NAS: Ein einziger Ordner, der keine CD
    // war, und aus einem Hörbuch blieben zwanzig.
    expect(partsOfOneBook(['CD 1', 'CD 2', 'Bonus', 'Booklet'])).toEqual(['CD 1', 'CD 2'])
  })

  it('braucht mindestens zwei Teile', () => {
    // Ein einzelner CD-Ordner ist der andere Fall: Er wird übersprungen, das
    // Buch heisst nach dem Ordner darüber.
    expect(partsOfOneBook(['CD 1'])).toEqual([])
  })

  it('lässt Folgen-Ordner in Ruhe', () => {
    expect(partsOfOneBook(['Folge 1', 'Folge 2'])).toEqual([])
    expect(partsOfOneBook(['01', '02'])).toEqual([])
    expect(partsOfOneBook([])).toEqual([])
  })

  it('lässt Teile mit eigener Aussage getrennt', () => {
    // „CD 1 - Anfang" und „CD 2 - Das Ende" erzählen jeder für sich etwas;
    // zusammengeworfen wäre der Unterschied weg.
    expect(partsOfOneBook(['CD 1 - Anfang', 'CD 2 - Das Ende'])).toEqual([])
  })

  it('fasst nichts zusammen, wo zwei Werke nebeneinander liegen', () => {
    // Beide bekämen denselben Ordner und damit dieselbe Kennung.
    expect(partsOfOneBook(['Stein CD 1', 'Stein CD 2', 'Kelch CD 1', 'Kelch CD 2'])).toEqual([])
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
