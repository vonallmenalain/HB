import { Link, useParams } from 'react-router-dom'

import { useLibrary } from '@/features/library/libraryContext'
import { formatTime } from '@/lib/format'
import { BigLinkButton } from '@/ui/BigButton'
import { BookCover } from '@/ui/BookCover'
import { EmptyState } from '@/ui/EmptyState'
import { Screen } from '@/ui/Screen'
import { Spinner } from '@/ui/Spinner'

/**
 * Buchseite: Cover, Titel, Kapitelliste.
 *
 * Der Abspiel-Knopf kommt mit M5; bis dahin zeigt die Seite, was der Katalog
 * hergibt, damit sich die Daten vom NAS überhaupt prüfen lassen.
 */
export function BookScreen() {
  const { bookId = '' } = useParams()
  const { status, bookById, client } = useLibrary()

  if (status === 'loading') {
    return (
      <Screen>
        <Spinner label="Buch wird geladen" />
      </Screen>
    )
  }

  const book = bookById(bookId)
  if (!book) {
    return (
      <Screen>
        <div className="flex flex-1 items-center">
          <EmptyState
            title="Dieses Buch gibt es nicht mehr"
            hint="Vielleicht wurde es auf dem NAS verschoben oder gelöscht."
            action={<BigLinkButton to="/bibliothek">Zur Bibliothek</BigLinkButton>}
          />
        </div>
      </Screen>
    )
  }

  const cover = book.cover !== null ? (client?.coverUrl(book.cover) ?? null) : null

  return (
    <Screen>
      <div className="py-4">
        <Link
          to="/bibliothek"
          className="inline-flex min-h-touch items-center gap-2 rounded-tile pr-4 text-lg focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span aria-hidden="true" className="text-3xl">
            ←
          </span>
          Zurück
        </Link>
      </div>

      <div className="mx-auto w-full max-w-xs">
        <BookCover title={book.title} color={book.coverColor} src={cover} />
      </div>

      <div className="flex flex-col gap-1 py-5 text-center">
        <h1 className="text-2xl font-bold">{book.title}</h1>
        {book.series !== null ? (
          <p className="text-ink-soft">
            {book.series}
            {book.seriesIndex !== null ? ` · Folge ${String(book.seriesIndex)}` : ''}
          </p>
        ) : null}
        {book.author !== null ? <p className="text-ink-soft">{book.author}</p> : null}
        <p className="text-ink-soft">
          {book.chapters.length} Kapitel · {formatTime(book.durationSec)}
        </p>
      </div>

      <h2 className="pb-3 text-xl font-bold">Kapitel</h2>
      <ol className="flex flex-col gap-2 pb-6">
        {book.chapters.map((chapter) => (
          <li
            key={chapter.idx}
            className="flex min-h-touch items-center gap-4 rounded-tile bg-surface px-4"
          >
            <span className="w-8 shrink-0 text-center text-lg font-semibold text-ink-soft">
              {chapter.idx + 1}
            </span>
            <span className="flex-1">{chapter.title}</span>
            <span className="shrink-0 tabular-nums text-ink-soft">
              {formatTime(chapter.endSec - chapter.startSec)}
            </span>
          </li>
        ))}
      </ol>
    </Screen>
  )
}
