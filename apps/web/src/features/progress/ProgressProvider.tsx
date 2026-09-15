import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'

import { useProfiles } from '@/features/profiles/profilesContext'
import { readAllProgress, writeProgress } from '@/lib/db'

import { type Progress } from './progress'
import { ProgressContext } from './progressContext'

const EMPTY: ReadonlyMap<string, Progress> = new Map()

interface Loaded {
  profileId: string
  entries: ReadonlyMap<string, Progress>
}

/**
 * Hörfortschritt des aktiven Profils.
 *
 * Geschrieben wird zuerst in den Speicher und sofort danach nach IndexedDB –
 * der Abgleich über Geräte kommt mit M6 dazu. Reihenfolge und Zuständigkeit
 * bleiben dabei gleich: lokal ist die Wahrheit, die Cloud ist die Ergänzung.
 */
export function ProgressProvider({ children }: { children: ReactNode }) {
  const { selected } = useProfiles()
  const profileId = selected?.id ?? null

  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    if (profileId === null) return
    let cancelled = false

    void (async () => {
      const stored = await readAllProgress(profileId)
      if (cancelled) return
      setLoaded({ profileId, entries: new Map(stored.map((entry) => [entry.bookId, entry])) })
    })()

    return () => {
      cancelled = true
    }
  }, [profileId])

  // Abgeleitet statt im Effekt gesetzt: Beim Profilwechsel gehört der
  // Fortschritt des alten Profils sofort weg, nicht erst nach dem Neuladen.
  const entries = loaded?.profileId === profileId ? loaded.entries : EMPTY
  const loading = profileId !== null && loaded?.profileId !== profileId

  const save = useCallback(
    (progress: Progress) => {
      if (profileId === null) return
      setLoaded((previous) => ({
        profileId,
        entries: new Map(
          previous?.profileId === profileId ? previous.entries : undefined,
        ).set(progress.bookId, progress),
      }))
      void writeProgress(profileId, progress)
    },
    [profileId],
  )

  const reset = useCallback(
    (bookId: string) => {
      const cleared: Progress = {
        bookId,
        positionSec: 0,
        fileIdx: 0,
        offsetSec: 0,
        filesHash: '',
        durationSec: 0,
        finished: false,
        updatedAt: new Date().toISOString(),
      }
      save(cleared)
    },
    [save],
  )

  const value = useMemo(
    () => ({
      entries,
      loading,
      get: (bookId: string) => entries.get(bookId) ?? null,
      save,
      reset,
    }),
    [entries, loading, save, reset],
  )

  return <ProgressContext value={value}>{children}</ProgressContext>
}
