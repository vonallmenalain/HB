import { useNavigate } from 'react-router-dom'

import { type Book } from '@/features/library/catalog'
import { useLibrary } from '@/features/library/libraryContext'
import { type Progress, progressRatio } from '@/features/progress/progress'
import { RemoveFromShelf } from '@/features/progress/RemoveFromShelf'
import { formatRemaining } from '@/lib/format'
import { BookCover } from '@/ui/BookCover'
import { ProgressBar } from '@/ui/ProgressBar'

import { usePlayer } from './playerContext'

/**
 * Die „Weiterhören"-Kachel.
 *
 * Das wichtigste Element der ganzen App: Ein Kind öffnet die App und tippt
 * einmal – mehr soll zwischen ihm und seinem Hörbuch nicht stehen.
 */
export function ContinueTile({
  book,
  progress,
  onRemove,
}: {
  book: Book
  progress: Progress
  /** Nimmt das Buch von der Startseite. Ohne das bleibt die Kachel wie bisher. */
  onRemove?: () => void
}) {
  const { client } = useLibrary()
  const player = usePlayer()
  const navigate = useNavigate()

  const cover = book.cover !== null ? (client?.coverUrl(book.cover) ?? null) : null
  const remaining = Math.max(0, book.durationSec - progress.positionSec)

  const kachel = (
    <button
      type="button"
      onClick={() => {
        player.playBook(book)
        void navigate(`/player/${book.id}`)
      }}
      className="flex w-full flex-col gap-4 rounded-tile bg-surface p-4 text-left transition-transform active:scale-[0.98] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <div className="mx-auto w-full max-w-64">
        <BookCover title={book.title} color={book.coverColor} src={cover} />
      </div>

      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="flex size-touch shrink-0 items-center justify-center rounded-full bg-primary text-4xl text-on-primary"
        >
          ▶
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-2xl font-bold">Weiterhören</span>
          <span className="truncate text-ink-soft">{book.title}</span>
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <ProgressBar ratio={progressRatio(progress)} label={`Fortschritt in ${book.title}`} />
        <span className="text-ink-soft">{formatRemaining(remaining)}</span>
      </div>
    </button>
  )

  if (!onRemove) return kachel

  // Ein Knopf im Knopf geht nicht – das Kreuz liegt daneben und darüber.
  return (
    <div className="relative">
      {kachel}
      <RemoveFromShelf
        title={book.title}
        onRemove={onRemove}
        className="absolute right-3 top-3"
      />
    </div>
  )
}
