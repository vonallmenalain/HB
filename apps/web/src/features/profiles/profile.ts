/** Ein Kinderprofil innerhalb des Familienkontos. */
export interface Profile {
  id: string
  name: string
  avatar: string
  color: string
  /**
   * Downloads sind standardmässig aus und werden von den Eltern pro Kind
   * freigegeben – sonst ist das Tablet nach einem Nachmittag voll.
   */
  allowDownload: boolean
  createdAt: string
}

export const AVATARS = [
  '🦊',
  '🐻',
  '🐰',
  '🦁',
  '🐼',
  '🐸',
  '🐨',
  '🦉',
  '🐧',
  '🦄',
  '🐙',
  '🐢',
] as const

export const COLORS = [
  '#6d28d9',
  '#0369a1',
  '#047857',
  '#b45309',
  '#be123c',
  '#7c2d12',
  '#4338ca',
  '#0f766e',
] as const

export const NAME_MAX_LENGTH = 20

/** Fällt auf den ersten Buchstaben zurück, wenn kein Emoji gewählt wurde. */
export function avatarFallback(name: string): string {
  const trimmed = name.trim()
  return trimmed === '' ? '?' : [...trimmed][0]!.toUpperCase()
}

export interface NameCheck {
  ok: boolean
  reason?: string
}

export function checkProfileName(name: string, existing: readonly string[] = []): NameCheck {
  const trimmed = name.trim()
  if (trimmed === '') return { ok: false, reason: 'Bitte gib einen Namen ein.' }
  if ([...trimmed].length > NAME_MAX_LENGTH) {
    return { ok: false, reason: `Höchstens ${NAME_MAX_LENGTH} Zeichen.` }
  }
  const taken = existing.some((other) => other.trim().toLowerCase() === trimmed.toLowerCase())
  if (taken) return { ok: false, reason: 'Diesen Namen gibt es schon.' }
  return { ok: true }
}

/**
 * Liest ein Firestore-Dokument in ein Profil ein.
 *
 * Bewusst misstrauisch: In der Datenbank kann alles Mögliche stehen – aus einer
 * früheren Version, von Hand in der Konsole geändert, oder halb geschrieben.
 * Ein unbrauchbares Dokument darf die Profilliste nicht zum Absturz bringen.
 */
export function parseProfile(id: string, data: unknown): Profile | null {
  if (typeof data !== 'object' || data === null) return null
  const record = data as Record<string, unknown>

  const name = typeof record.name === 'string' ? record.name.trim() : ''
  if (name === '') return null

  const avatar =
    typeof record.avatar === 'string' && record.avatar !== ''
      ? record.avatar
      : avatarFallback(name)

  const color =
    typeof record.color === 'string' && /^#[0-9a-f]{6}$/i.test(record.color)
      ? record.color
      : COLORS[0]

  return {
    id,
    name,
    avatar,
    color,
    allowDownload: record.allowDownload === true,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : '',
  }
}

/** Älteste zuerst, damit die Reihenfolge stabil bleibt. */
export function sortProfiles(profiles: readonly Profile[]): Profile[] {
  return [...profiles].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name, 'de'),
  )
}
