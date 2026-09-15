import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore'

import { useUser } from '@/features/auth/authContext'
import { useProfiles } from '@/features/profiles/profilesContext'
import { readFirebaseConfig } from '@/lib/env'
import { getFirebase } from '@/lib/firebase'

import { FavoritesContext } from './favoritesContext'

const LEER: ReadonlySet<string> = new Set()

/**
 * Favoriten des aktiven Profils, in Firestore unter dem Profil abgelegt.
 *
 * Der Stern ist absichtlich sofort gesetzt und erst danach geschrieben: Ein
 * Kind tippt und sieht, dass etwas passiert ist – auch wenn das NAS aus ist und
 * Firestore erst später hinausschreibt.
 */
export function FavoriteProvider({ children }: { children: ReactNode }) {
  const user = useUser()
  const { selected } = useProfiles()
  const profileId = selected?.id ?? null

  const config = useMemo(() => readFirebaseConfig(), [])
  const db = useMemo(() => (config.ok ? getFirebase(config.config).db : null), [config])

  const [state, setState] = useState<{ profileId: string | null; ids: ReadonlySet<string> }>({
    profileId: null,
    ids: LEER,
  })

  useEffect(() => {
    if (!db || profileId === null) return

    return onSnapshot(
      collection(db, 'users', user.uid, 'profiles', profileId, 'favorites'),
      (snapshot) => {
        setState({ profileId, ids: new Set(snapshot.docs.map((entry) => entry.id)) })
      },
      () => {
        // Kein Netz, keine Sterne – aber auch kein Fehler, den ein Kind sehen müsste.
      },
    )
  }, [db, user.uid, profileId])

  // Abgeleitet statt im Effekt zurückgesetzt: Beim Profilwechsel gehören die
  // Sterne des anderen Kindes sofort weg, nicht erst nach dem Nachladen.
  const ids = state.profileId === profileId ? state.ids : LEER

  const toggle = useCallback(
    (bookId: string) => {
      if (profileId === null) return

      const gesetzt = ids.has(bookId)
      const next = new Set(ids)
      if (gesetzt) next.delete(bookId)
      else next.add(bookId)
      setState({ profileId, ids: next })

      if (!db) return
      const ref = doc(db, 'users', user.uid, 'profiles', profileId, 'favorites', bookId)
      const schreiben = gesetzt
        ? deleteDoc(ref)
        : setDoc(ref, { addedAt: new Date().toISOString() })
      void schreiben.catch(() => {
        // Firestore puffert selbst; scheitert es endgültig, ist der Stern beim
        // nächsten Start wieder weg. Das ist ärgerlich, aber harmlos.
      })
    },
    [db, user.uid, profileId, ids],
  )

  const value = useMemo(
    () => ({ ids, isFavorite: (bookId: string) => ids.has(bookId), toggle }),
    [ids, toggle],
  )

  return <FavoritesContext value={value}>{children}</FavoritesContext>
}
