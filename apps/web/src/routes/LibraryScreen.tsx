import { BigLinkButton } from '@/ui/BigButton'
import { EmptyState } from '@/ui/EmptyState'
import { Notice } from '@/ui/Notice'
import { Screen, ScreenTitle } from '@/ui/Screen'
import { Spinner } from '@/ui/Spinner'
import { SeriesTile } from '@/features/library/SeriesTile'
import { buildSeries } from '@/features/library/grouping'
import { useLibrary } from '@/features/library/libraryContext'
import { libraryErrorMessage } from '@/features/library/errors'

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
        <ScreenTitle>Alle Hörbücher</ScreenTitle>
        <Spinner label="Bücher werden geladen" />
      </Screen>
    )
  }

  if (status === 'error' || books.length === 0) {
    return (
      <Screen>
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
            <SeriesTile series={entry} />
          </li>
        ))}
      </ul>
    </Screen>
  )
}
