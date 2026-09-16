import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  makeBook,
  makeDownloadRecord,
  makeDownloadsValue,
  makeLibraryValue,
  makeProfile,
  makeProfilesValue,
  renderWithProfiles,
} from '@/test/renderWithProfiles'
import { AppRoutes } from '@/app/AppRoutes'
import { seriesSlug } from '@/features/library/grouping'

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
  it('zeigt zuerst die Reihen, nicht alle Folgen', () => {
    // Neun Reihen mit hunderten Folgen als eine Liste sind unbrauchbar. Der
    // erste Bildschirm zeigt deshalb die Reihen.
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/bibliothek',
      library: makeLibraryValue({ books: BOOKS }),
    })

    expect(screen.getByRole('link', { name: /Die drei \?\?\?/ })).toHaveAttribute(
      'href',
      `/bibliothek/${seriesSlug('Die drei ???')}`,
    )
    expect(screen.queryByRole('link', { name: /Phantomsee/ })).not.toBeInTheDocument()
  })

  it('zeigt in der Reihe jede Folge mit Nummer', () => {
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: `/bibliothek/${seriesSlug('Die drei ???')}`,
      library: makeLibraryValue({ books: BOOKS }),
    })

    expect(screen.getByRole('link', { name: /01 - Der Super-Papagei/ })).toHaveAttribute(
      'href',
      '/buch/b_1',
    )
    expect(screen.getByRole('link', { name: /02 - Der Phantomsee/ })).toHaveAttribute(
      'href',
      '/buch/b_2',
    )
  })

  it('stellt Unterordner einer Reihe als eigene Abschnitte dar', () => {
    const books = [
      ...BOOKS,
      makeBook({ id: 'b_3', title: 'Alarm', group: 'Mini-Fälle', seriesIndex: 5 }),
    ]

    renderWithProfiles(<AppRoutes />, profiles(), {
      route: `/bibliothek/${seriesSlug('Die drei ???')}`,
      library: makeLibraryValue({ books }),
    })

    expect(screen.getByRole('heading', { name: 'Mini-Fälle' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /05 - Alarm/ })).toBeInTheDocument()
  })

  it('zeigt an, welche Bücher auf dem Gerät liegen', () => {
    // Im Flugzeug ist das die einzige Auskunft, die zählt – und sie muss ohne
    // Lesen zu erkennen sein.
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: `/bibliothek/${seriesSlug('Die drei ???')}`,
      library: makeLibraryValue({ books: BOOKS }),
      downloads: makeDownloadsValue({
        records: new Map([['b_1', makeDownloadRecord({ bookId: 'b_1' })]]),
      }),
    })

    expect(screen.getByRole('link', { name: /Der Super-Papagei/ })).toHaveTextContent(
      'Auf dem Gerät',
    )
    expect(screen.getByRole('link', { name: /Der Phantomsee/ })).not.toHaveTextContent(
      'Auf dem Gerät',
    )
  })

  it('nimmt das Cover vom Gerät, sobald es dort liegt', () => {
    const { container } = renderWithProfiles(<AppRoutes />, profiles(), {
      route: `/bibliothek/${seriesSlug('Die drei ???')}`,
      library: makeLibraryValue({ books: [makeBook({ id: 'b_1', cover: '/cover/b_1.jpg' })] }),
      downloads: makeDownloadsValue({ offlineCoverUrl: () => 'blob:abc' }),
    })

    // Das Cover trägt bewusst kein `alt` – der Titel steht direkt darunter.
    expect(container.querySelector('img')).toHaveAttribute('src', 'blob:abc')
  })

  it('zeigt bei einem zu alten Dienst schlicht alle Hörbücher', () => {
    // Schema 1 kennt keine Reihen. Ohne diesen Rückfall bestünde die Übersicht
    // aus hunderten „Reihen" mit je einem Eintrag.
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/bibliothek',
      library: makeLibraryValue({ books: BOOKS, schemaVersion: 1 }),
    })

    expect(screen.getByRole('link', { name: /Der Super-Papagei/ })).toHaveAttribute(
      'href',
      '/buch/b_1',
    )
    expect(screen.getByText(/kennt die Reihen noch nicht/)).toBeInTheDocument()
  })

  it('führt von der Reihenübersicht zurück auf die Startseite', () => {
    // Die App startet dort, wo man aufgehört hat. Ohne diesen Weg käme man nie
    // wieder zu Weiterhören, Favoriten und Elternbereich.
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/bibliothek',
      library: makeLibraryValue({ books: BOOKS }),
    })

    expect(screen.getByRole('link', { name: /Startseite/ })).toHaveAttribute('href', '/')
  })

  it('führt bei einer Reihe mit einem einzigen Buch direkt zum Buch', () => {
    // Eine Reihe mit einem Eintrag ist keine Reihe – der Zwischenschritt wäre
    // nur ein Tap für eine Liste mit einer Kachel.
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/bibliothek',
      library: makeLibraryValue({
        books: [makeBook({ id: 'b_9', title: 'Einzelstück', series: 'Einzelstück' })],
      }),
    })

    expect(screen.getByRole('link', { name: /Einzelstück/ })).toHaveAttribute(
      'href',
      '/buch/b_9',
    )
  })

  it('zeigt einen leeren Zustand statt eines Fehlers, wenn nichts da ist', () => {
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/bibliothek',
      library: makeLibraryValue({ books: [] }),
    })

    expect(screen.getByText('Die Bibliothek ist leer')).toBeInTheDocument()
  })

  it('führt aus einer verschwundenen Reihe zurück', () => {
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/bibliothek/gibtesnicht',
      library: makeLibraryValue({ books: BOOKS }),
    })

    expect(screen.getByText('Diese Reihe gibt es nicht mehr')).toBeInTheDocument()
  })

  it('zeigt bei fehlender Verbindung den zuletzt bekannten Stand statt nichts', () => {
    // Genau der Fall unterwegs: NAS aus, heruntergeladene Bücher sollen
    // trotzdem auffindbar bleiben.
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/bibliothek',
      library: makeLibraryValue({ books: BOOKS, fromCache: true, error: 'offline' }),
    })

    expect(screen.getByRole('link', { name: /Die drei \?\?\?/ })).toBeInTheDocument()
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
  it('führt von der Buchseite zurück in seine Reihe', () => {
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/buch/b_1',
      library: makeLibraryValue({ books: BOOKS }),
    })

    expect(screen.getByRole('link', { name: /Zurück/ })).toHaveAttribute(
      'href',
      `/bibliothek/${seriesSlug('Die drei ???')}`,
    )
  })

  it('führt bei einer Reihe mit einem einzigen Buch zurück in die Übersicht', () => {
    // Die Übersicht führt direkt hierher; zurück müsste man sonst durch eine
    // Liste mit genau einer Kachel.
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/buch/b_9',
      library: makeLibraryValue({
        books: [makeBook({ id: 'b_9', title: 'Einzelstück', series: 'Einzelstück' })],
      }),
    })

    expect(screen.getByRole('link', { name: /Zurück/ })).toHaveAttribute('href', '/bibliothek')
  })

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
  it('zeigt die ganze Sammlung als Reihen', () => {
    // Früher standen hier die sechs neuesten Folgen und darunter ein Knopf in
    // die Bibliothek. Am ersten Tag war das eine fast leere Seite mit einem
    // Knopf – jetzt steht die Sammlung selbst da.
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/',
      library: makeLibraryValue({ books: BOOKS }),
    })

    expect(screen.getByRole('link', { name: /Die drei \?\?\?/ })).toHaveAttribute(
      'href',
      `/bibliothek/${seriesSlug('Die drei ???')}`,
    )
  })

  it('kommt ohne den Knopf in die Bibliothek aus', () => {
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/',
      library: makeLibraryValue({ books: BOOKS }),
    })

    expect(screen.queryByRole('link', { name: 'Alle Hörbücher' })).not.toBeInTheDocument()
  })

  it('zeigt ein einzelnes Hörbuch ohne Reihe direkt', () => {
    // Eine „Reihe" mit einem Eintrag ist keine Reihe – sie kostete sonst einen
    // Tap für eine Liste mit einem einzigen Buch.
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/',
      library: makeLibraryValue({
        books: [makeBook({ id: 'b_9', title: 'Einzelstück', series: null })],
      }),
    })

    expect(screen.getByRole('link', { name: /Einzelstück/ })).toHaveAttribute(
      'href',
      '/buch/b_9',
    )
  })
})
