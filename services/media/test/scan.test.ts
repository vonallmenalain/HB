import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { scanLibrary } from '../src/catalog/scan.js'
import { SCHEMA_VERSION } from '../src/catalog/types.js'

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

    expect(book.cover).toMatch(new RegExp(`^/cover/${book.id}\\.jpg\\?v=[0-9a-f]{8}$`))
    const coverPath = locations.get(book.id)?.coverPath
    expect(coverPath).toBe(join(cacheDir, 'covers', `${book.id}.jpg`))
    // Als JPEG abgelegt, nicht durchgereicht.
    const bytes = await readFile(coverPath!)
    expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]))
  })

  it('behält den Zeitpunkt eines bereits bekannten Buchs beim zweiten Scan', async () => {
    // Ohne das markierte jeder Sechs-Stunden-Scan die ganze Bibliothek als
    // frisch dazugekommen und machte die Sortierung wertlos.
    const { mediaRoot, cacheDir } = await makeLibrary([
      { path: 'Buch', files: [{ name: 'a.wav' }] },
    ])

    const first = await scanLibrary({ mediaRoot, cacheDir, now: NOW })
    const second = await scanLibrary({
      mediaRoot,
      cacheDir,
      now: () => new Date('2027-06-06T00:00:00.000Z'),
    })

    expect(second.catalog.books[0]?.addedAt).toBe(first.catalog.books[0]?.addedAt)
  })

  it('leitet den Zeitpunkt neuer Bücher aus dem Ordner ab, nicht aus der Uhr', async () => {
    const { mediaRoot, cacheDir } = await makeLibrary([
      { path: 'Erstes', files: [{ name: 'a.wav' }] },
      { path: 'Zweites', files: [{ name: 'a.wav' }] },
    ])

    const { catalog } = await scanLibrary({
      mediaRoot,
      cacheDir,
      now: () => new Date('2099-01-01T00:00:00.000Z'),
    })

    const zeiten = catalog.books.map((book) => book.addedAt)
    expect(zeiten).not.toContain('2099-01-01T00:00:00.000Z')
    expect(new Set(zeiten).size).toBe(2)
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

  it('gliedert Unterordner einer Reihe als Gruppe', async () => {
    // Unter „Die drei ??? Kids" liegen „Adventskalender" und „Mini-Fälle".
    // Beide gehören zur selben Reihe, nur eben in eigenen Fächern.
    const { mediaRoot, cacheDir } = await makeLibrary([
      { path: 'Kids/Mini-Fälle/05 - Alarm', files: [{ name: 'a.wav' }] },
      { path: 'Kids/68 - Chaos', files: [{ name: 'a.wav' }] },
    ])

    const { catalog } = await scanLibrary({ mediaRoot, cacheDir, now: NOW })

    expect(catalog.books.map((b) => [b.series, b.group, b.title])).toEqual([
      ['Kids', null, 'Chaos'],
      ['Kids', 'Mini-Fälle', 'Alarm'],
    ])
  })

  it('nennt ein Buch nach dem Ordner darüber, wenn es in „CD1" steckt', async () => {
    // Genau so sehen gerippte Hörspiele aus. Ohne diese Regel hiesse die Folge
    // in der Bibliothek „CD1" und läge in einer Gruppe mit ihrem eigenen Namen.
    const { mediaRoot, cacheDir } = await makeLibrary([
      { path: '5 Freunde/5Freunde - 001 - beim Wanderzirkus/CD1', files: [{ name: 'a.wav' }] },
    ])

    const { catalog } = await scanLibrary({ mediaRoot, cacheDir, now: NOW })

    expect(catalog.books).toHaveLength(1)
    expect(catalog.books[0]?.series).toBe('5 Freunde')
    expect(catalog.books[0]?.group).toBeNull()
    expect(catalog.books[0]?.title).toBe('beim Wanderzirkus')
    expect(catalog.books[0]?.seriesIndex).toBe(1)
  })

  it('tut das auch, wenn ein Ordner ohne Ton daneben liegt', async () => {
    const { mediaRoot, cacheDir } = await makeLibrary([
      { path: '5 Freunde/5Freunde - 001 - beim Wanderzirkus/CD1', files: [{ name: 'a.wav' }] },
      {
        path: '5 Freunde/5Freunde - 001 - beim Wanderzirkus/Scans',
        files: [{ name: 'cover.png', content: PNG_1X1 }],
      },
    ])

    const { catalog } = await scanLibrary({ mediaRoot, cacheDir, now: NOW })

    expect(catalog.books).toHaveLength(1)
    expect(catalog.books[0]?.group).toBeNull()
    expect(catalog.books[0]?.title).toBe('beim Wanderzirkus')
  })

  it('lässt aussagekräftige Unterordner in Ruhe', async () => {
    // „2019" ist eine Jahresangabe und keine CD-Nummer.
    const { mediaRoot, cacheDir } = await makeLibrary([
      { path: 'Kids/Adventskalender/2019', files: [{ name: 'a.wav' }] },
    ])

    const { catalog } = await scanLibrary({ mediaRoot, cacheDir, now: NOW })

    expect(catalog.books[0]?.title).toBe('2019')
    expect(catalog.books[0]?.group).toBe('Adventskalender')
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
    expect(catalog.schemaVersion).toBe(SCHEMA_VERSION)
    expect(catalog.generatedAt).toBe('2026-01-01T00:00:00.000Z')
  })
})

describe('Ein Hörbuch über mehrere CD-Ordner', () => {
  it('fasst die Teile zu einem Buch zusammen', async () => {
    // Vorher wurde jeder CD-Ordner ein eigenes Buch – die Reihe „Harry Potter"
    // bestand dann aus „CD 1", „CD 10", „CD 11".
    const { mediaRoot, cacheDir } = await makeLibrary([
      { path: 'Harry Potter/Der Feuerkelch/CD 1', files: [{ name: '01 - Anfang.wav' }] },
      { path: 'Harry Potter/Der Feuerkelch/CD 2', files: [{ name: '01 - Anfang.wav' }] },
      { path: 'Harry Potter/Der Feuerkelch/CD 10', files: [{ name: '01 - Anfang.wav' }] },
    ])

    const { catalog } = await scanLibrary({ mediaRoot, cacheDir, now: NOW })

    expect(catalog.books).toHaveLength(1)
    expect(catalog.books[0]?.title).toBe('Der Feuerkelch')
    expect(catalog.books[0]?.series).toBe('Harry Potter')
    expect(catalog.books[0]?.files).toHaveLength(3)
  })

  it('sortiert die Teile natürlich und nennt sie im Kapitel', async () => {
    // Alphabetisch käme CD 10 vor CD 2, und in zwanzig Ordnern hiesse jedes
    // Kapitel gleich.
    const { mediaRoot, cacheDir } = await makeLibrary([
      { path: 'Reihe/Buch/CD 1', files: [{ name: '01 - Anfang.wav' }] },
      { path: 'Reihe/Buch/CD 2', files: [{ name: '01 - Anfang.wav' }] },
      { path: 'Reihe/Buch/CD 10', files: [{ name: '01 - Anfang.wav' }] },
    ])

    const { catalog } = await scanLibrary({ mediaRoot, cacheDir, now: NOW })

    expect(catalog.books[0]?.chapters.map((kapitel) => kapitel.title)).toEqual([
      'CD 1 · Anfang',
      'CD 2 · Anfang',
      'CD 10 · Anfang',
    ])
  })

  it('lässt sich von einem Ordner daneben nicht beirren', async () => {
    // Genau daran scheiterte es auf dem NAS: Neben zwanzig CD-Ordnern lag noch
    // etwas anderes, und weil nicht *alle* Unterordner CDs waren, blieben aus
    // einem Hörbuch zwanzig.
    const { mediaRoot, cacheDir } = await makeLibrary([
      { path: 'Harry Potter/Der Feuerkelch/CD 1', files: [{ name: 'a.wav' }] },
      { path: 'Harry Potter/Der Feuerkelch/CD 2', files: [{ name: 'a.wav' }] },
      {
        path: 'Harry Potter/Der Feuerkelch/Booklet',
        files: [{ name: 'cover.png', content: PNG_1X1 }],
      },
    ])

    const { catalog } = await scanLibrary({ mediaRoot, cacheDir, now: NOW })

    expect(catalog.books).toHaveLength(1)
    expect(catalog.books[0]?.title).toBe('Der Feuerkelch')
  })

  it('kommt mit der Ablage zurecht, die auf dem NAS steht', async () => {
    // Genau so liegt der Feuerkelch dort: zwanzig Ordner, in jedem noch einmal
    // Autor und Titel vor der CD-Angabe, daneben das Titelbild als lose Datei.
    const werk = 'J.K. Rowling - Harry Potter und der Feuerkelch'
    const { mediaRoot, cacheDir } = await makeLibrary([
      ...Array.from({ length: 20 }, (_, i) => ({
        path: `Harry Potter/${werk}/${werk} CD ${String(i + 1)}`,
        files: [{ name: '01 - Anfang.wav' }],
      })),
      {
        path: `Harry Potter/${werk}`,
        files: [{ name: 'Harry Potter und der Feuerkelch - Front.jpg', content: PNG_1X1 }],
      },
    ])

    const { catalog } = await scanLibrary({ mediaRoot, cacheDir, now: NOW })

    expect(catalog.books).toHaveLength(1)
    expect(catalog.books[0]?.files).toHaveLength(20)
    // Natürlich sortiert: CD 2 vor CD 10, nicht alphabetisch.
    expect(catalog.books[0]?.chapters[1]?.title).toContain('CD 2 ·')
    expect(catalog.books[0]?.chapters[9]?.title).toContain('CD 10 ·')
  })

  it('lässt einen Bonus-Ordner ein eigenes Buch bleiben', async () => {
    const { mediaRoot, cacheDir } = await makeLibrary([
      { path: 'Harry Potter/Der Feuerkelch/CD 1', files: [{ name: 'a.wav' }] },
      { path: 'Harry Potter/Der Feuerkelch/CD 2', files: [{ name: 'a.wav' }] },
      { path: 'Harry Potter/Der Feuerkelch/Hörprobe', files: [{ name: 'a.wav' }] },
    ])

    const { catalog } = await scanLibrary({ mediaRoot, cacheDir, now: NOW })

    expect(catalog.books.map((book) => book.title).sort()).toEqual(['Der Feuerkelch', 'Hörprobe'])
  })

  it('nimmt den Werknamen vor der CD-Angabe hin', async () => {
    const { mediaRoot, cacheDir } = await makeLibrary([
      { path: 'Harry Potter/Der Feuerkelch/Feuerkelch CD 1', files: [{ name: 'a.wav' }] },
      { path: 'Harry Potter/Der Feuerkelch/Feuerkelch CD 2', files: [{ name: 'a.wav' }] },
    ])

    const { catalog } = await scanLibrary({ mediaRoot, cacheDir, now: NOW })

    expect(catalog.books).toHaveLength(1)
    expect(catalog.books[0]?.files).toHaveLength(2)
  })

  it('nimmt lose Dateien neben den Teilen mit', async () => {
    // Vorher gewann der Ordner mit eigenen Dateien, und die CD-Ordner daneben
    // fielen samt Ton stillschweigend heraus.
    const { mediaRoot, cacheDir } = await makeLibrary([
      { path: 'Reihe/Buch', files: [{ name: '00 - Vorwort.wav' }] },
      { path: 'Reihe/Buch/CD 1', files: [{ name: 'a.wav' }] },
      { path: 'Reihe/Buch/CD 2', files: [{ name: 'a.wav' }] },
    ])

    const { catalog } = await scanLibrary({ mediaRoot, cacheDir, now: NOW })

    expect(catalog.books).toHaveLength(1)
    expect(catalog.books[0]?.files).toHaveLength(3)
  })

  it('lässt nummerierte Folgen-Ordner in Ruhe', async () => {
    // „Folge 1" und „Folge 2" sind zwei Hörbücher, keine zwei Teile von einem.
    const { mediaRoot, cacheDir } = await makeLibrary([
      { path: 'Bibi Blocksberg/Folge 1', files: [{ name: 'a.wav' }] },
      { path: 'Bibi Blocksberg/Folge 2', files: [{ name: 'a.wav' }] },
      { path: 'Reihe/Buch/01', files: [{ name: 'a.wav' }] },
      { path: 'Reihe/Buch/02', files: [{ name: 'a.wav' }] },
    ])

    const { catalog } = await scanLibrary({ mediaRoot, cacheDir, now: NOW })
    expect(catalog.books).toHaveLength(4)
  })
})

describe('Ordner, in dem jede Datei ein Hörbuch ist', () => {
  const ausrufezeichen = () =>
    makeLibrary([
      {
        path: 'Die Drei Ausrufezeichen',
        files: [
          { name: 'buch.json', content: JSON.stringify({ einzelfolgen: true }) },
          { name: 'Drei Ausrufezeichen 001 - Die Handy-Falle.wav', seconds: 2 },
          { name: 'Drei Ausrufezeichen 002 - Betrug beim Casting.wav', seconds: 1 },
          { name: 'Drei Ausrufezeichen 002 - Betrug beim Casting.png', content: PNG_1X1 },
        ],
      },
    ])

  it('macht aus jeder Datei ein eigenes Buch', async () => {
    const { mediaRoot, cacheDir } = await ausrufezeichen()
    const { catalog } = await scanLibrary({ mediaRoot, cacheDir, now: NOW })

    expect(catalog.books).toHaveLength(2)
    expect(catalog.books.map((book) => [book.series, book.seriesIndex, book.title])).toEqual([
      ['Die Drei Ausrufezeichen', 1, 'Die Handy-Falle'],
      ['Die Drei Ausrufezeichen', 2, 'Betrug beim Casting'],
    ])
    // Eine Folge, eine Datei – und damit auch nur ein Kapitel.
    expect(catalog.books[0]?.files).toHaveLength(1)
    expect(catalog.books[0]?.chapters).toHaveLength(1)
  })

  it('gibt jeder Folge ihre eigene Kennung', async () => {
    const { mediaRoot, cacheDir } = await ausrufezeichen()
    const { catalog } = await scanLibrary({ mediaRoot, cacheDir, now: NOW })

    expect(catalog.books[0]?.id).not.toBe(catalog.books[1]?.id)
  })

  it('nimmt das Bild, das neben der Datei liegt', async () => {
    // Ohne das hätten neunzig Folgen ein gemeinsames Cover – oder keins.
    const { mediaRoot, cacheDir } = await ausrufezeichen()
    const { catalog } = await scanLibrary({ mediaRoot, cacheDir, now: NOW })

    const mitBild = catalog.books.find((book) => book.title === 'Betrug beim Casting')
    expect(mitBild?.cover).toContain(mitBild?.id ?? '')
    expect(catalog.books.find((book) => book.title === 'Die Handy-Falle')?.cover).toBeNull()
  })

  it('lässt den Adminbereich über die buch.json entscheiden', async () => {
    // An die Datei auf dem NAS kommt nicht jeder heran – was im Adminbereich
    // eingestellt wurde, lässt sich dort auch wieder zurücknehmen.
    const { mediaRoot, cacheDir } = await makeLibrary([
      {
        path: 'Reihe',
        files: [
          { name: 'buch.json', content: JSON.stringify({ einzelfolgen: true }) },
          { name: '01 - Eins.wav', seconds: 1 },
          { name: '02 - Zwei.wav', seconds: 1 },
        ],
      },
    ])

    await writeFile(
      join(cacheDir, 'struktur.json'),
      JSON.stringify({ Reihe: 'einBuch' }),
      'utf8',
    )

    const { catalog } = await scanLibrary({ mediaRoot, cacheDir, now: NOW })
    expect(catalog.books).toHaveLength(1)
  })

  it('merkt sich zu jedem Buch den Ordner, auf den sich die Einstellung bezieht', async () => {
    const { mediaRoot, cacheDir } = await makeLibrary([
      { path: 'Reihe/Buch/CD 1', files: [{ name: 'a.wav' }] },
      { path: 'Reihe/Buch/CD 2', files: [{ name: 'a.wav' }] },
    ])

    const { catalog, locations } = await scanLibrary({ mediaRoot, cacheDir, now: NOW })

    // Nicht „Reihe/Buch/CD 1": Umstellen liesse sich nur der Ordner, der das
    // Buch ausmacht.
    expect(locations.get(catalog.books[0]!.id)?.folder).toBe(join('Reihe', 'Buch'))
  })

  it('bleibt ohne die Ansage ein einziges Buch', async () => {
    const { mediaRoot, cacheDir } = await makeLibrary([
      {
        path: 'Die Drei Ausrufezeichen',
        files: [
          { name: 'Drei Ausrufezeichen 001 - Die Handy-Falle.wav', seconds: 2 },
          { name: 'Drei Ausrufezeichen 002 - Betrug beim Casting.wav', seconds: 1 },
        ],
      },
    ])

    const { catalog } = await scanLibrary({ mediaRoot, cacheDir, now: NOW })
    expect(catalog.books).toHaveLength(1)
    expect(catalog.books[0]?.chapters).toHaveLength(2)
  })
})

describe('Ein Ordner, der nur das Buch noch einmal nennt', () => {
  it('wird nicht zur Gruppe', async () => {
    // Entpackte Archive legen diese Ebene zuviel an. Ungefiltert bekäme jedes
    // Buch seine eigene Überschrift, und in der Reihe stünde eine Kachel pro
    // Zeile.
    const { mediaRoot, cacheDir } = await makeLibrary([
      {
        path: '5 Freunde/5Freunde - 001 - beim Wanderzirkus/5Freunde - 001 - beim Wanderzirkus',
        files: [{ name: 'a.wav' }],
      },
    ])

    const { catalog } = await scanLibrary({ mediaRoot, cacheDir, now: NOW })

    expect(catalog.books[0]?.series).toBe('5 Freunde')
    expect(catalog.books[0]?.group).toBeNull()
    expect(catalog.books[0]?.title).toBe('beim Wanderzirkus')
  })

  it('lässt eine echte Gruppe stehen', async () => {
    const { mediaRoot, cacheDir } = await makeLibrary([
      { path: 'Kids/Mini-Fälle/05 - Alarm', files: [{ name: 'a.wav' }] },
    ])

    const { catalog } = await scanLibrary({ mediaRoot, cacheDir, now: NOW })
    expect(catalog.books[0]?.group).toBe('Mini-Fälle')
  })
})

describe('Reihenfolge in einer Reihe', () => {
  it('stellt Folge 01 nach oben, egal wie die Nummer geschrieben ist', async () => {
    // Auf dem NAS standen „50A" und „75A" vor „01": Der Titel eines erkannten
    // Buchs hat seine Nummer nicht mehr, der eines nicht erkannten schon – und
    // eine Ziffer steht vor jedem Buchstaben.
    const { mediaRoot, cacheDir } = await makeLibrary([
      { path: 'Kids/50A - Freundinnen in Gefahr I', files: [{ name: 'a.wav' }] },
      { path: 'Kids/125 - Spurlos', files: [{ name: 'a.wav' }] },
      { path: 'Kids/02 - Betrug beim Casting', files: [{ name: 'a.wav' }] },
      { path: 'Kids/Folge 103 SOS im Bike-Park', files: [{ name: 'a.wav' }] },
      { path: 'Kids/01 - Die Handy-Falle', files: [{ name: 'a.wav' }] },
      { path: 'Kids/75A - Tatort Hollywood', files: [{ name: 'a.wav' }] },
      { path: 'Kids/79 Achtung, Abenteuer!', files: [{ name: 'a.wav' }] },
    ])

    const { catalog } = await scanLibrary({ mediaRoot, cacheDir, now: NOW })

    expect(catalog.books.map((book) => book.seriesIndex)).toEqual([1, 2, 50, 75, 79, 103, 125])
  })

  it('stellt Bücher ohne Nummer hinter die nummerierten', async () => {
    const { mediaRoot, cacheDir } = await makeLibrary([
      { path: 'Reihe/Der Anfang', files: [{ name: 'a.wav' }] },
      { path: 'Reihe/02 - Zwei', files: [{ name: 'a.wav' }] },
    ])

    const { catalog } = await scanLibrary({ mediaRoot, cacheDir, now: NOW })
    expect(catalog.books.map((book) => book.title)).toEqual(['Zwei', 'Der Anfang'])
  })
})
