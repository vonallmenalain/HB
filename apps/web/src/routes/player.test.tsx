import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '@/app/AppRoutes'
import {
  makeBook,
  makeLibraryValue,
  makePlayerValue,
  makeProfile,
  makeProfilesValue,
  makeProgressEntry,
  makeProgressValue,
  renderWithProfiles,
} from '@/test/renderWithProfiles'

const EMMA = makeProfile()
const profiles = () => makeProfilesValue({ profiles: [EMMA], selected: EMMA })

const BOOK = makeBook({
  id: 'b_1',
  title: 'Der Super-Papagei',
  durationSec: 1800,
  chapters: [
    { idx: 0, title: 'Der Anruf', fileIdx: 0, startSec: 0, endSec: 600 },
    { idx: 1, title: 'Die Spur', fileIdx: 1, startSec: 600, endSec: 1800 },
  ],
})

describe('Player', () => {
  it('zeigt Buch, Kapitel und Restzeit', () => {
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/player/b_1',
      library: makeLibraryValue({ books: [BOOK] }),
      player: makePlayerValue({
        book: BOOK,
        positionSec: 700,
        durationSec: 1800,
        playing: true,
        chapter: BOOK.chapters[1]!,
      }),
    })

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Der Super-Papagei')
    expect(screen.getByText('Die Spur')).toBeInTheDocument()
    expect(screen.getByText('11:40')).toBeInTheDocument()
    expect(screen.getByText('-18:20')).toBeInTheDocument()
  })

  it('bietet Pause an, während etwas läuft', async () => {
    const toggle = vi.fn()
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/player/b_1',
      library: makeLibraryValue({ books: [BOOK] }),
      player: makePlayerValue({ book: BOOK, playing: true, toggle, chapter: BOOK.chapters[0]! }),
    })

    await userEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(toggle).toHaveBeenCalled()
  })

  it('springt vor und zurück', async () => {
    const skip = vi.fn()
    const nextChapter = vi.fn()
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/player/b_1',
      library: makeLibraryValue({ books: [BOOK] }),
      player: makePlayerValue({ book: BOOK, skip, nextChapter, chapter: BOOK.chapters[0]! }),
    })

    await userEvent.click(screen.getByRole('button', { name: '30 Sekunden zurück' }))
    expect(skip).toHaveBeenCalledWith(-30)

    await userEvent.click(screen.getByRole('button', { name: '30 Sekunden vor' }))
    expect(skip).toHaveBeenCalledWith(30)

    await userEvent.click(screen.getByRole('button', { name: 'Nächstes Kapitel' }))
    expect(nextChapter).toHaveBeenCalled()
  })

  it('zeigt die Stelle im Buch als Balken zum Spulen', () => {
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/player/b_1',
      library: makeLibraryValue({ books: [BOOK] }),
      player: makePlayerValue({ book: BOOK, positionSec: 900, durationSec: 1800 }),
    })

    const balken = screen.getByRole('slider', { name: 'Stelle im Hörbuch' })
    expect(balken).toHaveValue('900')
    // Die Zeitangabe gehört dazu: „900" sagt einem Vorleseprogramm nichts.
    expect(balken).toHaveAttribute('aria-valuetext', '15:00 von 30:00')
  })

  it('springt beim Loslassen an die gezogene Stelle', () => {
    const seekTo = vi.fn()
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/player/b_1',
      library: makeLibraryValue({ books: [BOOK] }),
      player: makePlayerValue({ book: BOOK, positionSec: 900, durationSec: 1800, seekTo }),
    })

    const balken = screen.getByRole('slider', { name: 'Stelle im Hörbuch' })
    fireEvent.change(balken, { target: { value: '1200' } })
    // Während des Ziehens passiert nichts – sonst ruckelte der Ton bei jedem
    // Zwischenwert.
    expect(seekTo).not.toHaveBeenCalled()

    fireEvent.pointerUp(balken)
    expect(seekTo).toHaveBeenCalledWith(1200)
  })
})

describe('Weiterhören-Kachel', () => {
  it('erscheint auf dem Startbildschirm und startet das Buch', async () => {
    const playBook = vi.fn()
    const entry = makeProgressEntry({ bookId: 'b_1', positionSec: 900, durationSec: 1800 })

    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/',
      library: makeLibraryValue({ books: [BOOK] }),
      progress: makeProgressValue({ entries: new Map([['b_1', entry]]) }),
      player: makePlayerValue({ playBook }),
    })

    const tile = screen.getByRole('button', { name: /Weiterhören/ })
    expect(tile).toBeInTheDocument()

    await userEvent.click(tile)
    expect(playBook).toHaveBeenCalledWith(BOOK)
  })

  it('bleibt weg, solange nichts angefangen wurde', () => {
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/',
      library: makeLibraryValue({ books: [BOOK] }),
      progress: makeProgressValue({ entries: new Map() }),
    })

    expect(screen.queryByText('Weiterhören')).not.toBeInTheDocument()
  })

  it('bleibt weg, wenn das Buch fertig gehört ist', () => {
    const entry = makeProgressEntry({ bookId: 'b_1', positionSec: 1790, durationSec: 1800, finished: true })

    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/',
      library: makeLibraryValue({ books: [BOOK] }),
      progress: makeProgressValue({ entries: new Map([['b_1', entry]]) }),
    })

    expect(screen.queryByText('Weiterhören')).not.toBeInTheDocument()
  })
})

describe('Buchseite mit Fortschritt', () => {
  it('bietet Weiterhören statt Abspielen an, sobald angefangen wurde', () => {
    const entry = makeProgressEntry({ bookId: 'b_1', positionSec: 900, durationSec: 1800 })

    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/buch/b_1',
      library: makeLibraryValue({ books: [BOOK] }),
      progress: makeProgressValue({ entries: new Map([['b_1', entry]]) }),
    })

    expect(screen.getByRole('button', { name: 'Weiterhören' })).toBeInTheDocument()
  })

  it('startet ein Kapitel direkt', async () => {
    const playFrom = vi.fn()

    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/buch/b_1',
      library: makeLibraryValue({ books: [BOOK] }),
      player: makePlayerValue({ playFrom }),
    })

    await userEvent.click(screen.getByRole('button', { name: /Die Spur/ }))
    expect(playFrom).toHaveBeenCalledWith(BOOK, 600)
  })
})
