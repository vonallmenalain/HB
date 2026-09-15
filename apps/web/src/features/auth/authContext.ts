import { createContext, use } from 'react'
import { type User } from 'firebase/auth'

/**
 * Zustände der Anmeldung.
 *
 * `denied` ist kein Fehler, sondern der Normalfall für jedes Konto, das nicht
 * zur Familie gehört: Anmelden kann sich jeder mit einem Google-Konto, Zugriff
 * bekommt nur, wer in der Freigabeliste steht.
 */
export type AuthState =
  | { status: 'config-missing'; missing: string[] }
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'denied'; user: User }
  | { status: 'ready'; user: User }

export interface AuthActions {
  signInWithPassword: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  sendLoginLink: (email: string) => Promise<void>
  signOut: () => Promise<void>
  recheckAccess: () => Promise<void>
}

export interface AuthContextValue {
  state: AuthState
  actions: AuthActions
  /** Fehler beim Abschliessen eines Anmeldelinks, für den Login-Bildschirm. */
  linkError: string | null
  clearLinkError: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = use(AuthContext)
  if (!value) throw new Error('useAuth ausserhalb von <AuthProvider> benutzt')
  return value
}

/** Der angemeldete Nutzer – nur dort benutzen, wo `ready` garantiert ist. */
export function useUser(): User {
  const { state } = useAuth()
  if (state.status !== 'ready') {
    throw new Error('useUser ausserhalb eines angemeldeten Bereichs benutzt')
  }
  return state.user
}
