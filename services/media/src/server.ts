import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'

import cors from '@fastify/cors'
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'

import { type FirebaseUser, isUidAllowed } from './auth/firebaseToken.js'
import { issueTicket, verifyTicket } from './auth/ticket.js'
import type { CatalogStore } from './catalogStore.js'
import type { Config } from './config.js'
import { contentRange, parseRange, unsatisfiedContentRange } from './media/range.js'

export interface ServerOptions {
  config: Config
  store: CatalogStore
  /** Prüft ein Firebase-ID-Token. Im Test einsetzbar. */
  verifyIdToken: (token: string) => Promise<FirebaseUser>
  logger?: boolean
}

interface TicketQuery {
  t?: string
}

/** Grenze für ein hochgeladenes Cover: grosszügig, aber kein Videoupload. */
const MAX_COVER_BYTES = 12 * 1024 * 1024

export function buildServer(options: ServerOptions): FastifyInstance {
  const { config, store, verifyIdToken } = options
  const app = Fastify({ logger: options.logger ?? false })

  void app.register(cors, {
    origin: config.allowedOrigins,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    // Der Katalog wird per ETag revalidiert; ohne diese Freigabe sieht der
    // Browser den Header bei einer Cross-Origin-Antwort nicht.
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'ETag'],
    maxAge: 600,
  })

  /**
   * Hochgeladene Cover kommen als Rohdaten, nicht als Formular.
   *
   * Ein `multipart`-Parser wäre eine Abhängigkeit mehr für genau einen Zweck;
   * der Browser kann ein `File`-Objekt direkt als Body schicken. Die Grenze
   * liegt bewusst über dem, was ein Handyfoto wiegt – verkleinert wird danach
   * ohnehin auf 600 Pixel.
   */
  app.addContentTypeParser(
    ['image/jpeg', 'image/png', 'image/webp', 'application/octet-stream'],
    { parseAs: 'buffer', bodyLimit: MAX_COVER_BYTES },
    (_request, body, done) => {
      done(null, body)
    },
  )

  /**
   * Holt die UID aus dem Ticket in der Adresszeile.
   *
   * Antwortet selbst mit 401 und liefert dann `null` – der Aufrufer bricht
   * danach ab.
   */
  async function ticketUid(
    request: FastifyRequest<{ Querystring: TicketQuery }>,
    reply: FastifyReply,
  ): Promise<string | null> {
    const ticket = request.query.t
    if (typeof ticket !== 'string' || ticket === '') {
      await reply.code(401).send({ error: 'ticket_missing' })
      return null
    }
    const uid = await verifyTicket(config.ticketSecret, ticket)
    if (uid === null) {
      await reply.code(401).send({ error: 'ticket_invalid' })
      return null
    }
    return uid
  }

  /**
   * Wie {@link ticketUid}, verlangt aber das Administratorkonto.
   *
   * Ist keines konfiguriert, darf jedes freigeschaltete Konto verwalten – auf
   * einem Familien-NAS ohne Adminliste ist das die einzige Lesart, die nicht
   * alle aussperrt.
   */
  async function adminUid(
    request: FastifyRequest<{ Querystring: TicketQuery }>,
    reply: FastifyReply,
  ): Promise<string | null> {
    const uid = await ticketUid(request, reply)
    if (uid === null) return null
    if (config.adminUids.length > 0 && !config.adminUids.includes(uid)) {
      await reply.code(403).send({ error: 'not_admin' })
      return null
    }
    return uid
  }

  app.get('/health', () => ({
    ok: true,
    // `version` ist die Kennung des Images, `schemaVersion` die Form des
    // Katalogs. Zusammen beantworten sie nach einem Update die einzige Frage,
    // die zählt: Läuft schon der neue Stand?
    version: config.version,
    schemaVersion: store.catalog().schemaVersion,
    books: store.catalog().books.length,
    scannedAt: store.catalog().generatedAt,
    scanning: store.scanning(),
  }))

  app.post('/auth/session', async (request, reply) => {
    const header = request.headers.authorization ?? ''
    const match = /^Bearer\s+(.+)$/i.exec(header.trim())
    if (!match?.[1]) {
      return reply.code(401).send({ error: 'authorization_missing' })
    }

    let user: FirebaseUser
    try {
      user = await verifyIdToken(match[1])
    } catch (error) {
      // Der Grund gehört ins Log: Ein blosser 401 lässt offen, ob das Token
      // abgelaufen ist, aus einem fremden Projekt stammt oder der Dienst die
      // Signaturschlüssel gar nicht erst laden konnte.
      request.log.warn(
        { reason: error instanceof Error ? error.message : String(error) },
        'Token-Prüfung fehlgeschlagen',
      )
      return reply.code(401).send({ error: 'token_invalid' })
    }

    if (!isUidAllowed(user.uid, config.allowedUids)) {
      // Bewusst 403 und nicht 401: Das Token ist gültig, das Konto nur nicht
      // freigeschaltet. Ein neues Token hilft nicht.
      return reply.code(403).send({ error: 'uid_not_allowed', uid: user.uid })
    }

    const issued = await issueTicket(config.ticketSecret, user.uid, config.ticketTtlSeconds)
    return reply.send(issued)
  })

  app.get<{ Querystring: TicketQuery }>('/library', async (request, reply) => {
    if ((await ticketUid(request, reply)) === null) return reply

    const etag = store.etag()
    if (request.headers['if-none-match'] === etag) {
      return reply.code(304).send()
    }

    return reply
      .header('ETag', etag)
      .header('Cache-Control', 'no-cache')
      .send(store.catalog())
  })

  app.get<{ Params: { file: string }; Querystring: TicketQuery }>(
    '/cover/:file',
    async (request, reply) => {
      if ((await ticketUid(request, reply)) === null) return reply

      // Nur die ID aus dem Dateinamen nehmen und im Katalog nachschlagen –
      // ein Pfad aus der URL wird nirgends verwendet.
      const bookId = request.params.file.replace(/\.jpg$/i, '')
      const coverPath = await store.coverFile(bookId)
      if (coverPath === null) {
        return reply.code(404).send({ error: 'cover_not_found' })
      }

      return reply
        .header('Content-Type', 'image/jpeg')
        .header('Cache-Control', 'public, max-age=31536000, immutable')
        .send(createReadStream(coverPath))
    },
  )

  app.get<{ Params: { bookId: string; fileIdx: string }; Querystring: TicketQuery }>(
    '/audio/:bookId/:fileIdx',
    async (request, reply) => {
      const uid = await ticketUid(request, reply)
      if (uid === null) return reply

      const location = store.location(request.params.bookId)
      const index = Number(request.params.fileIdx)
      const path =
        location && Number.isInteger(index) ? location.filePaths[index] : undefined
      const file = store.book(request.params.bookId)?.files[index]

      if (path === undefined || file === undefined) {
        return reply.code(404).send({ error: 'audio_not_found' })
      }

      let size: number
      try {
        size = (await stat(path)).size
      } catch {
        // Datei ist seit dem Scan verschwunden.
        return reply.code(404).send({ error: 'audio_gone' })
      }

      const range = parseRange(request.headers.range, size)

      // `Accept-Ranges` gehört auf jede Antwort, auch auf die Fehlerfälle.
      // Der Audio-Content-Type dagegen erst dort, wo wirklich Audio rausgeht –
      // sonst versucht Fastify, den JSON-Fehlerkörper als audio/... zu
      // serialisieren, und antwortet mit 500 statt mit 416.
      void reply.header('Accept-Ranges', 'bytes')

      if (range.kind === 'unsatisfiable') {
        return reply
          .code(416)
          .header('Content-Range', unsatisfiedContentRange(size))
          .send({ error: 'range_not_satisfiable' })
      }

      void reply
        .header('Content-Type', file.mime)
        .header('Cache-Control', 'private, max-age=86400')

      if (range.kind === 'full') {
        request.log.info({ uid, bookId: request.params.bookId, index }, 'audio')
        return reply.header('Content-Length', size).send(createReadStream(path))
      }

      const { start, end } = range
      request.log.info({ uid, bookId: request.params.bookId, index, start, end }, 'audio range')
      return reply
        .code(206)
        .header('Content-Range', contentRange(start, end, size))
        .header('Content-Length', end - start + 1)
        .send(createReadStream(path, { start, end }))
    },
  )

  app.post<{ Querystring: TicketQuery }>('/admin/rescan', async (request, reply) => {
    if ((await adminUid(request, reply)) === null) return reply

    if (store.scanning()) {
      return reply.code(409).send({ error: 'scan_running' })
    }

    void store.rescan().catch((error: unknown) => {
      request.log.error({ error }, 'Scan fehlgeschlagen')
    })
    return reply.code(202).send({ started: true })
  })

  app.get<{ Querystring: TicketQuery }>('/admin/struktur', async (request, reply) => {
    if ((await adminUid(request, reply)) === null) return reply
    return reply.send({ folders: await store.folders() })
  })

  /**
   * Einen Ordner umstellen: ein Hörbuch oder eines je Datei.
   *
   * Danach läuft ein Scan, denn die Kennungen hängen am Pfad – ohne ihn zeigte
   * die App weiter Bücher, die es so nicht mehr gibt. Der Aufrufer sieht am
   * `scanning` in `/health`, wann er fertig ist.
   */
  app.post<{ Querystring: TicketQuery; Body: { ordner?: unknown; modus?: unknown } }>(
    '/admin/struktur',
    async (request, reply) => {
      if ((await adminUid(request, reply)) === null) return reply

      const { ordner, modus } = request.body
      if (typeof ordner !== 'string' || ordner === '') {
        return reply.code(400).send({ error: 'folder_missing' })
      }
      if (modus !== 'einzelfolgen' && modus !== 'einBuch' && modus !== null) {
        return reply.code(400).send({ error: 'mode_invalid' })
      }
      if (store.scanning()) {
        return reply.code(409).send({ error: 'scan_running' })
      }

      await store.setFolderMode(ordner, modus)
      request.log.info({ ordner, modus }, 'Ordner umgestellt')
      void store.rescan().catch((error: unknown) => {
        request.log.error({ error }, 'Scan nach dem Umstellen fehlgeschlagen')
      })
      return reply.code(202).send({ ordner, modus })
    },
  )

  /**
   * Ein Cover von Hand setzen.
   *
   * Es landet im Cache-Volume des Dienstes, nicht im Hörbuch-Ordner: Der ist
   * nur lesend eingebunden, und das soll er bleiben. Ein Scan überschreibt es
   * nicht – er sieht es und benutzt es weiter.
   */
  app.post<{ Params: { bookId: string }; Querystring: TicketQuery }>(
    '/admin/cover/:bookId',
    { bodyLimit: MAX_COVER_BYTES },
    async (request, reply) => {
      if ((await adminUid(request, reply)) === null) return reply

      const image = request.body
      if (!Buffer.isBuffer(image) || image.length === 0) {
        return reply.code(400).send({ error: 'image_missing' })
      }
      if (store.book(request.params.bookId) === undefined) {
        return reply.code(404).send({ error: 'book_not_found' })
      }

      const cover = await store.setManualCover(request.params.bookId, image)
      if (cover === null) return reply.code(415).send({ error: 'image_unreadable' })

      request.log.info({ bookId: request.params.bookId }, 'Cover gesetzt')
      return reply.send({ cover })
    },
  )

  app.delete<{ Params: { bookId: string }; Querystring: TicketQuery }>(
    '/admin/cover/:bookId',
    async (request, reply) => {
      if ((await adminUid(request, reply)) === null) return reply
      if (store.book(request.params.bookId) === undefined) {
        return reply.code(404).send({ error: 'book_not_found' })
      }

      await store.clearManualCover(request.params.bookId)
      return reply.send({ cover: store.book(request.params.bookId)?.cover ?? null })
    },
  )

  return app
}
