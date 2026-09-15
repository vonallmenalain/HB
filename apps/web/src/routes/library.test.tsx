import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  makeBook,
  makeLibraryValue,
  makeProfile,
  makeProfilesValue,
  renderWithProfiles,
} from '@/test/renderWithProfiles'
import { AppRoutes } from '@/app/AppRoutes'

const EMMA = makeProfile()
const profiles = () => makeProfilesValue({ profiles: [EMMA], selected: EMMA })

const BOOKS = [
  makeBook({ id: 'b_1', title: 'Der Super-Papagei', seriesIndex: 1 }),
  makeBook({
    id: 'b_2',
    title: 'Der Phantomsee',
    seriesIndex: 2,
    addedAt: '2026-02-01T00:00:00.000Z',
  }),
]

describe('Bibliothek', () => {
  it('zeigt jedes Buch als anklickbare Kachel', () => {
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/bibliothek',
      library: makeLibraryValue({ books: BOOKS }),
    })

    expect(screen.getByRole('link', { name: /Der Super-Papagei/ })).toHaveAttribute(
      'href',
      '/buch/b_1',
    )
    expect(screen.getByRole('link', { name: /Der Phantomsee/ })).toHaveAttribute(
      'href',
      '/buch/b_2',
    )
  })

  it('zeigt einen leeren Zustand statt eines Fehlers, wenn nichts da ist', () => {
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/bibliothek',
      library: makeLibraryValue({ books: [] }),
    })

    expect(screen.getByText('Die Bibliothek ist leer')).toBeInTheDocument()
  })

  it('zeigt bei fehlender Verbindung den zuletzt bekannten Stand statt nichts', () => {
    // Genau der Fall unterwegs: NAS aus, heruntergeladene Bücher sollen
    // trotzdem auffindbar bleiben.
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/bibliothek',
      library: makeLibraryValue({ books: BOOKS, fromCache: true, error: 'offline' }),
    })

    expect(screen.getByRole('link', { name: /Der Super-Papagei/ })).toBeInTheDocument()
    expect(screen.getByText(/NAS ist gerade nicht erreichbar/)).toBeInTheDocument()
  })

  it('lässt einen erneuten Versuch zu', async () => {
    const refresh = vi.fn()
    const { default: userEvent } = await import('@testing-library/user-event')

    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/bibliothek',
      library: makeLibraryValue({ books: BOOKS, fromCache: true, error: 'offline', refresh }),
    })

    await userEvent.click(screen.getByRole('button', { name: 'Nochmal versuchen' }))
    expect(refresh).toHaveBeenCalled()
  })
})

describe('Buchseite', () => {
  it('zeigt Titel, Reihe und Kapitel', () => {
    const book = makeBook({
      id: 'b_1',
      title: 'Der Super-Papagei',
      chapters: [
        { idx: 0, title: 'Der Anruf', fileIdx: 0, startSec: 0, endSec: 180 },
        { idx: 1, title: 'Die Spur', fileIdx: 1, startSec: 180, endSec: 300 },
      ],
      durationSec: 300,
    })

    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/buch/b_1',
      library: makeLibraryValue({ books: [book] }),
    })

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Der Super-Papagei')
    expect(screen.getByText('Die drei ??? · Folge 1')).toBeInTheDocument()
    expect(screen.getByText('2 Kapitel · 5:00')).toBeInTheDocument()
    expect(screen.getByText('Der Anruf')).toBeInTheDocument()
    expect(screen.getByText('3:00')).toBeInTheDocument()
    expect(screen.getByText('2:00')).toBeInTheDocument()
  })

  it('zeigt einen Weg zurück, wenn es das Buch nicht mehr gibt', () => {
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/buch/gibtesnicht',
      library: makeLibraryValue({ books: BOOKS }),
    })

    expect(screen.getByText('Dieses Buch gibt es nicht mehr')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Zur Bibliothek' })).toHaveAttribute(
      'href',
      '/bibliothek',
    )
  })

  it('verlangt ein gewähltes Profil', () => {
    renderWithProfiles(<AppRoutes />, makeProfilesValue({ profiles: [EMMA] }), {
      route: '/buch/b_1',
      library: makeLibraryValue({ books: BOOKS }),
    })

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Wer hört zu?')
  })
})

describe('Startbildschirm', () => {
  it('zeigt die zuletzt dazugekommenen Bücher zuerst', () => {
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/',
      library: makeLibraryValue({ books: BOOKS }),
    })

    const links = screen.getAllByRole('link', { name: /Papagei|Phantomsee/ })
    // b_2 ist neuer und steht deshalb vorn.
    expect(links[0]).toHaveAttribute('href', '/buch/b_2')
  })
})
