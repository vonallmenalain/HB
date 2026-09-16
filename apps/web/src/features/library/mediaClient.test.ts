import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createMediaClient } from './mediaClient'

const BASE = 'https://media.example.com'
const NOW = 1_800_000_000_000

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

const catalogBody = {
  schemaVersion: 1,
  generatedAt: '2026-01-01T00:00:00.000Z',
  books: [
    {
      id: 'b_1',
      title: 'Buch',
      files: [{ idx: 0, durationSec: 600, bytes: 100, mime: 'audio/mpeg' }],
    },
  ],
}

function ticketBody(hoursValid = 8): unknown {
  return { ticket: 'TICKET-1', expiresAt: new Date(NOW + hoursValid * 3600_000).toISOString() }
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function makeClient(fetchImpl: typeof fetch, idToken: string | null = 'ID-TOKEN') {
  return createMediaClient({
    baseUrl: BASE,
    getIdToken: () => Promise.resolve(idToken),
    fetchImpl,
    now: () => NOW,
  })
}

describe('Ticket holen', () => {
  it('tauscht das Firebase-Token gegen ein Ticket', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(ticketBody()))
    const client = makeClient(fetchImpl)

    expect(await client.ensureTicket()).toBe('TICKET-1')

    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe(`${BASE}/auth/session`)
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer ID-TOKEN')
  })

  it('holt bei mehreren gleichzeitigen Aufrufen nur einmal', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(ticketBody()))
    const client = makeClient(fetchImpl)

    await Promise.all([client.ensureTicket(), client.ensureTicket(), client.ensureTicket()])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('benutzt ein gespeichertes Ticket weiter', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(ticketBody()))
    await makeClient(fetchImpl).ensureTicket()

    // Ein zweiter Client startet mit dem Ticket aus localStorage.
    const second = makeClient(fetchImpl)
    expect(await second.ensureTicket()).toBe('TICKET-1')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('erneuert ein Ticket, das bald abläuft', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(ticketBody()))
    // Nur noch fünf Minuten gültig – unter der Erneuerungsschwelle.
    window.localStorage.setItem(
      'hb.mediaTicket',
      JSON.stringify({ ticket: 'ALT', expiresAt: NOW + 5 * 60_000 }),
    )

    expect(await makeClient(fetchImpl).ensureTicket()).toBe('TICKET-1')
  })

  it('unterscheidet „nicht freigeschaltet" von „nicht angemeldet"', async () => {
    const forbidden = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ error: 'uid_not_allowed' }, { status: 403 }))
    await expect(makeClient(forbidden).ensureTicket()).rejects.toMatchObject({
      reason: 'forbidden',
    })

    const noToken = vi.fn<typeof fetch>()
    await expect(makeClient(noToken, null).ensureTicket()).rejects.toMatchObject({
      reason: 'not-signed-in',
    })
    expect(noToken).not.toHaveBeenCalled()
  })

  it('meldet einen Netzwerkfehler als offline', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('failed'))
    await expect(makeClient(fetchImpl).ensureTicket()).rejects.toMatchObject({
      reason: 'offline',
    })
  })
})

describe('Katalog holen', () => {
  it('liefert den geprüften Katalog samt ETag', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(ticketBody()))
      .mockResolvedValueOnce(
        jsonResponse(catalogBody, { headers: { ETag: '"abc"', 'Content-Type': 'application/json' } }),
      )

    const result = await makeClient(fetchImpl).fetchCatalog(null)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.catalog.books).toHaveLength(1)
    expect(result.etag).toBe('"abc"')
  })

  it('schickt If-None-Match und versteht 304', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(ticketBody()))
      .mockResolvedValueOnce(new Response(null, { status: 304 }))

    const result = await makeClient(fetchImpl).fetchCatalog('"abc"')

    expect(result).toEqual({ status: 'not-modified' })
    const [, init] = fetchImpl.mock.calls[1]!
    expect((init?.headers as Record<string, string>)['If-None-Match']).toBe('"abc"')
  })

  it('erneuert das Ticket bei 401 und versucht es genau einmal erneut', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(ticketBody()))
      .mockResolvedValueOnce(jsonResponse({ error: 'ticket_invalid' }, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse(ticketBody()))
      .mockResolvedValueOnce(jsonResponse(catalogBody))

    const result = await makeClient(fetchImpl).fetchCatalog(null)

    expect(result.status).toBe('ok')
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })

  it('meldet einen zu neuen Dienst gesondert', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(ticketBody()))
      .mockResolvedValueOnce(jsonResponse({ schemaVersion: 99, books: [] }))

    const result = await makeClient(fetchImpl).fetchCatalog(null)
    expect(result).toEqual({ status: 'error', reason: 'unsupported-version' })
  })

  it('meldet ein nicht erreichbares NAS als offline', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(ticketBody()))
      .mockRejectedValueOnce(new TypeError('failed'))

    const result = await makeClient(fetchImpl).fetchCatalog(null)
    expect(result).toEqual({ status: 'error', reason: 'offline' })
  })
})

describe('Adressen', () => {
  it('hängt das Ticket an Cover- und Audio-Adressen', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(ticketBody()))
    const client = makeClient(fetchImpl)
    await client.ensureTicket()

    expect(client.coverUrl('/cover/b_1.jpg')).toBe(`${BASE}/cover/b_1.jpg?t=TICKET-1`)
    expect(client.audioUrl('b_1', 2)).toBe(`${BASE}/audio/b_1/2?t=TICKET-1`)
  })

  it('liefert die kanonische Adresse ohne Ticket', () => {
    // Schlüssel für den Offline-Cache: Mit Ticket wäre jeder Download nach
    // acht Stunden wertlos, weil sich die Adresse geändert hat.
    const client = makeClient(vi.fn<typeof fetch>())
    expect(client.canonicalAudioUrl('b_1', 2)).toBe(`${BASE}/audio/b_1/2`)
  })

  it('liefert null statt einer kaputten Adresse, solange kein Ticket da ist', () => {
    const client = makeClient(vi.fn<typeof fetch>())
    expect(client.audioUrl('b_1', 0)).toBeNull()
    expect(client.coverUrl('/cover/b_1.jpg')).toBeNull()
  })
})

describe('Neu einlesen anstossen', () => {
  const healthBody = { ok: true, scanning: false, books: 12, schemaVersion: 2 }

  it('schickt das Ticket an /admin/rescan', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(ticketBody()))
      .mockResolvedValueOnce(jsonResponse({ started: true }, { status: 202 }))

    expect(await makeClient(fetchImpl).startRescan()).toBe('started')

    const [url, init] = fetchImpl.mock.calls[1]!
    expect(url).toBe(`${BASE}/admin/rescan?t=TICKET-1`)
    expect(init?.method).toBe('POST')
  })

  it('nimmt einen schon laufenden Scan als Erfolg', async () => {
    // 409 heisst „liest bereits" – genau das, was der Aufrufer wollte.
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(ticketBody()))
      .mockResolvedValueOnce(jsonResponse({ error: 'scan_running' }, { status: 409 }))

    expect(await makeClient(fetchImpl).startRescan()).toBe('already-running')
  })

  it('holt bei abgelaufenem Ticket ein neues und wiederholt', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(ticketBody()))
      .mockResolvedValueOnce(jsonResponse({ error: 'ticket_invalid' }, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse(ticketBody()))
      .mockResolvedValueOnce(jsonResponse({ started: true }, { status: 202 }))

    expect(await makeClient(fetchImpl).startRescan()).toBe('started')
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })

  it('unterscheidet ein nicht berechtigtes Konto vom Serverfehler', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(ticketBody()))
      .mockResolvedValueOnce(jsonResponse({ error: 'not_admin' }, { status: 403 }))

    await expect(makeClient(fetchImpl).startRescan()).rejects.toMatchObject({
      reason: 'forbidden',
    })
  })

  it('liest den Zustand aus /health – ohne Ticket', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(healthBody))

    expect(await makeClient(fetchImpl).fetchStatus()).toEqual({
      scanning: false,
      books: 12,
      schemaVersion: 2,
    })
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(`${BASE}/health`)
  })

  it('meldet eine unverständliche Antwort, statt sie zu glauben', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true }))

    await expect(makeClient(fetchImpl).fetchStatus()).rejects.toMatchObject({
      reason: 'malformed',
    })
  })
})
