import { createHash } from 'node:crypto'

/**
 * Stabile Kennungen.
 *
 * Die Buch-ID muss über Scans hinweg gleich bleiben – sonst verliert jedes Kind
 * seinen Fortschritt, sobald der Katalog neu eingelesen wird. Sie hängt deshalb
 * am relativen Pfad und an sonst nichts.
 */
export function bookId(relativePath: string): string {
  const digest = createHash('sha1').update(relativePath, 'utf8').digest('hex')
  return `b_${digest.slice(0, 12)}`
}

/**
 * Fingerabdruck der Dateiliste. Ändert er sich, ist eine gespeicherte Position
 * als (Datei, Offset) nicht mehr verlässlich und muss über die globale Sekunde
 * neu aufgelöst werden.
 *
 * Die Dauer gehört mit hinein: Eine neu kodierte Datei kann zufällig dieselbe
 * Byte-Grösse behalten, und dann würde der Player eine gespeicherte Stelle für
 * exakt halten, obwohl sich die Zeitachse verschoben hat. Die Änderungszeit
 * wäre der naheliegende Kandidat, taugt aber schlechter: Ein blosses `touch`
 * würde jede exakte Position verwerfen, obwohl sich nichts geändert hat.
 */
export function filesHash(
  files: readonly { fileName: string; bytes: number; durationSec: number }[],
): string {
  const input = files
    .map((file) => `${file.fileName}:${String(file.bytes)}:${String(Math.round(file.durationSec))}`)
    .join('|')
  return createHash('sha1').update(input, 'utf8').digest('hex').slice(0, 16)
}
