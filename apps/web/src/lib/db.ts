import { type DBSchema, type IDBPDatabase, openDB } from 'idb'

import { type DownloadRecord } from '@/features/downloads/downloads'
import { type Progress } from '@/features/progress/progress'

/**
 * Lokale Datenbank der App.
 *
 * Hier liegt, was den Neustart überleben muss und zu gross oder zu
 * strukturiert für localStorage ist: der gespiegelte Katalog, der
 * Hörfortschritt und der Stand der Downloads. Die Audiodateien selbst liegen
 * nicht hier, sondern in Cache Storage – der ist für grosse Antworten gebaut.
 */
interface HbSchema extends DBSchema {
  meta: {
    key: string
    value: unknown
  }
  progress: {
    /** `${profileId}:${bookId}` – jedes Kind hat seinen eigenen Fortschritt. */
    key: string
    value: Progress & { profileId: string }
    indexes: { byProfile: string }
  }
  downloads: {
    /**
     * Die Buch-ID. Bewusst **nicht** pro Profil: Der Platz auf dem Gerät ist
     * einer, und zweimal dieselbe Datei zu speichern, nur weil zwei Kinder sie
     * hören, wäre Verschwendung.
     */
    key: string
    value: DownloadRecord
  }
}

const DB_NAME = 'hb'
const DB_VERSION = 3

let handle: Promise<IDBPDatabase<HbSchema>> | null = null

function db(): Promise<IDBPDatabase<HbSchema>> {
  handle ??= openDB<HbSchema>(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1 && !database.objectStoreNames.contains('meta')) {
        database.createObjectStore('meta')
      }
      if (!database.objectStoreNames.contains('progress')) {
        const store = database.createObjectStore('progress')
        store.createIndex('byProfile', 'profileId')
      }
      if (!database.objectStoreNames.contains('downloads')) {
        database.createObjectStore('downloads')
      }
    },
  })
  return handle
}

/**
 * Jeder Zugriff darf scheitern, ohne die App anzuhalten: Im privaten Modus,
 * bei blockierten Website-Daten oder wenn der Speicher voll ist, wirft
 * IndexedDB – die App muss dann eben online arbeiten.
 */
export async function readMeta<T>(key: string): Promise<T | null> {
  try {
    return ((await (await db()).get('meta', key)) as T | undefined) ?? null
  } catch {
    return null
  }
}

export async function writeMeta(key: string, value: unknown): Promise<void> {
  try {
    await (await db()).put('meta', value, key)
  } catch {
    // bewusst ignoriert
  }
}

export async function deleteMeta(key: string): Promise<void> {
  try {
    await (await db()).delete('meta', key)
  } catch {
    // bewusst ignoriert
  }
}

const progressKey = (profileId: string, bookId: string): string => `${profileId}:${bookId}`

export async function writeProgress(profileId: string, progress: Progress): Promise<void> {
  try {
    await (await db()).put(
      'progress',
      { ...progress, profileId },
      progressKey(profileId, progress.bookId),
    )
  } catch {
    // bewusst ignoriert
  }
}

export async function readAllProgress(profileId: string): Promise<Progress[]> {
  try {
    const entries = await (await db()).getAllFromIndex('progress', 'byProfile', profileId)
    return entries.map(({ profileId: _profileId, ...progress }) => progress)
  } catch {
    return []
  }
}

export async function deleteProgressFor(profileId: string): Promise<void> {
  try {
    const database = await db()
    const keys = await database.getAllKeysFromIndex('progress', 'byProfile', profileId)
    await Promise.all(keys.map((key) => database.delete('progress', key)))
  } catch {
    // bewusst ignoriert
  }
}

export async function readAllDownloads(): Promise<DownloadRecord[]> {
  try {
    return await (await db()).getAll('downloads')
  } catch {
    return []
  }
}

export async function writeDownload(record: DownloadRecord): Promise<void> {
  try {
    await (await db()).put('downloads', record, record.bookId)
  } catch {
    // bewusst ignoriert
  }
}

export async function deleteDownload(bookId: string): Promise<void> {
  try {
    await (await db()).delete('downloads', bookId)
  } catch {
    // bewusst ignoriert
  }
}
