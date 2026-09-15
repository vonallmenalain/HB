import type { ReactElement, ReactNode } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

import type { Profile } from '@/features/profiles/profile'
import {
  ProfilesContext,
  type ProfilesContextValue,
} from '@/features/profiles/profilesContext'

export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    name: 'Emma',
    avatar: '🦊',
    color: '#6d28d9',
    allowDownload: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

export function makeProfilesValue(
  overrides: Partial<ProfilesContextValue> = {},
): ProfilesContextValue {
  return {
    loading: false,
    profiles: [],
    selected: null,
    select: vi.fn(),
    clearSelection: vi.fn(),
    create: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

export function renderWithProfiles(
  ui: ReactElement,
  value: ProfilesContextValue,
  { route = '/' }: { route?: string } = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[route]}>
        <ProfilesContext value={value}>{children}</ProfilesContext>
      </MemoryRouter>
    )
  }

  return render(ui, { wrapper: Wrapper })
}
