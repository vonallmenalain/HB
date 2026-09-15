import { type JWTPayload, type JWTVerifyGetKey, createRemoteJWKSet, jwtVerify } from 'jose'

/**
 * Prüfung von Firebase-ID-Tokens.
 *
 * Bewusst ohne firebase-admin und ohne Dienstkonto-Schlüssel: Google
 * veröffentlicht die Signaturschlüssel, die Prüfung braucht nur die
 * öffentlichen Daten und die Projekt-ID. Damit liegt auf dem NAS kein einziges
 * Firebase-Geheimnis.
 */
export const GOOGLE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwks/securetoken@system.gserviceaccount.com'

export function googleKeySet(): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL(GOOGLE_JWKS_URL))
}

export interface FirebaseUser {
  uid: string
  email: string | null
}

export class InvalidIdTokenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidIdTokenError'
  }
}

export async function verifyFirebaseIdToken(
  token: string,
  options: { projectId: string; keySet: JWTVerifyGetKey },
): Promise<FirebaseUser> {
  const { projectId, keySet } = options

  let payload: JWTPayload
  try {
    ;({ payload } = await jwtVerify(token, keySet, {
      // Firebase signiert ausschliesslich mit RS256. Andere Verfahren
      // ausdrücklich auszuschliessen verhindert Algorithmus-Verwirrung.
      algorithms: ['RS256'],
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    }))
  } catch (cause) {
    throw new InvalidIdTokenError(
      cause instanceof Error ? cause.message : 'Token konnte nicht geprüft werden',
    )
  }

  const uid = payload.sub
  if (typeof uid !== 'string' || uid === '') {
    throw new InvalidIdTokenError('Token enthält keine Nutzerkennung')
  }

  const email = typeof payload.email === 'string' ? payload.email : null
  return { uid, email }
}

/**
 * Ist diese UID zugelassen?
 *
 * Eine leere Liste bedeutet „jeder verifizierte Nutzer dieses
 * Firebase-Projekts“. Das ist brauchbar, solange die Selbst-Registrierung aus
 * ist – wer die Google-Anmeldung aktiviert hat, sollte die Liste dagegen
 * ausdrücklich füllen.
 */
export function isUidAllowed(uid: string, allowed: readonly string[]): boolean {
  return allowed.length === 0 || allowed.includes(uid)
}
