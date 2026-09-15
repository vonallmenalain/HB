import { type Progress } from './progress'

/**
 * Abstand zwischen zwei Schreibvorgängen desselben Buchs in die Cloud.
 *
 * Lokal wird alle fünf Sekunden gesichert – das kostet nichts. Firestore
 * dagegen zählt jeden Schreibvorgang, und eine Stelle, die dreissig Sekunden
 * alt ist, reicht für „weiterhören auf dem anderen Gerät" vollkommen aus.
 */
export const CLOUD_MIN_INTERVAL_MS = 30_000

export interface SyncQueue {
  /** Nimmt einen Stand entgegen; wann er hinausgeht, entscheidet die Schlange. */
  push: (progress: Progress) => void
  /** Schreibt alles Wartende sofort – beim Pausieren, Wegwischen, Profilwechsel. */
  flush: () => void
}

/**
 * Drosselt die Schreibvorgänge in die Cloud, ohne je einen Stand zu verlieren.
 *
 * Der erste Stand eines Buchs geht sofort hinaus, danach höchstens einer pro
 * Intervall. Kommt währenddessen ein neuerer, ersetzt er den wartenden – es
 * liegt immer nur die zuletzt gehörte Stelle an, nicht eine Warteschlange
 * veralteter Zwischenstände.
 *
 * Jedes Buch hat seinen eigenen Takt: Wechselt ein Kind das Buch, soll die
 * neue Stelle nicht warten müssen, nur weil kurz zuvor die alte geschrieben
 * wurde.
 */
export function createSyncQueue({
  write,
  minIntervalMs = CLOUD_MIN_INTERVAL_MS,
  now = () => Date.now(),
}: {
  write: (progress: Progress) => void
  minIntervalMs?: number
  now?: () => number
}): SyncQueue {
  const pending = new Map<string, Progress>()
  const lastWrite = new Map<string, number>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  function send(progress: Progress): void {
    pending.delete(progress.bookId)
    lastWrite.set(progress.bookId, now())
    write(progress)
  }

  function clearTimer(bookId: string): void {
    const timer = timers.get(bookId)
    if (timer === undefined) return
    clearTimeout(timer)
    timers.delete(bookId)
  }

  return {
    push(progress) {
      const last = lastWrite.get(progress.bookId)
      if (last === undefined || now() - last >= minIntervalMs) {
        clearTimer(progress.bookId)
        send(progress)
        return
      }

      pending.set(progress.bookId, progress)
      if (timers.has(progress.bookId)) return

      const bookId = progress.bookId
      timers.set(
        bookId,
        setTimeout(() => {
          timers.delete(bookId)
          const waiting = pending.get(bookId)
          if (waiting !== undefined) send(waiting)
        }, minIntervalMs - (now() - last)),
      )
    },

    flush() {
      for (const bookId of [...timers.keys()]) clearTimer(bookId)
      for (const progress of [...pending.values()]) send(progress)
    },
  }
}
