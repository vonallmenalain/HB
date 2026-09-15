import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DownloadsContext } from '@/features/downloads/downloadsContext'
import { type Book } from '@/features/library/catalog'
import { LibraryContext } from '@/features/library/libraryContext'
import { PlayerProvider } from '@/features/player/PlayerProvider'
import { type PlayerSnapshot } from '@/features/player/audioEngine'
import { ProgressContext } from '@/features/progress/progressContext'
import {
  makeBook,
  makeDownloadsValue,
  makeLibraryValue,
  makeProgressValue,
} from '@/test/renderWithProfiles'

import { HistoryContext, type HistoryContextValue } from './historyContext'

/**
 * Was in der Hörhistorie landet, ist eine Aussage über ein Kind – sie soll
 * stimmen. Ein Takt alle fünf Sekunden heisst nicht fünf Sekunden Ton: Beim
 * Puffern steht die Stelle still, im Hintergrund kann der Browser den Takt
 * strecken. Gezählt wird deshalb die gewanderte Stelle, gedeckelt auf die
 * tatsächlich vergangene Zeit.
 */
const BOOK: Book = makeBook({ id: 'b_1', durationSec: 3600 })

let snapshot: PlayerSnapshot
const listeners = new Set<() => void>()

function setSnapshot(patch: Partial<PlayerSnapshot>): void {
  snapshot = { ...snapshot, ...patch }
  act(() => {
    for (const listener of listeners) listener()
  })
}

vi.mock('@/features/player/engine', () => ({
  setAudioUrlResolver: vi.fn(),
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
    reset: vi.fn(),
  }),
}))

function zeigen(history: HistoryContextValue) {
  return render(
    <LibraryContext value={makeLibraryValue({ books: [BOOK] })}>
      <ProgressContext value={makeProgressValue()}>
        <DownloadsContext value={makeDownloadsValue()}>
          <HistoryContext value={history}>
            <PlayerProvider>{null}</PlayerProvider>
          </HistoryContext>
        </DownloadsContext>
      </ProgressContext>
    </LibraryContext>,
  )
}

function fakeHistory() {
  const gehoert: number[] = []
  return {
    gehoert,
    context: {
      started: vi.fn(),
      listened: (_book: Book, seconds: number) => gehoert.push(seconds),
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  listeners.clear()
  snapshot = {
    book: BOOK,
    positionSec: 0,
    durationSec: BOOK.durationSec,
    playing: true,
    loading: false,
    finished: false,
    error: false,
    sleepMode: null,
    sleepRemainingSec: 0,
  }
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Hörhistorie aufzeichnen', () => {
  it('zählt ein geöffnetes Buch als Hörvorgang', () => {
    const history = fakeHistory()
    zeigen(history.context)

    expect(history.context.started).toHaveBeenCalledWith(BOOK)
  })

  it('zählt die gewanderte Stelle, nicht die Takte', () => {
    const history = fakeHistory()
    zeigen(history.context)

    // Fünf Sekunden Takt, aber nur drei Sekunden Ton: So sieht Puffern aus.
    setSnapshot({ positionSec: 0 })
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    setSnapshot({ positionSec: 3 })
    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(history.gehoert.reduce((sum, wert) => sum + wert, 0)).toBeCloseTo(3, 1)
  })

  it('zählt einen Sprung nach vorn nicht als gehört', () => {
    const history = fakeHistory()
    zeigen(history.context)

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    // Eine Viertelstunde weitergespult – gehört wurde davon nichts.
    setSnapshot({ positionSec: 900 })
    act(() => {
      vi.advanceTimersByTime(5000)
    })

    const summe = history.gehoert.reduce((sum, wert) => sum + wert, 0)
    expect(summe).toBeLessThanOrEqual(5)
  })

  it('zählt nichts, solange nichts läuft', () => {
    const history = fakeHistory()
    snapshot = { ...snapshot, playing: false }
    zeigen(history.context)

    act(() => {
      vi.advanceTimersByTime(30_000)
    })

    expect(history.gehoert).toEqual([])
  })
})
