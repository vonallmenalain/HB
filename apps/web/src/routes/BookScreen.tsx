import { Link, useNavigate, useParams } from 'react-router-dom'

import { DownloadButton } from '@/features/downloads/DownloadButton'
import { useDownloads } from '@/features/downloads/downloadsContext'
import { FavoriteButton } from '@/features/favorites/FavoriteButton'
import { seriesOf } from '@/features/library/grouping'
import { useLibrary } from '@/features/library/libraryContext'
import { usePlayer } from '@/features/player/playerContext'
import { progressRatio, resolveResume } from '@/features/progress/progress'
import { useProgress } from '@/features/progress/progressContext'
import { formatRemaining, formatTime } from '@/lib/format'
import { BigButton, BigLinkButton } from '@/ui/BigButton'
import { ProgressBar } from '@/ui/ProgressBar'
import { BookCover } from '@/ui/BookCover'
import { EmptyState } from '@/ui/EmptyState'
import { Screen } from '@/ui/Screen'
import { Spinner } from '@/ui/Spinner'

/** Buchseite: Cover, Titel, Abspiel-Knopf, Kapitelliste. */
export function BookScreen() {
  const { bookId = '' } = useParams()
  const { status, books, bookById, client } = useLibrary()
  const { get: getProgress } = useProgress()
  const { offlineCoverUrl } = useDownloads()
  const player = usePlayer()
  const navigate = useNavigate()

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

  // Was auf dem Gerät liegt, geht vor – sonst bliebe die Seite im Flugzeug
  // ohne Bild, obwohl das Buch vollständig heruntergeladen ist.
  const cover =
    offlineCoverUrl(book.id) ??
    (book.cover !== null ? (client?.coverUrl(book.cover) ?? null) : null)

  // Zurück dorthin, wo man hergekommen ist: in die Reihe, nicht in die
  // Übersicht aller Reihen.
  //
  // Eine Reihe mit einem einzigen Buch ist dabei keine Station: Die Übersicht
  // führt direkt hierher, und zurück müsste man sonst durch eine Liste mit
  // genau einer Kachel.
  const gefunden = seriesOf(books, book)
  const reihe = gefunden !== null && gefunden.books.length > 1 ? gefunden : null

  return (
    <Screen>
      <div className="flex items-center justify-between py-4">
        <Link
          to={reihe === null ? '/bibliothek' : `/bibliothek/${reihe.slug}`}
          className="inline-flex min-h-touch items-center gap-2 rounded-tile pr-4 text-lg focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span aria-hidden="true" className="text-3xl">
            ←
          </span>
          Zurück
        </Link>

        <FavoriteButton book={book} size="lg" />
      </div>

      <div className="mx-auto w-full max-w-xs">
        <BookCover title={book.title} color={book.coverColor} src={cover} />
      </div>

      <div className="flex flex-col gap-1 py-5 text-center">
        <h1 className="text-2xl font-bold">{book.title}</h1>
        {book.series !== null ? (
          <p className="text-ink-soft">
            {book.series}
            {book.group !== null ? ` · ${book.group}` : ''}
            {book.seriesIndex !== null ? ` · Folge ${String(book.seriesIndex)}` : ''}
          </p>
        ) : null}
        {book.author !== null ? <p className="text-ink-soft">{book.author}</p> : null}
        <p className="text-ink-soft">
          {book.chapters.length} Kapitel · {formatTime(book.durationSec)}
        </p>
      </div>

      {(() => {
        const progress = getProgress(book.id)
        const angefangen = progress !== null && !progress.finished && progress.positionSec > 0
        return (
          <div className="flex flex-col gap-3 pb-8">
            <BigButton
              onClick={() => {
                player.playBook(book)
                void navigate(`/player/${book.id}`)
              }}
            >
              {angefangen ? 'Weiterhören' : 'Abspielen'}
            </BigButton>

            {angefangen ? (
              <div className="flex flex-col gap-2">
                <ProgressBar
                  ratio={progressRatio(progress)}
                  label={`Fortschritt in ${book.title}`}
                />
                <p className="text-center text-ink-soft">
                  {formatRemaining(
                    Math.max(0, book.durationSec - resolveResume(book, progress).positionSec),
                  )}
                </p>
              </div>
            ) : null}

            <DownloadButton book={book} />
          </div>
        )
      })()}

      <h2 className="pb-3 text-xl font-bold">Kapitel</h2>
      <ol className="flex flex-col gap-2 pb-6">
        {book.chapters.map((chapter) => (
          <li key={chapter.idx}>
            <button
              type="button"
              onClick={() => {
                player.playFrom(book, chapter.startSec)
                void navigate(`/player/${book.id}`)
              }}
              className="flex min-h-touch w-full items-center gap-4 rounded-tile bg-surface px-4 text-left transition-transform active:scale-[0.99] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span className="w-8 shrink-0 text-center text-lg font-semibold text-ink-soft">
                {chapter.idx + 1}
              </span>
              <span className="flex-1">{chapter.title}</span>
              <span className="shrink-0 tabular-nums text-ink-soft">
                {formatTime(chapter.endSec - chapter.startSec)}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </Screen>
  )
}
