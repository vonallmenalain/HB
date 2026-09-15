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
  emitError: () => void
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
      element.paused = true
      fire('ended')
    },
    emitError: () => {
      fire('error')
    },
    advanceTo: (seconds) => {
      element.currentTime = seconds
      fire('timeupdate')
    },
  }

  return element
}
