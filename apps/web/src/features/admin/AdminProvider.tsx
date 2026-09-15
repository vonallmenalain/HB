import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore'

import {
  type AccessRequest,
  type AllowedAccount,
  parseAccessRequest,
  parseAllowedAccount,
  sortRequests,
} from '@/features/auth/accessRequest'
import { useAuth, useUser } from '@/features/auth/authContext'
import { readFirebaseConfig } from '@/lib/env'
import { getFirebase } from '@/lib/firebase'

import { AdminContext } from './adminContext'

export const ALLOWLIST = 'allowlist'
export const ACCESS_REQUESTS = 'accessRequests'

/**
 * Freigaben verwalten.
 *
 * Gelesen wird nur, wenn das angemeldete Konto der Administrator ist – sonst
 * liefen bei jedem Kind zwei Abfragen gegen eine Kollektion, die es nicht lesen
 * darf, und Firestore meldete im Protokoll dauernd „permission denied".
 */
export function AdminProvider({ children }: { children: ReactNode }) {
  const user = useUser()
  const { isAdmin } = useAuth()
  const config = useMemo(() => readFirebaseConfig(), [])
  const db = useMemo(() => (config.ok ? getFirebase(config.config).db : null), [config])

  // Dass ohne Administratorkonto nichts zu laden ist, steht schon beim Rendern
  // fest – dafür braucht es keinen zweiten Durchgang über einen Effekt.
  const aktiv = db !== null && isAdmin
  const [requests, setRequests] = useState<AccessRequest[] | null>(null)
  const [accounts, setAccounts] = useState<AllowedAccount[]>([])
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!db || !isAdmin) return

    const stopRequests = onSnapshot(
      collection(db, ACCESS_REQUESTS),
      (snapshot) => {
        setRequests(
          sortRequests(
            snapshot.docs
              .map((entry) => parseAccessRequest(entry.id, entry.data()))
              .filter((entry): entry is AccessRequest => entry !== null),
          ),
        )
        setError(false)
      },
      () => {
        setRequests([])
        setError(true)
      },
    )

    const stopAccounts = onSnapshot(
      collection(db, ALLOWLIST),
      (snapshot) => {
        setAccounts(snapshot.docs.map((entry) => parseAllowedAccount(entry.id, entry.data())))
      },
      () => {
        setError(true)
      },
    )

    return () => {
      stopRequests()
      stopAccounts()
    }
  }, [db, isAdmin])

  const approve = useCallback(
    async (request: AccessRequest) => {
      if (!db) return
      await setDoc(
        doc(db, ALLOWLIST, request.uid),
        {
          email: request.email ?? '',
          name: request.name ?? '',
          approvedAt: new Date().toISOString(),
          approvedBy: user.uid,
        },
        { merge: true },
      )
      // Die erledigte Anfrage gehört weg, sonst wächst die Liste ewig.
      await deleteDoc(doc(db, ACCESS_REQUESTS, request.uid))
    },
    [db, user.uid],
  )

  const deny = useCallback(
    async (request: AccessRequest) => {
      if (!db) return
      // Abgelehnt, aber nicht gelöscht: Sonst legt das Gerät beim nächsten
      // Start sofort wieder eine neue Anfrage an und die Liste füllt sich von
      // selbst.
      await setDoc(doc(db, ACCESS_REQUESTS, request.uid), { status: 'denied' }, { merge: true })
    },
    [db],
  )

  const revoke = useCallback(
    async (uid: string) => {
      if (!db) return
      await deleteDoc(doc(db, ALLOWLIST, uid))
    },
    [db],
  )

  const value = useMemo(
    () => ({
      loading: aktiv && requests === null,
      requests: aktiv ? (requests ?? []) : [],
      accounts: aktiv ? accounts : [],
      error,
      approve,
      deny,
      revoke,
    }),
    [aktiv, requests, accounts, error, approve, deny, revoke],
  )

  return <AdminContext value={value}>{children}</AdminContext>
}
