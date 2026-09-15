import { type DBSchema, type IDBPDatabase, openDB } from 'idb'

import { type Progress } from '@/features/progress/progress'

/**
 * Lokale Datenbank der App.
 *
 * Hier liegt, was den Neustart überleben muss und zu gross oder zu
 * strukturiert für localStorage ist: der gespiegelte Katalog und der
 * Hörfortschritt. Der Download-Status kommt mit M7 dazu.
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
}

const DB_NAME = 'hb'
const DB_VERSION = 2

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
