/// <reference lib="webworker" />

/**
 * Service Worker der App.
 *
 * Stand M1: nur die App-Hülle (Precache + Navigations-Fallback), damit die PWA
 * installierbar ist und offline startet. Der Audio-Cache und der Background
 * Fetch für ganze Hörbücher kommen in M7 hier dazu – deshalb `injectManifest`
 * statt eines generierten Service Workers.
 */
import { clientsClaim } from 'workbox-core'
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
  type PrecacheEntry,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

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

clientsClaim()
