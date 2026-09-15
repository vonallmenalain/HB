import { describe, expect, it, vi } from 'vitest'

import { type DownloadTarget, runDownload } from './downloader'

const target = (fileIdx: number, bytes = 100): DownloadTarget => ({
  fileIdx,
  key: `/audio/b_1/${String(fileIdx)}`,
  url: `/audio/b_1/${String(fileIdx)}?t=ticket`,
  bytes,
})

function setup({
  targets = [target(0), target(1), target(2)],
  vorhanden = new Set<string>(),
  ladeFehler = new Set<number>(),
  statusFehler = new Set<number>(),
  abbrechenNach = Number.POSITIVE_INFINITY,
}: {
  targets?: DownloadTarget[]
  vorhanden?: Set<string>
  ladeFehler?: Set<number>
  statusFehler?: Set<number>
  abbrechenNach?: number
} = {}) {
  const gespeichert: string[] = []
  const fortschritt: { filesDone: number; bytesDone: number }[] = []
  let geladen = 0

  const run = runDownload({
    targets,
    has: (key) => Promise.resolve(vorhanden.has(key)),
    load: (entry) => {
      geladen += 1
      if (ladeFehler.has(entry.fileIdx)) return Promise.reject(new Error('kein Netz'))
      return Promise.resolve(
        new Response('x', { status: statusFehler.has(entry.fileIdx) ? 502 : 200 }),
      )
    },
    store: (key) => {
      gespeichert.push(key)
      return Promise.resolve()
    },
    onProgress: (progress) => fortschritt.push(progress),
    aborted: () => gespeichert.length >= abbrechenNach,
  })

  return { run, gespeichert, fortschritt, geladenCount: () => geladen }
}

describe('runDownload', () => {
  it('lädt alle Dateien der Reihe nach', async () => {
    const { run, gespeichert } = setup()

    expect(await run).toBe('done')
    expect(gespeichert).toEqual(['/audio/b_1/0', '/audio/b_1/1', '/audio/b_1/2'])
  })

  it('meldet den Fortschritt nach jeder Datei', async () => {
    const { run, fortschritt } = setup()
    await run

    expect(fortschritt).toEqual([
      { filesDone: 1, bytesDone: 100 },
      { filesDone: 2, bytesDone: 200 },
      { filesDone: 3, bytesDone: 300 },
    ])
  })

  it('überspringt, was schon auf dem Gerät liegt', async () => {
    // Das ist die ganze Fortsetzbarkeit: Ein abgebrochener Download muss sich
    // nicht merken, wo er war – er sieht es.
    const { run, gespeichert, fortschritt, geladenCount } = setup({
      vorhanden: new Set(['/audio/b_1/0', '/audio/b_1/1']),
    })

    expect(await run).toBe('done')
    expect(gespeichert).toEqual(['/audio/b_1/2'])
    expect(geladenCount()).toBe(1)
    // Der Fortschritt zählt die übersprungenen trotzdem mit.
    expect(fortschritt.at(-1)).toEqual({ filesDone: 3, bytesDone: 300 })
  })

  it('hört beim Abbrechen sofort auf', async () => {
    const { run, gespeichert } = setup({ abbrechenNach: 2 })

    expect(await run).toBe('aborted')
    expect(gespeichert).toHaveLength(2)
  })

  it('schreibt nach dem Abbruch nichts mehr', async () => {
    // Zwischen „laden" und „speichern" liegt ein Wartepunkt. Ohne die zweite
    // Prüfung landete die gerade geladene Datei noch im Cache.
    let abgebrochen = false
    const gespeichert: string[] = []

    const outcome = await runDownload({
      targets: [target(0)],
      has: () => Promise.resolve(false),
      load: () => {
        abgebrochen = true
        return Promise.resolve(new Response('x'))
      },
      store: (key) => {
        gespeichert.push(key)
        return Promise.resolve()
      },
      onProgress: vi.fn(),
      aborted: () => abgebrochen,
    })

    expect(outcome).toBe('aborted')
    expect(gespeichert).toEqual([])
  })

  it('bricht bei einem Netzfehler ab und behält das Geladene', async () => {
    const { run, gespeichert } = setup({ ladeFehler: new Set([1]) })

    expect(await run).toBe('failed')
    // Die erste Datei bleibt liegen – der nächste Versuch fängt bei der zweiten an.
    expect(gespeichert).toEqual(['/audio/b_1/0'])
  })

  it('behandelt eine Fehlerantwort wie einen Fehlschlag', async () => {
    // Sonst landete eine „502"-Seite als Hörbuchkapitel im Cache.
    const { run, gespeichert } = setup({ statusFehler: new Set([0]) })

    expect(await run).toBe('failed')
    expect(gespeichert).toEqual([])
  })

  it('ist mit nichts zu tun sofort fertig', async () => {
    const { run } = setup({ targets: [] })

    expect(await run).toBe('done')
  })
})
