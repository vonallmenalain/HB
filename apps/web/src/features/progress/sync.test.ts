import { describe, expect, it } from 'vitest'

import { makeProgressEntry } from '@/test/renderWithProfiles'

import { type Progress } from './progress'
import { mergeRemote, parseRemoteProgress, pick, toRemoteDoc } from './sync'

const at = (iso: string, overrides: Partial<Progress> = {}): Progress =>
  makeProgressEntry({ updatedAt: iso, ...overrides })

const byId = (...entries: Progress[]): Map<string, Progress> =>
  new Map(entries.map((entry) => [entry.bookId, entry]))

describe('pick', () => {
  it('nimmt den jüngeren Stand', () => {
    const alt = at('2026-01-01T10:00:00.000Z', { positionSec: 500 })
    const neu = at('2026-01-01T11:00:00.000Z', { positionSec: 20 })

    // Ausdrücklich auch dann, wenn er weiter vorn liegt: Zurückspringen ist
    // eine gültige Handlung, keine Störung.
    expect(pick(alt, neu)).toBe(neu)
  })

  it('entscheidet unabhängig von der Reihenfolge', () => {
    const a = at('2026-01-01T10:00:00.000Z')
    const b = at('2026-01-01T11:00:00.000Z')

    expect(pick(a, b)).toBe(pick(b, a))
  })

  it('kommt auch bei gleichem Zeitstempel auf beiden Geräten zum selben Ergebnis', () => {
    // Sonst würden sich zwei Geräte gegenseitig überschreiben, ohne je
    // zusammenzufinden.
    const a = at('2026-01-01T10:00:00.000Z', { positionSec: 120 })
    const b = at('2026-01-01T10:00:00.000Z', { positionSec: 300 })

    expect(pick(a, b)).toBe(b)
    expect(pick(b, a)).toBe(b)
  })

  it('lässt „fertig gehört" bei gleichem Zeitstempel gewinnen', () => {
    const offen = at('2026-01-01T10:00:00.000Z', { positionSec: 590 })
    const fertig = at('2026-01-01T10:00:00.000Z', { positionSec: 0, finished: true })

    expect(pick(offen, fertig)).toBe(fertig)
    expect(pick(fertig, offen)).toBe(fertig)
  })
})

describe('mergeRemote', () => {
  it('übernimmt ein Buch, das nur in der Cloud steht', () => {
    const fremd = at('2026-01-02T10:00:00.000Z', { bookId: 'b_2' })

    const result = mergeRemote(byId(), byId(fremd), { remoteComplete: true })

    expect(result.entries.get('b_2')).toEqual(fremd)
    expect(result.toStore).toEqual([fremd])
    expect(result.toPush).toEqual([])
    expect(result.changed).toBe(true)
  })

  it('übernimmt den jüngeren Stand aus der Cloud', () => {
    const hier = at('2026-01-01T10:00:00.000Z', { positionSec: 100 })
    const dort = at('2026-01-01T12:00:00.000Z', { positionSec: 400 })

    const result = mergeRemote(byId(hier), byId(dort), { remoteComplete: true })

    expect(result.entries.get('b_1')?.positionSec).toBe(400)
    expect(result.toStore).toEqual([dort])
    expect(result.toPush).toEqual([])
  })

  it('lässt den lokalen Stand stehen, wenn er jünger ist', () => {
    const hier = at('2026-01-01T12:00:00.000Z', { positionSec: 400 })
    const dort = at('2026-01-01T10:00:00.000Z', { positionSec: 100 })

    const result = mergeRemote(byId(hier), byId(dort), { remoteComplete: true })

    expect(result.entries.get('b_1')?.positionSec).toBe(400)
    expect(result.toStore).toEqual([])
    expect(result.changed).toBe(false)
  })

  it('legt einen überholten Cloud-Stand wieder hin', () => {
    // Der Fall, der ohne diese Zeile Fortschritt kostet: Ein Gerät lag eine
    // Woche im Flugmodus, schiebt beim Einschalten seinen alten Stand hinaus
    // und überschreibt damit in Firestore den neueren. Wer den neueren hat,
    // repariert das beim nächsten Schnappschuss von selbst.
    const hier = at('2026-01-08T12:00:00.000Z', { positionSec: 400 })
    const veraltet = at('2026-01-01T10:00:00.000Z', { positionSec: 20 })

    const result = mergeRemote(byId(hier), byId(veraltet), { remoteComplete: true })

    expect(result.toPush).toEqual([hier])
    expect(result.entries.get('b_1')).toBe(hier)
  })

  it('schreibt nichts, wenn beide Seiten denselben Stand haben', () => {
    // Der Normalfall nach jedem eigenen Schreibvorgang: Firestore meldet ihn
    // sofort zurück. Daraus darf keine Endlosschleife werden.
    const gleich = at('2026-01-01T10:00:00.000Z')

    const result = mergeRemote(byId(gleich), byId({ ...gleich }), { remoteComplete: true })

    expect(result.toStore).toEqual([])
    expect(result.toPush).toEqual([])
    expect(result.changed).toBe(false)
  })

  it('schiebt lokale Bücher nach, die in der Cloud fehlen', () => {
    const nurHier = at('2026-01-01T10:00:00.000Z', { bookId: 'b_9' })

    const result = mergeRemote(byId(nurHier), byId(), { remoteComplete: true })

    expect(result.toPush).toEqual([nurHier])
  })

  it('schiebt nichts nach, solange die Cloud-Seite unvollständig ist', () => {
    // Beim Kaltstart ohne Netz antwortet Firestore aus seinem eigenen
    // Zwischenspeicher. Ein leerer Stand von dort heisst nicht, dass auf dem
    // Server nichts liegt – sonst ginge bei jedem Start die ganze Bibliothek
    // hinaus.
    const nurHier = at('2026-01-01T10:00:00.000Z', { bookId: 'b_9' })

    const result = mergeRemote(byId(nurHier), byId(), { remoteComplete: false })

    expect(result.toPush).toEqual([])
  })

  it('lässt die übergebene Karte unangetastet', () => {
    const local = byId(at('2026-01-01T10:00:00.000Z'))
    const dort = at('2026-01-01T12:00:00.000Z')

    const result = mergeRemote(local, byId(dort), { remoteComplete: true })

    expect(local.get('b_1')?.updatedAt).toBe('2026-01-01T10:00:00.000Z')
    expect(result.entries).not.toBe(local)
  })
})

describe('parseRemoteProgress', () => {
  it('liest ein vollständiges Dokument', () => {
    const entry = parseRemoteProgress('b_1', {
      positionSec: 120,
      fileIdx: 2,
      offsetSec: 30,
      filesHash: 'abc',
      durationSec: 600,
      finished: false,
      updatedAt: '2026-01-01T10:00:00.000Z',
      deviceId: 'egal',
    })

    expect(entry).toEqual({
      bookId: 'b_1',
      positionSec: 120,
      fileIdx: 2,
      offsetSec: 30,
      filesHash: 'abc',
      durationSec: 600,
      finished: false,
      updatedAt: '2026-01-01T10:00:00.000Z',
    })
  })

  it('bringt Zeitstempel auf eine einheitliche Schreibweise', () => {
    // Verglichen wird als Zeichenkette – das geht nur auf, wenn alle
    // Zeitstempel gleich geschrieben sind.
    const entry = parseRemoteProgress('b_1', {
      updatedAt: '2026-01-01T12:00:00+01:00',
      positionSec: 10,
    })

    expect(entry?.updatedAt).toBe('2026-01-01T11:00:00.000Z')
  })

  it('nimmt auch einen Firestore-Timestamp', () => {
    const entry = parseRemoteProgress('b_1', {
      updatedAt: { toDate: () => new Date('2026-01-01T10:00:00.000Z') },
    })

    expect(entry?.updatedAt).toBe('2026-01-01T10:00:00.000Z')
  })

  it.each([
    ['kein Objekt', 'b_1', 'kaputt'],
    ['null', 'b_1', null],
    ['ohne Zeitstempel', 'b_1', { positionSec: 10 }],
    ['unlesbarer Zeitstempel', 'b_1', { updatedAt: 'gestern' }],
    ['ohne Buch-ID', '', { updatedAt: '2026-01-01T10:00:00.000Z' }],
  ])('überspringt %s', (_name, bookId, data) => {
    expect(parseRemoteProgress(bookId, data)).toBeNull()
  })

  it('fängt unsinnige Zahlen ab', () => {
    const entry = parseRemoteProgress('b_1', {
      positionSec: 99999,
      fileIdx: -3,
      offsetSec: Number.NaN,
      durationSec: 600,
      updatedAt: '2026-01-01T10:00:00.000Z',
    })

    expect(entry).toMatchObject({ positionSec: 600, fileIdx: 0, offsetSec: 0 })
  })
})

describe('toRemoteDoc', () => {
  it('lässt die Buch-ID weg – die ist der Dokumentname', () => {
    const doc = toRemoteDoc(makeProgressEntry(), 'geraet-1')

    expect(doc).not.toHaveProperty('bookId')
    expect(doc).toMatchObject({ positionSec: 300, deviceId: 'geraet-1' })
  })

  it('ist wieder einlesbar', () => {
    const entry = makeProgressEntry({ positionSec: 42 })

    expect(parseRemoteProgress(entry.bookId, toRemoteDoc(entry, 'g'))).toEqual(entry)
  })
})
