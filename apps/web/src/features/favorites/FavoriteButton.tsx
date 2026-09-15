import { type Book } from '@/features/library/catalog'

import { useFavorites } from './favoritesContext'

/**
 * Der Stern an einem Hörbuch.
 *
 * Gefüllt heisst „gemerkt", leer heisst „nicht gemerkt" – ein Kind, das noch
 * nicht liest, erkennt das am Bild. Für alle anderen steht es im Namen des
 * Knopfs.
 */
export function FavoriteButton({ book, size = 'md' }: { book: Book; size?: 'md' | 'lg' }) {
  const { isFavorite, toggle } = useFavorites()
  const gemerkt = isFavorite(book.id)

  return (
    <button
      type="button"
      aria-pressed={gemerkt}
      aria-label={gemerkt ? `${book.title} nicht mehr merken` : `${book.title} merken`}
      onClick={() => {
        toggle(book.id)
      }}
      className={`flex shrink-0 items-center justify-center rounded-full transition-transform active:scale-90 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        size === 'lg' ? 'size-touch text-4xl' : 'size-12 text-2xl'
      } ${gemerkt ? 'text-accent' : 'text-ink-soft'}`}
    >
      <span aria-hidden="true">{gemerkt ? '★' : '☆'}</span>
    </button>
  )
}
