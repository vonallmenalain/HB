import { createContext, use } from 'react'

/**
 * Alles auf Anfang – für den Elternbereich.
 *
 * Gedacht für den Moment nach dem Ausprobieren: Die Startseite soll wieder so
 * aussehen wie am ersten Tag, ohne fremde Hörstände, ohne Sterne, ohne
 * Vorschläge aus Testläufen.
 *
 * Die Vorschläge haben dabei keinen eigenen Speicher – sie werden bei jedem
 * Öffnen aus dem Hörfortschritt gerechnet. Ist der zurückgesetzt, sind sie es
 * automatisch mit.
 */
export interface ResetContextValue {
  /**
   * Setzt den Hörfortschritt aller Profile zurück, löscht deren Favoriten und,
   * sofern dieses Konto Administrator ist, die Hörhistorie.
   *
   * Liefert eine kurze Bilanz für die Rückmeldung im Elternbereich.
   */
  resetAll: () => Promise<ResetReport>
}

export interface ResetReport {
  /** Wie viele Hörstände auf Anfang gesetzt wurden. */
  progress: number
  favorites: number
  /** Gelöschte Historien-Einträge; `null`, wenn dieses Konto sie nicht sieht. */
  history: number | null
}

const OHNE_RESET: ResetContextValue = {
  resetAll: () => Promise.resolve({ progress: 0, favorites: 0, history: null }),
}

export const ResetContext = createContext<ResetContextValue>(OHNE_RESET)

export function useReset(): ResetContextValue {
  return use(ResetContext)
}
