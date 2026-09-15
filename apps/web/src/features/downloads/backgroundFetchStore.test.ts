import { describe, expect, it } from 'vitest'

import { makeDownloadRecord } from '@/test/renderWithProfiles'

import { completeBackgroundFetch } from './backgroundFetchStore'
import { type DownloadRecord } from './downloads'

function setup({
  vorher = makeDownloadRecord({
    bookId: 'b_1',
    status: 'running',
    filesTotal: 2,
    filesDone: 0,
    bytesTotal: 4_000_000,
    bytesDone: 0,
  }),
  files = [
    { url: 'https://nas.example/audio/b_1/0?t=abc', response: new Response('a') },
    { url: 'https://nas.example/audio/b_1/1?t=abc', response: new Response('b') },
  ],
  downloaded = 4_000_000,
  putFehler = false,
}: {
  vorher?: DownloadRecord | null
  files?: { url: string; response: Response }[]
  downloaded?: number
  putFehler?: boolean
} = {}) {
  const abgelegt: string[] = []
  const geschrieben: DownloadRecord[] = []

  const run = completeBackgroundFetch({
    bookId: 'b_1',
    files,
    downloaded,
    put: (key) => {
      if (putFehler) return Promise.reject(new Error('kein Platz'))
      abgelegt.push(key)
      return Promise.resolve()
    },
    readRecord: () => Promise.resolve(vorher),
    writeRecord: (record) => {
      geschrieben.push(record)
      return Promise.resolve()
    },
    now: () => new Date('2026-03-01T12:00:00.000Z'),
  })

  return { run, abgelegt, geschrieben }
}

describe('completeBackgroundFetch', () => {
  it('legt die Dateien unter der Adresse ohne Ticket ab', async () => {
    // Genau wie im Vordergrund – sonst fände die App nicht, was Android
    // gebracht hat.
    const { run, abgelegt } = setup()

    expect(await run).toBe('done')
    expect(abgelegt).toEqual([
      'https://nas.example/audio/b_1/0',
      'https://nas.example/audio/b_1/1',
    ])
  })

  it('schreibt den Stand auf „fertig" fort', async () => {
    const { run, geschrieben } = setup()
    await run

    expect(geschrieben.at(-1)).toEqual({
      bookId: 'b_1',
      status: 'done',
      filesTotal: 2,
      filesDone: 2,
      bytesTotal: 4_000_000,
      bytesDone: 4_000_000,
      filesHash: 'abc',
      updatedAt: '2026-03-01T12:00:00.000Z',
    })
  })

  it('legt eine Fehlerantwort nicht ab', async () => {
    // Sonst läge eine Fehlerseite als Hörbuchkapitel im Cache, und das Kind
    // hörte beim Antippen Stille.
    const { run, abgelegt, geschrieben } = setup({
      files: [
        { url: 'https://nas.example/audio/b_1/0?t=abc', response: new Response('a') },
        {
          url: 'https://nas.example/audio/b_1/1?t=abc',
          response: new Response('nein', { status: 502 }),
        },
      ],
    })

    expect(await run).toBe('failed')
    expect(abgelegt).toEqual(['https://nas.example/audio/b_1/0'])
    expect(geschrieben.at(-1)?.status).toBe('failed')
  })

  it('hält den Rest fest, wenn eine Datei nicht abgelegt werden kann', async () => {
    const { run, geschrieben } = setup({ putFehler: true })

    expect(await run).toBe('failed')
    expect(geschrieben.at(-1)?.filesDone).toBe(0)
  })

  it('meldet nie mehr Bytes, als das Buch gross ist', async () => {
    // Im Elternbereich steht diese Zahl als Platzbedarf – zu viel wäre dort
    // schlicht falsch.
    const { run, geschrieben } = setup({ downloaded: 99_000_000 })
    await run

    expect(geschrieben.at(-1)?.bytesDone).toBe(4_000_000)
  })

  it('kommt ohne früheren Eintrag aus', async () => {
    // Der Service Worker läuft möglicherweise, nachdem die Website-Daten
    // gelöscht wurden.
    const { run, geschrieben } = setup({ vorher: null })

    expect(await run).toBe('done')
    expect(geschrieben.at(-1)).toMatchObject({ status: 'done', filesTotal: 2, filesDone: 2 })
  })

  it('erklärt eine leere Übergabe nicht für fertig', async () => {
    const { run, geschrieben } = setup({ files: [] })

    expect(await run).toBe('failed')
    expect(geschrieben.at(-1)?.status).toBe('failed')
  })
})

describe('Teilweise angekommene Übergaben', () => {
  it('behält, was heil angekommen ist', async () => {
    // Android bricht schon ab, wenn eine einzige Datei fehlt. Das Übrige
    // wegzuwerfen hiesse, den nächsten Versuch wieder bei null anfangen zu
    // lassen.
    const abgelegt: string[] = []
    const geschrieben: DownloadRecord[] = []

    const status = await completeBackgroundFetch({
      bookId: 'b_1',
      files: [
        { url: 'https://nas.example/audio/b_1/0?t=abc', response: new Response('a') },
        { url: 'https://nas.example/audio/b_1/1?t=abc', response: null },
      ],
      downloaded: 1_000_000,
      put: (key) => {
        abgelegt.push(key)
        return Promise.resolve()
      },
      readRecord: () =>
        Promise.resolve(
          makeDownloadRecord({ bookId: 'b_1', status: 'running', filesTotal: 2, filesDone: 0, bytesDone: 0 }),
        ),
      writeRecord: (record) => {
        geschrieben.push(record)
        return Promise.resolve()
      },
    })

    expect(status).toBe('failed')
    expect(abgelegt).toEqual(['https://nas.example/audio/b_1/0'])
    expect(geschrieben.at(-1)).toMatchObject({ filesDone: 1, bytesDone: 1_000_000 })
  })

  it('zählt frühere Versuche mit', async () => {
    // Übergeben wird nur, was noch fehlt – der Stand muss deshalb aufaddieren,
    // nicht ersetzen.
    const geschrieben: DownloadRecord[] = []

    await completeBackgroundFetch({
      bookId: 'b_1',
      files: [{ url: 'https://nas.example/audio/b_1/1?t=abc', response: new Response('b') }],
      downloaded: 3_000_000,
      put: () => Promise.resolve(),
      readRecord: () =>
        Promise.resolve(
          makeDownloadRecord({
            bookId: 'b_1',
            status: 'running',
            filesTotal: 2,
            filesDone: 1,
            bytesTotal: 4_000_000,
            bytesDone: 1_000_000,
          }),
        ),
      writeRecord: (record) => {
        geschrieben.push(record)
        return Promise.resolve()
      },
    })

    expect(geschrieben.at(-1)).toMatchObject({
      status: 'done',
      filesDone: 2,
      bytesDone: 4_000_000,
    })
  })

  it('merkt einen Abbruch als „nichts läuft", nicht als Fehler', async () => {
    const geschrieben: DownloadRecord[] = []

    const status = await completeBackgroundFetch({
      bookId: 'b_1',
      files: [
        { url: 'https://nas.example/audio/b_1/0?t=abc', response: new Response('a') },
        { url: 'https://nas.example/audio/b_1/1?t=abc', response: null },
      ],
      downloaded: 1_000_000,
      incompleteStatus: 'idle',
      put: () => Promise.resolve(),
      readRecord: () => Promise.resolve(makeDownloadRecord({ bookId: 'b_1', filesTotal: 2, filesDone: 0 })),
      writeRecord: (record) => {
        geschrieben.push(record)
        return Promise.resolve()
      },
    })

    expect(status).toBe('idle')
    expect(geschrieben.at(-1)?.filesDone).toBe(1)
  })
})
