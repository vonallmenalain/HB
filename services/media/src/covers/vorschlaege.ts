/**
 * Die gemerkten Vorschläge auf der Platte.
 *
 * Ein Lauf über neunhundert Bücher dauert eine dreiviertel Stunde. Ginge sein
 * Ergebnis bei einem Neustart verloren – und der kommt bei jedem neuen Image –,
 * müsste man ihn danach wiederholen.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { CoverVorschlag } from './suche.js'

const DATEI = 'cover-vorschlaege.json'

function istQuelle(wert: unknown): wert is CoverVorschlag['quelle'] {
  return wert === 'apple' || wert === 'musicbrainz'
}

/** Liest defensiv – die Datei liegt in einem Volume und darf kaputt sein. */
export function parseVorschlaege(roh: unknown): Map<string, CoverVorschlag[]> {
  const alle = new Map<string, CoverVorschlag[]>()
  if (typeof roh !== 'object' || roh === null) return alle

  for (const [bookId, liste] of Object.entries(roh as Record<string, unknown>)) {
    if (bookId === '' || !Array.isArray(liste)) continue

    const geprueft: CoverVorschlag[] = []
    for (const eintrag of liste) {
      const satz = eintrag as Record<string, unknown>
      if (
        !istQuelle(satz.quelle) ||
        typeof satz.title !== 'string' ||
        typeof satz.imageUrl !== 'string' ||
        typeof satz.score !== 'number'
      ) {
        continue
      }
      geprueft.push({
        quelle: satz.quelle,
        title: satz.title,
        artist: typeof satz.artist === 'string' ? satz.artist : null,
        imageUrl: satz.imageUrl,
        score: satz.score,
      })
    }

    if (geprueft.length > 0) alle.set(bookId, geprueft)
  }
  return alle
}

export async function readVorschlaege(cacheDir: string): Promise<Map<string, CoverVorschlag[]>> {
  try {
    return parseVorschlaege(JSON.parse(await readFile(join(cacheDir, DATEI), 'utf8')))
  } catch {
    return new Map()
  }
}

export async function writeVorschlaege(
  cacheDir: string,
  alle: ReadonlyMap<string, CoverVorschlag[]>,
): Promise<void> {
  await writeFile(join(cacheDir, DATEI), JSON.stringify(Object.fromEntries(alle)), 'utf8')
}
