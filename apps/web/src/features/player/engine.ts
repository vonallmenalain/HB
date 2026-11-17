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
let renewal: (force: boolean) => Promise<void> = () => Promise.resolve()

export function setAudioUrlResolver(
  next: (bookId: string, fileIdx: number) => string | null,
): void {
  resolver = next
}

/**
 * Wie die Engine nach einem Abbruch an ein frisches Ticket kommt.
 *
 * Getrennt vom Resolver, weil das eine warten muss und das andere nicht darf:
 * `<audio src>` braucht die Adresse sofort, ein neues Ticket einen Weg zum NAS.
 */
export function setAccessRenewal(next: (force: boolean) => Promise<void>): void {
  renewal = next
}

/**
 * Läuft gerade Ton – oder ist er gleich da?
 *
 * Fragt, ohne die Engine dafür erst anzulegen: Wer nur wissen will, ob er
 * stören würde, soll dafür kein `<audio>`-Element erzeugen. Laden zählt mit –
 * wer eben auf Abspielen getippt hat, wartet auf Ton.
 */
export function isAudioBusy(): boolean {
  const state = engine?.snapshot()
  return state !== undefined && (state.playing || state.loading)
}

export function getEngine(): AudioEngine {
  engine ??= createAudioEngine({
    element: getAudioElement(),
    audioUrl: (bookId, fileIdx) => resolver(bookId, fileIdx),
    renewAccess: (force) => renewal(force),
  })
  return engine
}
