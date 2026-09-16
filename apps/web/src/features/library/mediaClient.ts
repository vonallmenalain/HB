import { readLocal, removeLocal, writeLocal } from '@/lib/localStore'

import { type Catalog, parseCatalog } from './catalog'

/**
 * Zugriff auf den Medien-Dienst auf dem NAS.
 *
 * Der Ablauf in einem Satz: Firebase-ID-Token gegen ein kurzlebiges
 * Media-Ticket tauschen, danach hängt das Ticket an jeder Medien-URL. Es steht
 * in der Adresse und nicht in einem Header, weil weder ein `<audio>`-Element
 * noch die Background Fetch API eigene Header setzen können.
 */
const TICKET_KEY = 'hb.mediaTicket'
/** So lange vor Ablauf wird schon erneuert. */
const REFRESH_MARGIN_MS = 10 * 60 * 1000

interface StoredTicket {
  ticket: string
  expiresAt: number
}

export type CatalogFetch =
  | { status: 'ok'; catalog: Catalog; etag: string | null; skipped: number }
  | { status: 'not-modified' }
  | { status: 'error'; reason: MediaError }

/**
 * `offline` heisst „das NAS war nicht erreichbar“ – die App schaltet dann auf
 * den zwischengespeicherten Katalog um, statt einen Fehler zu zeigen.
 */
export type MediaError =
  | 'not-configured'
  | 'offline'
  | 'not-signed-in'
  | 'unauthorized'
  | 'forbidden'
  | 'unsupported-version'
  | 'malformed'
  | 'server'

/** Was `/health` über den Dienst auf dem NAS sagt. */
export interface NasStatus {
  /** Läuft gerade ein Scan der Ordner? */
  scanning: boolean
  books: number
  schemaVersion: number
}

export interface MediaClient {
  /** Sorgt für ein gültiges Ticket und liefert es zurück. */
  ensureTicket: () => Promise<string>
  /** Das zuletzt geholte Ticket, ohne Netzwerk – für `<audio src>`. */
  currentTicket: () => string | null
  fetchCatalog: (etag: string | null) => Promise<CatalogFetch>
  /**
   * Lässt den Dienst die Ordner neu einlesen.
   *
   * Nicht zu verwechseln mit `fetchCatalog`: Das holt nur, was der Dienst
   * zuletzt gefunden hat. Ein Ordner, der seither aufs NAS kopiert wurde,
   * taucht erst nach diesem Aufruf auf – oder wenn der Dienst von selbst
   * wieder nachsieht, was standardmässig alle sechs Stunden passiert.
   */
  startRescan: () => Promise<'started' | 'already-running'>
  /** Zustand des Dienstes. Braucht kein Ticket – für die Fortschrittsanzeige. */
  fetchStatus: () => Promise<NasStatus>
  coverUrl: (coverPath: string) => string | null
  audioUrl: (bookId: string, fileIdx: number) => string | null
  /**
   * Kanonische Adressen ohne Ticket – die Schlüssel für den Offline-Cache.
   *
   * Das Ticket in der URL wechselt alle paar Stunden. Wäre es Teil des
   * Schlüssels, wäre jeder Download am nächsten Tag wertlos.
   */
  canonicalAudioUrl: (bookId: string, fileIdx: number) => string
  canonicalCoverUrl: (coverPath: string) => string
  forgetTicket: () => void
}

export class MediaRequestError extends Error {
  readonly reason: MediaError
  constructor(reason: MediaError) {
    super(reason)
    this.name = 'MediaRequestError'
    this.reason = reason
  }
}

function readStoredTicket(): StoredTicket | null {
  const raw = readLocal(TICKET_KEY)
  if (raw === null) return null
  try {
    const parsed = JSON.parse(raw) as Partial<StoredTicket>
    if (typeof parsed.ticket !== 'string' || typeof parsed.expiresAt !== 'number') return null
    return { ticket: parsed.ticket, expiresAt: parsed.expiresAt }
  } catch {
    return null
  }
}

export function createMediaClient(options: {
  baseUrl: string
  getIdToken: () => Promise<string | null>
  fetchImpl?: typeof fetch
  now?: () => number
}): MediaClient {
  const { baseUrl, getIdToken } = options
  const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  const now = options.now ?? Date.now

  let stored: StoredTicket | null = readStoredTicket()
  let inFlight: Promise<string> | null = null

  function isFresh(ticket: StoredTicket | null): ticket is StoredTicket {
    return ticket !== null && ticket.expiresAt - now() > REFRESH_MARGIN_MS
  }

  function forgetTicket(): void {
    stored = null
    removeLocal(TICKET_KEY)
  }

  async function requestTicket(): Promise<string> {
    const idToken = await getIdToken()
    if (idToken === null) throw new MediaRequestError('not-signed-in')

    let response: Response
    try {
      response = await doFetch(`${baseUrl}/auth/session`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      })
    } catch {
      throw new MediaRequestError('offline')
    }

    if (response.status === 403) throw new MediaRequestError('forbidden')
    if (!response.ok) throw new MediaRequestError('unauthorized')

    const body = (await response.json()) as { ticket?: unknown; expiresAt?: unknown }
    if (typeof body.ticket !== 'string' || typeof body.expiresAt !== 'string') {
      throw new MediaRequestError('malformed')
    }

    stored = { ticket: body.ticket, expiresAt: Date.parse(body.expiresAt) }
    writeLocal(TICKET_KEY, JSON.stringify(stored))
    return stored.ticket
  }

  async function ensureTicket(): Promise<string> {
    if (isFresh(stored)) return stored.ticket
    // Mehrere gleichzeitige Aufrufe teilen sich eine Anfrage.
    inFlight ??= requestTicket().finally(() => {
      inFlight = null
    })
    return inFlight
  }

  const withTicket = (path: string, ticket: string): string =>
    `${baseUrl}${path}${path.includes('?') ? '&' : '?'}t=${encodeURIComponent(ticket)}`

  async function fetchCatalog(etag: string | null): Promise<CatalogFetch> {
    let ticket: string
    try {
      ticket = await ensureTicket()
    } catch (error) {
      return {
        status: 'error',
        reason: error instanceof MediaRequestError ? error.reason : 'server',
      }
    }

    const headers: Record<string, string> = {}
    if (etag !== null) headers['If-None-Match'] = etag

    let response: Response
    try {
      response = await doFetch(withTicket('/library', ticket), { headers })
    } catch {
      return { status: 'error', reason: 'offline' }
    }

    // Abgelaufenes Ticket: einmal erneuern und wiederholen.
    if (response.status === 401) {
      forgetTicket()
      try {
        const fresh = await ensureTicket()
        response = await doFetch(withTicket('/library', fresh), { headers })
      } catch (error) {
        return {
          status: 'error',
          reason: error instanceof MediaRequestError ? error.reason : 'unauthorized',
        }
      }
    }

    if (response.status === 304) return { status: 'not-modified' }
    if (response.status === 403) return { status: 'error', reason: 'forbidden' }
    if (!response.ok) return { status: 'error', reason: 'server' }

    let raw: unknown
    try {
      raw = await response.json()
    } catch {
      return { status: 'error', reason: 'malformed' }
    }

    const parsed = parseCatalog(raw)
    if (!parsed.ok) {
      return {
        status: 'error',
        reason: parsed.reason === 'unsupported-version' ? 'unsupported-version' : 'malformed',
      }
    }

    return {
      status: 'ok',
      catalog: parsed.catalog,
      etag: response.headers.get('ETag'),
      skipped: parsed.skipped,
    }
  }

  /**
   * Einmal wiederholen, wenn das Ticket abgelaufen war.
   *
   * Dasselbe Muster wie in `fetchCatalog`: Ein 401 heisst hier nicht „nicht
   * erlaubt", sondern „das Ticket ist zu alt" – und dafür gibt es ein neues.
   */
  async function withFreshTicket(call: (ticket: string) => Promise<Response>): Promise<Response> {
    const response = await call(await ensureTicket())
    if (response.status !== 401) return response
    forgetTicket()
    return call(await ensureTicket())
  }

  async function startRescan(): Promise<'started' | 'already-running'> {
    let response: Response
    try {
      response = await withFreshTicket((ticket) =>
        doFetch(withTicket('/admin/rescan', ticket), { method: 'POST' }),
      )
    } catch (error) {
      if (error instanceof MediaRequestError) throw error
      throw new MediaRequestError('offline')
    }

    // Der Dienst liest schon – für den Aufrufer ist das kein Fehler, sondern
    // genau das, was er wollte.
    if (response.status === 409) return 'already-running'
    if (response.status === 403) throw new MediaRequestError('forbidden')
    if (response.status === 401) throw new MediaRequestError('unauthorized')
    if (!response.ok) throw new MediaRequestError('server')
    return 'started'
  }

  async function fetchStatus(): Promise<NasStatus> {
    let response: Response
    try {
      response = await doFetch(`${baseUrl}/health`)
    } catch {
      throw new MediaRequestError('offline')
    }
    if (!response.ok) throw new MediaRequestError('server')

    let raw: unknown
    try {
      raw = await response.json()
    } catch {
      throw new MediaRequestError('malformed')
    }

    const body = raw as Partial<Record<keyof NasStatus, unknown>>
    if (
      typeof body.scanning !== 'boolean' ||
      typeof body.books !== 'number' ||
      typeof body.schemaVersion !== 'number'
    ) {
      throw new MediaRequestError('malformed')
    }
    return { scanning: body.scanning, books: body.books, schemaVersion: body.schemaVersion }
  }

  return {
    ensureTicket,
    // Auch ein bald ablaufendes Ticket ist brauchbar – der Dienst entscheidet.
    currentTicket: () => stored?.ticket ?? null,
    fetchCatalog,
    startRescan,
    fetchStatus,
    coverUrl: (coverPath) => {
      const ticket = stored?.ticket
      return ticket === undefined ? null : withTicket(coverPath, ticket)
    },
    audioUrl: (bookId, fileIdx) => {
      const ticket = stored?.ticket
      return ticket === undefined
        ? null
        : withTicket(`/audio/${bookId}/${String(fileIdx)}`, ticket)
    },
    canonicalAudioUrl: (bookId, fileIdx) => `${baseUrl}/audio/${bookId}/${String(fileIdx)}`,
    // Das `?v=` im Pfad gehört dazu: Es wechselt, wenn sich das Cover ändert –
    // und genau dann soll auch der Cache-Eintrag ein anderer sein.
    canonicalCoverUrl: (coverPath) => `${baseUrl}${coverPath}`,
    forgetTicket,
  }
}
