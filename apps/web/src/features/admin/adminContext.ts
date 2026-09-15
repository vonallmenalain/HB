import { createContext, use } from 'react'

import { type AccessRequest, type AllowedAccount } from '@/features/auth/accessRequest'

/**
 * Der Adminbereich.
 *
 * Alles hier drin darf laut Firestore-Regeln nur ein einziges Konto: das mit
 * der im Deployment hinterlegten Adresse. Die App blendet den Bereich für alle
 * anderen aus – verhindert wird es in den Regeln, nicht hier.
 */
export interface AdminContextValue {
  loading: boolean
  /** Anfragen, die noch offen sind oder abgelehnt wurden. */
  requests: AccessRequest[]
  /** Konten mit Zugriff. */
  accounts: AllowedAccount[]
  /** Lässt sich die Liste gerade nicht lesen? */
  error: boolean
  approve: (request: AccessRequest) => Promise<void>
  deny: (request: AccessRequest) => Promise<void>
  revoke: (uid: string) => Promise<void>
}

const OHNE_ADMIN: AdminContextValue = {
  loading: false,
  requests: [],
  accounts: [],
  error: false,
  approve: () => Promise.resolve(),
  deny: () => Promise.resolve(),
  revoke: () => Promise.resolve(),
}

export const AdminContext = createContext<AdminContextValue>(OHNE_ADMIN)

export function useAdmin(): AdminContextValue {
  return use(AdminContext)
}
