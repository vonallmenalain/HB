import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type Auth,
  GoogleAuthProvider,
  type User,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'

import { isAdminEmail, readAdminEmail, readFirebaseConfig } from '@/lib/env'
import { getFirebase } from '@/lib/firebase'
import { readLocal, removeLocal, writeLocal } from '@/lib/localStore'

import { AuthContext, type AuthState } from './authContext'
import { toRequestDoc } from './accessRequest'
import { authErrorMessage } from './authErrors'

const EMAIL_FOR_LINK_KEY = 'hb.emailForSignIn'
const accessKey = (uid: string): string => `hb.access.${uid}`

/**
 * Wurde ein Anmeldelink auf einem anderen Gerät geöffnet als dem, das ihn
 * angefordert hat, fehlt die gespeicherte Adresse – Firebase verlangt sie zur
 * Bestätigung. Das steht schon beim ersten Rendern fest und wird deshalb als
 * Anfangszustand abgeleitet, nicht in einem Effekt nachgereicht.
 */
function initialLinkError(auth: Auth | undefined): string | null {
  if (!auth) return null
  if (!isSignInWithEmailLink(auth, window.location.href)) return null
  if (readLocal(EMAIL_FOR_LINK_KEY) !== null) return null
  return 'Öffne den Anmeldelink auf dem Gerät, auf dem du ihn angefordert hast.'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configResult = useMemo(() => readFirebaseConfig(), [])
  const [state, setState] = useState<AuthState>(() =>
    configResult.ok
      ? { status: 'loading' }
      : { status: 'config-missing', missing: configResult.missing },
  )

  const services = useMemo(
    () => (configResult.ok ? getFirebase(configResult.config) : null),
    [configResult],
  )

  const [linkError, setLinkError] = useState<string | null>(() =>
    initialLinkError(services?.auth),
  )

  const adminEmail = useMemo(() => readAdminEmail(), [])

  /**
   * Meldet dem Administrator, dass hier jemand hereinmöchte.
   *
   * Das ersetzt die abgetippte UID: Der Bildschirm sagt „warte kurz", und im
   * Adminbereich steht die Anfrage mit Namen und Adresse. Scheitert das
   * Schreiben – keine Regeln deployt, kein Netz –, sagt der Bildschirm das,
   * statt einen Erfolg vorzutäuschen.
   */
  const requestAccess = useCallback(
    async (user: User): Promise<boolean> => {
      if (!services) return false
      try {
        await setDoc(
          doc(services.db, 'accessRequests', user.uid),
          toRequestDoc(user.uid, user.email, user.displayName),
          { merge: true },
        )
        return true
      } catch {
        return false
      }
    },
    [services],
  )

  /**
   * Prüft die Freigabeliste.
   *
   * Der Schlüssel liegt zusätzlich in localStorage: Beim Start ohne Netz kann
   * sonst nicht entschieden werden, ob das Konto freigeschaltet ist, und die
   * App wäre offline unbenutzbar – obwohl genau dafür heruntergeladen wurde.
   * Das ist nur eine Anzeige-Entscheidung; durchgesetzt wird der Zugriff von
   * den Firestore-Regeln und vom Medien-Dienst auf dem NAS.
   */
  const checkAccess = useCallback(
    async (user: User): Promise<boolean> => {
      if (!services) return false

      const gewaehren = async (): Promise<true> => {
        writeLocal(accessKey(user.uid), 'granted')
        // Das Stammdokument trägt PIN und Einstellungen.
        await setDoc(
          doc(services.db, 'users', user.uid),
          { lastSeenAt: new Date().toISOString() },
          { merge: true },
        )
        return true
      }

      try {
        const snapshot = await getDoc(doc(services.db, 'allowlist', user.uid))
        if (snapshot.exists()) return await gewaehren()

        // Das Administratorkonto trägt sich selbst ein. Sonst bliebe genau das
        // eine Konto, das freischalten darf, selbst ausgesperrt – und man wäre
        // wieder bei der Konsole, die dieser ganze Umbau abschaffen soll.
        if (isAdminEmail(user.email, adminEmail)) {
          await setDoc(
            doc(services.db, 'allowlist', user.uid),
            {
              role: 'admin',
              email: user.email ?? '',
              name: user.displayName ?? '',
              approvedAt: new Date().toISOString(),
            },
            { merge: true },
          )
          return await gewaehren()
        }

        removeLocal(accessKey(user.uid))
        return false
      } catch {
        // Kein Netz und nichts im Cache: der zuletzt bekannte Stand gilt.
        return readLocal(accessKey(user.uid)) === 'granted'
      }
    },
    [services, adminEmail],
  )

  const applyUser = useCallback(
    async (user: User | null): Promise<void> => {
      if (!user) {
        setState({ status: 'signed-out' })
        return
      }

      const ablehnen = async (): Promise<void> => {
        const requested = await requestAccess(user)
        setState({ status: 'denied', user, requested })
      }

      // Bekannte Freigabe sofort anwenden, damit die App offline durchstartet.
      if (readLocal(accessKey(user.uid)) === 'granted') {
        setState({ status: 'ready', user })
        void checkAccess(user).then(async (allowed) => {
          if (!allowed) await ablehnen()
        })
        return
      }

      if (await checkAccess(user)) setState({ status: 'ready', user })
      else await ablehnen()
    },
    [checkAccess, requestAccess],
  )

  // Anmeldelink aus der E-Mail abschliessen, bevor der Zustand gesetzt wird.
  const linkHandled = useRef(false)
  useEffect(() => {
    if (!services || linkHandled.current) return
    linkHandled.current = true

    if (!isSignInWithEmailLink(services.auth, window.location.href)) return

    // Der Fall „Adresse fehlt“ steht bereits im Anfangszustand; hier bleibt
    // nur der eigentliche Anmeldevorgang.
    const email = readLocal(EMAIL_FOR_LINK_KEY)
    if (email === null) return

    void signInWithEmailLink(services.auth, email, window.location.href)
      .then(() => {
        removeLocal(EMAIL_FOR_LINK_KEY)
        // Den Einmal-Code aus der Adresszeile nehmen.
        window.history.replaceState({}, '', window.location.pathname)
      })
      .catch((cause: unknown) => {
        setLinkError(authErrorMessage(cause))
      })
  }, [services])

  useEffect(() => {
    if (!services) return
    return onAuthStateChanged(services.auth, (user) => {
      void applyUser(user)
    })
  }, [services, applyUser])

  const actions = useMemo(
    () => ({
      signInWithPassword: async (email: string, password: string) => {
        if (!services) return
        await signInWithEmailAndPassword(services.auth, email, password)
      },
      signInWithGoogle: async () => {
        if (!services) return
        await signInWithPopup(services.auth, new GoogleAuthProvider())
      },
      sendLoginLink: async (email: string) => {
        if (!services) return
        await sendSignInLinkToEmail(services.auth, email, {
          url: `${window.location.origin}/`,
          handleCodeInApp: true,
        })
        writeLocal(EMAIL_FOR_LINK_KEY, email)
      },
      signOut: async () => {
        if (!services) return
        await firebaseSignOut(services.auth)
      },
      recheckAccess: async () => {
        const user = services?.auth.currentUser
        if (!user) return
        if (await checkAccess(user)) {
          setState({ status: 'ready', user })
          return
        }
        setState({ status: 'denied', user, requested: await requestAccess(user) })
      },
    }),
    [services, checkAccess, requestAccess],
  )

  const isAdmin =
    state.status === 'ready' && isAdminEmail(state.user.email, adminEmail)

  const value = useMemo(
    () => ({
      state,
      isAdmin,
      actions,
      linkError,
      clearLinkError: () => {
        setLinkError(null)
      },
    }),
    [state, isAdmin, actions, linkError],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
