import { describe, expect, it } from 'vitest'

import {
  audioMime,
  chapterTitle,
  isAudioFile,
  isCoverFile,
  naturalCompare,
  parseBookFolder,
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
