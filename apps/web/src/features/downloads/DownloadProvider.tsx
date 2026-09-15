import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { type Book } from '@/features/library/catalog'
import { useLibrary } from '@/features/library/libraryContext'
import { useProfiles } from '@/features/profiles/profilesContext'
import { deleteDownload, readAllDownloads, writeDownload } from '@/lib/db'

import {
  type DownloadRecord,
  emptyRecord,
  isDownloaded,
  matchesCatalog,
  totalBytes,
} from './downloads'
import { DownloadsContext } from './downloadsContext'
import { type DownloadTarget, runDownload } from './downloader'
import {
  type StorageInfo,
  audioObjectUrl,
  cachedBytes,
  deleteAudio,
  hasAudio,
  openMediaCache,
  putAudio,
  readStorageInfo,
  requestPersistentStorage,
} from './mediaCache'

const NO_RECORDS: ReadonlyMap<string, DownloadRecord> = new Map()
const NO_URLS: ReadonlyMap<string, string> = new Map()

const audioKey = (bookId: string, fileIdx: number): string => `${bookId}:${String(fileIdx)}`
const coverKey = (bookId: string): string => `cover:${bookId}`

/**
 * Heruntergeladene Hörbücher.
 *
 * Geladen wird **immer nur ein Buch gleichzeitig**, der Rest wartet in einer
 * Schlange. Das ist nicht die schnellste, aber die ehrlichste Art: Der
 * Fortschrittsring zeigt dann, was tatsächlich gerade passiert, und das NAS
 * bekommt nicht fünf parallele Ströme über einen Tunnel.
 *
 * Abgebrochene Downloads sind fortsetzbar, ohne dass sich irgendetwas merken
 * müsste, wo es war: Was schon im Cache liegt, wird übersprungen.
 */
export function DownloadProvider({ children }: { children: ReactNode }) {
  const { books, client } = useLibrary()
  const { selected } = useProfiles()

  const [records, setRecords] = useState<ReadonlyMap<string, DownloadRecord>>(NO_RECORDS)
  const [offline, setOffline] = useState<ReadonlyMap<string, string>>(NO_URLS)
  const [storage, setStorage] = useState<StorageInfo | null>(null)
  const [supported, setSupported] = useState(false)

  // Der Cache wird einmal geöffnet und dann herumgereicht; die Schlange und
  // die Abbruchwünsche leben ausserhalb des Renderns.
  const cacheRef = useRef<Cache | null>(null)
  const queueRef = useRef<Book[]>([])
  const runningRef = useRef(false)
  const cancelledRef = useRef<Set<string>>(new Set())
  const recordsRef = useRef<ReadonlyMap<string, DownloadRecord>>(NO_RECORDS)

  // Spiegel und Zustand werden zusammen gesetzt: Die Schlange läuft
  // ausserhalb des Renderns und braucht den Stand von genau jetzt.
  const applyRecord = useCallback((record: DownloadRecord) => {
    const next = new Map(recordsRef.current).set(record.bookId, record)
    recordsRef.current = next
    setRecords(next)
    void writeDownload(record)
  }, [])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const cache = await openMediaCache()
      if (cancelled) return
      cacheRef.current = cache
      setSupported(cache !== null)

      const stored = await readAllDownloads()
      if (cancelled) return

      // Ein Download, der beim letzten Mal mitten im Lauf abgebrochen wurde
      // (App weggewischt, Gerät aus), steht sonst für immer auf „lädt".
      const entries = stored.map((record) =>
        record.status === 'running' || record.status === 'queued'
          ? { ...record, status: 'idle' as const }
          : record,
      )
      const map = new Map(entries.map((record) => [record.bookId, record]))
      recordsRef.current = map
      setRecords(map)
      setStorage(await readStorageInfo())
    })()

    return () => {
      cancelled = true
    }
  }, [])

  /**
   * Object-URLs für alles, was schon auf dem Gerät liegt.
   *
   * Vorbereitet wird beim Start, nicht beim Antippen: Der Player fragt
   * synchron nach der Adresse, und im Flugzeug gäbe es keine zweite Chance.
   *
   * `primedRef` sorgt dafür, dass das genau einmal pro Buch passiert – sonst
   * liefe bei jedem Fortschrittsschritt eines laufenden Downloads die ganze
   * Bibliothek noch einmal durch den Cache.
   */
  const primedRef = useRef<Set<string>>(new Set())

  const collect = useCallback(
    async (toPrime: readonly Book[]): Promise<Map<string, string>> => {
      const found = new Map<string, string>()
      const cache = cacheRef.current
      if (cache === null || client === null) return found

      for (const book of toPrime) {
        if (primedRef.current.has(book.id)) continue

        let gefunden = false
        for (const file of book.files) {
          const url = await audioObjectUrl(cache, client.canonicalAudioUrl(book.id, file.idx))
          if (url !== null) {
            found.set(audioKey(book.id, file.idx), url)
            gefunden = true
          }
        }
        if (book.cover !== null) {
          const url = await audioObjectUrl(cache, client.canonicalCoverUrl(book.cover))
          if (url !== null) found.set(coverKey(book.id), url)
        }

        // Erst als erledigt vormerken, wenn tatsächlich etwas gefunden wurde.
        // Sonst bliebe ein Buch für immer übersprungen, dessen Dateien beim
        // ersten Versuch noch gar nicht erreichbar waren.
        if (gefunden) primedRef.current.add(book.id)
      }
      return found
    },
    [client],
  )

  const applyUrls = useCallback((found: ReadonlyMap<string, string>) => {
    if (found.size === 0) return
    setOffline((previous) => {
      const next = new Map(previous)
      for (const [key, url] of found) {
        // Eine bereits vergebene Adresse behalten – sie könnte gerade laufen.
        if (next.has(key)) URL.revokeObjectURL(url)
        else next.set(key, url)
      }
      return next
    })
  }, [])

  const done = useMemo(
    () =>
      books.filter((book) => {
        const record = records.get(book.id) ?? null
        return isDownloaded(record) && matchesCatalog(record, book)
      }),
    [books, records],
  )

  useEffect(() => {
    // Bewusst ohne Abbruch beim erneuten Lauf: Gefundene Adressen sind
    // unabhängig davon gültig, welcher Durchlauf sie gefunden hat. Sie
    // wegzuwerfen, während das Buch schon als vorbereitet gilt, hiesse, dass
    // es nie wieder vorbereitet wird – und das Kind im Flugzeug vor einem
    // Buch steht, das laut Anzeige auf dem Gerät liegt.
    void (async () => {
      applyUrls(await collect(done))
    })()
  }, [collect, done, applyUrls])

  const targetsFor = useCallback(
    (book: Book): DownloadTarget[] | null => {
      if (client === null) return null
      const targets: DownloadTarget[] = []
      for (const file of book.files) {
        const url = client.audioUrl(book.id, file.idx)
        if (url === null) return null
        targets.push({
          fileIdx: file.idx,
          key: client.canonicalAudioUrl(book.id, file.idx),
          url,
          bytes: Math.max(0, file.bytes),
        })
      }
      if (book.cover !== null) {
        const url = client.coverUrl(book.cover)
        // Das Cover ist ein paar Dutzend Kilobyte – ohne es sähe die Bibliothek
        // im Flugzeug aus wie eine Liste farbiger Kacheln.
        if (url !== null) {
          targets.push({ fileIdx: -1, key: client.canonicalCoverUrl(book.cover), url, bytes: 0 })
        }
      }
      return targets
    },
    [client],
  )

  const pump = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true

    try {
      for (;;) {
        const book = queueRef.current.shift()
        if (book === undefined) return

        const cache = cacheRef.current
        const targets = targetsFor(book)
        if (cache === null || targets === null) {
          applyRecord({ ...emptyRecord(book), status: 'failed' })
          continue
        }

        // Noch in der Schlange abgebrochen: Der Eintrag stünde sonst für
        // immer auf „wartet".
        if (cancelledRef.current.delete(book.id)) {
          applyRecord({ ...emptyRecord(book), status: 'idle' })
          continue
        }

        const base: DownloadRecord = {
          ...emptyRecord(book),
          status: 'running',
          bytesTotal: totalBytes(book),
        }
        applyRecord(base)

        const outcome = await runDownload({
          targets,
          has: (key) => hasAudio(cache, key),
          // `cors` ist wichtig: Eine undurchsichtige Antwort liesse sich
          // später weder lesen noch in ihrer Grösse bestimmen.
          load: (target) => fetch(target.url, { mode: 'cors', credentials: 'omit' }),
          store: (key, response) => putAudio(cache, key, response),
          onProgress: ({ filesDone, bytesDone }) => {
            applyRecord({
              ...base,
              status: 'running',
              filesDone: Math.min(filesDone, base.filesTotal),
              bytesDone,
              updatedAt: new Date().toISOString(),
            })
          },
          aborted: () => cancelledRef.current.has(book.id),
        })

        if (outcome === 'aborted') {
          cancelledRef.current.delete(book.id)
          applyRecord({ ...base, status: 'idle', updatedAt: new Date().toISOString() })
          continue
        }

        applyRecord({
          ...base,
          status: outcome === 'done' ? 'done' : 'failed',
          filesDone: outcome === 'done' ? base.filesTotal : base.filesDone,
          bytesDone:
            outcome === 'done'
              ? await cachedBytes(
                  cache,
                  targets.map((target) => target.key),
                )
              : base.bytesDone,
          updatedAt: new Date().toISOString(),
        })

        if (outcome === 'done') applyUrls(await collect([book]))
        setStorage(await readStorageInfo())
      }
    } finally {
      runningRef.current = false
    }
  }, [applyRecord, applyUrls, collect, targetsFor])

  const start = useCallback(
    (book: Book) => {
      cancelledRef.current.delete(book.id)
      if (queueRef.current.some((queued) => queued.id === book.id)) return
      queueRef.current.push(book)
      applyRecord({ ...emptyRecord(book), status: 'queued' })
      // Beim ersten Download darum bitten, den Speicher nicht wegzuräumen.
      void requestPersistentStorage()
      void pump()
    },
    [applyRecord, pump],
  )

  const cancel = useCallback(
    (bookId: string) => {
      cancelledRef.current.add(bookId)
      queueRef.current = queueRef.current.filter((queued) => queued.id !== bookId)

      const record = recordsRef.current.get(bookId)
      if (record?.status === 'queued') applyRecord({ ...record, status: 'idle' })
    },
    [applyRecord],
  )

  const remove = useCallback(
    (book: Book) => {
      cancel(book.id)
      void (async () => {
        const cache = cacheRef.current
        if (cache !== null && client !== null) {
          const keys = book.files.map((file) => client.canonicalAudioUrl(book.id, file.idx))
          if (book.cover !== null) keys.push(client.canonicalCoverUrl(book.cover))
          await deleteAudio(cache, keys)
        }

        primedRef.current.delete(book.id)
        setOffline((previous) => {
          const next = new Map(previous)
          for (const file of book.files) {
            const key = audioKey(book.id, file.idx)
            const url = next.get(key)
            if (url !== undefined) {
              URL.revokeObjectURL(url)
              next.delete(key)
            }
          }
          const cover = next.get(coverKey(book.id))
          if (cover !== undefined) {
            URL.revokeObjectURL(cover)
            next.delete(coverKey(book.id))
          }
          return next
        })

        const next = new Map(recordsRef.current)
        next.delete(book.id)
        recordsRef.current = next
        setRecords(next)
        await deleteDownload(book.id)
        setStorage(await readStorageInfo())
      })()
    },
    [cancel, client],
  )

  const offlineUrl = useCallback(
    (bookId: string, fileIdx: number) => offline.get(audioKey(bookId, fileIdx)) ?? null,
    [offline],
  )

  const offlineCoverUrl = useCallback(
    (bookId: string) => offline.get(coverKey(bookId)) ?? null,
    [offline],
  )

  const value = useMemo(
    () => ({
      records,
      allowed: selected?.allowDownload ?? false,
      supported,
      storage,
      get: (bookId: string) => records.get(bookId) ?? null,
      start,
      cancel,
      remove,
      offlineUrl,
      offlineCoverUrl,
    }),
    [records, selected, supported, storage, start, cancel, remove, offlineUrl, offlineCoverUrl],
  )

  return <DownloadsContext value={value}>{children}</DownloadsContext>
}
