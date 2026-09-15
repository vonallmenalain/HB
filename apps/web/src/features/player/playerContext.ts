import { createContext, use } from 'react'

import { type Book, type Chapter } from '@/features/library/catalog'

import { type SleepMode } from './sleepTimer'

export interface PlayerContextValue {
  book: Book | null
  /** Globale Sekunde im Buch. */
  positionSec: number
  durationSec: number
  playing: boolean
  loading: boolean
  finished: boolean
  error: boolean
  chapter: Chapter | null
  /** Eingestellter Einschlaf-Timer, oder `null`. */
  sleepMode: SleepMode | null
  /** Restzeit des Einschlaf-Timers in Sekunden. */
  sleepRemainingSec: number
  /** Öffnet das Buch an der gespeicherten Stelle und startet. */
  playBook: (book: Book) => void
  /** Öffnet das Buch an einer bestimmten Sekunde und startet. */
  playFrom: (book: Book, positionSec: number) => void
  toggle: () => void
  skip: (deltaSec: number) => void
  nextChapter: () => void
  previousChapter: () => void
  seekTo: (positionSec: number) => void
  /** Einschlaf-Timer setzen oder mit `null` abschalten. */
  setSleep: (mode: SleepMode | null) => void
  /** Hält an und macht den Player zu: kein Buch mehr offen, keine Leiste unten. */
  stop: () => void
}

export const PlayerContext = createContext<PlayerContextValue | null>(null)

export function usePlayer(): PlayerContextValue {
  const value = use(PlayerContext)
  if (!value) throw new Error('usePlayer ausserhalb von <PlayerProvider> benutzt')
  return value
}
