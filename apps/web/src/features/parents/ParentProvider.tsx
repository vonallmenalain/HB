import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'

import { useUser } from '@/features/auth/authContext'
import { readFirebaseConfig } from '@/lib/env'
import { getFirebase } from '@/lib/firebase'
import { readLocal, removeLocal, writeLocal } from '@/lib/localStore'

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
 * Auf welchen Geräten die PIN als erledigt gilt.
 *
 * Nach Konto getrennt: Ein anderes Konto auf demselben Gerät erbt das nicht.
 */
const rememberKey = (uid: string): string => `hb.parents.unlocked.${uid}`

/**
 * Der Elternbereich und sein Schloss.
 *
 * Aufgesperrt wird für die Dauer der Sitzung: Wer die App schliesst, findet den
 * Elternbereich beim nächsten Start wieder zu.
 *
 * Es sei denn, jemand hat beim Eingeben „Auf diesem Gerät merken" gewählt. Das
 * ist der Unterschied zwischen dem eigenen Telefon und dem Kindertablett: Auf
 * dem eigenen Gerät ist die PIN ein Hindernis ohne Zweck, auf dem Tablett ist
 * sie der ganze Zweck. Deshalb entscheidet es niemand im Voraus für beide
 * Geräte, sondern jedes Gerät für sich – und ein Knopf im Elternbereich nimmt
 * es wieder zurück.
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
  const [remembered, setRemembered] = useState(() => readLocal(rememberKey(user.uid)) === 'ja')

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

  const locked = !loading && pin !== null && !unlocked && !remembered && !freshSignIn

  const unlock = useCallback(
    async (eingabe: string, remember = false) => {
      const passt = await verifyPin(eingabe, pin)
      if (!passt) return false

      setUnlocked(true)
      if (remember) {
        setRemembered(true)
        writeLocal(rememberKey(user.uid), 'ja')
      }
      return true
    },
    [pin, user.uid],
  )

  const lock = useCallback(() => {
    setUnlocked(false)
  }, [])

  const forgetOnThisDevice = useCallback(() => {
    setRemembered(false)
    setUnlocked(false)
    removeLocal(rememberKey(user.uid))
  }, [user.uid])

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
    // Ohne PIN gibt es nichts zu merken. Bliebe der Vermerk liegen, stünde der
    // Elternbereich nach einer neu gesetzten PIN auf diesem Gerät weiter offen.
    setRemembered(false)
    removeLocal(rememberKey(user.uid))
  }, [speichern, user.uid])

  const value = useMemo(
    () => ({
      loading,
      hasPin: pin !== null,
      locked,
      unlock,
      lock,
      remembered: remembered && pin !== null,
      forgetOnThisDevice,
      setPin,
      removePin,
    }),
    [loading, pin, locked, unlock, lock, remembered, forgetOnThisDevice, setPin, removePin],
  )

  return <ParentsContext value={value}>{children}</ParentsContext>
}
