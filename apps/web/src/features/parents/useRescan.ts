import { useCallback, useEffect, useRef, useState } from 'react'

import {
  type MediaClient,
  type MediaError,
  MediaRequestError,
  type NasStatus,
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
  /** Der Scan endete, ohne einen neuen Katalog zu hinterlassen. */
  | { kind: 'incomplete' }
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
  const { state, run } = useScanWatch(client, refresh)
  return {
    state,
    // Ohne diese Hülle bekäme `run` das Klickereignis als Aufgabe gereicht.
    start: () => {
      run((bereit) => bereit.startRescan())
    },
  }
}

/**
 * Stösst etwas an, das auf dem NAS einen Scan auslöst, und wartet ihn ab.
 *
 * Das Warten ist bei jedem Auslöser dasselbe: Der Dienst antwortet sofort und
 * liest im Hintergrund weiter; fertig ist er erst, wenn `/health` keinen Scan
 * mehr meldet **und** einen neueren Zeitstempel trägt. Neue Ordner suchen und
 * einen Ordner umstellen unterscheiden sich nur im ersten Aufruf.
 */
export function useScanWatch(
  client: MediaClient | null,
  refresh: () => void,
): { state: RescanState; run: (start: (client: MediaClient) => Promise<unknown>) => void } {
  const [state, setState] = useState<RescanState>({ kind: 'idle' })

  // Nach dem Verlassen des Elternbereichs soll nichts mehr gesetzt werden.
  const lebt = useRef(true)
  useEffect(() => {
    lebt.current = true
    return () => {
      lebt.current = false
    }
  }, [])

  const run = useCallback(
    (start: (client: MediaClient) => Promise<unknown>) => {
      if (client === null) {
        refresh()
        return
      }
      setState({ kind: 'running' })

      void (async () => {
        let vorher: NasStatus
        try {
          vorher = await client.fetchStatus()
          await start(client)
        } catch (error) {
          if (lebt.current) setState({ kind: 'failed', reason: reasonOf(error) })
          return
        }

        const bis = Date.now() + MAX_WAIT_MS
        let fehlversuche = 0

        while (Date.now() < bis) {
          await sleep(PROBE_INTERVAL_MS)
          if (!lebt.current) return

          let jetzt: NasStatus
          try {
            jetzt = await client.fetchStatus()
            fehlversuche = 0
          } catch (error) {
            // Ein einzelner Aussetzer während eines langen Scans ist normal –
            // erst mehrere hintereinander heissen, dass das NAS wirklich weg ist.
            fehlversuche += 1
            if (fehlversuche < MAX_PROBE_FAILURES) continue
            if (lebt.current) setState({ kind: 'failed', reason: reasonOf(error) })
            return
          }

          if (jetzt.scanning) continue

          // Ein gescheiterter Scan endet genauso still wie ein erfolgreicher:
          // `scanning` steht wieder auf false, nur der Katalog ist der alte. Wer
          // dann „Fertig" liest, sucht den fehlenden Ordner an der falschen
          // Stelle – deshalb zählt nur ein neuer Zeitstempel als Erfolg.
          if (
            vorher.scannedAt !== null &&
            jetzt.scannedAt !== null &&
            jetzt.scannedAt === vorher.scannedAt
          ) {
            if (lebt.current) setState({ kind: 'incomplete' })
            return
          }

          refresh()
          if (lebt.current) {
            setState({
              kind: 'done',
              neu: Math.max(jetzt.books - vorher.books, 0),
              gesamt: jetzt.books,
            })
          }
          return
        }

        if (lebt.current) setState({ kind: 'still-running' })
      })()
    },
    [client, refresh],
  )

  return { state, run }
}
