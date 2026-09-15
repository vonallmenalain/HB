import {
  type Book,
  fileStartSec,
  globalPosition,
  resolvePosition,
} from '@/features/library/catalog'

/**
 * Was der Player von einem Medienelement braucht.
 *
 * Bewusst schmal gehalten: Ein echtes `<audio>` erfüllt das strukturell, und im
 * Test lässt sich dieselbe Logik ohne echte Wiedergabe prüfen – jsdom spielt
 * nichts ab.
 */
export interface MediaElement {
  src: string
  currentTime: number
  duration: number
  paused: boolean
  playbackRate: number
  play: () => Promise<void>
  pause: () => void
  load: () => void
  addEventListener: (type: string, listener: () => void) => void
  removeEventListener: (type: string, listener: () => void) => void
}

export interface PlayerSnapshot {
  book: Book | null
  /** Globale Sekunde im Buch. */
  positionSec: number
  durationSec: number
  playing: boolean
  /** Quelle gewechselt, Metadaten noch nicht da. */
  loading: boolean
  /** Das Buch ist bis zum Ende gelaufen. */
  finished: boolean
  error: boolean
}

const EMPTY: PlayerSnapshot = {
  book: null,
  positionSec: 0,
  durationSec: 0,
  playing: false,
  loading: false,
  finished: false,
  error: false,
}

export interface AudioEngine {
  subscribe: (listener: () => void) => () => void
  snapshot: () => PlayerSnapshot
  open: (book: Book, positionSec: number) => void
  play: () => Promise<void>
  pause: () => void
  toggle: () => Promise<void>
  /** Springt auf eine globale Sekunde im Buch. */
  seekTo: (positionSec: number) => void
  /** Verschiebt um Sekunden, auch über Dateigrenzen hinweg. */
  skip: (deltaSec: number) => void
  nextChapter: () => void
  previousChapter: () => void
  close: () => void
}

/**
 * Wie weit zurück beim Fortsetzen gesprungen wird.
 *
 * Steht in jeder guten Hörbuch-App und hilft beim Wiedereinsteigen – man hört
 * den letzten Satz noch einmal an, statt mitten hineinzufallen.
 */
export const RESUME_REWIND_SEC = 5

export function createAudioEngine(deps: {
  element: MediaElement
  audioUrl: (bookId: string, fileIdx: number) => string | null
}): AudioEngine {
  const { element } = deps

  let book: Book | null = null
  let fileIdx = 0
  let pendingSeek: number | null = null
  let state: PlayerSnapshot = EMPTY

  const listeners = new Set<() => void>()
  const emit = (patch: Partial<PlayerSnapshot>): void => {
    state = { ...state, ...patch }
    for (const listener of listeners) listener()
  }

  function currentGlobal(): number {
    if (!book) return 0
    return globalPosition(book, fileIdx, element.currentTime)
  }

  /** Lädt die Datei, in der die globale Sekunde liegt, und springt dorthin. */
  function load(target: number, autoplay: boolean): void {
    if (!book) return

    const { fileIdx: nextFile, offsetSec } = resolvePosition(book, target)
    const url = deps.audioUrl(book.id, nextFile)
    if (url === null) {
      emit({ error: true, loading: false })
      return
    }

    if (nextFile !== fileIdx || element.src !== url) {
      fileIdx = nextFile
      pendingSeek = offsetSec
      element.src = url
      element.load()
      emit({ loading: true, error: false, positionSec: target })
    } else {
      element.currentTime = offsetSec
      emit({ positionSec: target })
    }

    if (autoplay) void play()
  }

  async function play(): Promise<void> {
    if (!book) return
    try {
      await element.play()
      emit({ playing: true, finished: false, error: false })
    } catch {
      // Ohne Nutzergeste verweigern Browser die Wiedergabe – kein Fehlerfall,
      // der Knopf bleibt einfach auf „Pause".
      emit({ playing: false })
    }
  }

  function pause(): void {
    element.pause()
    emit({ playing: false, positionSec: currentGlobal() })
  }

  const onLoadedMetadata = (): void => {
    if (pendingSeek !== null) {
      element.currentTime = pendingSeek
      pendingSeek = null
    }
    emit({ loading: false, positionSec: currentGlobal() })
  }

  const onTimeUpdate = (): void => {
    if (state.loading) return
    emit({ positionSec: currentGlobal() })
  }

  const onEnded = (): void => {
    if (!book) return

    const next = book.files.find((file) => fileStartSec(book!, file.idx) > fileStartSec(book!, fileIdx))
    if (next) {
      // Nahtlos weiter: dieselbe Elementinstanz behält die Wiedergabe-Erlaubnis.
      load(fileStartSec(book, next.idx), true)
      return
    }

    emit({ playing: false, finished: true, positionSec: book.durationSec })
  }

  const onError = (): void => {
    emit({ error: true, loading: false, playing: false })
  }

  const onPause = (): void => {
    if (state.playing) emit({ playing: false })
  }

  const onPlay = (): void => {
    if (!state.playing) emit({ playing: true })
  }

  element.addEventListener('loadedmetadata', onLoadedMetadata)
  element.addEventListener('timeupdate', onTimeUpdate)
  element.addEventListener('ended', onEnded)
  element.addEventListener('error', onError)
  element.addEventListener('pause', onPause)
  element.addEventListener('play', onPlay)

  return {
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    snapshot: () => state,

    open: (nextBook, positionSec) => {
      const sameBook = book?.id === nextBook.id
      book = nextBook
      emit({
        book: nextBook,
        durationSec: nextBook.durationSec,
        finished: false,
        error: false,
        positionSec,
      })
      if (!sameBook) fileIdx = -1
      load(positionSec, false)
    },

    play,
    pause,
    toggle: async () => {
      if (state.playing) {
        pause()
        return
      }
      await play()
    },

    seekTo: (positionSec) => {
      if (!book) return
      const clamped = Math.min(book.durationSec, Math.max(0, positionSec))
      load(clamped, state.playing)
    },

    skip: (deltaSec) => {
      if (!book) return
      const clamped = Math.min(book.durationSec, Math.max(0, currentGlobal() + deltaSec))
      load(clamped, state.playing)
    },

    nextChapter: () => {
      if (!book) return
      const position = currentGlobal()
      const next = book.chapters.find((chapter) => chapter.startSec > position)
      load(next ? next.startSec : book.durationSec, state.playing)
    },

    previousChapter: () => {
      if (!book) return
      const position = currentGlobal()
      // Innerhalb der ersten drei Sekunden zum vorigen Kapitel, sonst an den
      // Anfang des laufenden – so verhalten sich alle Player, und Kinder
      // treffen den Knopf ohnehin mehrfach.
      const current = book.chapters.find(
        (chapter) => position >= chapter.startSec && position < chapter.endSec,
      )
      if (!current) {
        load(0, state.playing)
        return
      }
      if (position - current.startSec > 3) {
        load(current.startSec, state.playing)
        return
      }
      const previous = [...book.chapters].reverse().find((c) => c.endSec <= current.startSec)
      load(previous ? previous.startSec : 0, state.playing)
    },

    close: () => {
      element.pause()
      element.removeEventListener('loadedmetadata', onLoadedMetadata)
      element.removeEventListener('timeupdate', onTimeUpdate)
      element.removeEventListener('ended', onEnded)
      element.removeEventListener('error', onError)
      element.removeEventListener('pause', onPause)
      element.removeEventListener('play', onPlay)
      book = null
      state = EMPTY
      for (const listener of listeners) listener()
    },
  }
}
