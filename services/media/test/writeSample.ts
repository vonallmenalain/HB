import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'

import { scanSampleLibrary } from './sampleLibrary.js'

/**
 * Schreibt `docs/examples/catalog.sample.json` neu.
 *
 *   npm run sample -w @hb/media
 *
 * Nur ausführen, wenn sich die Katalogform absichtlich geändert hat – der
 * Vertragstest schlägt sonst aus gutem Grund fehl.
 */
function repoRoot(): string {
  let directory = process.cwd()
  for (let depth = 0; depth < 5; depth += 1) {
    if (existsSync(join(directory, 'docs'))) return directory
    directory = dirname(directory)
  }
  throw new Error('Projektstamm nicht gefunden')
}

const target = join(repoRoot(), 'docs', 'examples', 'catalog.sample.json')

const { catalog } = await scanSampleLibrary()
await mkdir(dirname(target), { recursive: true })
await writeFile(target, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
console.log(`Beispielkatalog geschrieben: ${target}`)
