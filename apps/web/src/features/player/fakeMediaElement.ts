import { type MediaElement } from './audioEngine'

/**
 * Medienelement für Tests.
 *
 * jsdom spielt nichts ab – `play()` ist dort schlicht nicht umgesetzt. Diese
 * Attrappe bildet nach, was der Player wirklich braucht: Quellwechsel,
 * Zeitposition und die Ereignisse, die ein Browser feuert.
 */
export interface FakeMediaElement extends MediaElement {
  /** Simuliert, dass der Browser die Metadaten gelesen hat. */
  emitLoadedMetadata: (duration?: number) => void
  /** Simuliert das Ende der laufenden Datei. */
  emitEnded: () => void
  /**
   * Simuliert einen Abbruch – wie Chrome: erst `error`, dann `pause`.
   *
   * Das `pause` gehört dazu, weil es genau das ist, was ein Player nicht für
   * einen Wunsch zum Anhalten halten darf.
   */
  emitError: () => void
  /** Simuliert, dass der Puffer leer ist und auf Daten gewartet wird. */
  emitWaiting: () => void
  /** Simuliert, dass Daten eintreffen. */
  emitProgress: () => void
  /** Simuliert, dass es nach dem Warten weitergeht. */
  emitPlaying: () => void
  /** Simuliert fortschreitende Wiedergabe. */
  advanceTo: (seconds: number) => void
  playCalls: number
  loadCalls: number
}

export function createFakeMediaElement(
  options: { failPlay?: boolean } = {},
): FakeMediaElement {
  const listeners = new Map<string, Set<() => void>>()
  const fire = (type: string): void => {
    for (const listener of listeners.get(type) ?? []) listener()
  }

  const element: FakeMediaElement = {
    src: '',
    currentTime: 0,
    duration: Number.NaN,
    paused: true,
    playbackRate: 1,
    volume: 1,
    playCalls: 0,
    loadCalls: 0,

    play: () => {
      element.playCalls += 1
      if (options.failPlay === true) return Promise.reject(new Error('NotAllowedError'))
      element.paused = false
      fire('play')
      return Promise.resolve()
    },
    pause: () => {
      element.paused = true
      fire('pause')
    },
    load: () => {
      element.loadCalls += 1
      // Wie im Browser: Neu laden hält an, ohne ein `pause` zu feuern.
      element.paused = true
      element.currentTime = 0
      element.duration = Number.NaN
    },
    addEventListener: (type, listener) => {
      const set = listeners.get(type) ?? new Set()
      set.add(listener)
      listeners.set(type, set)
    },
    removeEventListener: (type, listener) => {
      listeners.get(type)?.delete(listener)
    },

    emitLoadedMetadata: (duration = 600) => {
      element.duration = duration
      fire('loadedmetadata')
    },
    emitEnded: () => {
      // Ein echtes `ended` kommt erst, wenn die Datei durchgelaufen ist – die
      // Position steht dann am Ende, nicht dort, wo sie zuletzt war.
      if (Number.isFinite(element.duration)) element.currentTime = element.duration
      // Und wie im Browser geht ihm ein `pause` voraus.
      if (!element.paused) {
        element.paused = true
        fire('pause')
      }
      fire('ended')
    },
    emitError: () => {
      fire('error')
      if (!element.paused) {
        element.paused = true
        fire('pause')
      }
    },
    emitWaiting: () => {
      fire('waiting')
    },
    emitProgress: () => {
      fire('progress')
    },
    emitPlaying: () => {
      fire('playing')
    },
    advanceTo: (seconds) => {
      element.currentTime = seconds
      fire('timeupdate')
    },
  }

  return element
}
