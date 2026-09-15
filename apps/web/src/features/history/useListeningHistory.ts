import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'

import { readFirebaseConfig } from '@/lib/env'
import { getFirebase } from '@/lib/firebase'

import { HISTORY_COLLECTION } from './HistoryProvider'
import { type HistoryEntry, parseHistoryEntry } from './history'

export interface ListeningHistory {
  loading: boolean
  entries: HistoryEntry[]
  error: boolean
}

/**
 * Liest die Hörhistorie – nur für den Adminbereich.
 *
 * Bewusst ein Hook und kein Provider: Gebraucht wird sie auf genau einem
 * Bildschirm, und niemand soll die Liste im Hintergrund mitziehen, während ein
 * Kind hört.
 */
export function useListeningHistory(enabled: boolean): ListeningHistory {
  const config = useMemo(() => readFirebaseConfig(), [])
  const db = useMemo(() => (config.ok ? getFirebase(config.config).db : null), [config])

  // Ob überhaupt gelesen wird, steht schon beim Rendern fest – und damit auch,
  // ob gerade geladen wird. Beides im Effekt zu setzen hiesse, einmal mehr zu
  // rendern, nur um dasselbe zu wissen.
  const aktiv = db !== null && enabled
  const [state, setState] = useState<{ entries: HistoryEntry[]; error: boolean } | null>(null)

  useEffect(() => {
    if (!db || !enabled) return

    return onSnapshot(
      collection(db, HISTORY_COLLECTION),
      (snapshot) => {
        setState({
          entries: snapshot.docs
            .map((entry) => parseHistoryEntry(entry.id, entry.data()))
            .filter((entry): entry is HistoryEntry => entry !== null),
          error: false,
        })
      },
      () => {
        setState({ entries: [], error: true })
      },
    )
  }, [db, enabled])

  if (!aktiv) return { loading: false, entries: [], error: false }
  if (state === null) return { loading: true, entries: [], error: false }
  return { loading: false, entries: state.entries, error: state.error }
}
