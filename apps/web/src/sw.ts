/// <reference lib="webworker" />

/**
 * Service Worker der App.
 *
 * Zwei Aufgaben: die App-Hülle vorhalten, damit die PWA installierbar ist und
 * offline startet – und Downloads entgegennehmen, die Android für uns erledigt
 * hat. Der zweite Teil ist der Grund für `injectManifest` statt eines
 * generierten Service Workers.
 *
 * Wichtig am zweiten Teil: Er läuft möglicherweise, **wenn die App längst
 * geschlossen ist**. Alles, was danach noch stimmen muss – die Dateien im
 * Cache, der Stand in IndexedDB –, muss deshalb hier passieren und nicht im
 * Fenster.
 */
import { clientsClaim } from 'workbox-core'
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
  type PrecacheEntry,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

import { completeBackgroundFetch } from '@/features/downloads/backgroundFetchStore'
import { type BackgroundFetchRegistration } from '@/features/downloads/backgroundFetchTypes'
import { MEDIA_CACHE, bookIdFromFetchId } from '@/features/downloads/mediaKeys'
import { readDownload, writeDownload } from '@/lib/db'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (string | PrecacheEntry)[]
}

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Jede Navigation liefert die App-Hülle aus – die Route entscheidet dann im
// Client. Medien-Endpunkte laufen nie über diesen Fallback.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//, /^\/auth\//, /^\/audio\//, /^\/cover\//],
  }),
)

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  // Wird ausgelöst, wenn die Nutzerin die neue Version bewusst annimmt.
  if ((event.data as { type?: string } | undefined)?.type === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
})

/** Nachricht an alle offenen Fenster: Der Stand eines Buchs hat sich geändert. */
async function tellClients(bookId: string): Promise<void> {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
  for (const client of clients) client.postMessage({ type: 'HB_DOWNLOAD_CHANGED', bookId })
}

interface BackgroundFetchEvent extends ExtendableEvent {
  readonly registration: BackgroundFetchRegistration
  updateUI?: (options: { title?: string }) => Promise<void>
}

/**
 * Die Dateien einer Übergabe einsammeln.
 *
 * Auch nach einem Fehlschlag: Android bricht schon ab, wenn eine einzige
 * Datei fehlt. Was daneben heil angekommen ist, soll trotzdem liegen bleiben –
 * der nächste Versuch fragt dann nur noch nach dem Rest.
 */
async function collectFiles(
  registration: BackgroundFetchRegistration,
): Promise<{ url: string; response: Response | null }[]> {
  if (!registration.recordsAvailable) return []
  const records = await registration.matchAll()

  return Promise.all(
    records.map(async (record) => ({
      url: record.request.url,
      // Bei einer gescheiterten Datei bricht `responseReady` ab – das ist
      // kein Grund, die heil angekommenen liegen zu lassen.
      response: await record.responseReady.catch(() => null),
    })),
  )
}

/** Übernimmt, was das Betriebssystem gebracht hat, und gibt Bescheid. */
function handleFetchEnd(
  event: Event,
  incompleteStatus: 'failed' | 'idle',
  title: (status: string) => string,
): void {
  const fetchEvent = event as BackgroundFetchEvent
  const bookId = bookIdFromFetchId(fetchEvent.registration.id)
  if (bookId === null) return

  fetchEvent.waitUntil(
    (async () => {
      const cache = await caches.open(MEDIA_CACHE)
      const status = await completeBackgroundFetch({
        bookId,
        files: await collectFiles(fetchEvent.registration),
        downloaded: fetchEvent.registration.downloaded,
        incompleteStatus,
        put: (key, response) => cache.put(key, response),
        readRecord: readDownload,
        writeRecord: writeDownload,
      })

      await fetchEvent.updateUI?.({ title: title(status) })
      await tellClients(bookId)
    })(),
  )
}

/** Android hat alles geladen. */
self.addEventListener('backgroundfetchsuccess', (event: Event) => {
  handleFetchEnd(event, 'failed', (status) =>
    status === 'done' ? 'Hörbuch ist da' : 'Hörbuch unvollständig',
  )
})

/** Android hat aufgegeben – das Heilgebliebene wird trotzdem übernommen. */
self.addEventListener('backgroundfetchfail', (event: Event) => {
  handleFetchEnd(event, 'failed', (status) =>
    status === 'done' ? 'Hörbuch ist da' : 'Hörbuch unvollständig',
  )
})

/** Jemand hat abgebrochen: kein Fehler, und das Geladene bleibt liegen. */
self.addEventListener('backgroundfetchabort', (event: Event) => {
  handleFetchEnd(event, 'idle', () => 'Download abgebrochen')
})

/** Tippt jemand die Benachrichtigung an, soll die App aufgehen. */
self.addEventListener('backgroundfetchclick', (event: Event) => {
  const fetchEvent = event as BackgroundFetchEvent
  fetchEvent.waitUntil(self.clients.openWindow('/'))
})

clientsClaim()
