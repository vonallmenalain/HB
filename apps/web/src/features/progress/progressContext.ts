import { createContext, use } from 'react'

import { type Progress } from './progress'

/**
 * Wie es um den Abgleich zwischen Geräten steht.
 *
 * Für das Kind unsichtbar – im Elternbereich ist es die Antwort auf „warum
 * steht auf dem Tablet etwas anderes als auf dem Handy".
 */
export type SyncState = 'off' | 'connecting' | 'live' | 'error'

export interface ProgressContextValue {
  /** Fortschritt des aktiven Profils, nach Buch-ID. */
  entries: ReadonlyMap<string, Progress>
  loading: boolean
  syncState: SyncState
  get: (bookId: string) => Progress | null
  save: (progress: Progress) => void
  /** Setzt ein Buch auf Anfang zurück. */
  reset: (bookId: string) => void
}

export const ProgressContext = createContext<ProgressContextValue | null>(null)

export function useProgress(): ProgressContextValue {
  const value = use(ProgressContext)
  if (!value) throw new Error('useProgress ausserhalb von <ProgressProvider> benutzt')
  return value
}
