import { getAudioElement } from './audioElement'
import { type AudioEngine, createAudioEngine } from './audioEngine'

/**
 * Die eine Player-Instanz der App.
 *
 * Sie lebt bewusst ausserhalb von React: Es gibt genau ein `<audio>`-Element
 * (siehe `audioElement.ts`), und die Wiedergabe soll beim Wechsel zwischen
 * Bildschirmen nicht abreissen.
 *
 * Woher die Adressen kommen, ändert sich dagegen mit der Anmeldung – deshalb
 * fragt die Engine bei jedem Laden nach, statt den Client festzuhalten.
 */
let engine: AudioEngine | null = null
let resolver: (bookId: string, fileIdx: number) => string | null = () => null

export function setAudioUrlResolver(
  next: (bookId: string, fileIdx: number) => string | null,
): void {
  resolver = next
}

export function getEngine(): AudioEngine {
  engine ??= createAudioEngine({
    element: getAudioElement(),
    audioUrl: (bookId, fileIdx) => resolver(bookId, fileIdx),
  })
  return engine
}
