import { type DownloadRecord, type DownloadStatus } from './downloads'
import { canonicalKey } from './mediaKeys'

/**
 * Was passiert, wenn das Betriebssystem einen Download beendet hat.
 *
 * Läuft im Service Worker – möglicherweise lange nachdem die App geschlossen
 * wurde. Deshalb steht hier nichts, was ein Fenster braucht, und deshalb ist
 * alles von aussen einsetzbar: Diese Datei ist der einzige Ort, an dem die
 * Übergabe stattfindet, und sie muss prüfbar sein, ohne dass ein Android-Gerät
 * dabei ist.
 */
export interface FetchedFile {
  url: string
  /** `null`, wenn diese Datei nicht angekommen ist. */
  response: Response | null
}

export interface CompleteDeps {
  bookId: string
  files: readonly FetchedFile[]
  /** Bytes, die das Betriebssystem bei diesem Versuch geladen hat. */
  downloaded: number
  /** Der Stand, wenn nicht alles angekommen ist: gescheitert oder abgebrochen. */
  incompleteStatus?: Extract<DownloadStatus, 'failed' | 'idle'>
  put: (key: string, response: Response) => Promise<void>
  readRecord: (bookId: string) => Promise<DownloadRecord | null>
  writeRecord: (record: DownloadRecord) => Promise<void>
  now?: () => Date
}

/**
 * Übernimmt die geladenen Dateien in den Cache und schreibt den Stand fort.
 *
 * **Auch dann, wenn die Übergabe insgesamt gescheitert ist.** Android bricht
 * schon ab, wenn eine einzige Datei fehlt – was daneben heil angekommen ist,
 * soll trotzdem liegen bleiben. Der nächste Versuch fragt nur noch nach dem
 * Rest.
 *
 * Eine Antwort, die nicht in Ordnung ist, wird nicht abgelegt: Sonst läge eine
 * Fehlerseite als Hörbuchkapitel im Cache, und das Kind hörte beim Antippen
 * Stille.
 */
export async function completeBackgroundFetch({
  bookId,
  files,
  downloaded,
  incompleteStatus = 'failed',
  put,
  readRecord,
  writeRecord,
  now = () => new Date(),
}: CompleteDeps): Promise<DownloadStatus> {
  let gespeichert = 0

  for (const file of files) {
    if (!file.response?.ok) continue
    try {
      await put(canonicalKey(file.url), file.response)
      gespeichert += 1
    } catch {
      // Ein voller Speicher oder eine undurchsichtige Antwort: Der Rest wird
      // trotzdem abgelegt, und unten steht dann „unvollständig".
    }
  }

  const vorher = await readRecord(bookId)
  const vollstaendig = files.length > 0 && gespeichert === files.length

  // Frühere Versuche mitzählen: Übergeben wird nur, was noch fehlt.
  const filesTotal = vorher?.filesTotal ?? files.length
  const bytesTotal = vorher?.bytesTotal ?? downloaded

  const record: DownloadRecord = {
    bookId,
    status: vollstaendig ? 'done' : incompleteStatus,
    filesTotal,
    filesDone: Math.min(filesTotal, (vorher?.filesDone ?? 0) + gespeichert),
    bytesTotal,
    // Bei „fertig" zählt die Grösse aus dem Katalog, nicht die Summe der
    // Versuche: Sonst stünde im Elternbereich mehr, als tatsächlich auf dem
    // Gerät liegt.
    bytesDone: vollstaendig
      ? bytesTotal
      : Math.min(bytesTotal, (vorher?.bytesDone ?? 0) + downloaded),
    filesHash: vorher?.filesHash ?? '',
    updatedAt: now().toISOString(),
  }
  await writeRecord(record)

  return record.status
}
