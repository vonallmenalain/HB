/**
 * Der eigentliche Download, als reine Ablaufsteuerung.
 *
 * Nichts hier kennt `fetch`, Cache Storage oder React – alles kommt von
 * aussen. Dadurch lässt sich das prüfen, worauf es ankommt: dass ein
 * abgebrochener Download fortsetzbar ist, dass eine kaputte Datei nicht den
 * Rest mitreisst, und dass nach dem Abbruch nichts mehr geschrieben wird.
 */
export interface DownloadTarget {
  fileIdx: number
  /** Adresse ohne Ticket – zugleich der Schlüssel im Cache. */
  key: string
  /** Adresse mit Ticket, von der tatsächlich geladen wird. */
  url: string
  bytes: number
}

export interface DownloadProgress {
  filesDone: number
  bytesDone: number
}

export type DownloadOutcome = 'done' | 'aborted' | 'failed'

export async function runDownload(deps: {
  targets: readonly DownloadTarget[]
  /** Liegt die Datei schon? Dann wird sie übersprungen. */
  has: (key: string) => Promise<boolean>
  load: (target: DownloadTarget) => Promise<Response>
  store: (key: string, response: Response) => Promise<void>
  onProgress: (progress: DownloadProgress) => void
  aborted: () => boolean
}): Promise<DownloadOutcome> {
  let filesDone = 0
  let bytesDone = 0

  for (const target of deps.targets) {
    if (deps.aborted()) return 'aborted'

    try {
      // Schon vorhandene Dateien überspringen – das macht einen abgebrochenen
      // Download fortsetzbar, ohne dass er sich merken müsste, wo er war.
      if (await deps.has(target.key)) {
        filesDone += 1
        bytesDone += target.bytes
        deps.onProgress({ filesDone, bytesDone })
        continue
      }

      const response = await deps.load(target)
      if (!response.ok) return 'failed'
      if (deps.aborted()) return 'aborted'

      await deps.store(target.key, response)
    } catch {
      // Abgebrochen sieht aus wie fehlgeschlagen – der Unterschied liegt
      // allein darin, ob jemand es wollte.
      return deps.aborted() ? 'aborted' : 'failed'
    }

    filesDone += 1
    bytesDone += target.bytes
    deps.onProgress({ filesDone, bytesDone })
  }

  return deps.aborted() ? 'aborted' : 'done'
}
