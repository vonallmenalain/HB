import { describe, expect, it } from 'vitest'

import {
  audioMime,
  chapterTitle,
  formatSeriesIndex,
  isAudioFile,
  isCoverFile,
  naturalCompare,
  parseBookFolder,
  stripSeriesPrefix,
  tidyName,
  tileColor,
} from './naming.js'

describe('naturalCompare', () => {
  it('sortiert Zahlen als Zahlen, nicht als Text', () => {
    const files = ['10 - Kapitel.mp3', '2 - Kapitel.mp3', '1 - Kapitel.mp3']
    expect([...files].sort(naturalCompare)).toEqual([
      '1 - Kapitel.mp3',
      '2 - Kapitel.mp3',
      '10 - Kapitel.mp3',
    ])
  })

  it('kommt mit führenden Nullen klar', () => {
    expect([...['track10.mp3', 'track02.mp3', 'track1.mp3']].sort(naturalCompare)).toEqual([
      'track1.mp3',
      'track02.mp3',
      'track10.mp3',
    ])
  })

  it('sortiert reinen Text alphabetisch', () => {
    expect([...['Zebra', 'Apfel', 'Öl']].sort(naturalCompare)).toEqual(['Apfel', 'Öl', 'Zebra'])
  })

  it('stellt den kürzeren Namen voran, wenn der Anfang gleich ist', () => {
    expect([...['Kapitel 1 Teil 2', 'Kapitel 1']].sort(naturalCompare)).toEqual([
      'Kapitel 1',
      'Kapitel 1 Teil 2',
    ])
  })
})

describe('parseBookFolder', () => {
  it('trennt Nummer und Titel', () => {
    expect(parseBookFolder('01 - Der Super-Papagei')).toEqual({
      title: 'Der Super-Papagei',
      seriesIndex: 1,
    })
    expect(parseBookFolder('7. Das Bergmonster')).toEqual({
      title: 'Das Bergmonster',
      seriesIndex: 7,
    })
  })

  it('lässt Ordner ohne Nummer in Ruhe', () => {
    expect(parseBookFolder('Bibi Blocksberg')).toEqual({
      title: 'Bibi Blocksberg',
      seriesIndex: null,
    })
  })

  it('verwechselt eine Jahreszahl im Titel nicht mit einer Nummer', () => {
    expect(parseBookFolder('1984')).toEqual({ title: '1984', seriesIndex: null })
  })

  it('lässt die Zahl stehen, wo sie zum Namen gehört', () => {
    // „5 Freunde" ohne Trennzeichen dahinter ist eine Reihe, keine Nummer.
    expect(parseBookFolder('5 Freunde auf der Felseninsel')).toEqual({
      title: '5 Freunde auf der Felseninsel',
      seriesIndex: null,
    })
  })

  it('räumt Ordnernamen mit Reihe, Nummer und Titel auf', () => {
    expect(
      parseBookFolder('Die Drei Fragezeichen Kids-68-Chaos Im Dunkeln', ['Fragezeichen Kids']),
    ).toEqual({ title: 'Chaos Im Dunkeln', seriesIndex: 68 })

    expect(
      parseBookFolder('Die Drei Fragezeichen Kids - 05 -Mini-Fall - Alarm, die Ritter kommen!', [
        'Die 3 Fragezeichen Kids',
        'Mini-Fälle',
      ]),
    ).toEqual({ title: 'Mini-Fall - Alarm, die Ritter kommen!', seriesIndex: 5 })
  })

  it('versteht ausgeschriebene Folgenangaben', () => {
    expect(parseBookFolder('Folge 12 - Der Karpatenhund')).toEqual({
      title: 'Der Karpatenhund',
      seriesIndex: 12,
    })
  })

  it('behält die Nummer, wenn sie vor dem Reihennamen steht', () => {
    // Zuerst die Nummer, dann die Reihe – sonst wäre die Folge namenlos.
    expect(
      parseBookFolder('068 - Bibi Blocksberg - Der Schulausflug', ['Bibi Blocksberg']),
    ).toEqual({ title: 'Der Schulausflug', seriesIndex: 68 })
  })
})

describe('tidyName', () => {
  it('macht aus jeder Schreibweise denselben Trenner', () => {
    expect(tidyName('Kids-68-Chaos Im Dunkeln')).toBe('Kids - 68 - Chaos Im Dunkeln')
    expect(tidyName('05 -Mini-Fall - Alarm, die Ritter kommen!')).toBe(
      '05 - Mini-Fall - Alarm, die Ritter kommen!',
    )
    expect(tidyName('68_Chaos_Im_Dunkeln')).toBe('68 Chaos Im Dunkeln')
  })

  it('lässt Bindestriche in Wörtern stehen', () => {
    // „Mini-Fall" ist ein Wort, kein Trenner – das muss der Unterschied
    // aushalten, sonst steht überall „Mini - Fall".
    expect(tidyName('Der Super-Papagei')).toBe('Der Super-Papagei')
    expect(tidyName('Mini-Fall am Wochenende')).toBe('Mini-Fall am Wochenende')
  })

  it('räumt Reste an den Rändern weg', () => {
    expect(tidyName('  - Der Phantomsee -  ')).toBe('Der Phantomsee')
  })
})

describe('stripSeriesPrefix', () => {
  it('nimmt den Reihennamen vorn heraus', () => {
    expect(
      stripSeriesPrefix('Die Drei Fragezeichen Kids - 05 - Alarm', ['Fragezeichen Kids']),
    ).toBe('05 - Alarm')
  })

  it('erkennt die Reihe auch in anderer Schreibweise', () => {
    // Ordner heisst „Die 3 Fragezeichen", die Folgen schreiben „Die drei ???".
    expect(stripSeriesPrefix('Die drei ??? - 01 - Der Super-Papagei', ['Die 3 Fragezeichen'])).toBe(
      '01 - Der Super-Papagei',
    )
    expect(stripSeriesPrefix('Fünf Freunde 12 - Auf der Felseninsel', ['5 Freunde'])).toBe(
      '12 - Auf der Felseninsel',
    )
  })

  it('lässt den Namen in Ruhe, wenn die Reihe nicht vorn steht', () => {
    expect(stripSeriesPrefix('Der Fall der Kids', ['Kids'])).toBe('Der Fall der Kids')
    expect(stripSeriesPrefix('Chaos im Dunkeln', ['Bibi Blocksberg'])).toBe('Chaos im Dunkeln')
  })

  it('überspringt keine echten Wörter vor dem Reihennamen', () => {
    // „Abenteuer mit" gehört zum Titel. Würde es übersprungen, bliebe von der
    // Folge nur „Hexerei" übrig.
    expect(stripSeriesPrefix('Abenteuer mit Bibi Blocksberg - Hexerei', ['Bibi Blocksberg'])).toBe(
      'Abenteuer mit Bibi Blocksberg - Hexerei',
    )
  })

  it('lässt den Reihennamen stehen, wo er Teil des Satzes ist', () => {
    // Bliebe nur „auf der Felseninsel" übrig, wäre der Titel ein Satzfragment.
    expect(stripSeriesPrefix('5 Freunde auf der Felseninsel', ['5 Freunde'])).toBe(
      '5 Freunde auf der Felseninsel',
    )
  })

  it('schrumpft einen Titel nie auf nichts zusammen', () => {
    expect(stripSeriesPrefix('Bibi Blocksberg', ['Bibi Blocksberg'])).toBe('Bibi Blocksberg')
  })
})

describe('formatSeriesIndex', () => {
  it('schreibt einstellige Nummern zweistellig', () => {
    expect(formatSeriesIndex(5)).toBe('05')
    expect(formatSeriesIndex(68)).toBe('68')
    expect(formatSeriesIndex(112)).toBe('112')
  })
})

describe('chapterTitle', () => {
  it('nimmt den ID3-Titel, wenn er etwas taugt', () => {
    expect(chapterTitle('01.mp3', 'Der Papagei spricht', 1)).toBe('Der Papagei spricht')
  })

  it('verwirft nichtssagende ID3-Titel', () => {
    // „Track 5“ steht in unzähligen Rips und hilft niemandem.
    expect(chapterTitle('05 - Die Verfolgung.mp3', 'Track 5', 5)).toBe('Die Verfolgung')
    expect(chapterTitle('05 - Die Verfolgung.mp3', '   ', 5)).toBe('Die Verfolgung')
    expect(chapterTitle('05 - Die Verfolgung.mp3', null, 5)).toBe('Die Verfolgung')
  })

  it('räumt den Dateinamen auf', () => {
    expect(chapterTitle('track04_Das_Versteck.mp3', null, 4)).toBe('Das Versteck')
    expect(chapterTitle('Kapitel 03 - Nachts.mp3', null, 3)).toBe('Nachts')
  })

  it('fällt auf die Position zurück, wenn nichts übrig bleibt', () => {
    expect(chapterTitle('07.mp3', null, 7)).toBe('Kapitel 7')
    expect(chapterTitle('track12.mp3', null, 12)).toBe('Kapitel 12')
  })
})

describe('Dateierkennung', () => {
  it('erkennt Audioformate samt MIME-Typ', () => {
    expect(audioMime('a.mp3')).toBe('audio/mpeg')
    expect(audioMime('a.M4B')).toBe('audio/mp4')
    expect(audioMime('a.opus')).toBe('audio/ogg')
    expect(isAudioFile('a.mp3')).toBe(true)
  })

  it('hält Nicht-Audio heraus', () => {
    expect(audioMime('cover.jpg')).toBeNull()
    expect(audioMime('liesmich')).toBeNull()
    expect(isAudioFile('buch.json')).toBe(false)
  })

  it('erkennt übliche Cover-Dateinamen', () => {
    expect(isCoverFile('cover.jpg')).toBe(true)
    expect(isCoverFile('Folder.PNG')).toBe(true)
    expect(isCoverFile('front.webp')).toBe(true)
    expect(isCoverFile('urlaubsfoto.jpg')).toBe(false)
    expect(isCoverFile('cover.txt')).toBe(false)
  })
})

describe('tileColor', () => {
  it('gibt demselben Titel immer dieselbe Farbe', () => {
    expect(tileColor('Der Super-Papagei')).toBe(tileColor('Der Super-Papagei'))
  })

  it('liefert immer eine Farbe aus der Palette', () => {
    for (const seed of ['a', 'Bibi', 'Ω', '', '🦊']) {
      expect(tileColor(seed)).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})
