import { type DBSchema, type IDBPDatabase, openDB } from 'idb'

/**
 * Lokale Datenbank der App.
 *
 * Hier liegt, was den Neustart überleben muss und zu gross oder zu
 * strukturiert für localStorage ist. Der Katalog ist der erste Bewohner;
 * Fortschritt (M6) und Download-Status (M7) kommen dazu.
 */
interface HbSchema extends DBSchema {
  meta: {
    key: string
    value: unknown
  }
}

const DB_NAME = 'hb'
const DB_VERSION = 1

let handle: Promise<IDBPDatabase<HbSchema>> | null = null

function db(): Promise<IDBPDatabase<HbSchema>> {
  handle ??= openDB<HbSchema>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('meta')) {
        database.createObjectStore('meta')
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
