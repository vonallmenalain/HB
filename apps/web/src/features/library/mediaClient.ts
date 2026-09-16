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
  /**
   * Konto, für das der Dienst das Ticket ausgestellt hat.
   *
   * Ohne diese Angabe überlebt ein Ticket den Kontowechsel: Es liegt acht
   * Stunden im Browser, der Dienst liest die UID aus dem Ticket – und wer sich
   * danach anmeldet, erbt die Rechte des vorherigen Kontos.
   */
  uid: string
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
  /**
   * Zeitpunkt des Katalogs, den der Dienst gerade ausliefert.
   *
   * Der einzige Beleg dafür, dass ein Scan wirklich durchgelaufen ist: Ein
   * gescheiterter lässt den bisherigen Katalog stehen – und damit auch diesen
   * Zeitpunkt. `null`, wenn ein älterer Dienst ihn nicht mitschickt.
   */
  scannedAt: string | null
}

/** Wie ein Ordner gelesen wird, wenn der Adminbereich es vorgibt. */
export type FolderMode = 'einzelfolgen' | 'einBuch'

/** Ein Ordner auf dem NAS, wie ihn der Adminbereich zur Wahl stellt. */
export interface MediaFolder {
  /** Pfad relativ zum Hörbuch-Ordner. */
  path: string
  books: number
  files: number
  /** Ein paar Titel daraus, zum Wiedererkennen. */
  titles: string[]
  /** Was eingestellt ist; null heisst „wie es auf dem NAS steht". */
  mode: FolderMode | null
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
  /** Die Ordner, die sich umstellen lassen. Nur fürs Administratorkonto. */
  fetchFolders: () => Promise<MediaFolder[]>
  /**
   * Stellt einen Ordner um: ein Hörbuch oder eines je Datei.
   *
   * Der Dienst liest danach neu ein – wie beim Suchen nach neuen Hörbüchern
   * kommt die Antwort sofort, der Scan läuft weiter.
   */
  setFolderMode: (folder: string, mode: FolderMode | null) => Promise<void>
  /** Die Bücher, für die ein Bild hochgeladen wurde. */
  fetchManualCovers: () => Promise<string[]>
  /** Legt ein Cover von Hand fest. Liefert die neue Adresse. */
  uploadCover: (bookId: string, image: Blob) => Promise<string>
  /** Nimmt es wieder weg; danach gilt wieder, was auf dem NAS liegt. */
  removeCover: (bookId: string) => Promise<void>
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
    if (
      typeof parsed.ticket !== 'string' ||
      typeof parsed.expiresAt !== 'number' ||
      // Ältere Stände kannten die UID noch nicht. Dann lieber ein neues Ticket
      // holen als eines benutzen, dessen Konto niemand kennt.
      typeof parsed.uid !== 'string'
    ) {
      return null
    }
    return { ticket: parsed.ticket, expiresAt: parsed.expiresAt, uid: parsed.uid }
  } catch {
    return null
  }
}

export function createMediaClient(options: {
  baseUrl: string
  getIdToken: () => Promise<string | null>
  /** UID des angemeldeten Kontos, oder null. Bindet das Ticket an dieses Konto. */
  accountId: () => string | null
  fetchImpl?: typeof fetch
  now?: () => number
}): MediaClient {
  const { baseUrl, getIdToken, accountId } = options
  const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  const now = options.now ?? Date.now

  let stored: StoredTicket | null = readStoredTicket()
  let inFlight: Promise<string> | null = null

  /**
   * Das gespeicherte Ticket, sofern es dem angemeldeten Konto gehört.
   *
   * Ein fremdes Ticket ist hier kein „fast gültiges" – es ist keines. Nach
   * einer Abmeldung gehört es niemandem mehr.
   */
  function ownTicket(): StoredTicket | null {
    const uid = accountId()
    return stored !== null && uid !== null && stored.uid === uid ? stored : null
  }

  function isFresh(ticket: StoredTicket | null): ticket is StoredTicket {
    return ticket !== null && ticket.expiresAt - now() > REFRESH_MARGIN_MS
  }

  function forgetTicket(): void {
    stored = null
    removeLocal(TICKET_KEY)
  }

  async function requestTicket(): Promise<string> {
    const uid = accountId()
    const idToken = await getIdToken()
    if (idToken === null || uid === null) throw new MediaRequestError('not-signed-in')

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

    stored = { ticket: body.ticket, expiresAt: Date.parse(body.expiresAt), uid }
    writeLocal(TICKET_KEY, JSON.stringify(stored))
    return stored.ticket
  }

  async function ensureTicket(): Promise<string> {
    const eigenes = ownTicket()
    if (isFresh(eigenes)) return eigenes.ticket
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

  /** Gemeinsame Fehlerlesart der Admin-Aufrufe. */
  function adminError(response: Response): MediaRequestError | null {
    if (response.ok) return null
    if (response.status === 403) return new MediaRequestError('forbidden')
    if (response.status === 401) return new MediaRequestError('unauthorized')
    return new MediaRequestError('server')
  }

  async function adminCall(
    path: string,
    init: RequestInit & { body?: BodyInit },
  ): Promise<Response> {
    let response: Response
    try {
      response = await withFreshTicket((ticket) => doFetch(withTicket(path, ticket), init))
    } catch (error) {
      if (error instanceof MediaRequestError) throw error
      throw new MediaRequestError('offline')
    }
    const fehler = adminError(response)
    if (fehler !== null) throw fehler
    return response
  }

  async function fetchFolders(): Promise<MediaFolder[]> {
    const response = await adminCall('/admin/struktur', { method: 'GET' })

    let raw: unknown
    try {
      raw = await response.json()
    } catch {
      throw new MediaRequestError('malformed')
    }

    const body = raw as { folders?: unknown }
    if (!Array.isArray(body.folders)) throw new MediaRequestError('malformed')

    // Defensiv wie beim Katalog: Was nicht passt, fliegt raus, statt die ganze
    // Liste unbrauchbar zu machen.
    return body.folders.flatMap((entry): MediaFolder[] => {
      const folder = entry as Partial<Record<keyof MediaFolder, unknown>>
      if (typeof folder.path !== 'string' || typeof folder.files !== 'number') return []
      return [
        {
          path: folder.path,
          books: typeof folder.books === 'number' ? folder.books : 0,
          files: folder.files,
          titles: Array.isArray(folder.titles)
            ? folder.titles.filter((title): title is string => typeof title === 'string')
            : [],
          mode:
            folder.mode === 'einzelfolgen' || folder.mode === 'einBuch' ? folder.mode : null,
        },
      ]
    })
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
    return {
      scanning: body.scanning,
      books: body.books,
      schemaVersion: body.schemaVersion,
      scannedAt: typeof body.scannedAt === 'string' ? body.scannedAt : null,
    }
  }

  return {
    ensureTicket,
    // Auch ein bald ablaufendes Ticket ist brauchbar – der Dienst entscheidet.
    currentTicket: () => ownTicket()?.ticket ?? null,
    fetchCatalog,
    startRescan,
    fetchStatus,
    fetchFolders,
    fetchManualCovers: async () => {
      const response = await adminCall('/admin/cover', { method: 'GET' })

      let raw: unknown
      try {
        raw = await response.json()
      } catch {
        throw new MediaRequestError('malformed')
      }

      const body = raw as { bookIds?: unknown }
      if (!Array.isArray(body.bookIds)) throw new MediaRequestError('malformed')
      return body.bookIds.filter((id): id is string => typeof id === 'string')
    },
    setFolderMode: async (folder, mode) => {
      await adminCall('/admin/struktur', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordner: folder, modus: mode }),
      })
    },
    uploadCover: async (bookId, image) => {
      const response = await adminCall(`/admin/cover/${bookId}`, {
        method: 'POST',
        // Das Bild geht roh hinaus, nicht als Formular: Der Dienst braucht
        // dafür keinen Multipart-Parser.
        headers: { 'Content-Type': image.type === '' ? 'application/octet-stream' : image.type },
        body: image,
      })

      const body = (await response.json()) as { cover?: unknown }
      if (typeof body.cover !== 'string') throw new MediaRequestError('malformed')
      return body.cover
    },
    removeCover: async (bookId) => {
      await adminCall(`/admin/cover/${bookId}`, { method: 'DELETE' })
    },
    coverUrl: (coverPath) => {
      const ticket = ownTicket()?.ticket
      return ticket === undefined ? null : withTicket(coverPath, ticket)
    },
    audioUrl: (bookId, fileIdx) => {
      const ticket = ownTicket()?.ticket
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
