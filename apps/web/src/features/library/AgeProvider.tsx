import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot, writeBatch } from 'firebase/firestore'

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

  /**
   * Schreibt eine Freigabe für beliebig viele Bücher.
   *
   * In Stapeln von 400, weil Firestore bei 500 Schreibvorgängen je Stapel
   * aufhört. Ein Stapel geht ganz oder gar nicht durch – bei „Die drei ??? ab
   * 10" bleiben also keine halb gesetzten zweihundert Folgen zurück, an denen
   * sich niemand mehr auskennt.
   *
   * Derselbe Zeitstempel für alle: Sie sind mit einer Handlung entstanden.
   */
  const setMinAges = useCallback(
    async (bookIds: readonly string[], minAge: number) => {
      if (!db || bookIds.length === 0) return
      const sauber = parseMinAge(minAge)
      const zeit = new Date().toISOString()

      for (let start = 0; start < bookIds.length; start += 400) {
        const batch = writeBatch(db)
        for (const bookId of bookIds.slice(start, start + 400)) {
          const ziel = doc(db, AGES_COLLECTION, bookId)
          // Kein Dokument heisst „frei" – statt einer Null, die jedes Gerät
          // mitliest.
          if (sauber <= 0) batch.delete(ziel)
          else batch.set(ziel, { minAge: sauber, updatedAt: zeit, updatedBy: user.uid })
        }
        await batch.commit()
      }
    },
    [db, user.uid],
  )

  // Ein einzelnes Buch ist eine Reihe mit einem Eintrag: Zwei Wege, die
  // dasselbe tun, liefen früher oder später auseinander.
  const setMinAge = useCallback(
    async (bookId: string, minAge: number) => {
      await setMinAges([bookId], minAge)
    },
    [setMinAges],
  )

  const value = useMemo(() => ({ ages, setMinAge, setMinAges }), [ages, setMinAge, setMinAges])

  return <AgesContext value={value}>{children}</AgesContext>
}
