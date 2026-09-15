import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { makeProfile, makeProfilesValue, renderWithProfiles } from '@/test/renderWithProfiles'

import { AppRoutes } from './AppRoutes'

describe('AppRoutes', () => {
  it('schickt ohne gewähltes Profil zur Profilauswahl', () => {
    renderWithProfiles(<AppRoutes />, makeProfilesValue(), { route: '/' })

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Wer hört zu?')
  })

  it('zeigt mit gewähltem Profil den Startbildschirm', () => {
    const selected = makeProfile({ name: 'Emma' })
    renderWithProfiles(
      <AppRoutes />,
      makeProfilesValue({ profiles: [selected], selected }),
      { route: '/' },
    )

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hörbücher')
    // Der Avatar führt zum eigenen Profil: Tier und Farbe für das Kind, und
    // darunter der Weg für die Erwachsenen.
    expect(screen.getByRole('link', { name: /Emma – Profil und Einstellungen/ })).toHaveAttribute(
      'href',
      '/profil/bearbeiten',
    )
  })

  it('schützt auch die Bibliothek', () => {
    renderWithProfiles(<AppRoutes />, makeProfilesValue(), { route: '/bibliothek' })

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Wer hört zu?')
  })

  it('lässt die Profilauswahl ohne gewähltes Profil zu', () => {
    renderWithProfiles(<AppRoutes />, makeProfilesValue(), { route: '/profil' })

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Wer hört zu?')
  })

  it('zeigt für unbekannte Adressen einen Weg zurück statt eines Fehlers', () => {
    renderWithProfiles(<AppRoutes />, makeProfilesValue(), { route: '/gibtesnicht' })

    expect(screen.getByText('Hier ist nichts')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Zum Anfang' })).toHaveAttribute('href', '/')
  })
})
