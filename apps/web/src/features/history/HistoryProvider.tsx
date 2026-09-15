import { type ReactNode, useCallback, useEffect, useMemo, useRef } from 'react'
import { doc, increment, setDoc } from 'firebase/firestore'

import { useUser } from '@/features/auth/authContext'
import { type Book } from '@/features/library/catalog'
import { useProfiles } from '@/features/profiles/profilesContext'
import { readFirebaseConfig } from '@/lib/env'
import { getFirebase } from '@/lib/firebase'

import { HistoryContext } from './historyContext'
import { historyId } from './history'

export const HISTORY_COLLECTION = 'listening'

/** Abstand, in dem gehörte Sekunden hinausgehen. */
const FLUSH_MS = 60_000

/**
 * Zweimal derselbe Start innerhalb dieser Zeit ist keiner.
 *
 * React ruft Effekte im Entwicklungsmodus doppelt auf, und ein Wechsel zurück
 * auf die Player-Seite hängt am selben Buch – ohne die Sperre stünde in der
 * Historie das Doppelte.
 */
const SAME_START_MS = 30_000

interface Offen {
  seconds: number
  book: Book
}

/**
 * Schreibt die Hörhistorie nach Firestore.
 *
 * Gezählt wird mit `increment`: Zwei Geräte, die gleichzeitig hören, addieren
 * sich dann richtig, statt sich gegenseitig zu überschreiben. Gesammelt wird
 * eine Minute lang – ein Schreibvorgang alle fünf Sekunden wäre für eine Zahl,
 * die niemand in Echtzeit ansieht, verschwendet.
 */
export function HistoryProvider({ children }: { children: ReactNode }) {
  const user = useUser()
  const { selected } = useProfiles()
  const config = useMemo(() => readFirebaseConfig(), [])
  const db = useMemo(() => (config.ok ? getFirebase(config.config).db : null), [config])

  const profile = selected
  const offen = useRef(new Map<string, Offen>())
  const letzterStart = useRef(new Map<string, number>())

  const schreiben = useCallback(
    (book: Book, plays: number, seconds: number) => {
      if (!db || !profile) return
      const id = historyId(user.uid, profile.id, book.id)

      void setDoc(
        doc(db, HISTORY_COLLECTION, id),
        {
          uid: user.uid,
          profileId: profile.id,
          profileName: profile.name,
          bookId: book.id,
          bookTitle: book.title,
          plays: increment(plays),
          secondsListened: increment(Math.round(seconds)),
          lastPlayedAt: new Date().toISOString(),
        },
        { merge: true },
      ).catch(() => {
        // Die Historie ist eine Nebensache: Sie darf fehlen, ohne dass jemand
        // etwas davon merkt. Nur hören muss funktionieren.
      })
    },
    [db, user.uid, profile],
  )

  const flush = useCallback(() => {
    const anstehend = [...offen.current.values()]
    offen.current.clear()
    for (const eintrag of anstehend) {
      if (eintrag.seconds >= 1) schreiben(eintrag.book, 0, eintrag.seconds)
    }
  }, [schreiben])

  useEffect(() => {
    const timer = setInterval(flush, FLUSH_MS)
    const onHide = (): void => {
      flush()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide)
      flush()
    }
  }, [flush])

  const value = useMemo(
    () => ({
      started: (book: Book) => {
        const jetzt = Date.now()
        const zuletzt = letzterStart.current.get(book.id) ?? 0
        if (jetzt - zuletzt < SAME_START_MS) return
        letzterStart.current.set(book.id, jetzt)
        schreiben(book, 1, 0)
      },
      listened: (book: Book, seconds: number) => {
        if (seconds <= 0) return
        const eintrag = offen.current.get(book.id)
        offen.current.set(book.id, {
          book,
          seconds: (eintrag?.seconds ?? 0) + seconds,
        })
      },
    }),
    [schreiben],
  )

  return <HistoryContext value={value}>{children}</HistoryContext>
}
