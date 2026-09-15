import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '@/app/AppRoutes'
import {
  makeBook,
  makeLibraryValue,
  makeProfile,
  makeProfilesValue,
  makeProgressEntry,
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

    await userEvent.click(screen.getByRole('link', { name: /Emma – Bild und Farbe ändern/ }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Dein Bild')
  })

  it('lässt ein Kind sein Tier selbst wechseln', async () => {
    const update = vi.fn().mockResolvedValue(undefined)

    renderWithProfiles(<AppRoutes />, profiles({ update }), { route: '/profil/bearbeiten' })

    await userEvent.click(screen.getByRole('button', { name: 'Bild 🐻' }))
    expect(update).toHaveBeenCalledWith(EMMA.id, { avatar: '🐻' })
  })

  it('zeigt einen Weg in die ganze Bibliothek', () => {
    renderWithProfiles(<AppRoutes />, profiles(), {
      route: '/',
      library: makeLibraryValue({ books: KIDS }),
    })

    expect(screen.getByRole('link', { name: 'Alle Hörbücher' })).toHaveAttribute(
      'href',
      '/bibliothek',
    )
  })
})
