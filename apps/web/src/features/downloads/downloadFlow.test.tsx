import { StrictMode } from 'react'
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
import { useDownloads } from './downloadsContext'

vi.mock('@/lib/db', () => ({
  readAllDownloads: vi.fn(),
  writeDownload: vi.fn(),
  deleteDownload: vi.fn(),
}))

const { readAllDownloads, writeDownload, deleteDownload } = await import('@/lib/db')

/**
 * Ein Cache Storage aus einer Map.
 *
 * Gespeichert werden die Bytes, nicht die `Response` – und jedes `match`
 * liefert eine frische. Genau so verhält sich der echte Cache, und genau
 * darauf kommt es hier an: Ein Antwortkörper lässt sich nur einmal lesen.
 * Eine Attrappe, die dieselbe Antwort zweimal herausgibt, wäre grün, wo die
 * App fehlschlüge.
 */
function fakeCaches() {
  const store = new Map<string, ArrayBuffer>()
  const cache = {
    match: (key: string) => {
      const body = store.get(key)
      return Promise.resolve(body === undefined ? undefined : new Response(body))
    },
    put: async (key: string, response: Response) => {
      store.set(key, await response.arrayBuffer())
    },
    delete: (key: string) => Promise.resolve(store.delete(key)),
  }
  return { store, caches: { open: () => Promise.resolve(cache) } }
}

/** Die Adresse aus einem `fetch`-Aufruf, egal in welcher Form sie kam. */
function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

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
  coverUrl: (path) => `https://nas.example${path}&t=t`,
  audioUrl: (bookId, fileIdx) => `https://nas.example/audio/${bookId}/${String(fileIdx)}?t=t`,
  canonicalAudioUrl: (bookId, fileIdx) =>
    `https://nas.example/audio/${bookId}/${String(fileIdx)}`,
  canonicalCoverUrl: (path) => `https://nas.example${path}`,
  forgetTicket: () => undefined,
}

function Show({ book = BUCH }: { book?: typeof BUCH }) {
  const { records, allowed, supported, start, cancel, remove, offlineUrl, offlineCoverUrl } =
    useDownloads()
  const record = records.get(book.id)
  return (
    <div>
      <span data-testid="status">{record?.status ?? 'kein Eintrag'}</span>
      <span data-testid="bytes">{record?.bytesDone ?? 0}</span>
      <span data-testid="allowed">{String(allowed)}</span>
      <span data-testid="supported">{String(supported)}</span>
      <span data-testid="offline0">{offlineUrl(book.id, 0) ?? '–'}</span>
      <span data-testid="cover">{offlineCoverUrl(book.id) ?? '–'}</span>
      <button type="button" onClick={() => { start(book) }}>laden</button>
      <button type="button" onClick={() => { cancel(book.id) }}>abbrechen</button>
      <button type="button" onClick={() => { remove(book) }}>löschen</button>
    </div>
  )
}

function renderProvider({
  allowDownload = true,
  books = [BUCH],
  strict = false,
}: { allowDownload?: boolean; books?: (typeof BUCH)[]; strict?: boolean } = {}) {
  const tree = (
    <ProfilesContext value={makeProfilesValue({ selected: makeProfile({ allowDownload }) })}>
      <LibraryContext value={makeLibraryValue({ books, client })}>
        <DownloadProvider>
          <Show />
        </DownloadProvider>
      </LibraryContext>
    </ProfilesContext>
  )
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
}

let store: Map<string, ArrayBuffer>
let revoke: ReturnType<typeof vi.fn<(url: string) => void>>

describe('Hörbücher auf das Gerät laden', () => {
  beforeEach(() => {
    const fake = fakeCaches()
    store = fake.store
    vi.stubGlobal('caches', fake.caches)
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('audio'))),
    )
    URL.createObjectURL = vi.fn((blob: Blob) => `blob:${String(blob.size)}`)
    revoke = vi.fn<(url: string) => void>()
    URL.revokeObjectURL = revoke

    vi.mocked(readAllDownloads).mockResolvedValue([])
    vi.mocked(writeDownload).mockResolvedValue(undefined)
    vi.mocked(deleteDownload).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('legt die Dateien unter der Adresse **ohne** Ticket ab', async () => {
    // Der entscheidende Kniff: Das Ticket wechselt alle paar Stunden. Wäre es
    // Teil des Schlüssels, wäre jeder Download am nächsten Tag wertlos.
    renderProvider()
    await waitFor(() => {
      expect(screen.getByTestId('supported')).toHaveTextContent('true')
    })

    await userEvent.click(screen.getByRole('button', { name: 'laden' }))
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('done')
    })

    expect([...store.keys()]).toEqual([
      'https://nas.example/audio/b_1/0',
      'https://nas.example/audio/b_1/1',
      'https://nas.example/cover/b_1.jpg?v=9',
    ])
    // Geladen wird dagegen sehr wohl mit Ticket.
    const ersteAdresse = vi.mocked(fetch).mock.calls[0]?.[0]
    expect(ersteAdresse === undefined ? '' : urlOf(ersteAdresse)).toContain('?t=t')
  })

  it('macht die geladenen Dateien sofort abspielbar', async () => {
    renderProvider()
    await waitFor(() => {
      expect(screen.getByTestId('supported')).toHaveTextContent('true')
    })

    await userEvent.click(screen.getByRole('button', { name: 'laden' }))
    await waitFor(() => {
      expect(screen.getByTestId('offline0')).toHaveTextContent('blob:')
    })
    expect(screen.getByTestId('cover')).toHaveTextContent('blob:')
  })

  it('merkt sich den Stand über einen Neustart hinweg', async () => {
    vi.mocked(readAllDownloads).mockResolvedValue([
      makeDownloadRecord({ bookId: 'b_1', filesTotal: 2, filesHash: 'abc' }),
    ])
    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('done')
    })
  })

  it('lässt einen abgestürzten Download nicht für immer auf „lädt" stehen', async () => {
    // App weggewischt, Gerät aus: Der Eintrag steht noch auf „running", aber
    // es läuft nichts mehr. Ohne diesen Schritt gäbe es keinen Weg zurück.
    vi.mocked(readAllDownloads).mockResolvedValue([
      makeDownloadRecord({ bookId: 'b_1', status: 'running', filesDone: 1 }),
    ])
    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('idle')
    })
  })

  it('setzt einen abgebrochenen Download nicht neu auf', async () => {
    renderProvider()
    await waitFor(() => {
      expect(screen.getByTestId('supported')).toHaveTextContent('true')
    })

    // Erst laden, dann die Hälfte löschen und erneut laden.
    await userEvent.click(screen.getByRole('button', { name: 'laden' }))
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('done')
    })

    store.delete('https://nas.example/audio/b_1/1')
    vi.mocked(fetch).mockClear()

    await userEvent.click(screen.getByRole('button', { name: 'laden' }))
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('done')
    })

    // Nur die fehlende Datei wird erneut geholt.
    expect(vi.mocked(fetch).mock.calls.map(([input]) => urlOf(input))).toEqual([
      'https://nas.example/audio/b_1/1?t=t',
    ])
  })

  it('räumt beim Löschen Cache und Eintrag ab', async () => {
    renderProvider()
    await waitFor(() => {
      expect(screen.getByTestId('supported')).toHaveTextContent('true')
    })
    await userEvent.click(screen.getByRole('button', { name: 'laden' }))
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('done')
    })

    await userEvent.click(screen.getByRole('button', { name: 'löschen' }))

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('kein Eintrag')
    })
    expect(store.size).toBe(0)
    expect(screen.getByTestId('offline0')).toHaveTextContent('–')
    expect(deleteDownload).toHaveBeenCalledWith('b_1')
    expect(revoke).toHaveBeenCalled()
  })

  it('findet die Dateien nach einem Neustart wieder', async () => {
    // Der Fall, der beim Ausprobieren im Browser aufgefallen ist: Nach einem
    // Neustart stand das Buch als „auf dem Gerät" da, gespielt wurde aber vom
    // NAS – und ohne Netz gar nicht.
    store.set('https://nas.example/audio/b_1/0', new TextEncoder().encode('a').buffer)
    store.set('https://nas.example/audio/b_1/1', new TextEncoder().encode('b').buffer)
    vi.mocked(readAllDownloads).mockResolvedValue([
      makeDownloadRecord({ bookId: 'b_1', filesTotal: 2, filesHash: 'abc' }),
    ])

    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('offline0')).toHaveTextContent('blob:')
    })
  })

  it('findet sie auch, wenn React die Effekte doppelt ausführt', async () => {
    // Die App läuft unter StrictMode; jeder Effekt läuft dort einmal mehr.
    // (Den Fehler weiter unten fängt dieser Test nicht – dafür brauchte es
    // den echten Browser. Er hält nur fest, dass der doppelte Lauf an sich
    // nichts kaputt macht.)
    store.set('https://nas.example/audio/b_1/0', new TextEncoder().encode('a').buffer)
    store.set('https://nas.example/audio/b_1/1', new TextEncoder().encode('b').buffer)
    vi.mocked(readAllDownloads).mockResolvedValue([
      makeDownloadRecord({ bookId: 'b_1', filesTotal: 2, filesHash: 'abc' }),
    ])

    renderProvider({ strict: true })

    await waitFor(() => {
      expect(screen.getByTestId('offline0')).toHaveTextContent('blob:')
    })
  })

  it('gibt einem Buch eine zweite Chance, dessen Dateien noch fehlten', async () => {
    // Hier steckt der Fehler, der im Browser aufgefallen ist: Ein Buch galt
    // schon als vorbereitet, bevor überhaupt etwas gefunden war – und wurde
    // danach nie wieder angesehen. Ein leerer Cache beim ersten Blick darf
    // nicht heissen: nie wieder nachsehen.
    vi.mocked(readAllDownloads).mockResolvedValue([
      makeDownloadRecord({ bookId: 'b_1', filesTotal: 2, filesHash: 'abc' }),
    ])
    const { rerender } = renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('done')
    })
    expect(screen.getByTestId('offline0')).toHaveTextContent('–')

    store.set('https://nas.example/audio/b_1/0', new TextEncoder().encode('a').buffer)
    rerender(
      <ProfilesContext value={makeProfilesValue({ selected: makeProfile({ allowDownload: true }) })}>
        <LibraryContext value={makeLibraryValue({ books: [BUCH, makeBook({ id: 'b_2' })], client })}>
          <DownloadProvider>
            <Show />
          </DownloadProvider>
        </LibraryContext>
      </ProfilesContext>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('offline0')).toHaveTextContent('blob:')
    })
  })

  it('lässt ein abgebrochenes Buch nicht auf „wartet" stehen', async () => {
    let freigeben = () => undefined as void
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise((resolve) => {
          freigeben = () => {
            resolve(new Response('audio'))
          }
        }),
    )

    renderProvider()
    await waitFor(() => {
      expect(screen.getByTestId('supported')).toHaveTextContent('true')
    })

    await userEvent.click(screen.getByRole('button', { name: 'laden' }))
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('running')
    })

    await userEvent.click(screen.getByRole('button', { name: 'abbrechen' }))
    freigeben()

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('idle')
    })
  })

  it('folgt der Elternfreigabe', async () => {
    renderProvider({ allowDownload: false })

    await waitFor(() => {
      expect(screen.getByTestId('allowed')).toHaveTextContent('false')
    })
  })

  it('schreibt jeden Schritt mit, damit ein Abbruch nichts kostet', async () => {
    renderProvider()
    await waitFor(() => {
      expect(screen.getByTestId('supported')).toHaveTextContent('true')
    })
    await userEvent.click(screen.getByRole('button', { name: 'laden' }))
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('done')
    })

    const geschrieben = vi.mocked(writeDownload).mock.calls.map(([record]) => record.status)
    expect(geschrieben[0]).toBe('queued')
    expect(geschrieben).toContain('running')
    expect(geschrieben.at(-1)).toBe('done')
  })
})
