import { createContext, use } from 'react'

export interface ParentsContextValue {
  /** Wird noch geladen, ob überhaupt eine PIN gesetzt ist? */
  loading: boolean
  /** Ist eine PIN hinterlegt? */
  hasPin: boolean
  /** Ist der Elternbereich gerade gesperrt? */
  locked: boolean
  /**
   * Prüft die eingegebene PIN; `true`, wenn sie stimmt.
   *
   * Mit `remember` bleibt dieses Gerät offen, bis es jemand im Elternbereich
   * wieder sperrt – für das eigene Telefon, auf dem die PIN sonst bei jedem
   * Start wieder verlangt würde.
   */
  unlock: (pin: string, remember?: boolean) => Promise<boolean>
  /** Sperrt wieder zu – beim Verlassen des Elternbereichs. */
  lock: () => void
  /** Ist dieses Gerät dauerhaft aufgesperrt? */
  remembered: boolean
  /** Nimmt das Gemerkte wieder weg: Auf diesem Gerät gilt wieder die PIN. */
  forgetOnThisDevice: () => void
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
