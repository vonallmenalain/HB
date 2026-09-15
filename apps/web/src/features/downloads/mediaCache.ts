/**
 * Der Speicher für heruntergeladene Hörbücher.
 *
 * Cache Storage statt IndexedDB, weil er für grosse Antworten gebaut ist: Eine
 * Kapiteldatei von 25 MB wandert dort als Ganzes hinein, ohne dass sie je
 * vollständig im Arbeitsspeicher liegen müsste.
 *
 * **Der Schlüssel ist die Adresse ohne Ticket.** Das ist der entscheidende
 * Kniff: Das Ticket in der URL wechselt alle paar Stunden – wäre es Teil des
 * Schlüssels, wäre jeder Download am nächsten Tag wertlos.
 */
export const MEDIA_CACHE = 'hb-media-v1'

/**
 * Cache Storage fehlt in unsicheren Kontexten und im privaten Modus mancher
 * Browser. Dann gibt es eben keine Downloads – die App läuft weiter.
 */
export async function openMediaCache(): Promise<Cache | null> {
  try {
    if (typeof caches === 'undefined') return null
    return await caches.open(MEDIA_CACHE)
  } catch {
    return null
  }
}

export async function hasAudio(cache: Cache, url: string): Promise<boolean> {
  try {
    return (await cache.match(url)) !== undefined
  } catch {
    return false
  }
}

export async function putAudio(cache: Cache, url: string, response: Response): Promise<void> {
  await cache.put(url, response)
}

/**
 * Eine abspielbare Adresse für eine bereits geladene Datei.
 *
 * Der Umweg über den Blob ist Absicht: Ein `<audio>`-Element stellt
 * Range-Anfragen, und die müsste ein Service Worker aus der vollständigen
 * Antwort erst als `206` nachbauen. Eine Object-URL kann der Browser selbst
 * stückweise lesen – einfacher, schneller, eine Fehlerquelle weniger.
 */
export async function audioObjectUrl(cache: Cache, url: string): Promise<string | null> {
  try {
    const response = await cache.match(url)
    if (response === undefined) return null
    return URL.createObjectURL(await response.blob())
  } catch {
    return null
  }
}

export async function deleteAudio(cache: Cache, urls: readonly string[]): Promise<void> {
  await Promise.all(
    urls.map(async (url) => {
      try {
        await cache.delete(url)
      } catch {
        // bewusst ignoriert – ein Rest im Cache ist kein Grund anzuhalten
      }
    }),
  )
}

/** Wie viel Platz die Dateien eines Buchs tatsächlich belegen. */
export async function cachedBytes(cache: Cache, urls: readonly string[]): Promise<number> {
  let total = 0
  for (const url of urls) {
    try {
      const response = await cache.match(url)
      if (response === undefined) continue
      total += (await response.blob()).size
    } catch {
      // Eine unlesbare Antwort zählt als nicht vorhanden.
    }
  }
  return total
}

export interface StorageInfo {
  usageBytes: number
  quotaBytes: number
}

export async function readStorageInfo(): Promise<StorageInfo | null> {
  try {
    const estimate = await navigator.storage.estimate()
    return { usageBytes: estimate.usage ?? 0, quotaBytes: estimate.quota ?? 0 }
  } catch {
    return null
  }
}

/**
 * Bittet darum, den Speicher nicht bei Platzmangel wegzuräumen.
 *
 * Bei einer installierten PWA gewährt Android das in der Regel ohne Rückfrage.
 * Ein „nein" ist kein Fehler – der Download läuft trotzdem, er ist dann nur
 * nicht vor dem Aufräumen des Systems geschützt.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
