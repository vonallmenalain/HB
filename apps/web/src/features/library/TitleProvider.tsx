import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore'

import { useUser } from '@/features/auth/authContext'
import { readFirebaseConfig } from '@/lib/env'
import { getFirebase } from '@/lib/firebase'

import { TitlesContext } from './titlesContext'

/** Kollektion mit den von Hand gesetzten Titeln – für alle Konten dieselbe. */
export const TITLES_COLLECTION = 'bookTitles'

function parseTitle(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null
  const record = data as Record<string, unknown>
  const title = typeof record.title === 'string' ? record.title.trim() : ''
  return title === '' ? null : title
}

export function TitleProvider({ children }: { children: ReactNode }) {
  const user = useUser()
  const config = useMemo(() => readFirebaseConfig(), [])
  const db = useMemo(() => (config.ok ? getFirebase(config.config).db : null), [config])

  const [titles, setTitles] = useState<ReadonlyMap<string, string>>(new Map())

  useEffect(() => {
    if (!db) return

    return onSnapshot(
      collection(db, TITLES_COLLECTION),
      (snapshot) => {
        const next = new Map<string, string>()
        for (const entry of snapshot.docs) {
          const title = parseTitle(entry.data())
          if (title !== null) next.set(entry.id, title)
        }
        setTitles(next)
      },
      () => {
        // Kein Zugriff oder kein Netz: Dann gelten die erkannten Titel. Das ist
        // kein Fehler, den jemand sehen müsste.
      },
    )
  }, [db])

  const setTitle = useCallback(
    async (bookId: string, title: string) => {
      if (!db) return
      const trimmed = title.trim()
      if (trimmed === '') {
        await deleteDoc(doc(db, TITLES_COLLECTION, bookId))
        return
      }
      await setDoc(doc(db, TITLES_COLLECTION, bookId), {
        title: trimmed,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
      })
    },
    [db, user.uid],
  )

  const value = useMemo(() => ({ titles, setTitle }), [titles, setTitle])

  return <TitlesContext value={value}>{children}</TitlesContext>
}
