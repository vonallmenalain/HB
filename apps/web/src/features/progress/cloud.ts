import { type Firestore, collection, doc, onSnapshot, setDoc } from 'firebase/firestore'

import { readLocal, writeLocal } from '@/lib/localStore'

import { type Progress } from './progress'
import { parseRemoteProgress, toRemoteDoc } from './sync'

/**
 * Die Cloud-Seite des Fortschritts, auf das Nötigste eingedampft.
 *
 * Firestore steckt ausschliesslich hinter dieser Schnittstelle. Der Provider
 * darüber kennt nur noch „hör zu" und „schreib das hin" – und lässt sich damit
 * mit ein paar Zeilen Attrappe vollständig prüfen.
 */
export interface ProgressCloud {
  subscribe: (
    onEntries: (entries: ReadonlyMap<string, Progress>, complete: boolean) => void,
    onError: () => void,
  ) => () => void
  write: (progress: Progress) => void
}

export function createFirestoreCloud(
  db: Firestore,
  uid: string,
  profileId: string,
  device: string = deviceId(),
): ProgressCloud {
  const entries = collection(db, 'users', uid, 'profiles', profileId, 'progress')

  return {
    subscribe(onEntries, onError) {
      return onSnapshot(
        entries,
        (snapshot) => {
          const parsed = new Map<string, Progress>()
          for (const document of snapshot.docs) {
            const entry = parseRemoteProgress(document.id, document.data())
            if (entry !== null) parsed.set(entry.bookId, entry)
          }
          // Ein Schnappschuss aus dem Zwischenspeicher sagt nichts darüber, was
          // beim Server noch liegt – nur ein bestätigter zählt als vollständig.
          onEntries(parsed, !snapshot.metadata.fromCache)
        },
        onError,
      )
    },

    write(progress) {
      // Kein `await`: Firestore legt den Schreibvorgang sofort lokal ab und
      // schiebt ihn hinaus, sobald wieder Netz da ist. Auf die Bestätigung zu
      // warten hiesse, beim Wegwischen der App darauf zu verzichten.
      void setDoc(doc(entries, progress.bookId), toRemoteDoc(progress, device)).catch(() => {
        // Ohne Freigabe oder ohne Netz: Der lokale Stand bleibt die Wahrheit.
      })
    },
  }
}

const DEVICE_KEY = 'hb.device'

/**
 * Eine Kennung für dieses Gerät – nur zur Fehlersuche.
 *
 * Springt eine Stelle unerwartet, steht damit im Dokument, welches Gerät sie
 * geschrieben hat. Für den Abgleich selbst spielt sie keine Rolle.
 */
export function deviceId(): string {
  const stored = readLocal(DEVICE_KEY)
  if (stored !== null && stored !== '') return stored

  const fresh =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  writeLocal(DEVICE_KEY, fresh)
  return fresh
}
