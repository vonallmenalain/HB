import { createHash } from 'node:crypto'

import { scanLibrary } from './catalog/scan.js'
import type { Book, BookLocation, Catalog, ScanResult } from './catalog/types.js'

export interface CatalogStore {
  catalog: () => Catalog
  /** ETag des ausgelieferten Katalogs. */
  etag: () => string
  location: (bookId: string) => BookLocation | undefined
  book: (bookId: string) => Book | undefined
  rescan: () => Promise<void>
  scanning: () => boolean
}

/**
 * Hält den eingelesenen Katalog im Speicher.
 *
 * Ein laufender Scan blockiert keine Anfrage: Bis er fertig ist, wird weiter
 * der vorherige Stand ausgeliefert. Ein zweiter Scan-Aufruf hängt sich an den
 * laufenden, statt die Bibliothek doppelt zu lesen.
 */
export function createCatalogStore(options: {
  mediaRoot: string
  cacheDir: string
  onNotice?: (message: string) => void
}): CatalogStore {
  let current: ScanResult = {
    catalog: { schemaVersion: 1, generatedAt: new Date(0).toISOString(), books: [] },
    locations: new Map(),
  }
  let etagValue = '"leer"'
  let running: Promise<void> | null = null

  function refreshEtag(): void {
    const digest = createHash('sha1')
      .update(JSON.stringify(current.catalog), 'utf8')
      .digest('hex')
      .slice(0, 16)
    etagValue = `"${digest}"`
  }

  async function rescan(): Promise<void> {
    running ??= (async () => {
      try {
        const scanOptions: Parameters<typeof scanLibrary>[0] = {
          mediaRoot: options.mediaRoot,
          cacheDir: options.cacheDir,
        }
        if (options.onNotice) scanOptions.onNotice = options.onNotice
        current = await scanLibrary(scanOptions)
        refreshEtag()
      } finally {
        running = null
      }
    })()
    return running
  }

  return {
    catalog: () => current.catalog,
    etag: () => etagValue,
    location: (bookId) => current.locations.get(bookId),
    book: (bookId) => current.catalog.books.find((entry) => entry.id === bookId),
    rescan,
    scanning: () => running !== null,
  }
}
