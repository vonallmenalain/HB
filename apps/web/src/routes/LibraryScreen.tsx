import { Link } from 'react-router-dom'

import { BigLinkButton } from '@/ui/BigButton'
import { EmptyState } from '@/ui/EmptyState'
import { Notice } from '@/ui/Notice'
import { Screen, ScreenTitle } from '@/ui/Screen'
import { Spinner } from '@/ui/Spinner'
import { BookTile } from '@/features/library/BookTile'
import { SeriesTile } from '@/features/library/SeriesTile'
import { buildSeries } from '@/features/library/grouping'
import { useLibrary } from '@/features/library/libraryContext'
import { libraryErrorMessage } from '@/features/library/errors'

/**
 * Der Weg zurück auf die Startseite.
 *
 * Er muss hier stehen: Die App merkt sich die zuletzt gesehene Ansicht und
 * startet beim nächsten Mal direkt hier. Ohne diesen Link gäbe es dann keinen
 * sichtbaren Weg mehr zu Weiterhören, Favoriten und Elternbereich – ausser dem
 * Zurück-Knopf des Geräts, und den findet ein Kind nicht.
 */
function ZurStartseite() {
  return (
    <div className="py-4">
      <Link
        to="/"
        className="inline-flex min-h-touch items-center gap-2 rounded-tile pr-4 text-lg focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span aria-hidden="true" className="text-3xl">
          ←
        </span>
        Startseite
      </Link>
    </div>
  )
}

/**
 * „Alle Hörbücher“ – erst die Reihen, dann die Folgen.
 *
 * Neun Reihen mit zusammen mehreren hundert Folgen waren als eine Liste
 * unbrauchbar: Man scrollte an allem vorbei, was man suchte. Ein Schritt mehr
 * kostet einen Tap und spart das Suchen.
 */
export function LibraryScreen() {
  const { status, books, error, fromCache, refresh } = useLibrary()

  if (status === 'loading') {
    return (
      <Screen>
        <ZurStartseite />
        <ScreenTitle>Alle Hörbücher</ScreenTitle>
        <Spinner label="Bücher werden geladen" />
      </Screen>
    )
  }

  if (status === 'error' || books.length === 0) {
    return (
      <Screen>
        <ZurStartseite />
        <ScreenTitle>Alle Hörbücher</ScreenTitle>
        <EmptyState
          title={error === null ? 'Die Bibliothek ist leer' : 'Keine Verbindung'}
          hint={error === null ? 'Auf dem NAS liegen noch keine Hörbücher.' : libraryErrorMessage(error)}
          action={
            <div className="flex flex-col gap-3">
              <BigLinkButton to="/">Zurück</BigLinkButton>
            </div>
          }
        />
      </Screen>
    )
  }

  const series = buildSeries(books)

  return (
    <Screen>
      <ZurStartseite />
      <ScreenTitle>Alle Hörbücher</ScreenTitle>

      {fromCache && error !== null ? (
        <div className="pb-4">
          <Notice>
            {libraryErrorMessage(error)} Angezeigt wird der zuletzt bekannte Stand.{' '}
            <button type="button" className="underline" onClick={refresh}>
              Nochmal versuchen
            </button>
          </Notice>
        </div>
      ) : null}

      <ul className="grid grid-cols-2 gap-4 pb-6 sm:grid-cols-3">
        {series.map((entry) => (
          <li key={entry.slug}>
            {/* Eine „Reihe" mit einem einzigen Hörbuch ist keine Reihe. Sie
                führt direkt zum Buch, statt einen Tap für eine Liste mit einem
                Eintrag zu kosten. */}
            {entry.books.length === 1 ? (
              <BookTile book={entry.books[0]!} />
            ) : (
              <SeriesTile series={entry} />
            )}
          </li>
        ))}
      </ul>
    </Screen>
  )
}
