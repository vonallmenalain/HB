import {
  type BackgroundFetchManager,
  type BackgroundFetchRegistration,
} from './backgroundFetchTypes'
import { fetchIdFor } from './mediaKeys'

/**
 * Den Download an das Betriebssystem übergeben.
 *
 * Auf Android ist das der Unterschied zwischen „Tablet offen lassen" und
 * „antippen und weglegen": Der Transfer läuft weiter, wenn die App geschlossen
 * oder der Bildschirm aus ist, Android zeigt eine eigene Benachrichtigung, und
 * ein unterbrochener Download wird vom System selbst wieder aufgenommen,
 * sobald wieder WLAN da ist.
 *
 * Wo es die Schnittstelle nicht gibt – Desktop, iOS, ältere Geräte –, liefert
 * alles hier `null`, und die App lädt wie bisher im Vordergrund.
 */
export async function backgroundFetchManager(): Promise<BackgroundFetchManager | null> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
    const registration = await navigator.serviceWorker.ready
    return registration.backgroundFetch ?? null
  } catch {
    return null
  }
}

export interface BackgroundJob {
  bookId: string
  title: string
  /** Adressen **mit** Ticket – geladen wird damit, abgelegt wird ohne. */
  urls: readonly string[]
  /**
   * Die erwartete Gesamtgrösse. Android bricht ab, wenn tatsächlich mehr
   * ankommt – deshalb kommt hier nur, was im Katalog genau beziffert ist.
   */
  downloadTotal: number
  iconUrl?: string | null
}

export async function startBackgroundFetch(
  manager: BackgroundFetchManager,
  job: BackgroundJob,
): Promise<BackgroundFetchRegistration | null> {
  try {
    // `cors` ist Pflicht: Eine undurchsichtige Antwort lässt sich später nicht
    // in den Cache legen – `cache.put` weist sie zurück.
    const requests = job.urls.map(
      (url) => new Request(url, { mode: 'cors', credentials: 'omit' }),
    )

    return await manager.fetch(fetchIdFor(job.bookId), requests, {
      title: job.title,
      downloadTotal: job.downloadTotal,
      ...(job.iconUrl != null ? { icons: [{ src: job.iconUrl, sizes: '512x512' }] } : {}),
    })
  } catch {
    // Schon in der Schlange, kein Platz, vom Nutzer abgelehnt: Der Aufrufer
    // lädt dann im Vordergrund.
    return null
  }
}

export async function findBackgroundFetch(
  manager: BackgroundFetchManager,
  bookId: string,
): Promise<BackgroundFetchRegistration | null> {
  try {
    return (await manager.get(fetchIdFor(bookId))) ?? null
  } catch {
    return null
  }
}

export async function abortBackgroundFetch(
  manager: BackgroundFetchManager,
  bookId: string,
): Promise<boolean> {
  const registration = await findBackgroundFetch(manager, bookId)
  if (registration === null) return false
  try {
    return await registration.abort()
  } catch {
    return false
  }
}

/** Alle laufenden Übergaben, die zu diesem Programm gehören. */
export async function runningBackgroundFetches(
  manager: BackgroundFetchManager,
): Promise<BackgroundFetchRegistration[]> {
  try {
    const ids = await manager.getIds()
    const found = await Promise.all(ids.map((id) => manager.get(id)))
    return found.filter((entry): entry is BackgroundFetchRegistration => entry !== undefined)
  } catch {
    return []
  }
}
