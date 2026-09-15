import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore'

import { useUser } from '@/features/auth/authContext'
import { readFirebaseConfig } from '@/lib/env'
import { getFirebase } from '@/lib/firebase'
import { readLocal, removeLocal, writeLocal } from '@/lib/localStore'

import { type Profile, parseProfile, sortProfiles } from './profile'
import { ProfilesContext, type ProfileInput, type ProfilePatch } from './profilesContext'

const selectionKey = (uid: string): string => `hb.profile.${uid}`

export function ProfileProvider({ children }: { children: ReactNode }) {
  const user = useUser()
  const config = useMemo(() => readFirebaseConfig(), [])
  const db = useMemo(
    () => (config.ok ? getFirebase(config.config).db : null),
    [config],
  )

  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    readLocal(selectionKey(user.uid)),
  )

  useEffect(() => {
    if (!db) return
    const profilesRef = collection(db, 'users', user.uid, 'profiles')

    // `onSnapshot` statt einmaligem Lesen: Der lokale Firestore-Cache
    // beantwortet den ersten Aufruf sofort und offline, spätere Änderungen von
    // einem anderen Gerät kommen ohne Zutun nach.
    return onSnapshot(
      profilesRef,
      (snapshot) => {
        const parsed = snapshot.docs
          .map((entry) => parseProfile(entry.id, entry.data()))
          .filter((entry): entry is Profile => entry !== null)
        setProfiles(sortProfiles(parsed))
        setLoading(false)
      },
      () => {
        // Kein Zugriff oder kein Netz: lieber eine leere Liste als ein
        // hängender Ladebalken.
        setLoading(false)
      },
    )
  }, [db, user.uid])

  const select = useCallback(
    (id: string) => {
      setSelectedId(id)
      writeLocal(selectionKey(user.uid), id)
    },
    [user.uid],
  )

  const clearSelection = useCallback(() => {
    setSelectedId(null)
    removeLocal(selectionKey(user.uid))
  }, [user.uid])

  const create = useCallback(
    async (input: ProfileInput) => {
      if (!db) return
      await addDoc(collection(db, 'users', user.uid, 'profiles'), {
        name: input.name.trim(),
        avatar: input.avatar,
        color: input.color,
        allowDownload: false,
        createdAt: new Date().toISOString(),
      })
    },
    [db, user.uid],
  )

  const update = useCallback(
    async (id: string, patch: ProfilePatch) => {
      if (!db) return
      const clean: Record<string, unknown> = {}
      if (patch.name !== undefined) clean.name = patch.name.trim()
      if (patch.avatar !== undefined) clean.avatar = patch.avatar
      if (patch.color !== undefined) clean.color = patch.color
      if (patch.allowDownload !== undefined) clean.allowDownload = patch.allowDownload
      if (Object.keys(clean).length === 0) return
      await updateDoc(doc(db, 'users', user.uid, 'profiles', id), clean)
    },
    [db, user.uid],
  )

  const remove = useCallback(
    async (id: string) => {
      if (!db) return
      await deleteDoc(doc(db, 'users', user.uid, 'profiles', id))
      if (selectedId === id) clearSelection()
    },
    [db, user.uid, selectedId, clearSelection],
  )

  /**
   * Die aktive Auswahl wird beim Rendern abgeleitet, nicht in einem Effekt
   * nachgezogen. Das erledigt zwei Fälle nebenbei: Eine gespeicherte Kennung,
   * zu der es kein Profil mehr gibt (auf einem anderen Gerät gelöscht), greift
   * einfach nicht mehr – und gibt es genau ein Profil, ist die Auswahl keine
   * Entscheidung, die man einem Kind vorlegen müsste.
   */
  const selected = useMemo(() => {
    if (loading) return null
    const stored = profiles.find((profile) => profile.id === selectedId)
    if (stored) return stored
    return profiles.length === 1 ? profiles[0]! : null
  }, [loading, profiles, selectedId])

  // Das Stammdokument anlegen, damit die Unterkollektion einen Elternteil hat.
  useEffect(() => {
    if (!db) return
    void setDoc(doc(db, 'users', user.uid), { uid: user.uid }, { merge: true }).catch(() => {
      // Ohne Freigabe schlägt das fehl – dann ist der Zugriff ohnehin gesperrt.
    })
  }, [db, user.uid])

  const value = useMemo(
    () => ({ loading, profiles, selected, select, clearSelection, create, update, remove }),
    [loading, profiles, selected, select, clearSelection, create, update, remove],
  )

  return <ProfilesContext value={value}>{children}</ProfilesContext>
}
