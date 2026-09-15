import { describe, expect, it, vi } from 'vitest'

import {
  abortBackgroundFetch,
  backgroundFetchManager,
  findBackgroundFetch,
  runningBackgroundFetches,
  startBackgroundFetch,
} from './backgroundFetch'
import {
  type BackgroundFetchManager,
  type BackgroundFetchRegistration,
} from './backgroundFetchTypes'

function fakeRegistration(id: string, abort = vi.fn(() => Promise.resolve(true))) {
  return { id, abort, downloaded: 0 } as unknown as BackgroundFetchRegistration
}

function fakeManager(overrides: Partial<BackgroundFetchManager> = {}): BackgroundFetchManager {
  return {
    fetch: vi.fn(() => Promise.resolve(fakeRegistration('hb:b_1'))),
    get: vi.fn(() => Promise.resolve(undefined)),
    getIds: vi.fn(() => Promise.resolve([])),
    ...overrides,
  }
}

const JOB = {
  bookId: 'b_1',
  title: 'Der Super-Papagei',
  urls: ['https://nas.example/audio/b_1/0?t=abc'],
  downloadTotal: 4_000_000,
}

describe('startBackgroundFetch', () => {
  it('übergibt unter einer Kennung, die zum Buch zurückführt', async () => {
    // Der Service Worker bekommt später nur diese Kennung – aus ihr muss
    // hervorgehen, um welches Buch es ging.
    const manager = fakeManager()

    await startBackgroundFetch(manager, JOB)

    expect(vi.mocked(manager.fetch).mock.calls[0]?.[0]).toBe('hb:b_1')
  })

  it('fragt mit `cors` an', async () => {
    // Eine undurchsichtige Antwort liesse sich später nicht in den Cache
    // legen – `cache.put` weist sie zurück, und der Download wäre umsonst.
    const manager = fakeManager()

    await startBackgroundFetch(manager, JOB)

    const requests = vi.mocked(manager.fetch).mock.calls[0]?.[1] as Request[]
    expect(requests[0]?.mode).toBe('cors')
    expect(requests[0]?.url).toContain('t=abc')
  })

  it('nennt die erwartete Grösse', async () => {
    // Ohne sie zeigt Android keinen Fortschritt; mit einer zu kleinen bricht
    // es ab, sobald mehr ankommt.
    const manager = fakeManager()

    await startBackgroundFetch(manager, JOB)

    expect(vi.mocked(manager.fetch).mock.calls[0]?.[2]).toMatchObject({
      title: 'Der Super-Papagei',
      downloadTotal: 4_000_000,
    })
  })

  it('gibt `null` zurück, wenn das Gerät ablehnt', async () => {
    // Schon in der Schlange, kein Platz, vom Nutzer abgelehnt: Der Aufrufer
    // lädt dann im Vordergrund weiter, statt stehen zu bleiben.
    const manager = fakeManager({ fetch: vi.fn(() => Promise.reject(new Error('nein'))) })

    expect(await startBackgroundFetch(manager, JOB)).toBeNull()
  })
})

describe('findBackgroundFetch / abortBackgroundFetch', () => {
  it('sucht unter der Kennung des Buchs', async () => {
    const manager = fakeManager({ get: vi.fn(() => Promise.resolve(fakeRegistration('hb:b_1'))) })

    expect(await findBackgroundFetch(manager, 'b_1')).not.toBeNull()
    expect(vi.mocked(manager.get).mock.calls[0]?.[0]).toBe('hb:b_1')
  })

  it('bricht eine laufende Übergabe ab', async () => {
    const abort = vi.fn(() => Promise.resolve(true))
    const manager = fakeManager({
      get: vi.fn(() => Promise.resolve(fakeRegistration('hb:b_1', abort))),
    })

    expect(await abortBackgroundFetch(manager, 'b_1')).toBe(true)
    expect(abort).toHaveBeenCalled()
  })

  it('sagt nein, wenn gar nichts läuft', async () => {
    expect(await abortBackgroundFetch(fakeManager(), 'b_1')).toBe(false)
  })
})

describe('runningBackgroundFetches', () => {
  it('lässt weg, was inzwischen verschwunden ist', async () => {
    // Zwischen `getIds` und `get` kann eine Übergabe fertig geworden sein.
    const manager = fakeManager({
      getIds: vi.fn(() => Promise.resolve(['hb:b_1', 'hb:b_2'])),
      get: vi.fn((id: string) =>
        Promise.resolve(id === 'hb:b_1' ? fakeRegistration(id) : undefined),
      ),
    })

    expect((await runningBackgroundFetches(manager)).map((entry) => entry.id)).toEqual(['hb:b_1'])
  })

  it('gibt bei einem Fehler eine leere Liste zurück', async () => {
    const manager = fakeManager({ getIds: vi.fn(() => Promise.reject(new Error('nein'))) })

    expect(await runningBackgroundFetches(manager)).toEqual([])
  })
})

describe('backgroundFetchManager', () => {
  it('liefert nichts, wo es die Schnittstelle nicht gibt', async () => {
    // Desktop, iOS, ältere Geräte: Dort lädt die App im Vordergrund.
    expect(await backgroundFetchManager()).toBeNull()
  })
})
