import { describe, expect, it } from 'vitest'

import { type BookInput, type ProbedFile, buildBook, parseOverride } from './build.js'

function file(overrides: Partial<ProbedFile> = {}): ProbedFile {
  return {
    fileName: '01 - Kapitel eins.mp3',
    bytes: 1_000_000,
    durationSec: 600,
    mime: 'audio/mpeg',
    tagTitle: null,
    tagArtist: null,
    tagAlbumArtist: null,
    discName: null,
    ...overrides,
  }
}

function input(overrides: Partial<BookInput> = {}): BookInput {
  return {
    relativePath: 'Die drei ???/01 - Der Super-Papagei',
    folderName: '01 - Der Super-Papagei',
    folderChain: ['Die drei ???'],
    files: [file()],
    coverAvailable: true,
    coverVersion: 'abcd1234',
    override: null,
    addedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('buildBook', () => {
  it('leitet Titel, Serie und Nummer aus den Ordnernamen ab', () => {
    const book = buildBook(input())
    expect(book.title).toBe('Der Super-Papagei')
    expect(book.series).toBe('Die drei ???')
    expect(book.group).toBeNull()
    expect(book.seriesIndex).toBe(1)
  })

  it('macht aus dem Ordner unter der Reihe eine Gruppe', () => {
    // So sieht es auf dem NAS aus: unter der Reihe liegen „Adventskalender"
    // und „Mini-Fälle" – die gehören in der Bibliothek zusammen, nicht in neun
    // einzelne Reihen.
    const book = buildBook(
      input({
        relativePath: 'Die drei ??? Kids/Mini-Fälle/05 - Alarm',
        folderName: '05 - Alarm',
        folderChain: ['Die drei ??? Kids', 'Mini-Fälle'],
      }),
    )
    expect(book.series).toBe('Die drei ??? Kids')
    expect(book.group).toBe('Mini-Fälle')
  })

  it('nimmt den Reihennamen aus dem Ordnernamen der Folge heraus', () => {
    // Gewachsene Sammlungen schreiben die Reihe in jeden Ordnernamen. In der
    // Reihe gelesen stünde sonst neunmal dasselbe untereinander.
    const book = buildBook(
      input({
        relativePath: 'Fragezeichen Kids/Die Drei Fragezeichen Kids-68-Chaos Im Dunkeln',
        folderName: 'Die Drei Fragezeichen Kids-68-Chaos Im Dunkeln',
        folderChain: ['Fragezeichen Kids'],
      }),
    )
    expect(book.title).toBe('Chaos Im Dunkeln')
    expect(book.seriesIndex).toBe(68)
  })

  it('vergibt eine stabile ID aus dem Pfad', () => {
    // Derselbe Pfad muss über Scans hinweg dieselbe ID ergeben – sonst
    // verlieren die Kinder ihren Fortschritt.
    const a = buildBook(input())
    const b = buildBook(input({ addedAt: '2027-05-05T00:00:00.000Z' }))
    expect(a.id).toBe(b.id)
    expect(a.id).toMatch(/^b_[0-9a-f]{12}$/)

    const other = buildBook(input({ relativePath: 'anderer/Pfad' }))
    expect(other.id).not.toBe(a.id)
  })

  it('rechnet Kapitelgrenzen als globale Sekunden durch', () => {
    const book = buildBook(
      input({
        files: [
          file({ fileName: '01.mp3', durationSec: 600 }),
          file({ fileName: '02.mp3', durationSec: 700 }),
          file({ fileName: '03.mp3', durationSec: 500 }),
        ],
      }),
    )

    expect(book.durationSec).toBe(1800)
    expect(book.chapters.map((c) => [c.startSec, c.endSec])).toEqual([
      [0, 600],
      [600, 1300],
      [1300, 1800],
    ])
    // Lückenlos: das Ende eines Kapitels ist der Anfang des nächsten.
    expect(book.chapters.every((c, i) => i === 0 || c.startSec === book.chapters[i - 1]!.endSec))
      .toBe(true)
  })

  it('verbindet jedes Kapitel mit genau einer Datei', () => {
    const book = buildBook(
      input({ files: [file({ fileName: '01.mp3' }), file({ fileName: '02.mp3' })] }),
    )
    expect(book.chapters.map((c) => c.fileIdx)).toEqual([0, 1])
    expect(book.files.map((f) => f.idx)).toEqual([0, 1])
  })

  it('nimmt den Autor aus den Tags, Album-Interpret zuerst', () => {
    expect(
      buildBook(input({ files: [file({ tagArtist: 'Sprecher', tagAlbumArtist: 'Autorin' })] }))
        .author,
    ).toBe('Autorin')

    expect(buildBook(input({ files: [file({ tagArtist: 'Sprecher' })] })).author).toBe('Sprecher')
    expect(buildBook(input()).author).toBeNull()
  })

  it('lässt buch.json alles überschreiben', () => {
    const book = buildBook(
      input({
        override: {
          title: 'Eigener Titel',
          series: 'Eigene Reihe',
          seriesIndex: 42,
          author: 'Eigener Autor',
          narrator: 'Eigener Sprecher',
          tags: ['Krimi', 'ab 8'],
        },
        files: [file({ tagAlbumArtist: 'Aus dem Tag' })],
      }),
    )

    expect(book.title).toBe('Eigener Titel')
    expect(book.series).toBe('Eigene Reihe')
    expect(book.seriesIndex).toBe(42)
    expect(book.author).toBe('Eigener Autor')
    expect(book.narrator).toBe('Eigener Sprecher')
    expect(book.tags).toEqual(['Krimi', 'ab 8'])
  })

  it('verweist nur auf ein Cover, wenn es eins gibt', () => {
    expect(buildBook(input()).cover).toMatch(/^\/cover\/b_[0-9a-f]{12}\.jpg\?v=abcd1234$/)
    const without = buildBook(input({ coverAvailable: false }))
    expect(without.cover).toBeNull()
    // Ohne Cover braucht die App eine Farbe für die Buchstabenkachel.
    expect(without.coverColor).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('ändert den Datei-Fingerabdruck, wenn sich die Dateien ändern', () => {
    const before = buildBook(input()).filesHash
    const added = buildBook(input({ files: [file(), file({ fileName: '02.mp3' })] })).filesHash
    const grown = buildBook(input({ files: [file({ bytes: 2_000_000 })] })).filesHash
    // Gleiche Grösse, andere Dauer: eine neu kodierte Datei. Die gespeicherte
    // Stelle als (Datei, Offset) ist dann nicht mehr verlässlich.
    const reencoded = buildBook(input({ files: [file({ durationSec: 590 })] })).filesHash

    expect(added).not.toBe(before)
    expect(grown).not.toBe(before)
    expect(reencoded).not.toBe(before)
  })

  it('hängt die Cover-Version an die Adresse', () => {
    // Ohne Version dürfte das Cover nicht ein Jahr lang als unveränderlich
    // ausgeliefert werden – ein Wechsel auf dem NAS bliebe sonst unsichtbar.
    const alt = buildBook(input({ coverVersion: 'ffff0000' }))
    expect(alt.cover).toContain('?v=ffff0000')
    expect(buildBook(input({ coverVersion: null })).cover).not.toContain('?v=')
  })

  it('rundet Bruchteile von Sekunden weg', () => {
    const book = buildBook(input({ files: [file({ durationSec: 600.4 })] }))
    expect(book.durationSec).toBe(600)
    expect(book.files[0]?.durationSec).toBe(600)
  })
})

describe('buildBook mit CD-Ordnern', () => {
  it('stellt den Teil vor den Kapitelnamen', () => {
    // In zwanzig CD-Ordnern heisst die erste Datei zwanzigmal gleich. Ohne den
    // Teil davor wäre die Kapitelliste zum Suchen unbrauchbar.
    const book = buildBook(
      input({
        files: [
          file({ fileName: '01 - Anfang.mp3', discName: 'CD 1' }),
          file({ fileName: '01 - Anfang.mp3', discName: 'CD 2' }),
        ],
      }),
    )

    expect(book.chapters.map((kapitel) => kapitel.title)).toEqual([
      'CD 1 · Anfang',
      'CD 2 · Anfang',
    ])
  })

  it('lässt Kapitel ohne Teil unverändert', () => {
    const book = buildBook(input({ files: [file({ fileName: '01 - Anfang.mp3' })] }))
    expect(book.chapters[0]?.title).toBe('Anfang')
  })
})

describe('parseOverride', () => {
  it('liest brauchbare Felder', () => {
    expect(parseOverride({ title: 'T', seriesIndex: 3, tags: ['a'] })).toEqual({
      title: 'T',
      seriesIndex: 3,
      tags: ['a'],
    })
  })

  it('überspringt Felder mit falschem Typ, statt zu werfen', () => {
    expect(parseOverride({ title: 42, seriesIndex: 'drei', tags: 'Krimi' })).toEqual({})
    expect(parseOverride({ seriesIndex: Number.NaN })).toEqual({})
  })

  it('siebt Nicht-Zeichenketten aus den Tags', () => {
    expect(parseOverride({ tags: ['a', 3, null, 'b'] })).toEqual({ tags: ['a', 'b'] })
  })

  it('liest „einzelfolgen" in beide Richtungen', () => {
    // Das `false` ist nicht dasselbe wie „nicht gesetzt": Es ist die Bremse
    // für einen Ordner, bei dem jemand sonst nachhelfen möchte.
    expect(parseOverride({ einzelfolgen: true })).toEqual({ einzelfolgen: true })
    expect(parseOverride({ einzelfolgen: false })).toEqual({ einzelfolgen: false })
    expect(parseOverride({ einzelfolgen: 'ja' })).toEqual({})
  })

  it('kommt mit Unsinn klar', () => {
    expect(parseOverride(null)).toBeNull()
    expect(parseOverride('kaputt')).toBeNull()
    expect(parseOverride([])).toEqual({})
  })
})
