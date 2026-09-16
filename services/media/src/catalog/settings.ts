/**
 * Was der Adminbereich über einzelne Ordner sagt.
 *
 * Der Hörbuch-Ordner ist nur lesend eingebunden – eine `buch.json` kann der
 * Dienst also nicht schreiben. Die Einstellungen aus dem Adminbereich liegen
 * deshalb im Cache-Volume, nach Ordnerpfad abgelegt, und gelten für den
 * nächsten Scan.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const SETTINGS_FILE = 'struktur.json'

/**
 * Wie ein Ordner gelesen werden soll.
 *
 * `einzelfolgen`: jede Audiodatei ist ein eigenes Hörbuch.
 * `einBuch`: der Ordner ist ein Hörbuch – auch wenn eine `buch.json` daneben
 * etwas anderes sagt. Steht nichts da, entscheidet die `buch.json`.
 */
export type FolderMode = 'einzelfolgen' | 'einBuch'

export type Structure = ReadonlyMap<string, FolderMode>

function isMode(value: unknown): value is FolderMode {
  return value === 'einzelfolgen' || value === 'einBuch'
}

/** Liest die Datei defensiv – sie ist von Hand änderbar und darf kaputt sein. */
export function parseStructure(raw: unknown): Map<string, FolderMode> {
  const settings = new Map<string, FolderMode>()
  if (typeof raw !== 'object' || raw === null) return settings

  for (const [folder, mode] of Object.entries(raw as Record<string, unknown>)) {
    if (folder !== '' && isMode(mode)) settings.set(folder, mode)
  }
  return settings
}

export async function readStructure(cacheDir: string): Promise<Map<string, FolderMode>> {
  try {
    return parseStructure(JSON.parse(await readFile(join(cacheDir, SETTINGS_FILE), 'utf8')))
  } catch {
    // Keine Datei, kaputtes JSON: Dann gilt, was auf dem NAS steht.
    return new Map()
  }
}

export async function writeStructure(cacheDir: string, settings: Structure): Promise<void> {
  await writeFile(
    join(cacheDir, SETTINGS_FILE),
    JSON.stringify(Object.fromEntries(settings), null, 2),
    'utf8',
  )
}
