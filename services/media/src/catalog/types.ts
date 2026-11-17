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
  /**
   * Ordner relativ zum Medien-Stamm, aus dem das Buch stammt.
   *
   * Beim gewöhnlichen Buch der Ordner mit den Dateien, bei einem Buch über
   * CD-Ordner der Ordner darüber, bei einer Einzelfolge der Ordner, in dem sie
   * liegt.
   */
  folder: string
  /**
   * Lässt sich dieser Ordner im Adminbereich umstellen?
   *
   * Nur wo die Audiodateien unmittelbar liegen: Ein Buch aus `CD 1` … `CD 20`
   * entsteht in einem anderen Zweig des Scanners, der die Einstellung gar
   * nicht liest – ein Knopf dafür wäre ein Knopf, der nichts tut.
   */
  switchable: boolean
  /** Absolute Pfade, Reihenfolge entspricht `files[].idx`. */
  filePaths: string[]
  /** Absoluter Pfad des aufbereiteten Covers oder null. */
  coverPath: string | null
  /**
   * Die Cover-Adresse aus dem Scan – ohne ein im Adminbereich hochgeladenes.
   *
   * Wird gebraucht, wenn jemand das hochgeladene Bild wieder wegnimmt: Dann
   * gilt wieder, was auf dem NAS liegt, ohne dafür neu einlesen zu müssen.
   */
  scannedCover: string | null
}

/**
 * Etwas, das der Scanner liegen gelassen hat.
 *
 * Kein Teil des Katalogs: Den bekommt jedes Gerät, und ein Kind braucht keine
 * Ordnerpfade. Die Liste geht nur an den Adminbereich.
 *
 * `folder` ist immer relativ zum Medien-Stamm – so, wie der Ordner auch in der
 * File Station heisst.
 */
export type ScanIssue =
  /** Ton- oder Filmdateien in einem Format, das der Scanner nicht einliest. */
  | {
      kind: 'unsupported-format'
      folder: string
      /** Die Dateinamen, natürlich sortiert. */
      files: string[]
      /** Ihre Endungen, kleingeschrieben und ohne Doppelte: `['.mka']`. */
      extensions: string[]
      /**
       * Liegt daneben gar nichts, was der Scanner abspielen kann?
       *
       * Dann fehlt der Ordner in der Bibliothek ganz – sonst nur diese Dateien.
       */
      noPlayableAudio: boolean
    }
  /** Dateien, die sich nicht lesen liessen – kaputt, abgeschnitten, gesperrt. */
  | {
      kind: 'unreadable-files'
      folder: string
      files: string[]
      /** Die Fehlermeldung der ersten Datei. */
      reason: string
      /** Liess sich keine einzige Datei des Hörbuchs lesen? Dann fehlt es ganz. */
      bookMissing: boolean
    }
  /** Ein Ordner, in den der Scanner nicht hineinsehen durfte. */
  | { kind: 'unreadable-folder'; folder: string; reason: string }
  /** Ton in einem Ordner, der tiefer liegt, als der Scanner sucht. */
  | { kind: 'too-deep'; folder: string }

export interface ScanResult {
  catalog: Catalog
  locations: Map<string, BookLocation>
  /** Was beim Einlesen liegen blieb, nach Ordner sortiert. */
  issues: ScanIssue[]
}
