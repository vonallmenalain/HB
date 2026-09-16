import { type ReactNode, useCallback, useMemo } from 'react'
import {
  type Firestore,
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore'

import { useAuth, useUser } from '@/features/auth/authContext'
import { HISTORY_COLLECTION } from '@/features/history/HistoryProvider'
import { useHistory } from '@/features/history/historyContext'
import { deviceId } from '@/features/progress/cloud'
import { blankProgress } from '@/features/progress/progress'
import { toRemoteDoc } from '@/features/progress/sync'
import { useProfiles } from '@/features/profiles/profilesContext'
import { readAllProgress, writeProgress } from '@/lib/db'
import { readFirebaseConfig } from '@/lib/env'
import { getFirebase } from '@/lib/firebase'

import { ResetContext, type ResetReport } from './resetContext'

/** Ein Firestore-Batch fasst höchstens 500 Schreibvorgänge. */
const BATCH_SIZE = 400

/** Schreibt eine Liste von Änderungen in Portionen, die Firestore annimmt. */
async function inPortionen<T>(
  items: readonly T[],
  db: Firestore,
  schreiben: (batch: ReturnType<typeof writeBatch>, item: T) => void,
): Promise<void> {
  for (let start = 0; start < items.length; start += BATCH_SIZE) {
    const batch = writeBatch(db)
    for (const item of items.slice(start, start + BATCH_SIZE)) schreiben(batch, item)
    await batch.commit()
  }
}

/**
 * Setzt den Hörfortschritt eines Profils auf Anfang – überall.
 *
 * Bewusst geschrieben und nicht gelöscht: Der Abgleich in `mergeRemote` kennt
 * kein „ist weg", nur „der jüngere Stand gewinnt". Ein gelöschtes Dokument
 * würde vom nächsten Gerät, das noch seinen alten lokalen Stand hat, sofort
 * wieder hochgeschoben. Ein Eintrag von jetzt auf 0 gewinnt dagegen überall.
 *
 * Berücksichtigt beide Seiten: Was nur lokal liegt (nie synchronisiert), ist
 * genauso Teil dessen, was ein Kind auf der Startseite sieht.
 */
async function profilZuruecksetzen(
  db: Firestore,
  uid: string,
  profileId: string,
): Promise<{ progress: number; favorites: number }> {
  const progressRef = collection(db, 'users', uid, 'profiles', profileId, 'progress')
  const [ausDerCloud, lokal] = await Promise.all([
    getDocs(progressRef),
    readAllProgress(profileId),
  ])

  const buecher = new Set([
    ...ausDerCloud.docs.map((entry) => entry.id),
    ...lokal.map((entry) => entry.bookId),
  ])
  const jetzt = new Date()
  const leer = [...buecher].map((bookId) => blankProgress(bookId, () => jetzt))
  const geraet = deviceId()

  // Erst lokal, dann in die Cloud – dieselbe Reihenfolge wie im normalen
  // Betrieb: Das Gerät ist die Wahrheit, die Cloud die Ergänzung.
  for (const eintrag of leer) await writeProgress(profileId, eintrag)
  await inPortionen(leer, db, (batch, eintrag) => {
    batch.set(doc(progressRef, eintrag.bookId), toRemoteDoc(eintrag, geraet))
  })

  // Favoriten dürfen wirklich weg: Sie liegen nur in Firestore, es gibt keinen
  // lokalen Stand, der sie wieder hervorholen könnte.
  const favoriten = await getDocs(
    collection(db, 'users', uid, 'profiles', profileId, 'favorites'),
  )
  await inPortionen(favoriten.docs, db, (batch, eintrag) => {
    batch.delete(eintrag.ref)
  })

  return { progress: leer.length, favorites: favoriten.docs.length }
}

/** Löscht die Hörhistorie dieses Kontos. Nur der Administrator darf das. */
async function historieLoeschen(db: Firestore, uid: string): Promise<number> {
  const eintraege = await getDocs(
    query(collection(db, HISTORY_COLLECTION), where('uid', '==', uid)),
  )
  await inPortionen(eintraege.docs, db, (batch, eintrag) => {
    batch.delete(eintrag.ref)
  })
  return eintraege.docs.length
}

export function ResetProvider({ children }: { children: ReactNode }) {
  const user = useUser()
  const { isAdmin } = useAuth()
  const { profiles } = useProfiles()
  const { forget } = useHistory()

  const config = useMemo(() => readFirebaseConfig(), [])
  const db = useMemo(() => (config.ok ? getFirebase(config.config).db : null), [config])

  const resetAll = useCallback(async (): Promise<ResetReport> => {
    if (!db) return { progress: 0, favorites: 0, history: null }

    let progress = 0
    let favorites = 0
    for (const profile of profiles) {
      const bilanz = await profilZuruecksetzen(db, user.uid, profile.id)
      progress += bilanz.progress
      favorites += bilanz.favorites
    }

    // Erst vergessen, dann löschen: Die Historie sammelt gehörte Sekunden eine
    // Minute lang im Speicher. Geht dieser Rest nach dem Löschen hinaus, legt
    // `increment` die eben gelöschten Dokumente wieder an.
    forget()

    // Die Historie gehört dem Administrator; die Regeln lassen sonst niemanden
    // sie auch nur lesen. Ohne diese Abfrage liefe die Anfrage in einen Fehler
    // und nähme das gelungene Zurücksetzen mit.
    const history = isAdmin ? await historieLoeschen(db, user.uid) : null

    return { progress, favorites, history }
  }, [db, user.uid, profiles, isAdmin, forget])

  const value = useMemo(() => ({ resetAll }), [resetAll])

  return <ResetContext value={value}>{children}</ResetContext>
}
