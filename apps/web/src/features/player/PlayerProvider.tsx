import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react'

import { type Book, chapterAt, resolvePosition } from '@/features/library/catalog'
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

/** Abstand, in dem der Fortschritt während der Wiedergabe gesichert wird. */
const PERSIST_INTERVAL_MS = 5000

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { client } = useLibrary()
  const { get: getProgress, save: saveProgress } = useProgress()

  const engine = useMemo(() => (typeof document === 'undefined' ? null : getEngine()), [])

  // Der Client wechselt mit der Anmeldung, die Engine lebt länger als er.
  useEffect(() => {
    setAudioUrlResolver((bookId, fileIdx) => client?.audioUrl(bookId, fileIdx) ?? null)
  }, [client])
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

  useEffect(() => {
    if (snapshot?.playing !== true) return
    const timer = setInterval(() => {
      persistRef.current()
    }, PERSIST_INTERVAL_MS)
    return () => {
      clearInterval(timer)
    }
  }, [snapshot?.playing])

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
    const cover = book?.cover != null ? (client?.coverUrl(book.cover) ?? null) : null
    setMediaMetadata(book, chapter?.title ?? book?.title ?? '', cover)
  }, [book, chapter, client])

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
      stop: () => {
        persistRef.current()
        engine?.pause()
      },
    }
  }, [engine, book, positionSec, snapshot, chapter, getProgress])

  return <PlayerContext value={value}>{children}</PlayerContext>
}
