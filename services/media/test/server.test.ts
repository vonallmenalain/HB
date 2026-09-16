import { beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { issueTicket } from '../src/auth/ticket.js'
import { type CatalogStore, createCatalogStore } from '../src/catalogStore.js'
import type { Config } from '../src/config.js'
import { buildServer } from '../src/server.js'
import { SCHEMA_VERSION } from '../src/catalog/types.js'

import { join } from 'node:path'

import { PNG_1X1, makeLibrary } from './fixtures.js'

const SECRET = 's'.repeat(40)
const UID = 'uid-papa'

let app: FastifyInstance
let store: CatalogStore
let ticket: string
let bookId: string
let bookWithoutCoverId: string
let audioBytes: number

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    host: '127.0.0.1',
    port: 0,
    mediaRoot: '/unused',
    cacheDir: '/unused',
    firebaseProjectId: 'hoerbuchkinder',
    ticketSecret: SECRET,
    ticketTtlSeconds: 3600,
    allowedOrigins: ['https://hb.example.com'],
    allowedUids: [],
    adminUids: [],
    scanOnStart: false,
    version: 'test',
    rescanIntervalMinutes: 0,
    ...overrides,
  }
}

beforeAll(async () => {
  const { mediaRoot, cacheDir } = await makeLibrary([
    {
      path: 'Reihe/01 - Mit Cover',
      files: [
        { name: '01.wav', seconds: 2 },
        { name: '02.wav', seconds: 1 },
        { name: 'cover.png', content: PNG_1X1 },
      ],
    },
    { path: 'Ohne Cover', files: [{ name: 'a.wav', seconds: 1 }] },
  ])

  store = createCatalogStore({ mediaRoot, cacheDir })
  await store.rescan()

  bookId = store.catalog().books.find((b) => b.title === 'Mit Cover')!.id
  bookWithoutCoverId = store.catalog().books.find((b) => b.title === 'Ohne Cover')!.id
  audioBytes = store.catalog().books.find((b) => b.id === bookId)!.files[0]!.bytes

  app = buildServer({
    config: makeConfig(),
    store,
    verifyIdToken: (token) =>
      token === 'gutes-token'
        ? Promise.resolve({ uid: UID, email: 'papa@example.com' })
        : Promise.reject(new Error('ungültig')),
  })

  ticket = (await issueTicket(SECRET, UID, 3600)).ticket
})

describe('GET /health', () => {
  it('antwortet ohne Anmeldung', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ ok: true, books: 2 })
  })

  it('nennt die Kennung des Images und die Katalog-Form', async () => {
    // Nach einem Update ist das die einzige Frage: Läuft schon der neue Stand?
    const response = await app.inject({ method: 'GET', url: '/health' })
    expect(response.json()).toMatchObject({
      version: 'test',
      schemaVersion: SCHEMA_VERSION,
    })
  })
})

describe('POST /auth/session', () => {
  it('tauscht ein Firebase-Token gegen ein Ticket', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/session',
      headers: { authorization: 'Bearer gutes-token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json<{ ticket: string; expiresAt: string }>()
    expect(body.ticket).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/)
    expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.now())
  })

  it('verlangt einen Authorization-Header', async () => {
    const response = await app.inject({ method: 'POST', url: '/auth/session' })
    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'authorization_missing' })
  })

  it('lehnt ein ungültiges Token ab', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/session',
      headers: { authorization: 'Bearer schrott' },
    })
    expect(response.statusCode).toBe(401)
  })

  it('antwortet 403 statt 401, wenn die UID nicht freigeschaltet ist', async () => {
    // 401 hiesse „hol dir ein neues Token“ – das würde nichts ändern.
    const restricted = buildServer({
      config: makeConfig({ allowedUids: ['jemand-anderes'] }),
      store: createCatalogStore({ mediaRoot: '/unused', cacheDir: '/unused' }),
      verifyIdToken: () => Promise.resolve({ uid: UID, email: null }),
    })

    const response = await restricted.inject({
      method: 'POST',
      url: '/auth/session',
      headers: { authorization: 'Bearer gutes-token' },
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toMatchObject({ error: 'uid_not_allowed', uid: UID })
  })
})

describe('GET /library', () => {
  it('liefert den Katalog mit gültigem Ticket', async () => {
    const response = await app.inject({ method: 'GET', url: `/library?t=${ticket}` })
    expect(response.statusCode).toBe(200)
    expect(response.json<{ books: unknown[] }>().books).toHaveLength(2)
  })

  it('gibt den Stand der Cover-Suche aus, auch bevor sie je lief', async () => {
    const response = await app.inject({ method: 'GET', url: `/admin/cover-suche?t=${ticket}` })
    expect(response.statusCode).toBe(200)
    const daten = response.json<{
      stand: { laeuft: boolean; gesamt: number }
      vorschlaege: Record<string, unknown>
    }>()
    expect(daten.stand.laeuft).toBe(false)
    expect(daten.vorschlaege).toEqual({})
  })

  it('verlangt ein Ticket', async () => {
    expect((await app.inject({ method: 'GET', url: '/library' })).statusCode).toBe(401)
    expect(
      (await app.inject({ method: 'GET', url: '/library?t=kaputt' })).statusCode,
    ).toBe(401)
  })

  it('antwortet 304, wenn sich nichts geändert hat', async () => {
    const first = await app.inject({ method: 'GET', url: `/library?t=${ticket}` })
    const etag = first.headers.etag!
    expect(etag).toBeTruthy()

    const second = await app.inject({
      method: 'GET',
      url: `/library?t=${ticket}`,
      headers: { 'if-none-match': etag },
    })
    expect(second.statusCode).toBe(304)
  })

  it('verrät keine Dateipfade', async () => {
    const response = await app.inject({ method: 'GET', url: `/library?t=${ticket}` })
    expect(response.body).not.toContain('/tmp/')
  })
})

describe('GET /cover', () => {
  it('liefert das aufbereitete Cover', async () => {
    const response = await app.inject({ method: 'GET', url: `/cover/${bookId}.jpg?t=${ticket}` })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('image/jpeg')
    expect(response.rawPayload.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]))
  })

  it('antwortet 404 für ein Buch ohne Cover', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/cover/${bookWithoutCoverId}.jpg?t=${ticket}`,
    })
    expect(response.statusCode).toBe(404)
  })
})

describe('GET /audio', () => {
  it('liefert die ganze Datei ohne Range-Header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/audio/${bookId}/0?t=${ticket}`,
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['accept-ranges']).toBe('bytes')
    expect(response.headers['content-type']).toBe('audio/wav')
    expect(Number(response.headers['content-length'])).toBe(audioBytes)
    expect(response.rawPayload.subarray(0, 4).toString('ascii')).toBe('RIFF')
  })

  it('beantwortet einen Bereich mit 206 und passendem Content-Range', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/audio/${bookId}/0?t=${ticket}`,
      headers: { range: 'bytes=0-99' },
    })

    expect(response.statusCode).toBe(206)
    expect(response.headers['content-range']).toBe(`bytes 0-99/${audioBytes}`)
    expect(Number(response.headers['content-length'])).toBe(100)
    expect(response.rawPayload).toHaveLength(100)
  })

  it('liefert bei offenem Ende bis zum Dateiende', async () => {
    const start = audioBytes - 50
    const response = await app.inject({
      method: 'GET',
      url: `/audio/${bookId}/0?t=${ticket}`,
      headers: { range: `bytes=${start}-` },
    })

    expect(response.statusCode).toBe(206)
    expect(response.rawPayload).toHaveLength(50)
  })

  it('antwortet 416 bei unerfüllbarem Bereich', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/audio/${bookId}/0?t=${ticket}`,
      headers: { range: `bytes=${audioBytes + 10}-` },
    })

    expect(response.statusCode).toBe(416)
    expect(response.headers['content-range']).toBe(`bytes */${audioBytes}`)
  })

  it('verlangt ein Ticket', async () => {
    expect(
      (await app.inject({ method: 'GET', url: `/audio/${bookId}/0` })).statusCode,
    ).toBe(401)
  })

  it('antwortet 404 für unbekannte Bücher und Dateien', async () => {
    expect(
      (await app.inject({ method: 'GET', url: `/audio/b_gibtesnicht/0?t=${ticket}` }))
        .statusCode,
    ).toBe(404)
    expect(
      (await app.inject({ method: 'GET', url: `/audio/${bookId}/99?t=${ticket}` })).statusCode,
    ).toBe(404)
    expect(
      (await app.inject({ method: 'GET', url: `/audio/${bookId}/keine-zahl?t=${ticket}` }))
        .statusCode,
    ).toBe(404)
  })

  it('kommt nicht aus dem Hörbuch-Ordner heraus', async () => {
    // Der Dienst nimmt nie einen Pfad entgegen, sondern schlägt Buch-ID und
    // Dateiindex im Katalog nach – Traversal ist strukturell ausgeschlossen.
    for (const attempt of [
      '/audio/..%2F..%2Fetc/0',
      '/audio/%2Fetc%2Fpasswd/0',
      '/audio/../../../etc/passwd/0',
      `/cover/..%2F..%2Fetc%2Fpasswd.jpg`,
      // Auch mit hochgeladenen Covern gilt das: Die Kennung wird im Katalog
      // nachgeschlagen, bevor überhaupt ein Pfad entsteht.
      '/cover/..%2F..%2Fcovers%2Firgendwas.jpg',
      '/cover/%2E%2E%2F%2E%2E%2Fetc%2Fpasswd.jpg',
    ]) {
      const response = await app.inject({ method: 'GET', url: `${attempt}?t=${ticket}` })
      expect([401, 404], `${attempt} → ${String(response.statusCode)}`).toContain(
        response.statusCode,
      )
      expect(response.body).not.toContain('root:')
    }
  })
})

describe('POST /admin/rescan', () => {
  it('lehnt Nicht-Administratoren ab', async () => {
    const restricted = buildServer({
      config: makeConfig({ adminUids: ['nur-papa'] }),
      store: createCatalogStore({ mediaRoot: '/unused', cacheDir: '/unused' }),
      verifyIdToken: () => Promise.resolve({ uid: UID, email: null }),
    })

    const response = await restricted.inject({
      method: 'POST',
      url: `/admin/rescan?t=${ticket}`,
    })
    expect(response.statusCode).toBe(403)
  })

  it('verlangt ein Ticket', async () => {
    expect((await app.inject({ method: 'POST', url: '/admin/rescan' })).statusCode).toBe(401)
  })
})

describe('Cover von Hand setzen', () => {
  it('nimmt ein Bild an und liefert es danach aus', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/admin/cover/${bookWithoutCoverId}?t=${ticket}`,
      headers: { 'content-type': 'image/png' },
      payload: PNG_1X1,
    })

    expect(response.statusCode).toBe(200)
    const cover = response.json<{ cover: string }>().cover
    expect(cover).toContain(bookWithoutCoverId)

    // Sofort sichtbar, ohne auf den nächsten Scan zu warten.
    expect(store.book(bookWithoutCoverId)?.cover).toBe(cover)

    const bild = await app.inject({ method: 'GET', url: `${cover}&t=${ticket}` })
    expect(bild.statusCode).toBe(200)
    expect(bild.headers['content-type']).toBe('image/jpeg')
  })

  it('schlägt das Bild aus dem Ordner', async () => {
    const vorher = store.book(bookId)?.cover
    await app.inject({
      method: 'POST',
      url: `/admin/cover/${bookId}?t=${ticket}`,
      headers: { 'content-type': 'image/png' },
      payload: PNG_1X1,
    })
    expect(store.book(bookId)?.cover).not.toBe(vorher)

    // Und wieder zurück: Dann gilt erneut, was auf dem NAS liegt.
    const weg = await app.inject({ method: 'DELETE', url: `/admin/cover/${bookId}?t=${ticket}` })
    expect(weg.statusCode).toBe(200)
    expect(store.book(bookId)?.cover).toBe(vorher)
  })

  it('lehnt ab, was kein Bild ist', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/admin/cover/${bookId}?t=${ticket}`,
      headers: { 'content-type': 'image/png' },
      payload: Buffer.from('kein Bild'),
    })
    expect(response.statusCode).toBe(415)
  })

  it('antwortet 404 für ein unbekanntes Buch', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/admin/cover/b_gibtsnicht?t=${ticket}`,
      headers: { 'content-type': 'image/png' },
      payload: PNG_1X1,
    })
    expect(response.statusCode).toBe(404)
  })

  it('nennt die Bücher mit einem eigenen Bild samt Herkunft', async () => {
    // Die App braucht das, um das Zurücknehmen nur dort anzubieten, wo es
    // etwas zurückzunehmen gibt – und um an der Kachel zu sagen, woher das
    // Bild stammt.
    await app.inject({
      method: 'POST',
      url: `/admin/cover/${bookWithoutCoverId}?t=${ticket}`,
      headers: { 'content-type': 'image/png' },
      payload: PNG_1X1,
    })

    const liste = await app.inject({ method: 'GET', url: `/admin/cover?t=${ticket}` })
    expect(liste.json<{ covers: Record<string, string> }>().covers).toEqual({
      [bookWithoutCoverId]: 'hochgeladen',
    })

    const weg = await app.inject({
      method: 'DELETE',
      url: `/admin/cover/${bookWithoutCoverId}?t=${ticket}`,
    })
    expect(weg.json<{ entfernt: boolean }>().entfernt).toBe(true)
    expect(
      (await app.inject({ method: 'GET', url: `/admin/cover?t=${ticket}` })).json<{
        covers: Record<string, string>
      }>().covers,
    ).toEqual({})
  })

  it('nimmt keine Adresse an, die niemand vorgeschlagen hat', async () => {
    // Sonst wäre die Route eine Aufforderung an den Dienst, eine beliebige
    // Adresse abzurufen – auch eine im Heimnetz, an die von aussen niemand
    // herankommt.
    const response = await app.inject({
      method: 'POST',
      url: `/admin/cover/${bookId}/vorschlag?t=${ticket}`,
      payload: { bild: 'http://192.168.1.1/admin' },
    })
    expect(response.statusCode).toBe(422)
  })

  it('reicht keine Adresse durch, die niemand vorgeschlagen hat', async () => {
    // Dieselbe Sperre wie beim Übernehmen: Ohne sie wäre die Vorschau ein
    // Fenster in jedes Gerät im Heimnetz.
    const response = await app.inject({
      method: 'GET',
      url: `/admin/cover-vorschlag/${bookId}?bild=${encodeURIComponent('http://192.168.1.1/')}&t=${ticket}`,
    })
    expect(response.statusCode).toBe(404)
  })

  it('verlangt überhaupt eine Adresse', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/admin/cover/${bookId}/vorschlag?t=${ticket}`,
      payload: {},
    })
    expect(response.statusCode).toBe(400)
  })

  it('sagt, wenn gar kein eigenes Bild gesetzt war', async () => {
    const weg = await app.inject({ method: 'DELETE', url: `/admin/cover/${bookId}?t=${ticket}` })
    expect(weg.statusCode).toBe(200)
    expect(weg.json<{ entfernt: boolean }>().entfernt).toBe(false)
  })

  it('verlangt ein Ticket', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/admin/cover/${bookId}`,
      headers: { 'content-type': 'image/png' },
      payload: PNG_1X1,
    })
    expect(response.statusCode).toBe(401)
  })
})

describe('Ordner umstellen', () => {
  it('lässt CD-Ordner aussen vor', async () => {
    // Ein Buch aus „CD 1" … „CD 3" entsteht in einem anderen Zweig des
    // Scanners, der die Einstellung gar nicht liest. Ein Knopf dafür wäre eine
    // Zusage, die niemand einlöst.
    const { mediaRoot, cacheDir } = await makeLibrary([
      { path: 'Harry Potter/Der Feuerkelch/CD 1', files: [{ name: 'a.wav' }] },
      { path: 'Harry Potter/Der Feuerkelch/CD 2', files: [{ name: 'a.wav' }] },
      { path: 'Reihe/Ein Buch', files: [{ name: 'a.wav' }, { name: 'b.wav' }] },
    ])
    const eigener = createCatalogStore({ mediaRoot, cacheDir })
    await eigener.rescan()

    expect((await eigener.folders()).map((eintrag) => eintrag.path)).toEqual([
      join('Reihe', 'Ein Buch'),
    ])
  })

  it('nennt die Ordner, für die sich das lohnt', async () => {
    const response = await app.inject({ method: 'GET', url: `/admin/struktur?t=${ticket}` })
    expect(response.statusCode).toBe(200)

    const { folders } = response.json<{
      folders: { path: string; files: number; books: number; mode: string | null }[]
    }>()
    // „Ohne Cover" hat eine einzige Datei – da gibt es nichts aufzuteilen.
    expect(folders.map((eintrag) => eintrag.path)).toEqual(['Reihe/01 - Mit Cover'])
    expect(folders[0]?.files).toBe(2)
    expect(folders[0]?.mode).toBeNull()
  })

  it('stellt um, liest neu ein und merkt sich die Wahl', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/admin/struktur?t=${ticket}`,
      payload: { ordner: 'Reihe/01 - Mit Cover', modus: 'einzelfolgen' },
    })
    // 202: Die Einstellung steht, der Scan läuft noch – wie bei /admin/rescan.
    expect(response.statusCode).toBe(202)
    await store.rescan()

    // Aus einem Buch mit zwei Kapiteln sind zwei Hörbücher geworden.
    expect(store.catalog().books.filter((buch) => buch.series === 'Reihe')).toHaveLength(2)

    const liste = await app.inject({ method: 'GET', url: `/admin/struktur?t=${ticket}` })
    const { folders } = liste.json<{ folders: { path: string; mode: string | null }[] }>()
    expect(folders.find((eintrag) => eintrag.path === 'Reihe/01 - Mit Cover')?.mode).toBe(
      'einzelfolgen',
    )

    // Zurückstellen ergibt wieder ein Buch.
    await app.inject({
      method: 'POST',
      url: `/admin/struktur?t=${ticket}`,
      payload: { ordner: 'Reihe/01 - Mit Cover', modus: null },
    })
    await store.rescan()
    expect(store.catalog().books.filter((buch) => buch.series === 'Reihe')).toHaveLength(1)
  })

  it('lehnt Unsinn ab', async () => {
    const ohneOrdner = await app.inject({
      method: 'POST',
      url: `/admin/struktur?t=${ticket}`,
      payload: { modus: 'einzelfolgen' },
    })
    expect(ohneOrdner.statusCode).toBe(400)

    const falscherModus = await app.inject({
      method: 'POST',
      url: `/admin/struktur?t=${ticket}`,
      payload: { ordner: 'Reihe/01 - Mit Cover', modus: 'irgendwas' },
    })
    expect(falscherModus.statusCode).toBe(400)
  })

  it('verlangt ein Ticket', async () => {
    expect((await app.inject({ method: 'GET', url: '/admin/struktur' })).statusCode).toBe(401)
  })
})
