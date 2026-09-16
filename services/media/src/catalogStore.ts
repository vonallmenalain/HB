import { createHash } from 'node:crypto'
import { mkdir, rm } from 'node:fs/promises'
import { dirname } from 'node:path'

import { coverPath } from './catalog/build.js'
import { coverVersionOf, manualCoverPath, writeCover } from './catalog/cover.js'
import { scanLibrary } from './catalog/scan.js'
import { type FolderMode, readStructure, writeStructure } from './catalog/settings.js'
import type { Book, BookLocation, Catalog, ScanResult } from './catalog/types.js'

/** Ein Ordner auf dem NAS, wie ihn der Adminbereich zur Wahl stellt. */
export interface FolderInfo {
  /** Pfad relativ zum Medien-Stamm. */
  path: string
  books: number
  files: number
  /** Ein paar Titel daraus – damit man den Ordner wiedererkennt. */
  titles: string[]
  /** Was im Adminbereich eingestellt ist; null heisst „wie auf dem NAS". */
  mode: FolderMode | null
}

export interface CatalogStore {
  catalog: () => Catalog
  /** ETag des ausgelieferten Katalogs. */
  etag: () => string
  location: (bookId: string) => BookLocation | undefined
  book: (bookId: string) => Book | undefined
  rescan: () => Promise<void>
  scanning: () => boolean
  /** Die Datei, die als Cover ausgeliefert wird – hochgeladen schlägt gescannt. */
  coverFile: (bookId: string) => Promise<string | null>
  /** Ordner, für die sich eine Umstellung überhaupt lohnt. */
  folders: () => Promise<FolderInfo[]>
  /**
   * Stellt einen Ordner um.
   *
   * Wirksam wird das erst beim nächsten Scan – den stösst der Aufrufer an, wie
   * bei `/admin/rescan` auch. Sonst hinge die Antwort minutenlang an einer
   * grossen Bibliothek.
   */
  setFolderMode: (folder: string, mode: FolderMode | null) => Promise<void>
  /** Legt ein hochgeladenes Cover ab. Liefert die neue Adresse oder null. */
  setManualCover: (bookId: string, image: Buffer) => Promise<string | null>
  /** Nimmt es wieder weg; danach gilt wieder, was auf dem NAS liegt. */
  clearManualCover: (bookId: string) => Promise<boolean>
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

  /**
   * Tauscht ein Buch im Katalog aus.
   *
   * Der Katalog wird sonst nur vom Scan geschrieben. Ein hochgeladenes Cover
   * soll aber sofort sichtbar sein und nicht erst nach dem nächsten Einlesen –
   * bei tausend Ordnern dauert das zu lange, um darauf zu warten.
   */
  function replaceBook(bookId: string, cover: string | null): boolean {
    const index = current.catalog.books.findIndex((entry) => entry.id === bookId)
    const book = current.catalog.books[index]
    if (index < 0 || book === undefined) return false

    const books = [...current.catalog.books]
    books[index] = { ...book, cover }
    current = { ...current, catalog: { ...current.catalog, books } }
    refreshEtag()
    return true
  }

  return {
    catalog: () => current.catalog,
    etag: () => etagValue,
    location: (bookId) => current.locations.get(bookId),
    book: (bookId) => current.catalog.books.find((entry) => entry.id === bookId),
    rescan,
    scanning: () => running !== null,

    coverFile: async (bookId) => {
      const manual = manualCoverPath(options.cacheDir, bookId)
      if ((await coverVersionOf(manual)) !== null) return manual
      return current.locations.get(bookId)?.coverPath ?? null
    },

    folders: async () => {
      const structure = await readStructure(options.cacheDir)
      const byFolder = new Map<string, FolderInfo>()

      for (const book of current.catalog.books) {
        const location = current.locations.get(book.id)
        if (location === undefined) continue

        const eintrag = byFolder.get(location.folder) ?? {
          path: location.folder,
          books: 0,
          files: 0,
          titles: [],
          mode: structure.get(location.folder) ?? null,
        }
        eintrag.books += 1
        eintrag.files += location.filePaths.length
        // Drei Titel reichen zum Wiedererkennen; neunzig wären eine Liste.
        if (eintrag.titles.length < 3) eintrag.titles.push(book.title)
        byFolder.set(location.folder, eintrag)
      }

      // Ein Ordner mit einer einzigen Datei lässt sich nicht aufteilen, und ein
      // Buch aus CD-Ordnern liegt nicht selbst im Ordner – beides gehört nicht
      // in eine Liste zum Umstellen.
      return [...byFolder.values()]
        .filter((eintrag) => eintrag.files > 1)
        .sort((a, b) => b.files - a.files || a.path.localeCompare(b.path, 'de'))
    },

    setFolderMode: async (folder, mode) => {
      const structure = await readStructure(options.cacheDir)
      if (mode === null) structure.delete(folder)
      else structure.set(folder, mode)
      await writeStructure(options.cacheDir, structure)
    },

    setManualCover: async (bookId, image) => {
      if (current.catalog.books.every((entry) => entry.id !== bookId)) return null

      const target = manualCoverPath(options.cacheDir, bookId)
      await mkdir(dirname(target), { recursive: true })
      // `writeCover` entscheidet auch, ob das überhaupt ein Bild ist: Was sharp
      // nicht lesen kann, wird nicht abgelegt.
      if ((await writeCover(target, image)) === null) return null

      const version = await coverVersionOf(target)
      const cover = coverPath(bookId, version)
      return replaceBook(bookId, cover) ? cover : null
    },

    clearManualCover: async (bookId) => {
      await rm(manualCoverPath(options.cacheDir, bookId), { force: true })
      return replaceBook(bookId, current.locations.get(bookId)?.scannedCover ?? null)
    },
  }
}
