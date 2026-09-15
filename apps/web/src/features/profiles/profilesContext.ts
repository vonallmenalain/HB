import { createContext, use } from 'react'

import { type Profile } from './profile'

export interface ProfileInput {
  name: string
  avatar: string
  color: string
}

export type ProfilePatch = Partial<ProfileInput & { allowDownload: boolean }>

export interface ProfilesContextValue {
  loading: boolean
  profiles: Profile[]
  selected: Profile | null
  select: (id: string) => void
  clearSelection: () => void
  create: (input: ProfileInput) => Promise<void>
  update: (id: string, patch: ProfilePatch) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const ProfilesContext = createContext<ProfilesContextValue | null>(null)

export function useProfiles(): ProfilesContextValue {
  const value = use(ProfilesContext)
  if (!value) throw new Error('useProfiles ausserhalb von <ProfileProvider> benutzt')
  return value
}
