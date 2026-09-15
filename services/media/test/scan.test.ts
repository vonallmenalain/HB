import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { scanLibrary } from '../src/catalog/scan.js'

import { PNG_1X1, makeLibrary, wav } from './fixtures.js'

const NOW = () => new Date('2026-01-01T00:00:00.000Z')

describe('scanLibrary', () => {
  it('findet Bücher in Reihenordnern und erkennt die Reihe', async () => {
    const { mediaRoot, cacheDir } = await makeLibrary([
      {
        path: 'Die drei ???/01 - Der Super-Papagei',
        files: [
          { name: '01 - Kapitel eins.wav', seconds: 2 },
          { name: '02 - Kapitel zwei.wav', seconds: 3 },
        ],
      },
      {
        path: 'Die drei ???/02 - Der Phantomsee',
        files: [{ name: '01.wav', seconds: 1 }],
      },
      {
        path: 'Bibi Blocksberg',
        files: [{ name: 'hexerei.wav', seconds: 1 }],
      },
    ])

    const { catalog } = await scanLibrary({ mediaRoot, cacheDir, now: NOW })

    expect(catalog.books).toHaveLength(3)

    const papagei = catalog.books.find((book) => book.title === 'Der Super-Papagei')
    expect(papagei?.series).toBe('Die drei ???')
    expect(papagei?.seriesIndex).toBe(1)
    expect(papagei?.files).toHaveLength(2)

    // Ein Buch direkt unter dem Stamm gehört zu keiner Reihe.
    const bibi = catalog.books.find((book) => book.title === 'Bibi Blocksberg')
    expect(bibi?.series).toBeNull()
  })

  it('sortiert Reihen zusammen und darin nach Nummer', async () => {
    const { mediaRoot, cacheDir } = await makeLibrary([
      { path: 'Reihe/10 - Zehn', files: [{ name: 'a.wav' }] },
      { path: 'Reihe/02 - Zwei', files: [{ name: 'a.wav' }] },
      { path: 'Andere Reihe/01 - Eins', files: [{ name: 'a.wav' }] },
    ])

    const { catalog } = await scanLibrary({ mediaRoot, cacheDir, now: NOW })

    expect(catalog.books.map((book) => `${book.series ?? '-'}/${book.title}`)).toEqual([
      'Andere Reihe/Eins',
      'Reihe/Zwei',
      'Reihe/Zehn',
    ])
  })

  it('sortiert Kapitel natürlich, nicht alphabetisch', async () => {
    const { mediaRoot, cacheDir } = await makeLibrary([
      {
        path: 'Buch',
        files: [
          { name: '10 - Zehn.wav', seconds: 1 },
          { name: '2 - Zwei.wav', seconds: 1 },
          { name: '1 - Eins.wav', seconds: 1 },
        ],
      },
    ])

    const { catalog } = await scanLibrary({ mediaRoot, cacheDir, now: NOW })
    expect(catalog.books[0]?.chapters.map((c) => c.title)).toEqual(['Eins', 'Zwei', 'Zehn'])
  })

  it('rechnet die Gesamtdauer aus den echten Dateien', async () => {
    const { mediaRoot, cacheDir } = await makeLibrary([
      { path: 'Buch', files: [{ name: 'a.wav', seconds: 2 }, { name: 'b.wav', seconds: 3 }] },
    ])

    const { catalog } = await scanLibrary({ mediaRoot, cacheDir, now: NOW })
    expect(catalog.books[0]?.durationSec).toBe(5)
    expect(catalog.books[0]?.chapters.at(-1)?.endSec).toBe(5)
  })

  it('bereitet ein Cover aus dem Ordner auf', async () => {
    const { mediaRoot, cacheDir } = await makeLibrary([
      {
        path: 'Buch',
        files: [{ name: 'a.wav' }, { name: 'cover.png', content: PNG_1X1 }],
      },
    ])

    const { catalog, locations } = await scanLibrary({ mediaRoot, cacheDir, now: NOW })
    const book = catalog.books[0]!

    expect(book.cover).toBe(`/cover/${book.id}.jpg`)
    const coverPath = locations.get(book.id)?.coverPath
    expect(coverPath).toBe(join(cacheDir, 'covers', `${book.id}.jpg`))
    // Als JPEG abgelegt, nicht durchgereicht.
    const bytes = await readFile(coverPath!)
    expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]))
  })

  it('kommt ohne Cover aus und liefert eine Ersatzfarbe', async () => {
    const { mediaRoot, cacheDir } = await makeLibrary([
      { path: 'Buch', files: [{ name: 'a.wav' }] },
    ])

    const { catalog } = await scanLibrary({ mediaRoot, cacheDir, now: NOW })
    expect(catalog.books[0]?.cover).toBeNull()
    expect(catalog.books[0]?.coverColor).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('lässt buch.json gewinnen', async () => {
    const { mediaRoot, cacheDir } = await makeLibrary([
      {
        path: 'Reihe/01 - Ordnername',
        files: [
          { name: 'a.wav' },
          {
            name: 'buch.json',
            content: JSON.stringify({ title: 'Echter Titel', author: 'Echte Autorin' }),
          },
        ],
      },
    ])

    const { catalog } = await scanLibrary({ mediaRoot, cacheDir, now: NOW })
    expect(catalog.books[0]?.title).toBe('Echter Titel')
    expect(catalog.books[0]?.author).toBe('Echte Autorin')
    // Die Reihe kommt weiterhin aus dem Ordner darüber.
    expect(catalog.books[0]?.series).toBe('Reihe')
  })

  it('versteckt Bücher mit hidden: true', async () => {
    const { mediaRoot, cacheDir } = await makeLibrary([
      { path: 'Sichtbar', files: [{ name: 'a.wav' }] },
      {
        path: 'Versteckt',
        files: [{ name: 'a.wav' }, { name: 'buch.json', content: '{"hidden": true}' }],
      },
    ])

    const { catalog } = await scanLibrary({ mediaRoot, cacheDir, now: NOW })
    expect(catalog.books.map((b) => b.title)).toEqual(['Sichtbar'])
  })

  it('überspringt Ordner ohne Audiodateien', async () => {
    const { mediaRoot, cacheDir } = await makeLibrary([
      { path: 'Leer/Unterordner', files: [{ name: 'liesmich.txt', content: 'nichts' }] },
      { path: 'Mit Ton', files: [{ name: 'a.wav' }] },
    ])

    const { catalog } = await scanLibrary({ mediaRoot, cacheDir, now: NOW })
    expect(catalog.books.map((b) => b.title)).toEqual(['Mit Ton'])
  })

  it('merkt sich die echten Pfade, ohne sie in den Katalog zu schreiben', async () => {
    const { mediaRoot, cacheDir } = await makeLibrary([
      { path: 'Buch', files: [{ name: 'a.wav' }, { name: 'b.wav' }] },
    ])

    const { catalog, locations } = await scanLibrary({ mediaRoot, cacheDir, now: NOW })
    const book = catalog.books[0]!

    expect(locations.get(book.id)?.filePaths).toEqual([
      join(mediaRoot, 'Buch', 'a.wav'),
      join(mediaRoot, 'Buch', 'b.wav'),
    ])
    // Im ausgelieferten Katalog stehen keine Dateipfade.
    expect(JSON.stringify(catalog)).not.toContain(mediaRoot)
  })

  it('vergibt beim zweiten Scan dieselben IDs', async () => {
    const { mediaRoot, cacheDir } = await makeLibrary([
      { path: 'Reihe/01 - Buch', files: [{ name: 'a.wav' }] },
    ])

    const first = await scanLibrary({ mediaRoot, cacheDir, now: NOW })
    const second = await scanLibrary({ mediaRoot, cacheDir, now: NOW })

    expect(second.catalog.books[0]?.id).toBe(first.catalog.books[0]?.id)
  })

  it('bemerkt eine geänderte Datei trotz Metadaten-Cache', async () => {
    const { mediaRoot, cacheDir } = await makeLibrary([
      { path: 'Buch', files: [{ name: 'a.wav', seconds: 2 }] },
    ])

    const first = await scanLibrary({ mediaRoot, cacheDir, now: NOW })
    expect(first.catalog.books[0]?.durationSec).toBe(2)

    // Datei ersetzen: andere Grösse, andere Änderungszeit → Cache greift nicht.
    await writeFile(join(mediaRoot, 'Buch', 'a.wav'), wav(5))
    const second = await scanLibrary({ mediaRoot, cacheDir, now: NOW })
    expect(second.catalog.books[0]?.durationSec).toBe(5)
  })

  it('liefert einen leeren Katalog statt eines Fehlers, wenn nichts da ist', async () => {
    const { mediaRoot, cacheDir } = await makeLibrary([])
    const { catalog } = await scanLibrary({ mediaRoot, cacheDir, now: NOW })

    expect(catalog.books).toEqual([])
    expect(catalog.schemaVersion).toBe(1)
    expect(catalog.generatedAt).toBe('2026-01-01T00:00:00.000Z')
  })
})
