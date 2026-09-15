import { createContext, use } from 'react'

export interface ParentsContextValue {
  /** Wird noch geladen, ob überhaupt eine PIN gesetzt ist? */
  loading: boolean
  /** Ist eine PIN hinterlegt? */
  hasPin: boolean
  /** Ist der Elternbereich gerade gesperrt? */
  locked: boolean
  /** Prüft die eingegebene PIN; `true`, wenn sie stimmt. */
  unlock: (pin: string) => Promise<boolean>
  /** Sperrt wieder zu – beim Verlassen des Elternbereichs. */
  lock: () => void
  /** Setzt eine neue PIN (oder ändert sie). */
  setPin: (pin: string) => Promise<void>
  /** Nimmt die PIN weg; der Elternbereich steht dann offen. */
  removePin: () => Promise<void>
}

export const ParentsContext = createContext<ParentsContextValue | null>(null)

export function useParents(): ParentsContextValue {
  const value = use(ParentsContext)
  if (!value) throw new Error('useParents ausserhalb von <ParentProvider> benutzt')
  return value
}
