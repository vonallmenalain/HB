import { type Book } from '@/features/library/catalog'

/**
 * Zustand eines heruntergeladenen Buchs.
 *
 * Gezählt wird in Dateien und Bytes, nicht in Prozent: Prozent lässt sich
 * daraus ausrechnen, umgekehrt nicht – und beim Fortsetzen eines abgebrochenen
 * Downloads muss bekannt sein, was schon liegt.
 */
export type DownloadStatus = 'idle' | 'queued' | 'running' | 'done' | 'failed'

export interface DownloadRecord {
  bookId: string
  status: DownloadStatus
  filesTotal: number
  filesDone: number
  bytesTotal: number
  bytesDone: number
  /** Der Fingerabdruck des Katalogs, zu dem die Dateien gehören. */
  filesHash: string
  updatedAt: string
}

export function emptyRecord(book: Book, now: () => Date = () => new Date()): DownloadRecord {
  return {
    bookId: book.id,
    status: 'idle',
    filesTotal: book.files.length,
    filesDone: 0,
    bytesTotal: totalBytes(book),
    bytesDone: 0,
    filesHash: book.filesHash,
    updatedAt: now().toISOString(),
  }
}

export function totalBytes(book: Book): number {
  return book.files.reduce((sum, file) => sum + Math.max(0, file.bytes), 0)
}

/** Anteil des Downloads – zwischen 0 und 1. */
export function downloadRatio(record: DownloadRecord | null): number {
  if (record === null) return 0
  if (record.status === 'done') return 1
  if (record.bytesTotal > 0) return clamp(record.bytesDone / record.bytesTotal)
  if (record.filesTotal > 0) return clamp(record.filesDone / record.filesTotal)
  return 0
}

export function isDownloaded(record: DownloadRecord | null): boolean {
  return record?.status === 'done'
}

export function isBusy(record: DownloadRecord | null): boolean {
  return record?.status === 'queued' || record?.status === 'running'
}

/**
 * Passt der Download noch zum Katalog?
 *
 * Wird ein Buch auf dem NAS neu kodiert oder um ein Kapitel ergänzt, ändert
 * sich sein Fingerabdruck. Die Dateien im Cache gehören dann zu einer anderen
 * Fassung – sie liegen noch da, sind aber nicht mehr das, was das Kind hören
 * würde.
 */
export function matchesCatalog(record: DownloadRecord | null, book: Book): boolean {
  if (record === null) return false
  return record.filesHash === book.filesHash && record.filesTotal === book.files.length
}

/** Grössenangabe, wie Eltern sie erwarten: „1,2 GB", nicht „1234567890 Bytes". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  const mb = bytes / 1_000_000
  if (mb < 1) return '<1 MB'
  if (mb < 1000) return `${String(Math.round(mb))} MB`
  return `${(mb / 1000).toFixed(1).replace('.', ',')} GB`
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value))
}
