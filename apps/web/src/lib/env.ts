/**
 * Zugriff auf die Build-Zeit-Konfiguration.
 *
 * Die Firebase-Web-Konfiguration ist per Design öffentlich – sie landet ohnehin
 * im ausgelieferten Bundle. Sie steht trotzdem in Umgebungsvariablen und nicht
 * im Quelltext, damit das Repository keine projektspezifische
 * Deployment-Konfiguration enthält und ein zweites Firebase-Projekt ohne
 * Code-Änderung möglich bleibt.
 */
export interface FirebaseConfig {
  apiKey: string
  authDomain: string
  projectId: string
  appId: string
}

const FIREBASE_VARS = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  appId: 'VITE_FIREBASE_APP_ID',
} as const

export type ConfigResult =
  | { ok: true; config: FirebaseConfig }
  | { ok: false; missing: string[] }

/**
 * Liest die Firebase-Konfiguration und meldet fehlende Variablen namentlich,
 * statt die App mit einem unverständlichen Firebase-Fehler abstürzen zu lassen.
 */
export function readFirebaseConfig(env: Record<string, unknown> = import.meta.env): ConfigResult {
  const config: Partial<Record<keyof FirebaseConfig, string>> = {}
  const missing: string[] = []

  for (const [key, variable] of Object.entries(FIREBASE_VARS) as [
    keyof FirebaseConfig,
    string,
  ][]) {
    const value = env[variable]
    if (typeof value === 'string' && value.trim() !== '') {
      config[key] = value.trim()
    } else {
      missing.push(variable)
    }
  }

  if (missing.length > 0) return { ok: false, missing }
  return { ok: true, config: config as FirebaseConfig }
}

/**
 * Die E-Mail-Adresse des Administrators.
 *
 * Steht bewusst in einer Umgebungsvariablen und nicht im Quelltext: Das
 * Repository ist öffentlich, und eine private Adresse gehört dort nicht hinein
 * (KONZEPT §9.3). Dieselbe Adresse setzt der Regel-Workflow beim Deployen in
 * `firestore.rules` ein – dort wird sie durchgesetzt, hier entscheidet sie nur,
 * wer den Adminbereich zu sehen bekommt.
 */
export function readAdminEmail(env: Record<string, unknown> = import.meta.env): string | null {
  const value = env.VITE_ADMIN_EMAIL
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim().toLowerCase()
}

/** Vergleicht zwei Adressen so, wie Firebase es tut: ohne Rücksicht auf Gross-/Kleinschreibung. */
export function isAdminEmail(email: string | null, adminEmail: string | null): boolean {
  if (email === null || adminEmail === null) return false
  return email.trim().toLowerCase() === adminEmail
}

/** Basis-URL des Medien-Dienstes auf dem NAS. Erst ab M3 in Gebrauch. */
export function readMediaBaseUrl(
  env: Record<string, unknown> = import.meta.env,
): string | null {
  const value = env.VITE_MEDIA_BASE_URL
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim().replace(/\/+$/, '')
}
