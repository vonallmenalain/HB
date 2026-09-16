import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LibraryContext } from '@/features/library/libraryContext'
import { type MediaClient } from '@/features/library/mediaClient'
import { ProfilesContext } from '@/features/profiles/profilesContext'
import {
  makeBook,
  makeDownloadRecord,
  makeLibraryValue,
  makeProfile,
  makeProfilesValue,
} from '@/test/renderWithProfiles'

import { DownloadProvider } from './DownloadProvider'
import { type BackgroundFetchManager } from './backgroundFetchTypes'
import { useDownloads } from './downloadsContext'

vi.mock('@/lib/db', () => ({
  readAllDownloads: vi.fn(),
  readDownload: vi.fn(),
  writeDownload: vi.fn(),
  deleteDownload: vi.fn(),
}))

const { readAllDownloads, readDownload, writeDownload, deleteDownload } = await import('@/lib/db')

const BUCH = makeBook({
  id: 'b_1',
  filesHash: 'abc',
  cover: '/cover/b_1.jpg?v=9',
  files: [
    { idx: 0, durationSec: 300, bytes: 1_000_000, mime: 'audio/mpeg' },
    { idx: 1, durationSec: 300, bytes: 3_000_000, mime: 'audio/mpeg' },
  ],
})

const client: MediaClient = {
  ensureTicket: () => Promise.resolve('t'),
  currentTicket: () => 't',
  fetchCatalog: () => Promise.resolve({ status: 'not-modified' }),
  startRescan: () => Promise.resolve('started'),
  fetchStatus: () =>
    Promise.resolve({ scanning: false, books: 1, schemaVersion: 2, scannedAt: null }),
  fetchFolders: () => Promise.resolve([]),
  setFolderMode: () => Promise.resolve(),
  uploadCover: () => Promise.resolve('/cover/b_1.jpg?v=1'),
  removeCover: () => Promise.resolve(),
  coverUrl: (path) => `https://nas.example${path}&t=t`,
  audioUrl: (bookId, fileIdx) => `https://nas.example/audio/${bookId}/${String(fileIdx)}?t=t`,
  canonicalAudioUrl: (bookId, fileIdx) =>
    `https://nas.example/audio/${bookId}/${String(fileIdx)}`,
  canonicalCoverUrl: (path) => `https://nas.example${path}`,
  forgetTicket: () => undefined,
}

/** Ein Service Worker, der sich ansprechen lässt – mehr braucht der Test nicht. */
function fakeServiceWorker(manager: BackgroundFetchManager | null) {
  const target = new EventTarget()
  return Object.assign(target, {
    ready: Promise.resolve(manager === null ? {} : { backgroundFetch: manager }),
  })
}

function fakeRegistration(id = 'hb:b_1') {
  const target = new EventTarget()
  return Object.assign(target, {
    id,
    downloaded: 0,
    downloadTotal: 0,
    result: '' as const,
    failureReason: '',
    recordsAvailable: true,
    matchAll: () => Promise.resolve([]),
    abort: () => Promise.resolve(true),
  })
}

/** Die Adresse aus einem `fetch`-Aufruf, egal in welcher Form sie kam. */
function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

function Show() {
  const { records, background, start, cancel } = useDownloads()
  const record = records.get('b_1')
  return (
    <div>
      <span data-testid="status">{record?.status ?? 'kein Eintrag'}</span>
      <span data-testid="bytes">{record?.bytesDone ?? 0}</span>
      <span data-testid="background">{String(background)}</span>
      <button type="button" onClick={() => { start(BUCH) }}>laden</button>
      <button type="button" onClick={() => { cancel('b_1') }}>abbrechen</button>
    </div>
  )
}

function renderProvider() {
  return render(
    <ProfilesContext value={makeProfilesValue({ selected: makeProfile({ allowDownload: true }) })}>
      <LibraryContext value={makeLibraryValue({ books: [BUCH], client })}>
        <DownloadProvider>
          <Show />
        </DownloadProvider>
      </LibraryContext>
    </ProfilesContext>,
  )
}

function installServiceWorker(manager: BackgroundFetchManager | null) {
  const worker = fakeServiceWorker(manager)
  Object.defineProperty(navigator, 'serviceWorker', { value: worker, configurable: true })
  return worker
}

describe('Download an das Betriebssystem übergeben', () => {
  beforeEach(() => {
    const store = new Map<string, ArrayBuffer>()
    vi.stubGlobal('caches', {
      open: () =>
        Promise.resolve({
          match: (key: string) => {
            const body = store.get(key)
            return Promise.resolve(body === undefined ? undefined : new Response(body))
          },
          put: async (key: string, response: Response) => {
            store.set(key, await response.arrayBuffer())
          },
          delete: (key: string) => Promise.resolve(store.delete(key)),
        }),
    })
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('x'))))
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()

    vi.mocked(readAllDownloads).mockResolvedValue([])
    vi.mocked(readDownload).mockResolvedValue(null)
    vi.mocked(writeDownload).mockResolvedValue(undefined)
    vi.mocked(deleteDownload).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    // @ts-expect-error – in jsdom gibt es die Eigenschaft sonst nicht
    delete navigator.serviceWorker
    vi.clearAllMocks()
  })

  it('übergibt die Audiodateien an das Gerät statt sie selbst zu laden', async () => {
    // Das ist der ganze Punkt: antippen und weglegen. Die App darf danach zu
    // sein.
    const manager: BackgroundFetchManager = {
      fetch: vi.fn(() => Promise.resolve(fakeRegistration())),
      get: vi.fn(() => Promise.resolve(undefined)),
      getIds: vi.fn(() => Promise.resolve([])),
    }
    installServiceWorker(manager)
    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('background')).toHaveTextContent('true')
    })
    await userEvent.click(screen.getByRole('button', { name: 'laden' }))

    await waitFor(() => {
      expect(manager.fetch).toHaveBeenCalled()
    })
    const [, requests, options] = vi.mocked(manager.fetch).mock.calls[0] ?? []
    expect((requests as Request[]).map((request) => request.url)).toEqual([
      'https://nas.example/audio/b_1/0?t=t',
      'https://nas.example/audio/b_1/1?t=t',
    ])
    // Die angekündigte Grösse zählt nur die Audiodateien: Android bricht ab,
    // sobald mehr ankommt – und die Grösse des Covers steht nicht im Katalog.
    expect(options?.downloadTotal).toBe(4_000_000)
  })

  it('holt das Cover selbst, solange die App noch offen ist', async () => {
    const manager: BackgroundFetchManager = {
      fetch: vi.fn(() => Promise.resolve(fakeRegistration())),
      get: vi.fn(() => Promise.resolve(undefined)),
      getIds: vi.fn(() => Promise.resolve([])),
    }
    installServiceWorker(manager)
    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('background')).toHaveTextContent('true')
    })
    await userEvent.click(screen.getByRole('button', { name: 'laden' }))

    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.map(([input]) => urlOf(input))).toEqual([
        'https://nas.example/cover/b_1.jpg?v=9&t=t',
      ])
    })
  })

  it('lädt im Vordergrund weiter, wenn das Gerät die Übergabe ablehnt', async () => {
    // Schon in der Schlange, kein Platz, abgelehnt: Stehen bleiben wäre die
    // schlechteste Antwort.
    const manager: BackgroundFetchManager = {
      fetch: vi.fn(() => Promise.reject(new Error('nein'))),
      get: vi.fn(() => Promise.resolve(undefined)),
      getIds: vi.fn(() => Promise.resolve([])),
    }
    installServiceWorker(manager)
    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('background')).toHaveTextContent('true')
    })
    await userEvent.click(screen.getByRole('button', { name: 'laden' }))

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('done')
    })
    expect(vi.mocked(fetch).mock.calls.map(([input]) => urlOf(input))).toContain(
      'https://nas.example/audio/b_1/0?t=t',
    )
  })

  it('greift eine Übergabe wieder auf, die beim Öffnen noch läuft', async () => {
    // Android hat weitergeladen, während die App zu war. Ohne diesen Schritt
    // stünde der Eintrag auf „nichts läuft", obwohl gerade geladen wird.
    const registration = Object.assign(fakeRegistration(), { downloaded: 500_000 })
    const manager: BackgroundFetchManager = {
      fetch: vi.fn(() => Promise.resolve(registration)),
      get: vi.fn(() => Promise.resolve(registration)),
      getIds: vi.fn(() => Promise.resolve(['hb:b_1'])),
    }
    installServiceWorker(manager)
    vi.mocked(readAllDownloads).mockResolvedValue([
      makeDownloadRecord({
        bookId: 'b_1',
        status: 'running',
        filesTotal: 2,
        filesDone: 1,
        bytesTotal: 4_000_000,
        // Aus einem früheren Versuch: Diese Datei liegt schon im Cache.
        bytesDone: 1_000_000,
      }),
    ])

    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('running')
    })
    // Aufaddiert, nicht ersetzt – sonst spränge der Balken zurück.
    expect(screen.getByTestId('bytes')).toHaveTextContent('1500000')
  })

  it('übernimmt, was der Service Worker inzwischen abgelegt hat', async () => {
    const manager: BackgroundFetchManager = {
      fetch: vi.fn(() => Promise.resolve(fakeRegistration())),
      get: vi.fn(() => Promise.resolve(undefined)),
      getIds: vi.fn(() => Promise.resolve([])),
    }
    const worker = installServiceWorker(manager)
    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('background')).toHaveTextContent('true')
    })

    vi.mocked(readDownload).mockResolvedValue(
      makeDownloadRecord({ bookId: 'b_1', status: 'done', bytesDone: 4_000_000 }),
    )
    worker.dispatchEvent(
      new MessageEvent('message', { data: { type: 'HB_DOWNLOAD_CHANGED', bookId: 'b_1' } }),
    )

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('done')
    })
    expect(screen.getByTestId('bytes')).toHaveTextContent('4000000')
  })

  it('bricht die Übergabe ab, wenn jemand abbricht', async () => {
    const abort = vi.fn(() => Promise.resolve(true))
    const registration = Object.assign(fakeRegistration(), { abort })
    const manager: BackgroundFetchManager = {
      fetch: vi.fn(() => Promise.resolve(registration)),
      get: vi.fn(() => Promise.resolve(registration)),
      getIds: vi.fn(() => Promise.resolve([])),
    }
    installServiceWorker(manager)
    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('background')).toHaveTextContent('true')
    })
    await userEvent.click(screen.getByRole('button', { name: 'laden' }))
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('running')
    })

    await userEvent.click(screen.getByRole('button', { name: 'abbrechen' }))

    await waitFor(() => {
      expect(abort).toHaveBeenCalled()
    })
  })

  it('übergibt nichts mehr, wenn währenddessen abgebrochen wurde', async () => {
    // Zwischen „laden" und der Übergabe wird im Cache nachgesehen, und das
    // dauert. Wer in dieser Zeit abbricht, hat sonst einen Download am Hals,
    // den niemand mehr angefordert hat – und der in Androids Warteschlange
    // sitzt, wo ihn die App nicht mehr sieht.
    const manager: BackgroundFetchManager = {
      fetch: vi.fn(() => Promise.resolve(fakeRegistration())),
      get: vi.fn(() => Promise.resolve(undefined)),
      getIds: vi.fn(() => Promise.resolve([])),
    }
    installServiceWorker(manager)

    // Das Nachsehen im Cache künstlich anhalten – ein Tor für alle Abfragen,
    // nicht nur für die erste: Sonst bliebe die zweite Datei hängen und der
    // Test käme nie an die Stelle, um die es geht.
    let oeffnen = () => undefined as void
    const tor = new Promise<void>((resolve) => {
      oeffnen = resolve
    })
    vi.stubGlobal('caches', {
      open: () =>
        Promise.resolve({
          match: async () => {
            await tor
            return undefined
          },
          put: () => Promise.resolve(),
          delete: () => Promise.resolve(true),
        }),
    })

    renderProvider()
    await waitFor(() => {
      expect(screen.getByTestId('background')).toHaveTextContent('true')
    })

    await userEvent.click(screen.getByRole('button', { name: 'laden' }))
    await userEvent.click(screen.getByRole('button', { name: 'abbrechen' }))
    oeffnen()

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('idle')
    })
    expect(manager.fetch).not.toHaveBeenCalled()
  })

  it('meldet ohne Schnittstelle, dass nichts übergeben wird', async () => {
    installServiceWorker(null)
    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('background')).toHaveTextContent('false')
    })
  })
})
