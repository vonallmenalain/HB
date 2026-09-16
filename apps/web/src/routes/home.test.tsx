import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '@/app/AppRoutes'
import { CONTINUE_LIMIT, blankProgress } from '@/features/progress/progress'
import {
  makeAuthValue,
  makeBook,
  makeLibraryValue,
  makeProfile,
  makeProfilesValue,
  makeProgressEntry,
  makeParentsValue,
  makeProgressValue,
  renderWithProfiles,
} from '@/test/renderWithProfiles'

const EMMA = makeProfile({ name: 'Emma' })
const profiles = (overrides = {}) =>
  makeProfilesValue({ profiles: [EMMA], selected: EMMA, ...overrides })

const KIDS = [5, 6, 7, 8].map((nummer) =>
  makeBook({
    id: `kids_${String(nummer)}`,
    title: `Folge ${String(nummer)}`,
    series: 'Fragezeichen Kids',
    seriesIndex: nummer,
  }),
)

function abschnitt(titel: string): HTMLElement {
  const ueberschrift = screen.getByRole('heading', { name: titel })
  const bereich = ueberschrift.parentElement
  if (!bereich) throw new Error(`Abschnitt „${titel}" hat keinen Inhalt`)
  return bereich
}

describe('Startseite', () => {
  it('schlägt die nächsten Folgen vor, wenn eine läuft', () => {
    // Folge 5 angefangen – dann sind 6, 7 und 8 die Antwort, die ein Kind
    // ohne Erklärung versteht.
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/',
      library: makeLibraryValue({ books: KIDS }),
      progress: makeProgressValue({
        entries: new Map([
          ['kids_5', makeProgressEntry({ bookId: 'kids_5', positionSec: 400 })],
        ]),
      }),
    })

    const vorschlaege = abschnitt('Vielleicht auch etwas für dich')
    expect(vorschlaege.textContent).toContain('06 - Folge 6')
    expect(vorschlaege.textContent).toContain('07 - Folge 7')
    // Die angefangene Folge steht schon als „Weiterhören" oben.
    expect(vorschlaege.textContent).not.toContain('05 - Folge 5')
  })

  it('führt vom Avatar zum eigenen Bild', async () => {
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/',
      library: makeLibraryValue({ books: KIDS }),
    })

    await userEvent.click(screen.getByRole('link', { name: /Emma – Profil und Einstellungen/ }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Dein Profil')
  })

  it('lässt ein Kind sein Tier selbst wechseln', async () => {
    const update = vi.fn().mockResolvedValue(undefined)

    renderWithProfiles(<AppRoutes />, profiles({ update }), { route: '/profil/bearbeiten' })

    await userEvent.click(screen.getByRole('button', { name: 'Bild 🐻' }))
    expect(update).toHaveBeenCalledWith(EMMA.id, { avatar: '🐻' })
  })

  it('führt vom Profil in den Elternbereich', () => {
    // Der versteckte Eingang (zwei Sekunden auf den Titel) findet niemand, der
    // ihn nicht kennt. Hinter der PIN darf er sichtbar sein.
    renderWithProfiles(<AppRoutes />, profiles(), { route: '/profil/bearbeiten' })

    expect(screen.getByRole('link', { name: /Elternbereich/ })).toHaveAttribute(
      'href',
      '/eltern',
    )
  })

  it('zeigt den Adminbereich nur dem Administratorkonto', () => {
    const { unmount } = renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/profil/bearbeiten',
    })
    expect(screen.queryByRole('link', { name: /Adminbereich/ })).not.toBeInTheDocument()
    unmount()

    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/profil/bearbeiten',
      auth: makeAuthValue({ isAdmin: true }),
    })
    expect(screen.getByRole('link', { name: /Adminbereich/ })).toHaveAttribute('href', '/admin')
  })

  it('warnt, solange keine PIN gesetzt ist', () => {
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/profil/bearbeiten',
      parents: makeParentsValue({ hasPin: false }),
    })

    expect(screen.getByText(/Noch keine PIN/)).toBeInTheDocument()
  })

  it('zeigt die ganze Sammlung unten als Reihen', () => {
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/',
      library: makeLibraryValue({ books: KIDS }),
    })

    const alle = abschnitt('Alle Hörbücher')
    expect(alle.textContent).toContain('Fragezeichen Kids')
    expect(alle.textContent).toContain('4 Hörbücher')
  })
})

describe('Hörbücher von der Startseite nehmen', () => {
  const laufend = new Map([
    ['kids_5', makeProgressEntry({ bookId: 'kids_5', updatedAt: '2026-01-02T00:00:00.000Z' })],
    ['kids_6', makeProgressEntry({ bookId: 'kids_6', updatedAt: '2026-01-01T00:00:00.000Z' })],
  ])

  function zeigen(reset = vi.fn()) {
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/',
      library: makeLibraryValue({ books: KIDS }),
      progress: makeProgressValue({ entries: laufend, reset }),
    })
    return reset
  }

  it('fragt beim ersten Tipp nach und nimmt erst beim zweiten weg', async () => {
    // Ein Kind tippt schnell. Ein einziger Fehlgriff würde hier drei Stunden
    // Hörbuch auf Anfang setzen – deshalb zwei Tipps.
    const reset = zeigen()

    await userEvent.click(screen.getByRole('button', { name: '06 - Folge 6 entfernen' }))
    expect(reset).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: '06 - Folge 6 wirklich entfernen' }))
    expect(reset).toHaveBeenCalledWith('kids_6')
  })

  it('lässt auch das Buch aus „Weiterhören" wegnehmen', async () => {
    const reset = zeigen()

    await userEvent.click(screen.getByRole('button', { name: 'Folge 5 entfernen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Folge 5 wirklich entfernen' }))

    expect(reset).toHaveBeenCalledWith('kids_5')
  })

  it('schlägt nach dem Zurücksetzen nichts mehr vor', () => {
    // Zurückgesetzt heisst: Einträge auf 0, aber eben Einträge. Würde die
    // Startseite nur zählen, wie viele es sind, stünden hier weiter Vorschläge
    // – obwohl nichts gehört wurde.
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/',
      library: makeLibraryValue({ books: KIDS }),
      progress: makeProgressValue({
        entries: new Map(KIDS.map((book) => [book.id, blankProgress(book.id)])),
      }),
    })

    expect(
      screen.queryByRole('heading', { name: 'Vielleicht auch etwas für dich' }),
    ).not.toBeInTheDocument()
  })

  it('stellt kein Kreuz an Vorschläge und Gemerktes', () => {
    // Dort wäre es eine Frage ohne Antwort: Vorschläge wechseln von allein,
    // und Gemerktes nimmt der Stern zurück.
    zeigen()

    expect(screen.queryByRole('button', { name: '07 - Folge 7 entfernen' })).not.toBeInTheDocument()
  })
})

describe('Weiterhören', () => {
  // Zwanzig angefangene Hörbücher, das erste zuletzt gehört – mehr als die
  // Startseite zeigt. Buchstaben statt Zahlen als Titel: „Buch 1" steckt auch
  // in „Buch 10", und eine Prüfung darauf hielte stillschweigend.
  const NAMEN = [...'ABCDEFGHIJKLMNOPQRST']
  const ANGEFANGEN = NAMEN.map((name) =>
    makeBook({
      id: `b_${name.toLowerCase()}`,
      title: `Buch ${name}`,
      series: null,
      seriesIndex: null,
    }),
  )
  const fortschritt = new Map(
    ANGEFANGEN.map((book, index) => [
      book.id,
      makeProgressEntry({
        bookId: book.id,
        // Absteigend: „Buch A" ist das jüngste und wird die grosse Kachel.
        updatedAt: `2026-01-${String(NAMEN.length - index).padStart(2, '0')}T00:00:00.000Z`,
      }),
    ]),
  )

  function zeigen(reset = vi.fn()) {
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/',
      library: makeLibraryValue({ books: ANGEFANGEN }),
      progress: makeProgressValue({ entries: fortschritt, reset }),
    })
    return reset
  }

  it('stellt die weiteren angefangenen Hörbücher unter die grosse Kachel', () => {
    // Bisher hiess der Abschnitt „Zuletzt gehört" – zwei Namen für dieselbe
    // Liste, und keiner sagte, was beim Antippen passiert.
    zeigen()

    const weiter = abschnitt('Weiterhören')
    expect(weiter.textContent).toContain('Buch B')
    expect(weiter.textContent).toContain('Buch C')
    // Das jüngste steht gross darüber und nicht noch einmal als Kachel.
    expect(weiter.textContent).not.toContain('Buch A')
    expect(screen.queryByRole('heading', { name: 'Zuletzt gehört' })).not.toBeInTheDocument()
  })

  it('zeigt deutlich mehr als die vier von früher, aber nicht endlos', () => {
    // Vier Kacheln waren zu wenig: Wer in mehreren Büchern gleichzeitig hört,
    // fand das fünfte nur noch über die Bibliothek wieder – und dort ohne die
    // Stelle, an der es steht. Ganz ohne Grenze lägen Gemerktes und Vorschläge
    // dagegen eine halbe Handylänge weiter unten.
    zeigen()

    const weiter = abschnitt('Weiterhören')
    expect(weiter.querySelectorAll('li')).toHaveLength(CONTINUE_LIMIT - 1)
    expect(weiter.textContent).toContain(`Buch ${NAMEN[CONTINUE_LIMIT - 1]!}`)
    expect(weiter.textContent).not.toContain(`Buch ${NAMEN[CONTINUE_LIMIT]!}`)
  })

  it('nimmt auch aus dem Abschnitt ein Hörbuch wieder weg', async () => {
    // Das Kreuz ist der einzige Weg, die Liste zu kürzen – ohne es wüchse sie
    // mit jedem versehentlich angetippten Buch.
    const reset = zeigen()

    await userEvent.click(screen.getByRole('button', { name: 'Buch D entfernen' }))
    expect(reset).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Buch D wirklich entfernen' }))
    expect(reset).toHaveBeenCalledWith('b_d')
  })
})
