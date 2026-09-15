/**
 * Anfragen auf Zugriff.
 *
 * Bis M8 stand auf dem Sperrbildschirm eine UID zum Abschreiben, die dann von
 * Hand in die Firebase-Konsole gehörte. Das war der einzige Schritt in der
 * ganzen App, der einen Browser auf einem Rechner verlangte. Jetzt legt die App
 * die Anfrage selbst ab, und der Administrator tippt im Adminbereich auf
 * „Freigeben“.
 */
export type AccessStatus = 'pending' | 'denied'

export interface AccessRequest {
  uid: string
  email: string | null
  name: string | null
  /** ISO-8601, Gerätezeit des Anfragenden. */
  requestedAt: string
  status: AccessStatus
}

/** Was die App beim Anmelden über sich selbst ablegt. */
export function toRequestDoc(
  uid: string,
  email: string | null,
  name: string | null,
  now: () => Date = () => new Date(),
): Record<string, string> {
  const doc: Record<string, string> = {
    uid,
    requestedAt: now().toISOString(),
    status: 'pending',
  }
  // Leere Felder gar nicht erst schreiben: Die Regeln lassen nur genau diese
  // Schlüssel zu, und `null` wäre keiner davon.
  if (email !== null && email.trim() !== '') doc.email = email.trim()
  if (name !== null && name.trim() !== '') doc.name = name.trim()
  return doc
}

/** Liest ein Dokument defensiv ein – Inhalt aus fremder Hand. */
export function parseAccessRequest(id: string, data: unknown): AccessRequest | null {
  if (typeof data !== 'object' || data === null) return null
  const record = data as Record<string, unknown>

  const text = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : null

  return {
    uid: id,
    email: text(record.email),
    name: text(record.name),
    requestedAt: text(record.requestedAt) ?? '',
    status: record.status === 'denied' ? 'denied' : 'pending',
  }
}

/** Offene Anfragen zuerst, darin die jüngste oben. */
export function sortRequests(requests: readonly AccessRequest[]): AccessRequest[] {
  return [...requests].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'pending' ? -1 : 1
    return b.requestedAt.localeCompare(a.requestedAt)
  })
}

export interface AllowedAccount {
  uid: string
  email: string | null
  name: string | null
  /** Der Administrator selbst – sein Zugang lässt sich nicht wegnehmen. */
  admin: boolean
  approvedAt: string
}

export function parseAllowedAccount(id: string, data: unknown): AllowedAccount {
  const record = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}
  const text = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : null

  return {
    uid: id,
    email: text(record.email),
    name: text(record.name),
    admin: record.role === 'admin',
    approvedAt: text(record.approvedAt) ?? '',
  }
}
