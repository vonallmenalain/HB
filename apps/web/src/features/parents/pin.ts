/**
 * Die Eltern-PIN.
 *
 * **Was sie ist und was nicht:** Sie hält ein Kind davon ab, versehentlich
 * oder neugierig in den Elternbereich zu geraten. Sie ist *keine*
 * Sicherheitsgrenze. Wer das Gerät in der Hand hat, ist ohnehin angemeldet;
 * und vier Ziffern sind zehntausend Möglichkeiten, die jeder Rechner in
 * Sekunden durchprobiert.
 *
 * Gespeichert wird sie trotzdem nicht im Klartext, und abgeleitet wird mit
 * PBKDF2 statt mit einem einfachen Hash: Das kostet nichts und macht aus dem
 * Durchprobieren wenigstens Arbeit. Versprochen wird damit nichts, was nicht
 * eingehalten werden kann.
 */
export const PIN_LENGTH = 4
const ITERATIONS = 100_000
const KEY_BITS = 256

export interface StoredPin {
  salt: string
  hash: string
}

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${String(PIN_LENGTH)}}$`).test(pin)
}

/**
 * Warum diese PIN nicht taugt – oder `null`, wenn sie in Ordnung ist.
 *
 * „1234" und „0000" sind die ersten beiden Versuche eines jeden Kindes, das
 * überhaupt auf die Idee kommt.
 */
export function checkPin(pin: string): string | null {
  if (!isValidPin(pin)) return `Die PIN besteht aus ${String(PIN_LENGTH)} Ziffern.`
  if (new Set(pin).size === 1) return 'Bitte nicht vier gleiche Ziffern.'
  if (pin === '1234' || pin === '4321') return 'Diese PIN errät auch ein Kind.'
  return null
}

export function randomSalt(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return toHex(bytes)
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromHex(salt), iterations: ITERATIONS, hash: 'SHA-256' },
    key,
    KEY_BITS,
  )
  return toHex(new Uint8Array(bits))
}

export async function makeStoredPin(pin: string): Promise<StoredPin> {
  const salt = randomSalt()
  return { salt, hash: await hashPin(pin, salt) }
}

/**
 * Stimmt die eingegebene PIN?
 *
 * Verglichen wird in gleichbleibender Zeit. Gegen einen Angreifer nützt das
 * hier wenig – gegen die Gewohnheit, Vergleiche nachlässig zu schreiben, schon.
 */
export async function verifyPin(pin: string, stored: StoredPin | null): Promise<boolean> {
  if (stored === null || !isValidPin(pin)) return false
  return equalsInConstantTime(await hashPin(pin, stored.salt), stored.hash)
}

/** Liest, was in Firestore steht – dort kann alles Mögliche stehen. */
export function parseStoredPin(data: unknown): StoredPin | null {
  if (typeof data !== 'object' || data === null) return null
  const record = data as Record<string, unknown>
  const salt = typeof record.pinSalt === 'string' ? record.pinSalt : ''
  const hash = typeof record.pinHash === 'string' ? record.pinHash : ''
  if (salt === '' || hash === '') return null
  return { salt, hash }
}

function equalsInConstantTime(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2))
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}
