import { type FirebaseApp, initializeApp } from 'firebase/app'
import {
  type Auth,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  initializeAuth,
} from 'firebase/auth'
import {
  type Firestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'

import { type FirebaseConfig } from './env'

interface FirebaseServices {
  app: FirebaseApp
  auth: Auth
  db: Firestore
}

let services: FirebaseServices | undefined

/**
 * Initialisiert Firebase beim ersten Zugriff.
 *
 * Bewusst träge: Fehlt die Konfiguration, soll die App einen verständlichen
 * Hinweis zeigen können, statt beim Import abzustürzen.
 */
export function getFirebase(config: FirebaseConfig): FirebaseServices {
  if (services) return services

  const app = initializeApp(config)

  // `browserLocalPersistence` ist der Kern des Konzepts: einmal anmelden, dann
  // nie wieder. Ein Kind kann keine E-Mail-Adresse eintippen.
  // `popupRedirectResolver` muss bei `initializeAuth` mitgegeben werden –
  // ohne ihn scheitert die Google-Anmeldung per Popup.
  const auth = initializeAuth(app, {
    persistence: browserLocalPersistence,
    popupRedirectResolver: browserPopupRedirectResolver,
  })

  // Firestore mit dauerhaftem lokalem Cache: Fortschritt wird offline
  // geschrieben und synchronisiert sich von selbst, sobald wieder Netz da ist.
  // Kein eigener Sync-Code nötig.
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  })

  services = { app, auth, db }
  return services
}
