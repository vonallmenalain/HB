import { createHash } from 'node:crypto'
import { mkdir, readdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { coverPath } from './catalog/build.js'
import {
  coverVersionOf,
  manualCoverPath,
  onlineCoverPath,
  writeCover,
} from './catalog/cover.js'
import { scanLibrary } from './catalog/scan.js'
import { type FolderMode, readStructure, writeStructure } from './catalog/settings.js'
import type { Book, BookLocation, Catalog, ScanResult } from './catalog/types.js'
import {
  type CoverSucheStand,
  type CoverVorschlag,
  createCoverSuche,
} from './covers/suche.js'
import { readVorschlaege, writeVorschlaege } from './covers/vorschlaege.js'

/** Ein Cover ist ein Bild, kein Film. */
const MAX_BILD_BYTES = 8 * 1024 * 1024

/** Woher ein Bild kommt, das nicht auf dem NAS liegt. */
export type CoverHerkunft = 'hochgeladen' | 'online'

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
  /** Die Datei, die als Cover ausgeliefert wird – eigenes schlägt gescanntes. */
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
  /** Die Bücher mit einem eigenen Bild – hochgeladen oder online gefunden. */
  ownCovers: () => Promise<Record<string, CoverHerkunft>>
  /** Legt ein hochgeladenes Cover ab. Liefert die neue Adresse oder null. */
  setManualCover: (bookId: string, image: Buffer) => Promise<string | null>
  /** Nimmt jedes eigene Bild wieder weg. Liefert, ob überhaupt eines da war. */
  clearOwnCover: (bookId: string) => Promise<boolean>
  /** Startet den Lauf, der fehlende Cover online sucht. */
  startCoverSearch: () => 'gestartet' | 'laeuft'
  coverSearchState: () => CoverSucheStand
  /** Die Treffer, die auf eine Bestätigung warten. */
  coverSuggestions: () => Record<string, CoverVorschlag[]>
  /**
   * Reicht ein vorgeschlagenes Bild zum Ansehen durch, ohne es abzulegen.
   *
   * Über den Dienst statt direkt aus dem Browser: Sonst müsste die
   * Content-Security-Policy fremde Bildquellen zulassen, und jeder Aufruf
   * verriete dem Anbieter, wer gerade im Adminbereich sitzt.
   */
  previewSuggestion: (bookId: string, imageUrl: string) => Promise<{ bytes: Buffer; mime: string } | null>
  /**
   * Übernimmt einen Vorschlag.
   *
   * Die Adresse muss aus der Vorschlagsliste dieses Buchs stammen. Sonst wäre
   * die Route eine Aufforderung an den Dienst, eine beliebige Adresse im
   * Netz – auch im Heimnetz – abzurufen.
   */
  applySuggestion: (bookId: string, imageUrl: string) => Promise<string | null>
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
  /** Abstand zwischen zwei Anfragen an eine Cover-Quelle. Für Tests. */
  coverPauseMs?: number
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

  /**
   * Legt ein Bild in einer der beiden eigenen Stufen ab.
   *
   * Gemeinsam für hochgeladen und online gefunden: Der Unterschied ist der
   * Ordner, alles andere – prüfen, verkleinern, Version bilden, Katalog
   * nachziehen – ist dasselbe.
   */
  async function schreibeCover(
    bookId: string,
    image: Buffer,
    ziel: string,
  ): Promise<string | null> {
    if (current.catalog.books.every((entry) => entry.id !== bookId)) return null

    await mkdir(dirname(ziel), { recursive: true })
    // `writeCover` entscheidet auch, ob das überhaupt ein Bild ist: Was sharp
    // nicht lesen kann, wird nicht abgelegt.
    if ((await writeCover(ziel, image)) === null) return null

    const version = await coverVersionOf(ziel)
    const cover = coverPath(bookId, version)
    return replaceBook(bookId, cover) ? cover : null
  }

  /** Bilder, die der Dienst durchreicht – alles andere kommt nicht herein. */
  const BILD_TYPEN = ['image/jpeg', 'image/png', 'image/webp']

  /** Holt ein Bild von einer Adresse, die dieser Dienst selbst vorgeschlagen hat. */
  async function holeBild(url: string): Promise<{ bytes: Buffer; mime: string } | null> {
    try {
      const antwort = await fetch(url, { signal: AbortSignal.timeout(15_000) })
      if (!antwort.ok) return null

      const mime = (antwort.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? ''
      if (!BILD_TYPEN.includes(mime)) return null

      const bytes = Buffer.from(await antwort.arrayBuffer())
      return bytes.length === 0 || bytes.length > MAX_BILD_BYTES ? null : { bytes, mime }
    } catch {
      return null
    }
  }

  /**
   * Der Vorschlag, den eine Adresse meint – oder nichts.
   *
   * Nur eine Adresse, die dieser Dienst selbst vorgeschlagen hat. Ohne diese
   * Prüfung wären die Routen darüber eine Aufforderung an den Dienst,
   * irgendeine Adresse abzurufen – auch eine im Heimnetz, an die von aussen
   * niemand herankommt.
   */
  function vorschlagFuer(bookId: string, imageUrl: string): boolean {
    return suche
      .vorschlaege()
      .get(bookId)
      ?.some((eintrag) => eintrag.imageUrl === imageUrl) === true
  }

  const suche = createCoverSuche({
    // Frisch geholt, nicht eingefroren: Zwischen zwei Läufen kann ein Scan den
    // Katalog ausgetauscht haben.
    buecher: () =>
      current.catalog.books
        .filter((book) => book.cover === null)
        .map((book) => ({
          id: book.id,
          series: book.series,
          seriesIndex: book.seriesIndex,
          title: book.title,
        })),
    holen: fetch,
    setzen: (bookId, bild) =>
      schreibeCover(bookId, bild, onlineCoverPath(options.cacheDir, bookId)),
    merken: (vorschlaege) => writeVorschlaege(options.cacheDir, vorschlaege),
    ...(options.onNotice ? { onNotice: options.onNotice } : {}),
    ...(options.coverPauseMs === undefined ? {} : { pauseMs: options.coverPauseMs }),
  })

  // Was ein früherer Lauf gefunden hat, ist nach einem Neustart wieder da –
  // sonst wäre eine dreiviertel Stunde Suche mit jedem neuen Image verloren.
  void readVorschlaege(options.cacheDir).then(
    (gemerkt) => {
      suche.uebernehmen(gemerkt)
    },
    () => {
      // Keine Datei, kaputtes JSON: Dann fängt die Liste leer an.
    },
  )

  async function setzeOnlineCover(bookId: string, image: Buffer): Promise<string | null> {
    return schreibeCover(bookId, image, onlineCoverPath(options.cacheDir, bookId))
  }

  return {
    catalog: () => current.catalog,
    etag: () => etagValue,
    location: (bookId) => current.locations.get(bookId),
    book: (bookId) => current.catalog.books.find((entry) => entry.id === bookId),
    rescan,
    scanning: () => running !== null,

    coverFile: async (bookId) => {
      // Erst nachschlagen, dann einen Pfad bauen – nie umgekehrt. Aus der
      // Adresse kommt eine Kennung, und `join` würde ein „../" darin brav
      // auflösen: Damit stünde der Cache-Ordner offen, obwohl die Route nie
      // einen Pfad entgegennehmen wollte.
      const location = current.locations.get(bookId)
      if (location === undefined) return null

      const manual = manualCoverPath(options.cacheDir, bookId)
      if ((await coverVersionOf(manual)) !== null) return manual
      const online = onlineCoverPath(options.cacheDir, bookId)
      if ((await coverVersionOf(online)) !== null) return online
      return location.coverPath
    },

    ownCovers: async () => {
      const gefunden: Record<string, CoverHerkunft> = {}
      // Die schwächere Stufe zuerst, damit ein hochgeladenes Bild sie
      // überschreibt – dieselbe Rangfolge wie beim Ausliefern.
      for (const [ordner, herkunft] of [
        ['online', 'online'],
        ['manual', 'hochgeladen'],
      ] as const) {
        let dateien: string[]
        try {
          dateien = await readdir(join(options.cacheDir, ordner))
        } catch {
          continue
        }
        for (const name of dateien) {
          const bookId = name.replace(/\.jpg$/i, '')
          // Nur, was auch im Katalog steht: Ein Bild zu einem Buch, das es
          // nicht mehr gibt, interessiert niemanden.
          if (current.locations.has(bookId)) gefunden[bookId] = herkunft
        }
      }
      return gefunden
    },

    folders: async () => {
      const structure = await readStructure(options.cacheDir)
      const byFolder = new Map<string, FolderInfo>()

      for (const book of current.catalog.books) {
        const location = current.locations.get(book.id)
        if (location?.switchable !== true) continue

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

      // Ein Ordner mit einer einzigen Datei lässt sich nicht aufteilen.
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

    setManualCover: async (bookId, image) =>
      schreibeCover(bookId, image, manualCoverPath(options.cacheDir, bookId)),

    clearOwnCover: async (bookId) => {
      // Auch hier gilt: kein Pfad aus einer Kennung, die der Katalog nicht
      // kennt. Sonst löschte ein „../" irgendein Bild im Cache-Volume.
      const location = current.locations.get(bookId)
      if (location === undefined) return false

      // Beide Stufen auf einmal: „Eigenes Bild zurücknehmen" heisst, dass
      // wieder gilt, was auf dem NAS liegt. Bliebe das online gefundene
      // stehen, täte der Knopf scheinbar nichts.
      let gab = false
      for (const pfad of [
        manualCoverPath(options.cacheDir, bookId),
        onlineCoverPath(options.cacheDir, bookId),
      ]) {
        if ((await coverVersionOf(pfad)) !== null) gab = true
        await rm(pfad, { force: true })
      }

      suche.vergessen(bookId)
      replaceBook(bookId, location.scannedCover)
      return gab
    },

    startCoverSearch: () => suche.starten(),
    coverSearchState: () => suche.stand(),
    coverSuggestions: () => Object.fromEntries(suche.vorschlaege()),

    previewSuggestion: async (bookId, imageUrl) =>
      vorschlagFuer(bookId, imageUrl) ? holeBild(imageUrl) : null,

    applySuggestion: async (bookId, imageUrl) => {
      if (!vorschlagFuer(bookId, imageUrl)) return null

      const bild = await holeBild(imageUrl)
      if (bild === null) return null

      const cover = await setzeOnlineCover(bookId, bild.bytes)
      if (cover !== null) suche.vergessen(bookId)
      return cover
    },
  }
}
