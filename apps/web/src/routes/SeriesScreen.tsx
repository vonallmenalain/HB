import { Link, useParams } from 'react-router-dom'

import { BookTile } from '@/features/library/BookTile'
import { TILE_GRID } from '@/features/library/grid'
import { findSeries, groupBooks } from '@/features/library/grouping'
import { useLibrary } from '@/features/library/libraryContext'
import { BigLinkButton } from '@/ui/BigButton'
import { EmptyState } from '@/ui/EmptyState'
import { Screen, ScreenTitle } from '@/ui/Screen'
import { Spinner } from '@/ui/Spinner'

/**
 * Eine Reihe mit ihren Folgen.
 *
 * Unterordner auf dem NAS – „Adventskalender“, „Mini-Fälle“ – stehen hier als
 * eigene Abschnitte. Sie gehören zur Reihe, sind aber nicht die Reihe.
 */
export function SeriesScreen() {
  const { slug = '' } = useParams()
  const { status, books } = useLibrary()

  if (status === 'loading') {
    return (
      <Screen wide>
        <Spinner label="Bücher werden geladen" />
      </Screen>
    )
  }

  const series = findSeries(books, slug)

  if (!series) {
    return (
      <Screen wide>
        <div className="flex flex-1 items-center">
          <EmptyState
            title="Diese Reihe gibt es nicht mehr"
            hint="Vielleicht wurde der Ordner auf dem NAS umbenannt."
            action={<BigLinkButton to="/bibliothek">Alle Hörbücher</BigLinkButton>}
          />
        </div>
      </Screen>
    )
  }

  const groups = groupBooks(series.books)

  return (
    <Screen wide>
      <div className="py-4">
        <Link
          to="/bibliothek"
          className="inline-flex min-h-touch items-center gap-2 rounded-tile pr-4 text-lg focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span aria-hidden="true" className="text-3xl">
            ←
          </span>
          Alle Reihen
        </Link>
      </div>

      <ScreenTitle>{series.name}</ScreenTitle>

      {groups.map((group) => (
        <section key={group.name ?? 'reihe'}>
          {group.name !== null ? (
            <h2 className="pt-2 pb-3 text-xl font-bold">{group.name}</h2>
          ) : null}
          <ul className={`${TILE_GRID} pb-6`}>
            {group.books.map((book) => (
              <li key={book.id}>
                <BookTile book={book} inSeries />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Screen>
  )
}
