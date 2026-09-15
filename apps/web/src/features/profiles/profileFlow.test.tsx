import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AppRoutes } from '@/app/AppRoutes'
import { makeProfile } from '@/test/renderWithProfiles'

import { ProfilesContext, type ProfilesContextValue } from './profilesContext'

const EMMA = makeProfile({ id: 'a', name: 'Emma' })
const BEN = makeProfile({ id: 'b', name: 'Ben', avatar: '🐻' })

/**
 * Anders als die Einzeltests hält dieser Provider den Zustand tatsächlich –
 * nur so lässt sich prüfen, was *nach* dem Antippen passiert.
 */
function StatefulProfiles({ children }: { children: React.ReactNode }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const profiles = [EMMA, BEN]

  const value: ProfilesContextValue = {
    loading: false,
    profiles,
    selected: profiles.find((p) => p.id === selectedId) ?? null,
    select: setSelectedId,
    clearSelection: () => {
      setSelectedId(null)
    },
    create: () => Promise.resolve(),
    update: () => Promise.resolve(),
    remove: () => Promise.resolve(),
  }

  return <ProfilesContext value={value}>{children}</ProfilesContext>
}

describe('Profilauswahl bis zum Startbildschirm', () => {
  it('bringt das Kind nach dem Antippen auf den Startbildschirm', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <StatefulProfiles>
          <AppRoutes />
        </StatefulProfiles>
      </MemoryRouter>,
    )

    // Ohne Profil landet man auf der Auswahl.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Wer hört zu?')

    await userEvent.click(screen.getByRole('button', { name: 'Emma' }))

    // Der eigentliche Punkt: Es darf nicht bei der Auswahl bleiben.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hörbücher')
    expect(screen.queryByRole('button', { name: 'Ben' })).not.toBeInTheDocument()
  })

  it('führt auch beim Profilwechsel zurück zum Startbildschirm', async () => {
    render(
      <MemoryRouter initialEntries={['/profil']}>
        <StatefulProfiles>
          <AppRoutes />
        </StatefulProfiles>
      </MemoryRouter>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Ben' }))

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hörbücher')
  })
})
