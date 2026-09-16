import { Link } from 'react-router-dom'

import { isDownloaded } from '@/features/downloads/downloads'
import { useDownloads } from '@/features/downloads/downloadsContext'
import { useFavorites } from '@/features/favorites/favoritesContext'
import { RemoveFromShelf } from '@/features/progress/RemoveFromShelf'
import { BookCover } from '@/ui/BookCover'

import { type Book } from './catalog'
import { useLibrary } from './libraryContext'
import { bookLabel } from './titles'

/**
 * Eine Kachel im Bibliotheks-Raster: grosses Cover, Titel klein darunter.
 *
 * Die Folgennummer gehört zum Titel und steht immer davor. Der Reihenname
 * dagegen entfällt innerhalb einer Reihe (`inSeries`) – untereinander gelesen
 * wäre er in jeder Zeile dasselbe Rauschen.
 *
 * `onRemove` setzt oben rechts ein Kreuz zum Wegnehmen. Nur die Startseite
 * gibt es mit: In der Bibliothek stehen alle Hörbücher, dort wäre „entfernen"
 * eine Frage ohne Antwort.
 */
export function BookTile({
  book,
  inSeries = false,
  onRemove,
}: {
  book: Book
  inSeries?: boolean
  onRemove?: () => void
}) {
  const { client } = useLibrary()
  const { get, offlineCoverUrl } = useDownloads()
  const { isFavorite } = useFavorites()

  // Auch hier gilt: Was auf dem Gerät liegt, geht vor. Sonst bliebe im
  // Flugzeug ausgerechnet das heruntergeladene Buch ohne Bild – und Kinder,
  // die noch nicht lesen, finden es dann nicht wieder.
  const cover =
    offlineCoverUrl(book.id) ??
    (book.cover !== null ? (client?.coverUrl(book.cover) ?? null) : null)
  const aufDemGeraet = isDownloaded(get(book.id))
  const gemerkt = isFavorite(book.id)

  const kachel = (
    <Link
      to={`/buch/${book.id}`}
      className="flex flex-col gap-2 rounded-tile transition-transform active:scale-[0.97] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <div className="relative">
        <BookCover title={book.title} color={book.coverColor} src={cover} />
        {gemerkt ? (
          <span
            title="Gemerkt"
            className="absolute left-2 top-2 flex size-8 items-center justify-center rounded-full bg-surface text-lg text-accent shadow"
          >
            <span aria-hidden="true">★</span>
            <span className="sr-only">Gemerkt</span>
          </span>
        ) : null}
        {aufDemGeraet ? (
          <span
            title="Auf dem Gerät"
            // Rückt zur Seite, wenn oben rechts das Kreuz zum Wegnehmen sitzt.
            className={`absolute top-2 flex size-8 items-center justify-center rounded-full bg-surface text-lg shadow ${
              onRemove ? 'right-14' : 'right-2'
            }`}
          >
            <span aria-hidden="true">⬇</span>
            <span className="sr-only">Auf dem Gerät</span>
          </span>
        ) : null}
      </div>
      {/* Zwei Zeilen fest: sonst rutscht die Reihenangabe je nach
          Titellänge auf eine andere Höhe und das Raster wirkt schief. */}
      <span className="line-clamp-2 min-h-[2lh] px-1 font-semibold">{bookLabel(book)}</span>
      {!inSeries && book.series !== null ? (
        <span className="line-clamp-1 px-1 text-sm text-ink-soft">{book.series}</span>
      ) : null}
    </Link>
  )

  if (!onRemove) return kachel

  // Der Knopf steht neben dem Link, nicht darin: Ein Knopf im Link wäre weder
  // gültiges HTML noch für Vorlesehilfen eindeutig.
  return (
    <div className="relative">
      {kachel}
      <RemoveFromShelf
        title={bookLabel(book)}
        onRemove={onRemove}
        className="absolute right-0 top-0"
      />
    </div>
  )
}
