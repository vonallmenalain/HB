import { SignJWT, jwtVerify } from 'jose'

/**
 * Media-Tickets.
 *
 * Ein `<audio src="…">` kann keine eigenen Header setzen, und die Background
 * Fetch API lädt ebenfalls schlicht eine URL. Die Berechtigung muss deshalb in
 * die URL – als kurzlebiges, kompaktes Token, das ausser der Firebase-UID
 * nichts enthält. Das lange Firebase-ID-Token selbst gehört dort nicht hin.
 */
const ALGORITHM = 'HS256'
const ISSUER = 'hb-media'
const AUDIENCE = 'hb-app'

/** Kürzere Geheimnisse sind für HS256 zu schwach. */
export const MIN_SECRET_LENGTH = 32

export function ticketKey(secret: string): Uint8Array {
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `HB_TICKET_SECRET muss mindestens ${MIN_SECRET_LENGTH} Zeichen haben (hat ${secret.length}).`,
    )
  }
  return new TextEncoder().encode(secret)
}

export interface IssuedTicket {
  ticket: string
  /** ISO-Zeitstempel, damit die App rechtzeitig ein neues holen kann. */
  expiresAt: string
}

export async function issueTicket(
  secret: string,
  uid: string,
  ttlSeconds: number,
): Promise<IssuedTicket> {
  const key = ticketKey(secret)
  const now = Math.floor(Date.now() / 1000)
  const exp = now + ttlSeconds

  const ticket = await new SignJWT({})
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(uid)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(key)

  return { ticket, expiresAt: new Date(exp * 1000).toISOString() }
}

/** Liefert die UID oder `null` – Ticketprüfung wirft bewusst nicht. */
export async function verifyTicket(secret: string, ticket: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(ticket, ticketKey(secret), {
      algorithms: [ALGORITHM],
      issuer: ISSUER,
      audience: AUDIENCE,
    })
    const uid = payload.sub
    return typeof uid === 'string' && uid !== '' ? uid : null
  } catch {
    return null
  }
}
