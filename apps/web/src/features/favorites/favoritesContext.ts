import { createContext, use } from 'react'

/**
 * Die Sterne eines Kindes.
 *
 * Favoriten gehören zum Profil, nicht zum Konto: Zwei Geschwister auf demselben
 * Tablet haben verschiedene Lieblingsfolgen.
 */
export interface FavoritesContextValue {
  /** Buch-IDs mit Stern. */
  ids: ReadonlySet<string>
  isFavorite: (bookId: string) => boolean
  toggle: (bookId: string) => void
}

/** Ohne Provider gibt es keine Sterne – so laufen Vorschau und Tests. */
const OHNE_FAVORITEN: FavoritesContextValue = {
  ids: new Set(),
  isFavorite: () => false,
  toggle: () => undefined,
}

export const FavoritesContext = createContext<FavoritesContextValue>(OHNE_FAVORITEN)

export function useFavorites(): FavoritesContextValue {
  return use(FavoritesContext)
}
