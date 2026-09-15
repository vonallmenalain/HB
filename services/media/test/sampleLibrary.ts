import { scanLibrary } from '../src/catalog/scan.js'

import { PNG_1X1, makeLibrary } from './fixtures.js'

/**
 * Die Bibliothek, aus der `docs/examples/catalog.sample.json` erzeugt wird.
 *
 * Bewusst ein eigenes Modul und keine Testdatei: Der Schreiber importiert sie
 * ausserhalb von Vitest, und dort dürfen keine `describe`-Blöcke anlaufen.
 */
export async function scanSampleLibrary() {
  const { mediaRoot, cacheDir } = await makeLibrary([
    {
      path: 'Die drei ???/01 - Der Super-Papagei',
      files: [
        { name: '01 - Der Anruf.wav', seconds: 3 },
        { name: '02 - Die Spur.wav', seconds: 2 },
        { name: 'cover.png', content: PNG_1X1 },
      ],
    },
    {
      path: 'Die drei ???/02 - Der Phantomsee',
      files: [{ name: '01 - Am See.wav', seconds: 1 }],
    },
    {
      // Ein Unterordner in der Reihe – und der Reihenname noch einmal im
      // Ordnernamen der Folge, so wie gewachsene Sammlungen aussehen.
      path: 'Die drei ???/Mini-Fälle/Die drei ??? - 05 - Alarm im Zoo',
      files: [{ name: '01 - Alarm.wav', seconds: 1 }],
    },
    {
      path: 'Bibi Blocksberg - Hexerei',
      files: [{ name: 'hexerei.wav', seconds: 2 }],
    },
  ])

  return scanLibrary({
    mediaRoot,
    cacheDir,
    now: () => new Date('2026-01-01T00:00:00.000Z'),
  })
}
