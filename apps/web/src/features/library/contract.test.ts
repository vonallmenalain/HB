import { describe, expect, it } from 'vitest'

import { parseCatalog } from './catalog'

/**
 * Die App-Seite desselben Vertrags wie in `services/media/test/contract.test.ts`.
 *
 * Gelesen wird ein echter Ausgabestand des Scanners. Ändert der Dienst seine
 * Form, schlägt drüben der Vergleich fehl; kann die App das Ergebnis nicht mehr
 * lesen, schlägt dieser Test fehl. Damit fällt Auseinanderdriften beim Bauen
 * auf statt im Betrieb.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'

/**
 * Sucht eine Datei vom aktuellen Verzeichnis aufwärts.
 *
 * Vitest startet je nach Aufruf im Workspace oder im Projektstamm – ein fest
 * verdrahtetes `../..` bricht dann je nach Startort.
 */
function repoFile(relative: string): string {
  let directory = process.cwd()
  for (let depth = 0; depth < 5; depth += 1) {
    const candidate = join(directory, relative)
    if (existsSync(candidate)) return candidate
    directory = dirname(directory)
  }
  throw new Error(`${relative} nicht gefunden (gesucht ab ${process.cwd()})`)
}

const sample: unknown = JSON.parse(
  readFileSync(repoFile('docs/examples/catalog.sample.json'), 'utf8'),
)

describe('Katalog-Vertrag', () => {
  it('versteht den echten Ausgabestand des Dienstes vollständig', () => {
    const result = parseCatalog(sample)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Kein einziger Eintrag darf beim Einlesen verloren gehen.
    expect(result.skipped).toBe(0)
    expect(result.catalog.books).toHaveLength(3)
  })

  it('liest Reihen, Kapitel und Cover wie erwartet', () => {
    const result = parseCatalog(sample)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const papagei = result.catalog.books.find((book) => book.title === 'Der Super-Papagei')
    expect(papagei?.series).toBe('Die drei ???')
    expect(papagei?.seriesIndex).toBe(1)
    expect(papagei?.chapters.map((c) => c.title)).toEqual(['Der Anruf', 'Die Spur'])
    // Kapitelgrenzen sind globale Sekunden im Buch.
    expect(papagei?.chapters.map((c) => [c.startSec, c.endSec])).toEqual([
      [0, 3],
      [3, 5],
    ])
    expect(papagei?.cover).toBe(`/cover/${papagei?.id ?? ''}.jpg`)

    const ohneCover = result.catalog.books.find((book) => book.cover === null)
    expect(ohneCover?.coverColor).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('löst Positionen über die Dateigrenze hinweg auf', async () => {
    const { resolvePosition } = await import('./catalog')
    const result = parseCatalog(sample)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const papagei = result.catalog.books.find((book) => book.title === 'Der Super-Papagei')!
    expect(resolvePosition(papagei, 1)).toEqual({ fileIdx: 0, offsetSec: 1 })
    expect(resolvePosition(papagei, 4)).toEqual({ fileIdx: 1, offsetSec: 1 })
  })
})
