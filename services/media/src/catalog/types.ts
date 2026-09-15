/**
 * Katalog-Schema. Entspricht docs/DATENMODELL.md §2 – Änderungen hier müssen
 * dort mitziehen und `schemaVersion` erhöhen.
 */
export const SCHEMA_VERSION = 2

export interface BookFile {
  idx: number
  durationSec: number
  bytes: number
  mime: string
}

export interface Chapter {
  idx: number
  title: string
  fileIdx: number
  /** Globale Sekunden im gesamten Buch, nicht relativ zur Datei. */
  startSec: number
  endSec: number
}

export interface Book {
  id: string
  title: string
  /**
   * Der Ordnername auf dem NAS, unverändert.
   *
   * Der Titel oben ist aufgeräumt – ohne Reihennamen, ohne Nummer, mit
   * vereinheitlichten Trennzeichen. Im Adminbereich muss aber nachvollziehbar
   * bleiben, woraus er entstanden ist: Sonst lässt sich weder suchen noch
   * beurteilen, ob das Aufräumen danebenlag.
   */
  folderName: string
  /** Oberster Ordner unter dem Medien-Stamm – die Reihe, nach der die App gliedert. */
  series: string | null
  /**
   * Ordner zwischen Reihe und Buch, etwa „Adventskalender" oder „Mini-Fälle".
   * Null, wenn das Buch direkt in der Reihe liegt.
   */
  group: string | null
  seriesIndex: number | null
  author: string | null
  narrator: string | null
  durationSec: number
  cover: string | null
  coverColor: string
  tags: string[]
  addedAt: string
  /** Ändert sich, sobald Dateien dazukommen, wegfallen oder wachsen. */
  filesHash: string
  files: BookFile[]
  chapters: Chapter[]
}

export interface Catalog {
  schemaVersion: number
  generatedAt: string
  books: Book[]
}

/** Interner Index: verbindet Katalog-IDs mit echten Pfaden. */
export interface BookLocation {
  id: string
  /** Absolute Pfade, Reihenfolge entspricht `files[].idx`. */
  filePaths: string[]
  /** Absoluter Pfad des aufbereiteten Covers oder null. */
  coverPath: string | null
}

export interface ScanResult {
  catalog: Catalog
  locations: Map<string, BookLocation>
}
