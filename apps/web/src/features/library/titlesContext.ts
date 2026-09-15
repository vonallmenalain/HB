import { createContext, use } from 'react'

/**
 * Die im Adminbereich von Hand gesetzten Titel.
 *
 * Sie gehören nicht einem Konto, sondern der Bibliothek: Benennt der
 * Administrator eine Folge um, liest jedes Kind auf jedem Gerät denselben
 * Titel. Deshalb liegen sie in einer eigenen Kollektion und nicht unter
 * `users/{uid}`.
 */
export interface TitlesContextValue {
  /** Buch-ID → Titel von Hand. Fehlt ein Eintrag, gilt der aufgeräumte Titel. */
  titles: ReadonlyMap<string, string>
  /** Setzt einen Titel; ein leerer Text nimmt die Überschreibung wieder weg. */
  setTitle: (bookId: string, title: string) => Promise<void>
}

/**
 * Ohne Provider gibt es schlicht keine Überschreibungen.
 *
 * Das ist kein Notbehelf, sondern der Normalfall in der Vorschau und in Tests:
 * Beide kommen ohne Firebase aus, und die Bibliothek soll trotzdem laufen.
 */
const OHNE_UEBERSCHREIBUNGEN: TitlesContextValue = {
  titles: new Map(),
  setTitle: () => Promise.resolve(),
}

export const TitlesContext = createContext<TitlesContextValue>(OHNE_UEBERSCHREIBUNGEN)

export function useTitles(): TitlesContextValue {
  return use(TitlesContext)
}
