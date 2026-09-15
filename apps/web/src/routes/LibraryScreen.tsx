import { BigLinkButton } from '@/ui/BigButton'
import { EmptyState } from '@/ui/EmptyState'
import { Notice } from '@/ui/Notice'
import { Screen, ScreenTitle } from '@/ui/Screen'
import { Spinner } from '@/ui/Spinner'
import { BookTile } from '@/features/library/BookTile'
import { useLibrary } from '@/features/library/libraryContext'
import { libraryErrorMessage } from '@/features/library/errors'

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
        {books.map((book) => (
          <li key={book.id}>
            <BookTile book={book} />
          </li>
        ))}
      </ul>
    </Screen>
  )
}
