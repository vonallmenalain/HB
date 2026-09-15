import { createContext, use } from 'react'

import { type Book } from './catalog'
import { type MediaClient, type MediaError } from './mediaClient'

export type LibraryStatus = 'loading' | 'ready' | 'error'

export interface LibraryContextValue {
  status: LibraryStatus
  books: Book[]
  /** Gesetzt, wenn die angezeigten Bücher aus dem lokalen Spiegel stammen. */
  fromCache: boolean
  error: MediaError | null
  /** Vom Dienst gelieferte, aber unbrauchbare Einträge. */
  skipped: number
  /**
   * Schema-Version des gelieferten Katalogs, oder null ohne Katalog.
   *
   * Steht hier 1, ist der Medien-Dienst auf dem NAS älter als die App: Er
   * kennt Reihen und Gruppen noch nicht, und die Bibliothek sieht dann anders
   * aus, als sie soll. Das ist die einzige Stelle, an der sich das erkennen
   * lässt – deshalb steht es im Elternbereich.
   */
  schemaVersion: number | null
  refresh: () => void
  bookById: (id: string) => Book | undefined
  client: MediaClient | null
}

export const LibraryContext = createContext<LibraryContextValue | null>(null)

export function useLibrary(): LibraryContextValue {
  const value = use(LibraryContext)
  if (!value) throw new Error('useLibrary ausserhalb von <LibraryProvider> benutzt')
  return value
}
