import { createContext, use } from 'react'

import { type BookAges } from '@/features/profiles/access'

/**
 * Die Altersfreigaben, die im Adminbereich gesetzt wurden.
 *
 * Sie gehören nicht einem Konto, sondern der Bibliothek – wie die von Hand
 * gesetzten Titel: „Der Feuerkelch ist ab 12" gilt auf jedem Gerät und für
 * jedes Kind. Deshalb liegen sie in einer eigenen Kollektion und nicht unter
 * `users/{uid}`.
 */
export interface AgesContextValue {
  /** Buch-ID → Altersfreigabe. Fehlt ein Eintrag, ist das Buch frei. */
  ages: BookAges
  /**
   * Setzt eine Altersfreigabe; `0` nimmt sie wieder weg.
   *
   * Wirkt sofort für alle: Ein Buch, das damit über dem Alter eines Kindes
   * liegt, verschwindet bei ihm aus der Bibliothek.
   */
  setMinAge: (bookId: string, minAge: number) => Promise<void>
  /**
   * Dasselbe für eine ganze Reihe – zweihundert Folgen in einem Rutsch.
   *
   * Eigener Weg und nicht zweihundertmal `setMinAge`: Das wären zweihundert
   * einzelne Schreibvorgänge, die gleichzeitig losrennen. Firestore fasst bis
   * zu 500 in einem Stapel zusammen; das ist ein Netzgang statt zweihundert
   * und geht entweder ganz oder gar nicht durch.
   */
  setMinAges: (bookIds: readonly string[], minAge: number) => Promise<void>
}

/**
 * Ohne Provider gibt es schlicht keine Altersfreigaben.
 *
 * Das ist kein Notbehelf, sondern der Normalfall in der Vorschau und in Tests:
 * Beide kommen ohne Firebase aus, und die Bibliothek soll trotzdem laufen.
 */
const OHNE_FREIGABEN: AgesContextValue = {
  ages: new Map(),
  setMinAge: () => Promise.resolve(),
  setMinAges: () => Promise.resolve(),
}

export const AgesContext = createContext<AgesContextValue>(OHNE_FREIGABEN)

export function useAges(): AgesContextValue {
  return use(AgesContext)
}
