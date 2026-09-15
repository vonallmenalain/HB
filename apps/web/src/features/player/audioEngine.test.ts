import { beforeEach, describe, expect, it } from 'vitest'

import { type Book } from '@/features/library/catalog'
import { makeBook } from '@/test/renderWithProfiles'

import { type AudioEngine, createAudioEngine } from './audioEngine'
import { type FakeMediaElement, createFakeMediaElement } from './fakeMediaElement'

/** Drei Dateien zu 600, 700 und 500 Sekunden; Kapitel entsprechen den Dateien. */
const BOOK: Book = makeBook({
  id: 'b_1',
  durationSec: 1800,
  files: [
    { idx: 0, durationSec: 600, bytes: 0, mime: 'audio/mpeg' },
    { idx: 1, durationSec: 700, bytes: 0, mime: 'audio/mpeg' },
    { idx: 2, durationSec: 500, bytes: 0, mime: 'audio/mpeg' },
  ],
  chapters: [
    { idx: 0, title: 'Eins', fileIdx: 0, startSec: 0, endSec: 600 },
    { idx: 1, title: 'Zwei', fileIdx: 1, startSec: 600, endSec: 1300 },
    { idx: 2, title: 'Drei', fileIdx: 2, startSec: 1300, endSec: 1800 },
  ],
})

let element: FakeMediaElement
let engine: AudioEngine

function build(options: { failPlay?: boolean } = {}): void {
  element = createFakeMediaElement(options)
  engine = createAudioEngine({
    element,
    audioUrl: (bookId, fileIdx) => `https://media.test/audio/${bookId}/${String(fileIdx)}`,
  })
}

beforeEach(() => {
  build()
})

describe('Öffnen und Springen', () => {
  it('lädt die Datei, in der die Position liegt', () => {
    engine.open(BOOK, 700)

    expect(element.src).toBe('https://media.test/audio/b_1/1')
    element.emitLoadedMetadata(700)
    // 700 global = 100 Sekunden in Datei 1.
    expect(element.currentTime).toBe(100)
    expect(engine.snapshot().positionSec).toBe(700)
  })

  it('setzt die Position erst, wenn die Metadaten da sind', () => {
    // Vorher gesetzt würde der Browser den Wert verwerfen.
    engine.open(BOOK, 700)
    expect(element.currentTime).toBe(0)

    element.emitLoadedMetadata(700)
    expect(element.currentTime).toBe(100)
  })

  it('meldet die globale Position, nicht die Position in der Datei', () => {
    engine.open(BOOK, 600)
    element.emitLoadedMetadata(700)
    element.advanceTo(50)

    expect(engine.snapshot().positionSec).toBe(650)
  })

  it('wechselt beim Springen die Datei', () => {
    engine.open(BOOK, 0)
    element.emitLoadedMetadata(600)

    engine.seekTo(1400)
    expect(element.src).toBe('https://media.test/audio/b_1/2')
    element.emitLoadedMetadata(500)
    expect(element.currentTime).toBe(100)
  })

  it('bleibt beim Springen innerhalb derselben Datei', () => {
    engine.open(BOOK, 0)
    element.emitLoadedMetadata(600)
    const loadsBefore = element.loadCalls

    engine.seekTo(300)
    expect(element.loadCalls).toBe(loadsBefore)
    expect(element.currentTime).toBe(300)
  })

  it('begrenzt Sprünge auf das Buch', () => {
    engine.open(BOOK, 0)
    element.emitLoadedMetadata(600)

    engine.seekTo(-100)
    expect(engine.snapshot().positionSec).toBe(0)

    engine.seekTo(99999)
    expect(engine.snapshot().positionSec).toBe(1800)
  })
})

describe('Vor- und Zurückspringen', () => {
  it('springt über die Dateigrenze zurück', () => {
    // Genau der Fall, den ±30 s am Kapitelanfang auslöst.
    engine.open(BOOK, 610)
    element.emitLoadedMetadata(700)
    expect(element.src).toBe('https://media.test/audio/b_1/1')

    engine.skip(-30)
    expect(element.src).toBe('https://media.test/audio/b_1/0')
    element.emitLoadedMetadata(600)
    expect(element.currentTime).toBe(580)
  })

  it('springt über die Dateigrenze vorwärts', () => {
    engine.open(BOOK, 0)
    element.emitLoadedMetadata(600)
    element.advanceTo(590)

    engine.skip(30)
    expect(element.src).toBe('https://media.test/audio/b_1/1')
    element.emitLoadedMetadata(700)
    expect(element.currentTime).toBe(20)
  })
})

describe('Kapitel', () => {
  it('springt zum nächsten Kapitel', () => {
    engine.open(BOOK, 100)
    element.emitLoadedMetadata(600)

    engine.nextChapter()
    expect(engine.snapshot().positionSec).toBe(600)
  })

  it('springt zunächst an den Anfang des laufenden Kapitels', () => {
    engine.open(BOOK, 900)
    element.emitLoadedMetadata(700)

    engine.previousChapter()
    expect(engine.snapshot().positionSec).toBe(600)
  })

  it('geht direkt nach dem Kapitelanfang zum vorigen Kapitel', () => {
    // Zweimal tippen muss zurückführen – Kinder treffen den Knopf mehrfach.
    engine.open(BOOK, 602)
    element.emitLoadedMetadata(700)

    engine.previousChapter()
    expect(engine.snapshot().positionSec).toBe(0)
  })

  it('bleibt am letzten Kapitel am Buchende stehen', () => {
    engine.open(BOOK, 1500)
    element.emitLoadedMetadata(500)

    engine.nextChapter()
    expect(engine.snapshot().positionSec).toBe(1800)
  })
})

describe('Kapitelwechsel am Dateiende', () => {
  it('lädt die nächste Datei und spielt weiter', () => {
    engine.open(BOOK, 0)
    element.emitLoadedMetadata(600)
    void engine.play()

    element.emitEnded()

    expect(element.src).toBe('https://media.test/audio/b_1/1')
    expect(element.playCalls).toBe(2)
    expect(engine.snapshot().finished).toBe(false)
  })

  it('benutzt dasselbe Element weiter', () => {
    // Ein neues Element verlöre die Wiedergabe-Erlaubnis des ersten Tippens.
    engine.open(BOOK, 0)
    element.emitLoadedMetadata(600)
    const before = element

    element.emitEnded()
    expect(element).toBe(before)
  })

  it('meldet das Buch am Ende der letzten Datei als beendet', () => {
    engine.open(BOOK, 1300)
    element.emitLoadedMetadata(500)
    void engine.play()

    element.emitEnded()

    expect(engine.snapshot().finished).toBe(true)
    expect(engine.snapshot().playing).toBe(false)
    expect(engine.snapshot().positionSec).toBe(1800)
  })
})

describe('Abspielen und Anhalten', () => {
  it('schaltet um', async () => {
    engine.open(BOOK, 0)
    element.emitLoadedMetadata(600)

    await engine.toggle()
    expect(engine.snapshot().playing).toBe(true)

    await engine.toggle()
    expect(engine.snapshot().playing).toBe(false)
  })

  it('behandelt eine abgelehnte Wiedergabe nicht als Fehler', async () => {
    // Ohne Nutzergeste lehnen Browser ab – das ist kein Defekt.
    build({ failPlay: true })
    engine.open(BOOK, 0)
    element.emitLoadedMetadata(600)

    await engine.play()
    expect(engine.snapshot().playing).toBe(false)
    expect(engine.snapshot().error).toBe(false)
  })

  it('merkt sich die Position beim Anhalten', () => {
    engine.open(BOOK, 600)
    element.emitLoadedMetadata(700)
    element.advanceTo(200)

    engine.pause()
    expect(engine.snapshot().positionSec).toBe(800)
  })
})

describe('Fehler', () => {
  it('meldet einen Ladefehler', () => {
    engine.open(BOOK, 0)
    element.emitError()

    expect(engine.snapshot().error).toBe(true)
    expect(engine.snapshot().loading).toBe(false)
  })

  it('meldet einen Fehler, wenn keine Adresse gebaut werden kann', () => {
    // Passiert, solange kein Media-Ticket da ist.
    const ohneTicket = createAudioEngine({ element, audioUrl: () => null })
    ohneTicket.open(BOOK, 0)

    expect(ohneTicket.snapshot().error).toBe(true)
  })
})

describe('Abonnenten', () => {
  it('meldet Änderungen', () => {
    let calls = 0
    const stop = engine.subscribe(() => {
      calls += 1
    })

    engine.open(BOOK, 0)
    expect(calls).toBeGreaterThan(0)

    stop()
    const before = calls
    engine.seekTo(100)
    expect(calls).toBe(before)
  })
})
