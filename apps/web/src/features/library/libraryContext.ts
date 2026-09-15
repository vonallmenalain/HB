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
