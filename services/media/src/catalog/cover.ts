/**
 * Cover aufbereiten und wiederfinden.
 *
 * Zwei Quellen, ein Ziel: Was der Scanner auf dem NAS findet, und was jemand im
 * Adminbereich hochlädt. Beides landet als verkleinertes JPEG im Cache-Volume –
 * der Hörbuch-Ordner selbst ist nur lesend eingebunden und bleibt unberührt.
 */
import { createHash } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'

import sharp from 'sharp'

const COVER_MAX_PIXELS = 600

/** Das Cover, das der Scanner aus dem Ordner erzeugt hat. */
export function scannedCoverPath(cacheDir: string, bookId: string): string {
  return join(cacheDir, 'covers', `${bookId}.jpg`)
}

/**
 * Das im Adminbereich hochgeladene Cover.
 *
 * Bewusst ein eigener Ordner: Der Scanner schreibt `covers/` bei jedem Lauf neu,
 * und ein hochgeladenes Bild darf davon nicht überschrieben werden.
 */
export function manualCoverPath(cacheDir: string, bookId: string): string {
  return join(cacheDir, 'manual', `${bookId}.jpg`)
}

/**
 * Das online gefundene Cover.
 *
 * Eine eigene Stufe zwischen den beiden anderen: Es schlägt, was auf dem NAS
 * liegt – dort steht meist gar nichts, sonst hätte niemand danach gesucht –,
 * und wird selbst von einem hochgeladenen Bild geschlagen. Wer von Hand etwas
 * hinlegt, hat sich das Buch angesehen; eine Suche hat nur gerechnet.
 */
export function onlineCoverPath(cacheDir: string, bookId: string): string {
  return join(cacheDir, 'online', `${bookId}.jpg`)
}

/**
 * Fingerabdruck der Cover-Quelle.
 *
 * Bewusst die Quelle und nicht das erzeugte JPEG: Das wird bei jedem Scan neu
 * geschrieben und bekäme jedes Mal eine neue Änderungszeit – die Adresse würde
 * sich dann grundlos ändern und jeden Browser-Cache verwerfen.
 */
export async function coverVersionOf(sourcePath: string): Promise<string | null> {
  try {
    const stats = await stat(sourcePath)
    return createHash('sha1')
      .update(`${String(stats.size)}:${String(stats.mtimeMs)}`, 'utf8')
      .digest('hex')
      .slice(0, 8)
  } catch {
    return null
  }
}

/**
 * Verkleinert ein Bild und legt es ab. Liefert den Pfad oder null.
 *
 * Kein Wurf bei kaputten Dateien: Auf einem gewachsenen NAS liegt auch mal eine
 * `cover.jpg`, die keine ist – deswegen soll kein Scan abbrechen.
 */
export async function writeCover(
  target: string,
  source: Buffer | string,
): Promise<string | null> {
  try {
    await sharp(source)
      .resize(COVER_MAX_PIXELS, COVER_MAX_PIXELS, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toFile(target)
    return target
  } catch {
    return null
  }
}
