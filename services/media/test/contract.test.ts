import { describe, expect, it } from 'vitest'

import { scanSampleLibrary } from './sampleLibrary.js'

/**
 * Vertragstest zwischen Dienst und App.
 *
 * Beide werden unabhängig voneinander ausgeliefert: Die App liegt auf Netlify,
 * der Dienst auf dem NAS. Ändert einer die Katalogform, merkt es der andere
 * erst im Betrieb. Deshalb liegt in `docs/examples/catalog.sample.json` ein
 * echter Scan-Ausgabestand, den beide Testsuiten lesen – der Dienst prüft, dass
 * er ihn so erzeugt, die App, dass sie ihn versteht.
 *
 * Neu erzeugen nach einer beabsichtigten Änderung:
 *   npm run sample -w @hb/media
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

const SAMPLE_PATH = repoFile('docs/examples/catalog.sample.json')

describe('Katalog-Vertrag', () => {
  it('erzeugt genau den Stand, den die App als Beispiel kennt', async () => {
    const { catalog } = await scanSampleLibrary()
    const sample: unknown = JSON.parse(readFileSync(SAMPLE_PATH, 'utf8'))

    expect(
      catalog,
      'Die Katalogform hat sich geändert. Wenn das beabsichtigt ist: ' +
        '`npm run sample -w @hb/media` ausführen und die App-Seite gegenprüfen.',
    ).toEqual(sample)
  })

  it('erzeugt deterministische Kennungen', async () => {
    // Wären die IDs zufällig oder zeitabhängig, verlöre jedes Kind beim
    // Neu-Einlesen seinen Fortschritt.
    const first = await scanSampleLibrary()
    const second = await scanSampleLibrary()
    expect(second.catalog.books.map((b) => b.id)).toEqual(first.catalog.books.map((b) => b.id))
  })
})
