import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useUser } from '@/features/auth/authContext'
import { useProfiles } from '@/features/profiles/profilesContext'
import { readFirebaseConfig } from '@/lib/env'
import { getFirebase } from '@/lib/firebase'
import { readAllProgress, writeProgress } from '@/lib/db'

import { type ProgressCloud, createFirestoreCloud } from './cloud'
import { type Progress, blankProgress } from './progress'
import { ProgressContext, type SyncState } from './progressContext'
import { mergeRemote, pick } from './sync'
import { createSyncQueue } from './syncQueue'

const EMPTY: ReadonlyMap<string, Progress> = new Map()

interface Loaded {
  profileId: string
  entries: ReadonlyMap<string, Progress>
}

/** Baut zu einem Profil die Cloud-Seite; `null` heisst „nur lokal". */
export type CloudFactory = (profileId: string) => ProgressCloud | null

/**
 * Hörfortschritt des aktiven Profils.
 *
 * Die Reihenfolge ist überall dieselbe: **lokal ist die Wahrheit, die Cloud
 * ist die Ergänzung.** Geschrieben wird zuerst in den Speicher, sofort danach
 * nach IndexedDB, und erst gedrosselt zu Firestore. Fällt die Cloud weg – kein
 * Netz, keine Freigabe, keine Konfiguration –, merkt das Kind davon nichts.
 *
 * Die Firestore-Anbindung steckt hinter {@link CloudFactory}; dieser Teil
 * kennt nur noch „hör zu" und „schreib das hin".
 */
export function ProgressStore({
  children,
  cloudFor,
}: {
  children: ReactNode
  cloudFor?: CloudFactory | undefined
}) {
  const { selected } = useProfiles()
  const profileId = selected?.id ?? null

  const [loaded, setLoaded] = useState<Loaded | null>(null)

  // Die Rückrufe aus der Cloud treffen ausserhalb des Renderns ein und
  // brauchen den Stand von genau jetzt. Spiegel und Zustand werden deshalb
  // immer gemeinsam gesetzt – ein hinterherhinkender Spiegel würde beim
  // Zusammenführen lokale Stände als „gibt es nicht" behandeln.
  const mirror = useRef<Loaded | null>(null)
  const apply = useCallback((next: Loaded) => {
    mirror.current = next
    setLoaded(next)
  }, [])

  useEffect(() => {
    if (profileId === null) return
    let cancelled = false

    void (async () => {
      const stored = await readAllProgress(profileId)
      if (cancelled) return

      const entries = new Map(stored.map((entry) => [entry.bookId, entry]))

      // Wer während des Ladens weiterhört, darf nicht überschrieben werden:
      // Das Lesen kann losgelaufen sein, bevor die neue Stelle geschrieben
      // wurde. In IndexedDB steht sie dann zwar, aber nicht mehr hier.
      const inzwischen = mirror.current?.profileId === profileId ? mirror.current.entries : EMPTY
      for (const [bookId, entry] of inzwischen) {
        const vonDerPlatte = entries.get(bookId)
        entries.set(bookId, vonDerPlatte === undefined ? entry : pick(vonDerPlatte, entry))
      }

      apply({ profileId, entries })
    })()

    return () => {
      cancelled = true
    }
  }, [profileId, apply])

  // Abgeleitet statt im Effekt gesetzt: Beim Profilwechsel gehört der
  // Fortschritt des alten Profils sofort weg, nicht erst nach dem Neuladen.
  const entries = loaded?.profileId === profileId ? loaded.entries : EMPTY
  const localReady = profileId !== null && loaded?.profileId === profileId
  const loading = profileId !== null && !localReady

  const cloud = useMemo(
    () => (profileId === null ? null : (cloudFor?.(profileId) ?? null)),
    [cloudFor, profileId],
  )

  const [signal, setSignal] = useState<{ profileId: string; value: 'live' | 'error' } | null>(
    null,
  )

  // Firestore meldet jede Änderung – auch die eigenen. Ein neues Objekt pro
  // Schnappschuss würde den ganzen Baum neu rendern, obwohl sich nichts geändert
  // hat.
  const mark = useCallback((forProfile: string, value: 'live' | 'error') => {
    setSignal((previous) =>
      previous?.profileId === forProfile && previous.value === value
        ? previous
        : { profileId: forProfile, value },
    )
  }, [])

  const pushRef = useRef<((progress: Progress) => void) | null>(null)
  const flushRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    // Erst der lokale Stand, dann die Cloud: Käme der Schnappschuss zuerst,
    // sähe das Zusammenführen ein leeres Gerät und hielte alles aus der Cloud
    // für neu.
    if (profileId === null || !localReady || cloud === null) return

    const queue = createSyncQueue({ write: cloud.write })
    pushRef.current = (progress) => {
      queue.push(progress)
    }
    flushRef.current = queue.flush

    const unsubscribe = cloud.subscribe(
      (remote, complete) => {
        const current = mirror.current
        if (current?.profileId !== profileId) return

        const merged = mergeRemote(current.entries, remote, { remoteComplete: complete })
        for (const entry of merged.toStore) void writeProgress(profileId, entry)
        for (const entry of merged.toPush) queue.push(entry)
        if (merged.changed) apply({ profileId, entries: merged.entries })
        if (complete) mark(profileId, 'live')
      },
      () => {
        mark(profileId, 'error')
      },
    )

    return () => {
      pushRef.current = null
      flushRef.current = null
      // Was noch wartet, gehört hinaus, bevor die Schlange verschwindet.
      queue.flush()
      unsubscribe()
    }
  }, [profileId, localReady, cloud, apply, mark])

  // Beim Wegwischen der App bleibt keine Zeit mehr zu warten.
  useEffect(() => {
    const onHide = (): void => {
      flushRef.current?.()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide)
    }
  }, [])

  const save = useCallback(
    (progress: Progress) => {
      if (profileId === null) return

      const base = mirror.current?.profileId === profileId ? mirror.current.entries : EMPTY
      apply({ profileId, entries: new Map(base).set(progress.bookId, progress) })
      void writeProgress(profileId, progress)

      pushRef.current?.(progress)
      // Läuft die App schon im Hintergrund, zählt jede Sekunde: Dann geht der
      // Stand sofort hinaus statt am Ende der Drosselung. Unabhängig davon,
      // in welcher Reihenfolge die Lauscher oben aufgerufen wurden.
      if (document.visibilityState === 'hidden') flushRef.current?.()
    },
    [profileId, apply],
  )

  const reset = useCallback(
    (bookId: string) => {
      save(blankProgress(bookId))
    },
    [save],
  )

  const syncState: SyncState =
    cloud === null ? 'off' : (signal?.profileId === profileId ? signal.value : 'connecting')

  const value = useMemo(
    () => ({
      entries,
      loading,
      syncState,
      get: (bookId: string) => entries.get(bookId) ?? null,
      save,
      reset,
    }),
    [entries, loading, syncState, save, reset],
  )

  return <ProgressContext value={value}>{children}</ProgressContext>
}

/**
 * Der Fortschritt, wie ihn die App benutzt: mit Firestore dahinter.
 *
 * Getrennt vom Speicher darüber, damit die Abgleichlogik ohne Anmeldung und
 * ohne Firebase geprüft werden kann.
 */
export function ProgressProvider({ children }: { children: ReactNode }) {
  const user = useUser()
  const config = useMemo(() => readFirebaseConfig(), [])
  const db = useMemo(() => (config.ok ? getFirebase(config.config).db : null), [config])

  const cloudFor = useCallback<CloudFactory>(
    (profileId) => (db === null ? null : createFirestoreCloud(db, user.uid, profileId)),
    [db, user.uid],
  )

  return <ProgressStore cloudFor={cloudFor}>{children}</ProgressStore>
}
