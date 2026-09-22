import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type Book } from '@/features/library/catalog'
import { makeBook } from '@/test/renderWithProfiles'

import {
  type AudioEngine,
  RENEW_TIMEOUT_MS,
  RETRY_DELAYS_MS,
  STALL_TIMEOUT_MS,
  createAudioEngine,
} from './audioEngine'
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

describe('Springen während des Ladens', () => {
  it('springt an das neue Ziel, nicht an das beim Öffnen', () => {
    // Vorher gewann das alte Ziel, sobald die Metadaten kamen.
    engine.open(BOOK, 100)
    engine.seekTo(300)

    element.emitLoadedMetadata(600)
    expect(element.currentTime).toBe(300)
    expect(engine.snapshot().positionSec).toBe(300)
  })

  it('springt beim Anhalten nicht an den Dateianfang', () => {
    engine.open(BOOK, 700)
    engine.pause()

    expect(engine.snapshot().positionSec).toBe(700)
  })
})

/**
 * Abbruch und Wiederaufnahme.
 *
 * Jede Medienadresse trägt ein Ticket, das nach acht Stunden abläuft – eine
 * installierte App bleibt aber tagelang offen. Lief es ab, verstummte das
 * Hörbuch „aus dem Nichts", und kein Tippen brachte es zurück: Das Element
 * hatte aufgegeben, und die Engine lud nie neu. Erst ein Neustart der App
 * holte ein neues Ticket. Die Fälle hier sind im echten Chromium gegen den
 * Medien-Dienst nachgestellt.
 */
describe('Abbruch und Wiederaufnahme', () => {
  /** Das Ticket in der Adresse – die Tests lassen es ablaufen und erneuern es. */
  let ticket: string | null = 'alt'
  const renewAccess = vi.fn<(force: boolean) => Promise<void>>()
  const adresse = (fileIdx: number, t: string): string =>
    `https://media.test/audio/b_1/${String(fileIdx)}?t=${t}`

  beforeEach(() => {
    vi.useFakeTimers()
    ticket = 'alt'
    renewAccess.mockReset()
    renewAccess.mockImplementation((force) => {
      ticket = force ? 'erzwungen' : 'frisch'
      return Promise.resolve()
    })
    element = createFakeMediaElement()
    engine = createAudioEngine({
      element,
      audioUrl: (bookId, fileIdx) =>
        ticket === null ? null : `https://media.test/audio/${bookId}/${String(fileIdx)}?t=${ticket}`,
      renewAccess,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /** Öffnet das Buch an einer Stelle und lässt es laufen, wie nach dem ersten Tippen. */
  async function hoeren(position: number): Promise<void> {
    engine.open(BOOK, position)
    element.emitLoadedMetadata(position < 600 ? 600 : 700)
    await engine.play()
  }

  /** Lässt geplante Wiederholungen laufen, samt dem Warten auf das Ticket. */
  async function warten(ms = 0): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms)
  }

  it('lädt nach einem Abbruch mit frischem Ticket an derselben Stelle neu', async () => {
    await hoeren(600)
    element.advanceTo(100)

    element.emitError()
    await warten()

    expect(renewAccess).toHaveBeenCalledWith(false)
    expect(element.src).toBe(adresse(1, 'frisch'))
    element.emitLoadedMetadata(700)
    expect(element.currentTime).toBe(100)
    expect(engine.snapshot().positionSec).toBe(700)
    expect(engine.snapshot().playing).toBe(true)
    expect(element.paused).toBe(false)
  })

  it('hält das „pause" nach dem Fehler nicht für Anhalten', async () => {
    // Chrome schickt es hinterher. Wer es ernst nimmt, lädt zwar neu – aber
    // spielt nicht weiter, und das Kind steht wieder vor Stille.
    await hoeren(0)
    element.emitError()

    expect(engine.snapshot().playing).toBe(true)
    expect(engine.snapshot().loading).toBe(true)
    expect(engine.snapshot().error).toBe(false)
  })

  it('geht am Kapitelwechsel mit frischem Ticket weiter', async () => {
    // Der erste nachgestellte Fall: Das Ticket läuft während eines Kapitels
    // ab, und die nächste Datei wird mit dem alten angefragt.
    await hoeren(0)
    element.emitEnded()
    expect(element.src).toBe(adresse(1, 'alt'))

    element.emitError()
    await warten()

    expect(element.src).toBe(adresse(1, 'frisch'))
    element.emitLoadedMetadata(700)
    expect(element.currentTime).toBe(0)
    expect(engine.snapshot().positionSec).toBe(600)
    expect(engine.snapshot().playing).toBe(true)
  })

  it('setzt nach einem Abbruch beim Laden am Ziel an, nicht am Dateianfang', async () => {
    engine.open(BOOK, 700)
    await engine.play()

    element.emitError()
    await warten()

    element.emitLoadedMetadata(700)
    expect(element.currentTime).toBe(100)
    expect(engine.snapshot().positionSec).toBe(700)
  })

  it('erkennt einen Hänger ohne Fehlermeldung und lädt neu', async () => {
    // Der zweite nachgestellte Fall: Mitten in der Datei wiederholt Chrome
    // die abgewiesene Anfrage eine halbe Minute lang still, statt einen
    // Fehler zu melden – die Anzeige sagt „spielt", zu hören ist nichts.
    await hoeren(0)
    element.advanceTo(140)
    element.emitWaiting()

    await warten(STALL_TIMEOUT_MS - 1)
    expect(element.src).toBe(adresse(0, 'alt'))

    // Der Wächter schlägt an; die Wiederholung folgt unmittelbar danach.
    await warten(10)
    expect(element.src).toBe(adresse(0, 'frisch'))
    element.emitLoadedMetadata(600)
    expect(element.currentTime).toBe(140)
    expect(engine.snapshot().playing).toBe(true)
  })

  it('lässt ein langsames Netz in Ruhe, solange Daten ankommen', async () => {
    await hoeren(0)
    element.advanceTo(140)
    const loads = element.loadCalls

    element.emitWaiting()
    for (let i = 0; i < 4; i += 1) {
      await warten(STALL_TIMEOUT_MS - 1000)
      element.emitProgress()
    }
    element.emitPlaying()
    await warten(STALL_TIMEOUT_MS * 2)

    expect(element.loadCalls).toBe(loads)
    expect(renewAccess).not.toHaveBeenCalled()
  })

  it('wartet nicht auf Daten, wenn niemand zuhört', async () => {
    await hoeren(0)
    engine.pause()
    const loads = element.loadCalls

    element.emitWaiting()
    await warten(STALL_TIMEOUT_MS * 2)

    expect(element.loadCalls).toBe(loads)
  })

  it('gibt nach mehreren Fehlschlägen auf und meldet den Fehler', async () => {
    await hoeren(0)
    element.advanceTo(50)

    for (const delay of RETRY_DELAYS_MS) {
      element.emitError()
      expect(engine.snapshot().error).toBe(false)
      await warten(delay)
    }
    element.emitError()

    expect(engine.snapshot().error).toBe(true)
    expect(engine.snapshot().playing).toBe(false)
    expect(engine.snapshot().loading).toBe(false)
    expect(engine.snapshot().positionSec).toBe(50)
    // Erst ein gewöhnliches Ticket, danach auch ein scheinbar gültiges ersetzt.
    expect(renewAccess.mock.calls.map(([force]) => force)).toEqual([
      false,
      true,
      true,
      true,
      true,
    ])
  })

  it('versucht es nach dem Aufgeben beim Abspielen sofort von vorn', async () => {
    await hoeren(0)
    element.advanceTo(50)
    for (const delay of RETRY_DELAYS_MS) {
      element.emitError()
      await warten(delay)
    }
    element.emitError()
    const loads = element.loadCalls

    await engine.play()

    expect(element.loadCalls).toBe(loads + 1)
    expect(engine.snapshot().error).toBe(false)
    expect(engine.snapshot().playing).toBe(true)
    element.emitLoadedMetadata(600)
    expect(element.currentTime).toBe(50)
  })

  it('lädt nach einem Abbruch in der Pause erst beim nächsten Abspielen neu', async () => {
    await hoeren(0)
    element.advanceTo(50)
    engine.pause()
    const loads = element.loadCalls

    element.emitError()
    await warten(60_000)
    // Niemand hört zu: kein Neuladen, keine Fehlermeldung.
    expect(element.loadCalls).toBe(loads)
    expect(engine.snapshot().error).toBe(false)

    await engine.play()
    expect(element.loadCalls).toBe(loads + 1)
    element.emitLoadedMetadata(600)
    expect(element.currentTime).toBe(50)
    expect(engine.snapshot().playing).toBe(true)
  })

  it('spielt nach Anhalten während der Erholung nicht von selbst weiter', async () => {
    await hoeren(0)
    element.advanceTo(50)
    element.emitError()
    engine.pause()
    const loads = element.loadCalls

    await warten(60_000)
    expect(element.loadCalls).toBe(loads)
    expect(engine.snapshot().playing).toBe(false)
    expect(engine.snapshot().loading).toBe(false)

    await engine.play()
    element.emitLoadedMetadata(600)
    expect(element.currentTime).toBe(50)
  })

  it('springt nach einem Abbruch dorthin, wohin getippt wurde', async () => {
    await hoeren(0)
    element.advanceTo(50)
    element.emitError()

    engine.seekTo(1400)
    await warten(60_000)

    expect(element.src).toBe(adresse(2, 'alt'))
    element.emitLoadedMetadata(500)
    expect(element.currentTime).toBe(100)
  })

  it('nimmt beim Weiterhören die neue Adresse, wenn das Ticket erneuert wurde', async () => {
    // Der dritte nachgestellte Fall: angehalten, Ticket abgelaufen,
    // weitergehört – mit der alten Adresse lief der Puffer noch eine halbe
    // Minute, dann war Stille.
    await hoeren(0)
    element.advanceTo(100)
    engine.pause()

    ticket = 'neu'
    await engine.play()

    expect(element.src).toBe(adresse(0, 'neu'))
    element.emitLoadedMetadata(600)
    expect(element.currentTime).toBe(100)
    expect(engine.snapshot().playing).toBe(true)
  })

  it('lädt beim Weiterhören nicht neu, solange die Adresse gleich bleibt', async () => {
    await hoeren(0)
    element.advanceTo(100)
    engine.pause()
    const loads = element.loadCalls

    await engine.play()

    expect(element.loadCalls).toBe(loads)
    expect(engine.snapshot().playing).toBe(true)
  })

  it('holt ein Ticket, wenn beim Start noch keines da ist', async () => {
    ticket = null
    engine.open(BOOK, 0)
    await engine.play()

    await warten()

    expect(element.src).toBe(adresse(0, 'frisch'))
    expect(engine.snapshot().error).toBe(false)
  })

  it('meldet den Fehler, wenn sich keine Adresse bauen lässt', async () => {
    // Kein Ticket und keines zu bekommen – etwa ohne Netz und ohne Download.
    ticket = null
    renewAccess.mockRejectedValue(new Error('offline'))
    engine.open(BOOK, 0)
    await engine.play()

    await warten(60_000)

    expect(engine.snapshot().error).toBe(true)
    expect(engine.snapshot().playing).toBe(false)
  })

  it('wartet nicht ewig auf ein neues Ticket', async () => {
    renewAccess.mockImplementation(() => new Promise(() => undefined))
    await hoeren(0)
    const loads = element.loadCalls

    element.emitError()
    await warten()
    expect(element.loadCalls).toBe(loads)

    await warten(RENEW_TIMEOUT_MS)
    expect(element.loadCalls).toBe(loads + 1)
  })

  it('bricht eine geplante Wiederholung beim Stoppen ab', async () => {
    await hoeren(0)
    element.emitError()
    engine.stop()
    const loads = element.loadCalls

    await warten(60_000)

    expect(element.loadCalls).toBe(loads)
    expect(element.src).toBe('')
    expect(engine.snapshot().book).toBeNull()
  })

  it('fängt bei einem neuen Buch mit frischen Versuchen an', async () => {
    await hoeren(0)
    for (const delay of RETRY_DELAYS_MS) {
      element.emitError()
      await warten(delay)
    }
    element.emitError()
    expect(engine.snapshot().error).toBe(true)

    engine.open(BOOK, 900)
    await engine.play()
    expect(engine.snapshot().error).toBe(false)
    element.emitError()
    await warten()

    expect(engine.snapshot().error).toBe(false)
    element.emitLoadedMetadata(700)
    expect(element.currentTime).toBe(300)
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

describe('Einschlaf-Timer', () => {
  /** Eine Uhr, die der Test weiterstellt – nicht die echte. */
  let jetzt = 1_000_000
  const vor = (ms: number): void => {
    jetzt += ms
  }

  function bauenMitUhr(): void {
    jetzt = 1_000_000
    element = createFakeMediaElement()
    engine = createAudioEngine({
      element,
      audioUrl: (bookId, fileIdx) => `https://media.test/audio/${bookId}/${String(fileIdx)}`,
      now: () => jetzt,
    })
  }

  beforeEach(() => {
    bauenMitUhr()
    engine.open(BOOK, 0)
    element.emitLoadedMetadata(600)
  })

  it('zeigt die Restzeit ab dem Einstellen', () => {
    engine.setSleep({ kind: 'minutes', minutes: 15 })

    expect(engine.snapshot().sleepMode).toEqual({ kind: 'minutes', minutes: 15 })
    expect(engine.snapshot().sleepRemainingSec).toBe(900)
  })

  it('zählt mit der laufenden Wiedergabe herunter', async () => {
    await engine.play()
    engine.setSleep({ kind: 'minutes', minutes: 10 })

    vor(4 * 60_000)
    element.advanceTo(240)

    expect(engine.snapshot().sleepRemainingSec).toBe(360)
  })

  it('hält an, wenn das Kind pausiert', async () => {
    // „Noch 15 Minuten hören" meint Hörzeit. Sonst wäre die Zeit vorbei,
    // während das Tablet unangetastet auf dem Nachttisch lag.
    await engine.play()
    engine.setSleep({ kind: 'minutes', minutes: 10 })

    engine.pause()
    vor(9 * 60_000)
    await engine.play()
    element.advanceTo(10)

    expect(engine.snapshot().sleepRemainingSec).toBe(600)
  })

  it('blendet über die letzten Sekunden aus, ohne je stumm zu werden', async () => {
    // Stumm heisst für den Browser „spielt nicht" – und dann endet die
    // Hintergrundwiedergabe, statt sanft auszulaufen.
    await engine.play()
    engine.setSleep({ kind: 'minutes', minutes: 1 })

    const lautstaerken: number[] = []
    for (const sekunde of [30, 45, 50, 55, 59]) {
      vor(sekunde * 1000 - (jetzt - 1_000_000))
      element.advanceTo(sekunde)
      lautstaerken.push(element.volume)
    }

    expect(lautstaerken[0]).toBe(1)
    expect(lautstaerken.at(-1)).toBeLessThan(1)
    for (const lautstaerke of lautstaerken) expect(lautstaerke).toBeGreaterThan(0)
  })

  it('hält am Ende an, statt mitten im Satz abzubrechen', async () => {
    await engine.play()
    engine.setSleep({ kind: 'minutes', minutes: 1 })

    vor(61_000)
    element.advanceTo(61)

    expect(engine.snapshot().playing).toBe(false)
    expect(element.paused).toBe(true)
    // Und ohne Nachwirkung: Beim nächsten Mal ist wieder volle Lautstärke da.
    expect(element.volume).toBe(1)
    expect(engine.snapshot().sleepMode).toBeNull()
  })

  it('bleibt beim Ausschalten in voller Lautstärke stehen', async () => {
    await engine.play()
    engine.setSleep({ kind: 'minutes', minutes: 1 })
    vor(55_000)
    element.advanceTo(55)

    engine.setSleep(null)

    expect(element.volume).toBe(1)
    expect(engine.snapshot().sleepMode).toBeNull()
    expect(engine.snapshot().playing).toBe(true)
  })

  it('endet bei „bis Kapitelende" am Kapitelende', async () => {
    await engine.play()
    engine.setSleep({ kind: 'chapter' })

    // Erstes Kapitel geht bis Sekunde 600.
    element.advanceTo(400)
    expect(engine.snapshot().sleepRemainingSec).toBe(200)

    element.emitEnded()

    expect(engine.snapshot().playing).toBe(false)
    // Und ausdrücklich **nicht** weiter zum nächsten Kapitel.
    expect(element.src).toContain('/audio/b_1/0')
    expect(engine.snapshot().positionSec).toBe(600)
  })

  it('lässt ohne Timer den Kapitelwechsel unverändert laufen', async () => {
    await engine.play()
    element.emitEnded()

    expect(element.src).toContain('/audio/b_1/1')
  })
})
