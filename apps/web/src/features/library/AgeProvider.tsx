import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore'

import { useUser } from '@/features/auth/authContext'
import { parseMinAge } from '@/features/profiles/access'
import { readFirebaseConfig } from '@/lib/env'
import { getFirebase } from '@/lib/firebase'

import { AgesContext } from './agesContext'

/** Kollektion mit den Altersfreigaben – für alle Konten dieselbe. */
export const AGES_COLLECTION = 'bookAges'

export function AgeProvider({ children }: { children: ReactNode }) {
  const user = useUser()
  const config = useMemo(() => readFirebaseConfig(), [])
  const db = useMemo(() => (config.ok ? getFirebase(config.config).db : null), [config])

  const [ages, setAges] = useState<ReadonlyMap<string, number>>(new Map())

  useEffect(() => {
    if (!db) return

    return onSnapshot(
      collection(db, AGES_COLLECTION),
      (snapshot) => {
        const next = new Map<string, number>()
        for (const entry of snapshot.docs) {
          const data: unknown = entry.data()
          const minAge =
            typeof data === 'object' && data !== null
              ? parseMinAge((data as Record<string, unknown>).minAge)
              : 0
          if (minAge > 0) next.set(entry.id, minAge)
        }
        setAges(next)
      },
      () => {
        // Kein Zugriff oder kein Netz: Dann gilt keine Freigabe.
        //
        // Das ist die unvorsichtige Richtung, und sie ist Absicht. Die Regel
        // hier ist kein Schloss, sondern eine Aufräumhilfe: Sie hält
        // Unpassendes aus der Kachelübersicht heraus. Wäre es umgekehrt, stünde
        // das Kind bei jeder Störung vor einer leeren Bibliothek – und der
        // häufigste Grund dafür ist ein abgeschaltetes NAS, nicht ein
        // Umgehungsversuch.
      },
    )
  }, [db])

  const setMinAge = useCallback(
    async (bookId: string, minAge: number) => {
      if (!db) return
      const sauber = parseMinAge(minAge)
      if (sauber <= 0) {
        await deleteDoc(doc(db, AGES_COLLECTION, bookId))
        return
      }
      await setDoc(doc(db, AGES_COLLECTION, bookId), {
        minAge: sauber,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
      })
    },
    [db, user.uid],
  )

  const value = useMemo(() => ({ ages, setMinAge }), [ages, setMinAge])

  return <AgesContext value={value}>{children}</AgesContext>
}
