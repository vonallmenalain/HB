import { Link } from 'react-router-dom'

import { useDownloads } from '@/features/downloads/downloadsContext'
import { BookCover } from '@/ui/BookCover'

import { type Series } from './grouping'
import { useLibrary } from './libraryContext'

/** Eine Reihe als Kachel: das Cover einer Folge, darunter Name und Anzahl. */
export function SeriesTile({ series }: { series: Series }) {
  const { client } = useLibrary()
  const { offlineCoverUrl } = useDownloads()

  const cover =
    offlineCoverUrl(series.cover.id) ??
    (series.cover.cover !== null ? (client?.coverUrl(series.cover.cover) ?? null) : null)

  const anzahl = series.books.length

  return (
    <Link
      to={`/bibliothek/${series.slug}`}
      className="flex flex-col gap-2 rounded-tile transition-transform active:scale-[0.97] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <BookCover title={series.name} color={series.cover.coverColor} src={cover} />
      {/* Zwei Zeilen fest, damit die Kacheln im Raster auf einer Höhe bleiben. */}
      <span className="line-clamp-2 min-h-[2lh] px-1 font-semibold">{series.name}</span>
      <span className="px-1 text-sm text-ink-soft">
        {anzahl} {anzahl === 1 ? 'Hörbuch' : 'Hörbücher'}
      </span>
    </Link>
  )
}
