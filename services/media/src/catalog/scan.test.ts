import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { scanLibrary } from './scan.js'
import type { Book } from './types.js'

/**
 * Eine echte, winzige MP3-Datei.
 *
 * `music-metadata` liest die Dauer aus dem Frame-Header, nicht aus einem Tag –
 * eine leere Datei mit der Endung `.mp3` würde der Scanner deshalb als
 * unlesbar überspringen. Ein MPEG-1-Layer-3-Frame mit 128 kbit/s bei 44,1 kHz
 * ist 417 Bytes lang und dauert 26 ms; zehn davon ergeben eine viertel Sekunde.
 */
function mp3(frames: number): Buffer {
  const frame = Buffer.alloc(417)
  frame[0] = 0xff
  frame[1] = 0xfb
  frame[2] = 0x90
  frame[3] = 0x00
  return Buffer.concat(Array.from({ length: frames }, () => frame))
}

async function audio(path: string, frames = 10): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, mp3(frames))
}

async function bild(path: string): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true })
  await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 40, b: 40 } },
  })
    .jpeg()
    .toFile(path)
}

let root = ''
let cache = ''
let books: Book[] = []

function buch(titel: string): Book {
  const treffer = books.find((book) => book.title === titel)
  if (!treffer) {
    throw new Error(`Kein Buch „${titel}" – gefunden: ${books.map((b) => b.title).join(', ')}`)
  }
  return treffer
}

beforeAll(async () => {
  const base = await mkdtemp(join(tmpdir(), 'hb-scan-'))
  root = join(base, 'medien')
  cache = join(base, 'cache')

  // Neunzig Folgen als neunzig Dateien in einem Ordner – hier zwei davon.
  await audio(join(root, 'Die Drei Ausrufezeichen', 'Drei Ausrufezeichen 001 - Die Handy-Falle.mp3'))
  await audio(join(root, 'Die Drei Ausrufezeichen', 'Drei Ausrufezeichen 002 - Betrug beim Casting.mp3'))
  await bild(join(root, 'Die Drei Ausrufezeichen', 'Drei Ausrufezeichen 002 - Betrug beim Casting.jpg'))
  await writeFile(
    join(root, 'Die Drei Ausrufezeichen', 'buch.json'),
    JSON.stringify({ einzelfolgen: true }),
    'utf8',
  )

  // Ein Hörbuch, verteilt über CD-Ordner.
  const feuerkelch = join(root, 'Harry Potter', 'Harry Potter und der Feuerkelch')
  await audio(join(feuerkelch, 'CD 1', '01 - Anfang.mp3'))
  await audio(join(feuerkelch, 'CD 2', '01 - Anfang.mp3'))
  await audio(join(feuerkelch, 'CD 10', '01 - Anfang.mp3'))

  // Der Normalfall: ein Ordner, mehrere Kapitel.
  const papagei = join(root, 'Die drei ???', '01 - Der Super-Papagei')
  await audio(join(papagei, '01 - Kapitel eins.mp3'))
  await audio(join(papagei, '02 - Kapitel zwei.mp3'))

  // Nummerierte Folgen-Ordner sind keine Teile eines Buchs.
  await audio(join(root, 'Bibi Blocksberg', 'Folge 1', 'hexerei.mp3'))
  await audio(join(root, 'Bibi Blocksberg', 'Folge 2', 'schulausflug.mp3'))

  // Ein einzelner CD-Ordner bleibt übersprungen.
  await audio(join(root, 'Fünf Freunde', 'Das Spukhaus', 'CD1', '01 - Anfang.mp3'))

  const result = await scanLibrary({ mediaRoot: root, cacheDir: cache })
  books = result.catalog.books
})

afterAll(async () => {
  if (root !== '') await rm(join(root, '..'), { recursive: true, force: true })
})

describe('Ordner mit „einzelfolgen": jede Datei ein Hörbuch', () => {
  it('macht aus jeder Datei ein eigenes Buch', () => {
    expect(books.filter((book) => book.series === 'Die Drei Ausrufezeichen')).toHaveLength(2)
  })

  it('liest Titel und Folgennummer aus dem Dateinamen', () => {
    const folge = buch('Die Handy-Falle')
    expect(folge.seriesIndex).toBe(1)
    expect(folge.series).toBe('Die Drei Ausrufezeichen')
    expect(folge.group).toBeNull()
    // Eine Folge, eine Datei – und damit auch nur ein Kapitel.
    expect(folge.files).toHaveLength(1)
    expect(folge.chapters).toHaveLength(1)
  })

  it('gibt jeder Folge ihre eigene Kennung', () => {
    expect(buch('Die Handy-Falle').id).not.toBe(buch('Betrug beim Casting').id)
  })

  it('nimmt das Bild, das neben der Datei liegt', () => {
    // Ohne das gäbe es für neunzig Folgen nur ein gemeinsames Cover – oder
    // gar keins.
    expect(buch('Betrug beim Casting').cover).toContain(buch('Betrug beim Casting').id)
    expect(buch('Die Handy-Falle').cover).toBeNull()
  })
})

describe('Ein Hörbuch über mehrere CD-Ordner', () => {
  it('fasst die Teile zu einem Buch zusammen', () => {
    const feuerkelch = buch('Harry Potter und der Feuerkelch')
    expect(feuerkelch.series).toBe('Harry Potter')
    expect(feuerkelch.files).toHaveLength(3)
    // Der Ordner darüber gibt den Namen; „CD 1" steht nirgends als Buch.
    expect(books.map((book) => book.title)).not.toContain('CD 1')
  })

  it('sortiert die Teile natürlich, nicht alphabetisch', () => {
    // Sonst käme CD 10 vor CD 2 – und das Buch liefe in der falschen
    // Reihenfolge.
    expect(buch('Harry Potter und der Feuerkelch').chapters.map((kapitel) => kapitel.title)).toEqual(
      ['CD 1 · Anfang', 'CD 2 · Anfang', 'CD 10 · Anfang'],
    )
  })

  it('lässt nummerierte Folgen-Ordner in Ruhe', () => {
    // „Folge 1" und „Folge 2" sind zwei Hörbücher, keine zwei Teile von einem.
    expect(books.filter((book) => book.series === 'Bibi Blocksberg')).toHaveLength(2)
  })

  it('überspringt einen einzelnen CD-Ordner weiterhin', () => {
    const spukhaus = buch('Das Spukhaus')
    expect(spukhaus.series).toBe('Fünf Freunde')
    expect(spukhaus.files).toHaveLength(1)
    // Ein einzelner Teil braucht seinen Namen im Kapitel nicht.
    expect(spukhaus.chapters[0]?.title).toBe('Anfang')
  })
})

describe('Der gewöhnliche Ordner', () => {
  it('bleibt ein Buch mit einem Kapitel je Datei', () => {
    const papagei = buch('Der Super-Papagei')
    expect(papagei.series).toBe('Die drei ???')
    expect(papagei.seriesIndex).toBe(1)
    expect(papagei.files).toHaveLength(2)
    expect(papagei.chapters.map((kapitel) => kapitel.title)).toEqual([
      'Kapitel eins',
      'Kapitel zwei',
    ])
  })
})
