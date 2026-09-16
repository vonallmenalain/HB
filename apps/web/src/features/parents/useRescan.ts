import { useCallback, useEffect, useRef, useState } from 'react'

import {
  type MediaClient,
  type MediaError,
  MediaRequestError,
} from '@/features/library/mediaClient'

/** Abstand zwischen zwei Blicken auf `/health`, solange ein Scan läuft. */
const PROBE_INTERVAL_MS = 3000

/**
 * So lange schaut die App einem laufenden Scan zu.
 *
 * Danach hört nur die Anzeige auf zu warten – der Dienst liest weiter. Ein
 * erster Scan über eine grosse Bibliothek muss jede Datei einmal ganz lesen,
 * um ihre Spieldauer zu bestimmen, und das dauert auf einem NAS.
 */
const MAX_WAIT_MS = 15 * 60 * 1000

/** Nach so vielen erfolglosen Blicken hintereinander gilt das NAS als weg. */
const MAX_PROBE_FAILURES = 3

export type RescanState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; neu: number; gesamt: number }
  | { kind: 'still-running' }
  | { kind: 'failed'; reason: MediaError }

function reasonOf(error: unknown): MediaError {
  return error instanceof MediaRequestError ? error.reason : 'server'
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * Lässt das NAS seine Ordner neu einlesen und wartet, bis es fertig ist.
 *
 * Der Unterschied zum blossen Neuladen des Katalogs ist der entscheidende:
 * `refresh` holt, was der Dienst zuletzt gefunden hat – ein Ordner, der seither
 * aufs NAS kopiert wurde, ist da noch gar nicht dabei. Von selbst sieht der
 * Dienst erst nach `HB_RESCAN_INTERVAL_MINUTES` wieder nach.
 *
 * Wie viele Hörbücher dazugekommen sind, verrät der Vergleich der Zählstände
 * vor und nach dem Scan – das beantwortet die eigentliche Frage („ist mein
 * neuer Ordner angekommen?") ohne Blick in die Bibliothek.
 */
export function useRescan(
  client: MediaClient | null,
  refresh: () => void,
): { state: RescanState; start: () => void } {
  const [state, setState] = useState<RescanState>({ kind: 'idle' })

  // Nach dem Verlassen des Elternbereichs soll nichts mehr gesetzt werden.
  const lebt = useRef(true)
  useEffect(() => {
    lebt.current = true
    return () => {
      lebt.current = false
    }
  }, [])

  const start = useCallback(() => {
    if (client === null) {
      refresh()
      return
    }
    setState({ kind: 'running' })

    void (async () => {
      let vorher: number
      try {
        vorher = (await client.fetchStatus()).books
        await client.startRescan()
      } catch (error) {
        if (lebt.current) setState({ kind: 'failed', reason: reasonOf(error) })
        return
      }

      const bis = Date.now() + MAX_WAIT_MS
      let fehlversuche = 0

      while (Date.now() < bis) {
        await sleep(PROBE_INTERVAL_MS)
        if (!lebt.current) return

        let scanning: boolean
        let books: number
        try {
          const status = await client.fetchStatus()
          scanning = status.scanning
          books = status.books
          fehlversuche = 0
        } catch (error) {
          // Ein einzelner Aussetzer während eines langen Scans ist normal –
          // erst mehrere hintereinander heissen, dass das NAS wirklich weg ist.
          fehlversuche += 1
          if (fehlversuche < MAX_PROBE_FAILURES) continue
          if (lebt.current) setState({ kind: 'failed', reason: reasonOf(error) })
          return
        }

        if (scanning) continue

        refresh()
        if (lebt.current) {
          setState({ kind: 'done', neu: Math.max(books - vorher, 0), gesamt: books })
        }
        return
      }

      if (lebt.current) setState({ kind: 'still-running' })
    })()
  }, [client, refresh])

  return { state, start }
}
