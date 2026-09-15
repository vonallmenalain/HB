import { Link } from 'react-router-dom'

import { isDownloaded } from '@/features/downloads/downloads'
import { useDownloads } from '@/features/downloads/downloadsContext'
import { BookCover } from '@/ui/BookCover'

import { type Book } from './catalog'
import { useLibrary } from './libraryContext'

/** Eine Kachel im Bibliotheks-Raster: grosses Cover, Titel klein darunter. */
export function BookTile({ book }: { book: Book }) {
  const { client } = useLibrary()
  const { get, offlineCoverUrl } = useDownloads()

  // Auch hier gilt: Was auf dem Gerät liegt, geht vor. Sonst bliebe im
  // Flugzeug ausgerechnet das heruntergeladene Buch ohne Bild – und Kinder,
  // die noch nicht lesen, finden es dann nicht wieder.
  const cover =
    offlineCoverUrl(book.id) ??
    (book.cover !== null ? (client?.coverUrl(book.cover) ?? null) : null)
  const aufDemGeraet = isDownloaded(get(book.id))

  return (
    <Link
      to={`/buch/${book.id}`}
      className="flex flex-col gap-2 rounded-tile transition-transform active:scale-[0.97] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <div className="relative">
        <BookCover title={book.title} color={book.coverColor} src={cover} />
        {aufDemGeraet ? (
          <span
            title="Auf dem Gerät"
            className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-surface text-lg shadow"
          >
            <span aria-hidden="true">⬇</span>
            <span className="sr-only">Auf dem Gerät</span>
          </span>
        ) : null}
      </div>
      {/* Zwei Zeilen fest: sonst rutscht die Reihenangabe je nach
          Titellänge auf eine andere Höhe und das Raster wirkt schief. */}
      <span className="line-clamp-2 min-h-[2lh] px-1 font-semibold">{book.title}</span>
      {book.series !== null ? (
        <span className="line-clamp-1 px-1 text-sm text-ink-soft">{book.series}</span>
      ) : null}
    </Link>
  )
}
