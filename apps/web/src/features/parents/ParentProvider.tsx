import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'

import { useUser } from '@/features/auth/authContext'
import { readFirebaseConfig } from '@/lib/env'
import { getFirebase } from '@/lib/firebase'

import { ParentsContext } from './parentsContext'
import { type StoredPin, makeStoredPin, parseStoredPin, verifyPin } from './pin'

/**
 * Wie lange eine frische Anmeldung als Ausweis gilt.
 *
 * Das ist der Weg aus einer vergessenen PIN: abmelden, neu anmelden. Wer sich
 * anmelden kann, kennt das Konto – und darf die PIN neu setzen. Ein Kind kann
 * das nicht, und genau darum geht es.
 */
export const FRESH_SIGN_IN_MS = 5 * 60_000

/**
 * Der Elternbereich und sein Schloss.
 *
 * Aufgesperrt wird für die Dauer der Sitzung, nicht dauerhaft: Wer den
 * Elternbereich verlässt, findet ihn beim nächsten Mal wieder zu.
 */
export function ParentProvider({
  children,
  now = () => Date.now(),
}: {
  children: ReactNode
  now?: () => number
}) {
  const user = useUser()
  const config = useMemo(() => readFirebaseConfig(), [])
  const db = useMemo(() => (config.ok ? getFirebase(config.config).db : null), [config])

  const [stored, setStored] = useState<{ uid: string; pin: StoredPin | null } | null>(null)
  const [unlocked, setUnlocked] = useState(false)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      if (db === null) {
        if (!cancelled) setStored({ uid: user.uid, pin: null })
        return
      }
      try {
        const snapshot = await getDoc(doc(db, 'users', user.uid))
        if (!cancelled) setStored({ uid: user.uid, pin: parseStoredPin(snapshot.data()) })
      } catch {
        // Kein Zugriff oder kein Netz: Dann lieber offen als ausgesperrt. Der
        // Elternbereich enthält nichts, was ohne Konto Schaden anrichtet.
        if (!cancelled) setStored({ uid: user.uid, pin: null })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [db, user.uid])

  const loading = stored?.uid !== user.uid
  const pin = loading ? null : stored?.pin ?? null

  /**
   * Wer sich gerade erst angemeldet hat, kommt einmal ohne PIN hinein.
   *
   * Sonst wäre eine vergessene PIN eine Sackgasse – und zwar eine, die
   * ausgerechnet die Eltern aus ihrem eigenen Bereich aussperrt.
   */
  const freshSignIn = useMemo(() => {
    // Ohne Fragezeichen: Fehlt `metadata`, reisst der Zugriff die ganze App
    // mit – für eine Bequemlichkeit, die auch einfach entfallen kann.
    const zeit = user.metadata?.lastSignInTime
    if (zeit === undefined || zeit === null) return false
    const ms = Date.parse(zeit)
    return !Number.isNaN(ms) && now() - ms < FRESH_SIGN_IN_MS
  }, [user, now])

  const locked = !loading && pin !== null && !unlocked && !freshSignIn

  const unlock = useCallback(
    async (eingabe: string) => {
      const passt = await verifyPin(eingabe, pin)
      if (passt) setUnlocked(true)
      return passt
    },
    [pin],
  )

  const lock = useCallback(() => {
    setUnlocked(false)
  }, [])

  const speichern = useCallback(
    async (next: StoredPin | null) => {
      setStored({ uid: user.uid, pin: next })
      if (db === null) return
      await setDoc(
        doc(db, 'users', user.uid),
        { uid: user.uid, pinSalt: next?.salt ?? '', pinHash: next?.hash ?? '' },
        { merge: true },
      )
    },
    [db, user.uid],
  )

  const setPin = useCallback(
    async (eingabe: string) => {
      await speichern(await makeStoredPin(eingabe))
      setUnlocked(true)
    },
    [speichern],
  )

  const removePin = useCallback(async () => {
    await speichern(null)
    setUnlocked(true)
  }, [speichern])

  const value = useMemo(
    () => ({
      loading,
      hasPin: pin !== null,
      locked,
      unlock,
      lock,
      setPin,
      removePin,
    }),
    [loading, pin, locked, unlock, lock, setPin, removePin],
  )

  return <ParentsContext value={value}>{children}</ParentsContext>
}
