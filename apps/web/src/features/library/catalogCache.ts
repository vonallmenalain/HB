import { readMeta, writeMeta } from '@/lib/db'

import { type Catalog, parseCatalog } from './catalog'

const CATALOG_KEY = 'catalog'
const ETAG_KEY = 'catalogEtag'

export interface CachedCatalog {
  catalog: Catalog
  etag: string | null
}

/**
 * Spiegel des Katalogs.
 *
 * Damit lässt sich die Bibliothek durchblättern, wenn das NAS aus ist – und
 * genau das ist der Normalfall für heruntergeladene Bücher unterwegs.
 * Beim Lesen wird erneut geprüft: Was hier liegt, kann aus einer älteren
 * App-Version stammen.
 */
export async function loadCachedCatalog(): Promise<CachedCatalog | null> {
  const raw = await readMeta<unknown>(CATALOG_KEY)
  if (raw === null) return null

  const parsed = parseCatalog(raw)
  if (!parsed.ok) return null

  return { catalog: parsed.catalog, etag: await readMeta<string>(ETAG_KEY) }
}

export async function saveCachedCatalog(catalog: Catalog, etag: string | null): Promise<void> {
  await writeMeta(CATALOG_KEY, catalog)
  await writeMeta(ETAG_KEY, etag)
}
