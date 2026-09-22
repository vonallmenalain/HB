import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DownloadsContext } from '@/features/downloads/downloadsContext'
import { HistoryContext } from '@/features/history/historyContext'
import { type Book } from '@/features/library/catalog'
import { LibraryContext } from '@/features/library/libraryContext'
import { type MediaClient } from '@/features/library/mediaClient'
import { ProgressContext } from '@/features/progress/progressContext'
import {
  makeBook,
  makeDownloadsValue,
  makeLibraryValue,
  makeProgressValue,
} from '@/test/renderWithProfiles'

import { type PlayerSnapshot } from './audioEngine'
import { setAccessRenewal } from './engine'
import { PlayerProvider, TICKET_CHECK_MS } from './PlayerProvider'

/**
 * Das Ticket in den Audio-Adressen läuft nach acht Stunden ab; eine
 * installierte App bleibt tagelang offen. Geholt wurde es früher nur beim
 * Start – danach verstummte das Hörbuch, bis jemand die App neu startete.
 */
const BOOK: Book = makeBook({ id: 'b_1', durationSec: 3600 })

let snapshot: PlayerSnapshot
const listeners = new Set<() => void>()

vi.mock('./engine', () => ({
  setAudioUrlResolver: vi.fn(),
  setAccessRenewal: vi.fn(),
  getEngine: () => ({
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    snapshot: () => snapshot,
    open: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    toggle: vi.fn(),
    seekTo: vi.fn(),
    skip: vi.fn(),
    nextChapter: vi.fn(),
    previousChapter: vi.fn(),
    setSleep: vi.fn(),
    stop: vi.fn(),
  }),
}))

function makeClient() {
  const ensureTicket = vi.fn<MediaClient['ensureTicket']>().mockResolvedValue('t')
  const renewTicket = vi.fn<MediaClient['renewTicket']>().mockResolvedValue('t')
  return { ensureTicket, renewTicket, client: { ensureTicket, renewTicket } as unknown as MediaClient }
}

function zeigen(client: MediaClient) {
  return render(
    <LibraryContext value={makeLibraryValue({ books: [BOOK], client })}>
      <ProgressContext value={makeProgressValue()}>
        <DownloadsContext value={makeDownloadsValue()}>
          <HistoryContext value={{ started: vi.fn(), listened: vi.fn(), forget: vi.fn() }}>
            <PlayerProvider>{null}</PlayerProvider>
          </HistoryContext>
        </DownloadsContext>
      </ProgressContext>
    </LibraryContext>,
  )
}

function sichtbar(zustand: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: zustand })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(setAccessRenewal).mockClear()
  listeners.clear()
  snapshot = {
    book: BOOK,
    positionSec: 0,
    durationSec: BOOK.durationSec,
    playing: false,
    loading: false,
    finished: false,
    error: false,
    sleepMode: null,
    sleepRemainingSec: 0,
  }
})

afterEach(() => {
  vi.useRealTimers()
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
})

describe('Ticket frisch halten', () => {
  it('sieht nach, wenn die App wieder in den Vordergrund kommt', () => {
    // Der häufigste Fall: Über Nacht lag die App im Hintergrund, am Morgen
    // tippt das Kind auf „Weiterhören".
    const { ensureTicket, client } = makeClient()
    zeigen(client)
    ensureTicket.mockClear()

    sichtbar('hidden')
    expect(ensureTicket).not.toHaveBeenCalled()

    sichtbar('visible')
    expect(ensureTicket).toHaveBeenCalledTimes(1)
  })

  it('sieht in festen Abständen nach, solange ein Buch offen ist', () => {
    const { ensureTicket, client } = makeClient()
    zeigen(client)
    ensureTicket.mockClear()

    act(() => {
      vi.advanceTimersByTime(TICKET_CHECK_MS * 3)
    })

    expect(ensureTicket).toHaveBeenCalledTimes(3)
  })

  it('lässt das NAS in Ruhe, solange kein Buch offen ist', () => {
    snapshot = { ...snapshot, book: null }
    const { ensureTicket, client } = makeClient()
    zeigen(client)

    act(() => {
      vi.advanceTimersByTime(TICKET_CHECK_MS * 3)
    })
    sichtbar('visible')

    expect(ensureTicket).not.toHaveBeenCalled()
  })

  it('übersteht es, wenn gerade kein Ticket zu bekommen ist', () => {
    const { ensureTicket, client } = makeClient()
    ensureTicket.mockRejectedValue(new Error('offline'))

    expect(() => {
      zeigen(client)
      sichtbar('visible')
    }).not.toThrow()
  })
})

describe('Ticket für die Engine', () => {
  it('holt nach einem Abbruch erst ein gewöhnliches, dann ein erzwungenes', async () => {
    const { ensureTicket, renewTicket, client } = makeClient()
    zeigen(client)
    const erneuern = vi.mocked(setAccessRenewal).mock.calls.at(-1)?.[0]
    ensureTicket.mockClear()

    await erneuern?.(false)
    expect(ensureTicket).toHaveBeenCalledTimes(1)
    expect(renewTicket).not.toHaveBeenCalled()

    await erneuern?.(true)
    expect(renewTicket).toHaveBeenCalledTimes(1)
  })
})
