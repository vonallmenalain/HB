import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '@/app/AppRoutes'
import {
  makeAgesValue,
  makeBook,
  makeLibraryValue,
  makeProfile,
  makeProfilesValue,
  renderWithProfiles,
} from '@/test/renderWithProfiles'

const EMMA = makeProfile({ id: 'p1', name: 'Emma' })
const BEN = makeProfile({ id: 'p2', name: 'Ben', createdAt: '2026-02-01T00:00:00.000Z' })

const BOOKS = [
  makeBook({ id: 'frei', title: 'Der Super-Papagei', series: null, seriesIndex: null }),
  makeBook({ id: 'ab12', title: 'Der Feuerkelch', series: null, seriesIndex: null }),
]

describe('Profilwechsel', () => {
  it('lässt ein Kind auswählen, solange noch niemand gewählt hat', () => {
    // Ein frisch eingerichtetes Tablett wäre sonst eine Sackgasse: Ohne
    // Auswahl keine Bibliothek, und ohne Auswahl auch keine Auswahl.
    renderWithProfiles(
      <AppRoutes />,
      makeProfilesValue({ profiles: [EMMA, BEN], selected: null }),
      { route: '/profil' },
    )

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Wer hört zu?')
  })

  it('schickt ein gesperrtes Profil von der Auswahl auf die Startseite', () => {
    const gesperrt = makeProfile({ id: 'p1', name: 'Emma', maySwitchProfile: false })

    renderWithProfiles(
      <AppRoutes />,
      makeProfilesValue({ profiles: [gesperrt, BEN], selected: gesperrt }),
      { route: '/profil', library: makeLibraryValue({ books: BOOKS }) },
    )

    expect(screen.queryByRole('heading', { name: 'Wer hört zu?' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hörbücher')
  })

  it('lässt die Auswahl offen, wenn das Profil wechseln darf', () => {
    const darf = makeProfile({ id: 'p1', name: 'Emma', maySwitchProfile: true })

    renderWithProfiles(
      <AppRoutes />,
      makeProfilesValue({ profiles: [darf, BEN], selected: darf }),
      { route: '/profil' },
    )

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Wer hört zu?')
  })

  it('bietet dem gesperrten Profil kein „Anderes Kind" an', async () => {
    // Der Knopf wäre ein Versprechen, das die Weiche gleich danach bricht.
    const gesperrt = makeProfile({ id: 'p1', name: 'Emma', maySwitchProfile: false })

    const { unmount } = renderWithProfiles(
      <AppRoutes />,
      makeProfilesValue({ profiles: [gesperrt, BEN], selected: gesperrt }),
      { route: '/profil/bearbeiten' },
    )
    expect(screen.queryByRole('button', { name: 'Anderes Kind' })).not.toBeInTheDocument()
    unmount()

    const darf = makeProfile({ id: 'p1', name: 'Emma', maySwitchProfile: true })
    const clearSelection = vi.fn()
    renderWithProfiles(
      <AppRoutes />,
      makeProfilesValue({ profiles: [darf, BEN], selected: darf, clearSelection }),
      { route: '/profil/bearbeiten' },
    )

    await userEvent.click(screen.getByRole('button', { name: 'Anderes Kind' }))
    expect(clearSelection).toHaveBeenCalled()
  })

  it('gibt den Wechsel im Elternbereich wieder frei', async () => {
    // Der einzige Weg zurück zur Auswahl – und er liegt hinter der PIN. Die
    // Auswahl muss dabei zuerst weg, sonst schickt die Weiche sofort zurück.
    const gesperrt = makeProfile({ id: 'p1', name: 'Emma', maySwitchProfile: false })
    const clearSelection = vi.fn()

    renderWithProfiles(
      <AppRoutes />,
      makeProfilesValue({ profiles: [gesperrt, BEN], selected: gesperrt, clearSelection }),
      { route: '/eltern', library: makeLibraryValue({ books: BOOKS }) },
    )

    await userEvent.click(screen.getByRole('button', { name: 'Anderes Kind auswählen' }))
    expect(clearSelection).toHaveBeenCalled()
  })
})

describe('Altersfreigabe im Elternbereich', () => {
  const zeigen = (profile = EMMA, update = vi.fn().mockResolvedValue(undefined)) => {
    renderWithProfiles(
      <AppRoutes />,
      makeProfilesValue({ profiles: [profile], selected: profile, update }),
      {
        route: '/eltern',
        library: makeLibraryValue({ books: BOOKS }),
        ages: makeAgesValue({ ages: new Map([['ab12', 12]]) }),
      },
    )
    return update
  }

  it('sagt, wie viele Hörbücher das Profil sieht', () => {
    // Ohne Alter bleibt alles mit Freigabe verborgen – und das muss dastehen,
    // sonst sucht man den Fehler im NAS.
    zeigen()

    expect(screen.getByText(/1 von 2 Hörbüchern/)).toBeInTheDocument()
    expect(screen.getByText(/Ohne Alter sieht das Profil nur/)).toBeInTheDocument()
  })

  it('trägt das Alter beim Profil ein', async () => {
    const update = zeigen()

    await userEvent.selectOptions(screen.getByLabelText('Alter'), '12')
    expect(update).toHaveBeenCalledWith('p1', { ageYears: 12 })
  })

  it('nimmt das Alter wieder weg', async () => {
    const update = zeigen(makeProfile({ id: 'p1', name: 'Emma', ageYears: 12 }))

    await userEvent.selectOptions(screen.getByLabelText('Alter'), '')
    expect(update).toHaveBeenCalledWith('p1', { ageYears: null })
  })

  it('sperrt ein einzelnes Hörbuch und gibt es wieder frei', async () => {
    const update = zeigen(makeProfile({ id: 'p1', name: 'Emma', ageYears: 12 }))

    await userEvent.click(screen.getByRole('button', { name: /Einzelne Hörbücher sperren/ }))
    await userEvent.type(screen.getByLabelText('Hörbuch suchen'), 'Papagei')
    await userEvent.click(screen.getByRole('button', { name: /Der Super-Papagei sperren/ }))

    expect(update).toHaveBeenCalledWith('p1', { blockedBooks: ['frei'] })
  })

  it('gibt ein gesperrtes Hörbuch wieder frei', async () => {
    const update = zeigen(
      makeProfile({ id: 'p1', name: 'Emma', ageYears: 12, blockedBooks: ['frei'] }),
    )

    await userEvent.click(screen.getByRole('button', { name: /Einzelne Hörbücher sperren/ }))
    await userEvent.click(
      screen.getByRole('button', { name: /Der Super-Papagei wieder freigeben/ }),
    )

    expect(update).toHaveBeenCalledWith('p1', { blockedBooks: [] })
  })

  it('schaltet den Profilwechsel um', async () => {
    const update = zeigen()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Darf das Profil wechseln' }))
    expect(update).toHaveBeenCalledWith('p1', { maySwitchProfile: false })
  })
})
