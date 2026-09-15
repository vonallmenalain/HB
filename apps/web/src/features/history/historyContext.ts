import { createContext, use } from 'react'

import { type Book } from '@/features/library/catalog'

/**
 * Das Aufzeichnen der Hörhistorie.
 *
 * Der Player kennt nur diese zwei Sätze: „hier fängt etwas an" und „hier sind
 * wieder ein paar Sekunden vergangen". Wohin das geht – Firestore oder
 * nirgendwo – entscheidet der Provider darüber.
 */
export interface HistoryContextValue {
  /** Ein Buch wurde geöffnet und gestartet. */
  started: (book: Book) => void
  /** Es wurden `seconds` Sekunden tatsächlich abgespielt. */
  listened: (book: Book, seconds: number) => void
}

/** Ohne Provider wird nichts aufgezeichnet – so laufen Vorschau und Tests. */
const OHNE_HISTORIE: HistoryContextValue = {
  started: () => undefined,
  listened: () => undefined,
}

export const HistoryContext = createContext<HistoryContextValue>(OHNE_HISTORIE)

export function useHistory(): HistoryContextValue {
  return use(HistoryContext)
}
