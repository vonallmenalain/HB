import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react'

import { type Book, chapterAt, resolvePosition } from '@/features/library/catalog'
import { useDownloads } from '@/features/downloads/downloadsContext'
import { useHistory } from '@/features/history/historyContext'
import { useLibrary } from '@/features/library/libraryContext'
import { makeProgress, resolveResume } from '@/features/progress/progress'
import { useProgress } from '@/features/progress/progressContext'

import { getEngine, setAudioUrlResolver } from './engine'
import {
  SKIP_SECONDS,
  setMediaHandlers,
  setMediaMetadata,
  setMediaPlaybackState,
  setMediaPosition,
} from './mediaSession'
import { PlayerContext } from './playerContext'
import { type SleepMode } from './sleepTimer'

/** Abstand, in dem der Fortschritt während der Wiedergabe gesichert wird. */
const PERSIST_INTERVAL_MS = 5000

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { client } = useLibrary()
  const { get: getProgress, save: saveProgress } = useProgress()
  const { offlineUrl, offlineCoverUrl } = useDownloads()
  const history = useHistory()

  const engine = useMemo(() => (typeof document === 'undefined' ? null : getEngine()), [])

  // Der Client wechselt mit der Anmeldung, die Engine lebt länger als er.
  //
  // Was auf dem Gerät liegt, hat Vorrang: kein Netz, kein Ticket, kein
  // abgelaufenes Ticket. Erst wenn dort nichts liegt, wird gestreamt.
  useEffect(() => {
    setAudioUrlResolver(
      (bookId, fileIdx) =>
        offlineUrl(bookId, fileIdx) ?? client?.audioUrl(bookId, fileIdx) ?? null,
    )
  }, [client, offlineUrl])
  const snapshot = useSyncExternalStore(
    engine?.subscribe ?? (() => () => undefined),
    engine?.snapshot ?? (() => null),
    engine?.snapshot ?? (() => null),
  )

  const book = snapshot?.book ?? null
  const positionSec = snapshot?.positionSec ?? 0

  const persist = useCallback(() => {
    if (!book) return
    const { fileIdx, offsetSec } = resolvePosition(book, positionSec)
    saveProgress(makeProgress(book, positionSec, fileIdx, offsetSec))
  }, [book, positionSec, saveProgress])

  // Laufend sichern. Der Abstand ist der Kompromiss aus „nie mehr als ein paar
  // Sekunden verlieren" und „nicht bei jedem Zeitsprung schreiben".
  //
  // Die Referenz wird im Effekt nachgezogen, nicht beim Rendern: Der Timer und
  // die Lauscher unten sollen immer die aktuelle Funktion aufrufen, ohne dass
  // sie bei jeder Positionsänderung neu aufgesetzt werden.
  const persistRef = useRef(persist)
  useEffect(() => {
    persistRef.current = persist
  }, [persist])

  // Dasselbe Spiel wie beim Sichern: Der Takt soll nicht neu aufgesetzt
  // werden, nur weil der Aufzeichner eine neue Funktion bekommen hat.
  const historyRef = useRef(history)
  useEffect(() => {
    historyRef.current = history
  }, [history])

  // Ein geöffnetes Buch ist ein Hörvorgang – das ist die Zahl, die im
  // Adminbereich „wie oft gehört" beantwortet.
  useEffect(() => {
    if (book) historyRef.current.started(book)
  }, [book])

  /**
   * Gehörte Sekunden aus dem Fortschritt, nicht aus dem Takt.
   *
   * Ein Takt alle fünf Sekunden heisst nicht fünf Sekunden Ton: Beim Puffern
   * steht die Zeit still, und im Hintergrund darf der Browser den Takt
   * strecken. Gezählt wird deshalb, wie weit die Stelle im Buch gewandert ist
   * – höchstens aber so viel, wie tatsächlich Zeit vergangen ist, damit ein
   * Sprung nach vorn nicht als Hören zählt.
   */
  const zuletztGezaehlt = useRef<{ positionSec: number; zeitMs: number } | null>(null)

  const zaehleGehoertes = useCallback(() => {
    if (!book) return
    const jetzt = Date.now()
    const vorher = zuletztGezaehlt.current
    zuletztGezaehlt.current = { positionSec, zeitMs: jetzt }
    if (vorher === null) return

    const gehoert = positionSec - vorher.positionSec
    const vergangen = (jetzt - vorher.zeitMs) / 1000
    if (gehoert > 0) historyRef.current.listened(book, Math.min(gehoert, vergangen))
  }, [book, positionSec])

  const zaehlenRef = useRef(zaehleGehoertes)
  useEffect(() => {
    zaehlenRef.current = zaehleGehoertes
  }, [zaehleGehoertes])

  // Ein neues Buch fängt bei null an, sonst zählte der Sprung vom letzten
  // Buch als gehörte Zeit.
  useEffect(() => {
    zuletztGezaehlt.current = null
  }, [book])

  useEffect(() => {
    if (snapshot?.playing !== true) return
    const timer = setInterval(() => {
      persistRef.current()
      zaehlenRef.current()
    }, PERSIST_INTERVAL_MS)
    return () => {
      clearInterval(timer)
      // Beim Anhalten zählt der letzte angefangene Abschnitt noch mit; danach
      // beginnt die Messung von vorn, damit die Pause nicht mitzählt.
      zaehlenRef.current()
      zuletztGezaehlt.current = null
    }
  }, [snapshot?.playing, book])

  // Beim Wegwischen der App bleibt keine Zeit mehr für asynchrone Arbeit –
  // deshalb hier und nicht erst beim Aufräumen.
  useEffect(() => {
    const onHide = (): void => {
      persistRef.current()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide)
    }
  }, [])

  const chapter = useMemo(
    () => (book ? chapterAt(book, positionSec) : null),
    [book, positionSec],
  )

  // Sperrbildschirm mitführen.
  useEffect(() => {
    const offlineCover = book === null ? null : offlineCoverUrl(book.id)
    const cover =
      offlineCover ?? (book?.cover != null ? (client?.coverUrl(book.cover) ?? null) : null)
    setMediaMetadata(book, chapter?.title ?? book?.title ?? '', cover)
  }, [book, chapter, client, offlineCoverUrl])

  useEffect(() => {
    setMediaPlaybackState(snapshot?.playing ?? false)
  }, [snapshot?.playing])

  useEffect(() => {
    if (book) setMediaPosition(positionSec, book.durationSec)
  }, [book, positionSec])

  useEffect(() => {
    if (!engine) return
    if (!book) {
      setMediaHandlers(null)
      return
    }
    setMediaHandlers({
      play: () => void engine.play(),
      pause: () => {
        engine.pause()
        persistRef.current()
      },
      seekBackward: () => {
        engine.skip(-SKIP_SECONDS)
      },
      seekForward: () => {
        engine.skip(SKIP_SECONDS)
      },
      previousChapter: engine.previousChapter,
      nextChapter: engine.nextChapter,
      seekTo: engine.seekTo,
    })
    return () => {
      setMediaHandlers(null)
    }
  }, [engine, book])

  // Ein zu Ende gehörtes Buch soll als solches gespeichert sein.
  useEffect(() => {
    if (snapshot?.finished === true) persistRef.current()
  }, [snapshot?.finished])

  const value = useMemo(() => {
    const playFrom = (next: Book, position: number): void => {
      engine?.open(next, position)
      void engine?.play()
    }

    return {
      book,
      positionSec,
      durationSec: snapshot?.durationSec ?? 0,
      playing: snapshot?.playing ?? false,
      loading: snapshot?.loading ?? false,
      finished: snapshot?.finished ?? false,
      error: snapshot?.error ?? false,
      chapter,
      sleepMode: snapshot?.sleepMode ?? null,
      sleepRemainingSec: snapshot?.sleepRemainingSec ?? 0,
      playBook: (next: Book) => {
        playFrom(next, resolveResume(next, getProgress(next.id)).positionSec)
      },
      playFrom,
      toggle: () => {
        const wasPlaying = snapshot?.playing === true
        void engine?.toggle()
        if (wasPlaying) persistRef.current()
      },
      skip: (deltaSec: number) => {
        engine?.skip(deltaSec)
      },
      nextChapter: () => {
        engine?.nextChapter()
      },
      previousChapter: () => {
        engine?.previousChapter()
      },
      seekTo: (position: number) => {
        engine?.seekTo(position)
      },
      setSleep: (mode: SleepMode | null) => {
        engine?.setSleep(mode)
      },
      /**
       * Anhalten und zumachen.
       *
       * Vorher hielt `stop` nur an – die Leiste am unteren Rand blieb dann
       * stehen, obwohl niemand mehr hörte. Die Stelle wird vorher gesichert;
       * sie steht danach wieder oben auf der Startseite unter „Weiterhören".
       */
      stop: () => {
        persistRef.current()
        zaehlenRef.current()
        engine?.stop()
      },
    }
  }, [engine, book, positionSec, snapshot, chapter, getProgress])

  return <PlayerContext value={value}>{children}</PlayerContext>
}
