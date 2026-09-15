import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { makeProfile, makeProfilesValue, renderWithProfiles } from '@/test/renderWithProfiles'

import { ProfilePicker } from './ProfilePicker'

describe('ProfilePicker', () => {
  it('bietet beim ersten Start das Anlegen an', () => {
    renderWithProfiles(<ProfilePicker />, makeProfilesValue())

    expect(screen.getByText('Noch kein Profil')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Profil anlegen' })).toHaveAttribute(
      'href',
      '/eltern',
    )
  })

  it('zeigt jedes Profil mit Namen', () => {
    renderWithProfiles(
      <ProfilePicker />,
      makeProfilesValue({
        profiles: [
          makeProfile({ id: 'a', name: 'Emma' }),
          makeProfile({ id: 'b', name: 'Ben', avatar: '🐻' }),
        ],
      }),
    )

    expect(screen.getByRole('button', { name: 'Emma' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ben' })).toBeInTheDocument()
  })

  it('wählt bei Tippen das Profil aus', async () => {
    const select = vi.fn()
    renderWithProfiles(
      <ProfilePicker />,
      makeProfilesValue({ profiles: [makeProfile({ id: 'a', name: 'Emma' })], select }),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Emma' }))

    expect(select).toHaveBeenCalledWith('a')
  })

  it('zeigt während des Ladens keine leere Liste', () => {
    renderWithProfiles(<ProfilePicker />, makeProfilesValue({ loading: true }))

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('Noch kein Profil')).not.toBeInTheDocument()
  })
})
