import { Link } from 'react-router-dom'

import { BookCover } from '@/ui/BookCover'

import { type Book } from './catalog'
import { useLibrary } from './libraryContext'

/** Eine Kachel im Bibliotheks-Raster: grosses Cover, Titel klein darunter. */
export function BookTile({ book }: { book: Book }) {
  const { client } = useLibrary()
  const cover = book.cover !== null ? (client?.coverUrl(book.cover) ?? null) : null

  return (
    <Link
      to={`/buch/${book.id}`}
      className="flex flex-col gap-2 rounded-tile transition-transform active:scale-[0.97] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <BookCover title={book.title} color={book.coverColor} src={cover} />
      {/* Zwei Zeilen fest: sonst rutscht die Reihenangabe je nach
          Titellänge auf eine andere Höhe und das Raster wirkt schief. */}
      <span className="line-clamp-2 min-h-[2lh] px-1 font-semibold">{book.title}</span>
      {book.series !== null ? (
        <span className="line-clamp-1 px-1 text-sm text-ink-soft">{book.series}</span>
      ) : null}
    </Link>
  )
}
