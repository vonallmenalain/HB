import { MIN_SECRET_LENGTH } from './auth/ticket.js'

export interface Config {
  host: string
  port: number
  /** Gemounteter Hörbuch-Ordner, nur lesend. */
  mediaRoot: string
  /** Eigenes Volume für Katalog, Metadaten und aufbereitete Cover. */
  cacheDir: string
  firebaseProjectId: string
  ticketSecret: string
  ticketTtlSeconds: number
  allowedOrigins: string[]
  /** Leer = jeder verifizierte Nutzer des Firebase-Projekts. */
  allowedUids: string[]
  adminUids: string[]
  /** Beim Start einmal einlesen. */
  scanOnStart: boolean
  /** Abstand wiederholter Scans in Minuten; 0 schaltet sie ab. */
  rescanIntervalMinutes: number
}

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
}

function positiveInt(value: string | undefined, fallback: number): number | null {
  if (value === undefined || value.trim() === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) return null
  return parsed
}

export class ConfigError extends Error {
  readonly problems: string[]

  constructor(problems: string[]) {
    super(`Konfiguration unvollständig:\n  - ${problems.join('\n  - ')}`)
    this.name = 'ConfigError'
    this.problems = problems
  }
}

/**
 * Liest die Konfiguration aus den Umgebungsvariablen.
 *
 * Meldet **alle** Probleme auf einmal statt beim ersten aufzuhören – wer den
 * Container auf dem NAS einrichtet, will nicht fünfmal neu starten, um fünf
 * fehlende Variablen zu finden.
 */
export function readConfig(env: Record<string, string | undefined>): Config {
  const problems: string[] = []

  const mediaRoot = env.HB_MEDIA_ROOT?.trim() ?? ''
  if (mediaRoot === '') problems.push('HB_MEDIA_ROOT fehlt (Pfad zum Hörbuch-Ordner)')

  const firebaseProjectId = env.HB_FIREBASE_PROJECT_ID?.trim() ?? ''
  if (firebaseProjectId === '') {
    problems.push('HB_FIREBASE_PROJECT_ID fehlt (Projekt-ID aus der Firebase-Konsole)')
  }

  const ticketSecret = env.HB_TICKET_SECRET ?? ''
  if (ticketSecret.length < MIN_SECRET_LENGTH) {
    problems.push(
      `HB_TICKET_SECRET braucht mindestens ${MIN_SECRET_LENGTH} Zeichen ` +
        `(hat ${ticketSecret.length}) – z. B. aus "openssl rand -base64 48"`,
    )
  }

  const allowedOrigins = list(env.HB_ALLOWED_ORIGINS)
  if (allowedOrigins.length === 0) {
    problems.push('HB_ALLOWED_ORIGINS fehlt (Adresse der App, z. B. https://hb.example.com)')
  }

  const port = positiveInt(env.HB_PORT, 8080)
  if (port === null) problems.push('HB_PORT muss eine positive ganze Zahl sein')

  const ticketTtlSeconds = positiveInt(env.HB_TICKET_TTL_SECONDS, 8 * 3600)
  if (ticketTtlSeconds === null) {
    problems.push('HB_TICKET_TTL_SECONDS muss eine positive ganze Zahl sein')
  }

  // 0 ist hier ausdrücklich erlaubt und heisst „keine wiederholten Scans“.
  const rawInterval = env.HB_RESCAN_INTERVAL_MINUTES?.trim() ?? ''
  const rescanIntervalMinutes = rawInterval === '' ? 360 : Number(rawInterval)
  if (!Number.isInteger(rescanIntervalMinutes) || rescanIntervalMinutes < 0) {
    problems.push('HB_RESCAN_INTERVAL_MINUTES muss 0 oder eine positive ganze Zahl sein')
  }

  if (problems.length > 0) throw new ConfigError(problems)

  return {
    host: env.HB_HOST?.trim() ?? '0.0.0.0',
    port: port ?? 8080,
    mediaRoot,
    cacheDir: env.HB_CACHE_DIR?.trim() ?? '/cache',
    firebaseProjectId,
    ticketSecret,
    ticketTtlSeconds: ticketTtlSeconds ?? 8 * 3600,
    allowedOrigins,
    allowedUids: list(env.HB_ALLOWED_UIDS),
    adminUids: list(env.HB_ADMIN_UIDS),
    scanOnStart: env.HB_SCAN_ON_START !== 'false',
    rescanIntervalMinutes,
  }
}
