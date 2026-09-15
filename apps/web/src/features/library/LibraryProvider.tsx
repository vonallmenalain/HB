import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useAuth } from '@/features/auth/authContext'
import { readMediaBaseUrl } from '@/lib/env'

import { type Book, sortBooks } from './catalog'
import { loadCachedCatalog, saveCachedCatalog } from './catalogCache'
import { LibraryContext, type LibraryStatus } from './libraryContext'
import { type MediaError, createMediaClient } from './mediaClient'

interface State {
  status: LibraryStatus
  books: Book[]
  fromCache: boolean
  error: MediaError | null
  skipped: number
}

const INITIAL: State = {
  status: 'loading',
  books: [],
  fromCache: false,
  error: null,
  skipped: 0,
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const { state: authState } = useAuth()
  const baseUrl = useMemo(() => readMediaBaseUrl(), [])

  // Fehlt die Adresse des Medien-Dienstes, steht das schon beim ersten Rendern
  // fest – das gehört in den Anfangszustand, nicht in einen Effekt.
  const [state, setState] = useState<State>(() =>
    baseUrl === null ? { ...INITIAL, status: 'error', error: 'not-configured' } : INITIAL,
  )
  const [reloadToken, setReloadToken] = useState(0)
  const etagRef = useRef<string | null>(null)

  const client = useMemo(() => {
    if (baseUrl === null) return null
    return createMediaClient({
      baseUrl,
      getIdToken: async () =>
        authState.status === 'ready' ? await authState.user.getIdToken() : null,
    })
  }, [baseUrl, authState])

  useEffect(() => {
    if (!client) return

    // Ohne diesen Schutz könnte eine langsame erste Antwort eine bereits
    // eingetroffene neuere überschreiben – etwa wenn jemand „Nochmal
    // versuchen" tippt, während der erste Versuch noch läuft.
    let cancelled = false

    void (async () => {
      // Erst der lokale Spiegel: Die Bibliothek ist damit sofort da, auch wenn
      // das NAS gerade aus ist.
      const cached = await loadCachedCatalog()
      if (cancelled) return

      if (cached) {
        etagRef.current = cached.etag
        setState({
          status: 'ready',
          books: sortBooks(cached.catalog.books),
          fromCache: true,
          error: null,
          skipped: 0,
        })
      }

      const result = await client.fetchCatalog(etagRef.current)
      if (cancelled) return

      if (result.status === 'not-modified') {
        setState((previous) => ({
          ...previous,
          status: 'ready',
          fromCache: false,
          error: null,
        }))
        return
      }

      if (result.status === 'error') {
        setState((previous) =>
          // Etwas Gezeigtes ist besser als ein Fehler – die Herkunft bleibt sichtbar.
          previous.books.length > 0
            ? { ...previous, status: 'ready', fromCache: true, error: result.reason }
            : { ...INITIAL, status: 'error', error: result.reason },
        )
        return
      }

      etagRef.current = result.etag
      await saveCachedCatalog(result.catalog, result.etag)
      if (cancelled) return

      setState({
        status: 'ready',
        books: sortBooks(result.catalog.books),
        fromCache: false,
        error: null,
        skipped: result.skipped,
      })
    })()

    return () => {
      cancelled = true
    }
  }, [client, reloadToken])

  const refresh = useCallback(() => {
    setReloadToken((token) => token + 1)
  }, [])

  const value = useMemo(
    () => ({
      ...state,
      refresh,
      bookById: (id: string) => state.books.find((book) => book.id === id),
      client,
    }),
    [state, refresh, client],
  )

  return <LibraryContext value={value}>{children}</LibraryContext>
}
