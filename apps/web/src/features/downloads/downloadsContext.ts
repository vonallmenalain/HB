import { createContext, use } from 'react'

import { type Book } from '@/features/library/catalog'

import { type DownloadRecord } from './downloads'
import { type StorageInfo } from './mediaCache'

export interface DownloadsContextValue {
  /** Stand je Buch, nach Buch-ID. */
  records: ReadonlyMap<string, DownloadRecord>
  /**
   * Darf das aktive Profil herunterladen? Die Eltern entscheiden das pro Kind –
   * sonst ist das Tablet nach einem Nachmittag voll.
   */
  allowed: boolean
  /** Kann dieses Gerät überhaupt speichern? */
  supported: boolean
  /**
   * Übernimmt das Betriebssystem den Download? Dann läuft er weiter, auch
   * wenn die App geschlossen ist.
   */
  background: boolean
  storage: StorageInfo | null
  get: (bookId: string) => DownloadRecord | null
  start: (book: Book) => void
  cancel: (bookId: string) => void
  remove: (book: Book) => void
  /**
   * Adresse einer bereits geladenen Datei – oder `null`.
   *
   * Absichtlich synchron: Der Player fragt im selben Moment, in dem das Kind
   * tippt. Ein `await` an dieser Stelle würde die Nutzergeste verlieren, und
   * Android verweigert dann die Wiedergabe.
   */
  offlineUrl: (bookId: string, fileIdx: number) => string | null
  offlineCoverUrl: (bookId: string) => string | null
}

export const DownloadsContext = createContext<DownloadsContextValue | null>(null)

export function useDownloads(): DownloadsContextValue {
  const value = use(DownloadsContext)
  if (!value) throw new Error('useDownloads ausserhalb von <DownloadProvider> benutzt')
  return value
}
