import { Link } from 'react-router-dom'

import { BookTile } from '@/features/library/BookTile'
import { useLibrary } from '@/features/library/libraryContext'
import { useProfiles } from '@/features/profiles/profilesContext'
import { Avatar } from '@/ui/Avatar'
import { BigLinkButton } from '@/ui/BigButton'
import { EmptyState } from '@/ui/EmptyState'
import { Screen } from '@/ui/Screen'
import { Spinner } from '@/ui/Spinner'

/**
 * Startbildschirm.
 *
 * Ganz oben steht später die grosse „Weiterhören“-Kachel (M5/M6). Bis es
 * Fortschritt gibt, zeigt die Seite die zuletzt hinzugekommenen Bücher – das
 * ist für ein Kind immer noch ein Bild zum Antippen.
 */
export function HomeScreen() {
  const { selected } = useProfiles()
  const { status, books } = useLibrary()

  const neueste = [...books]
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
    .slice(0, 6)

  return (
    <Screen>
      <div className="flex items-center gap-4 py-6">
        <h1 className="flex-1 text-3xl font-bold tracking-tight">Hörbücher</h1>
        {selected ? (
          <Link
            to="/profil"
            aria-label={`Angemeldet als ${selected.name}. Profil wechseln.`}
            className="rounded-full focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Avatar avatar={selected.avatar} color={selected.color} size="sm" />
          </Link>
        ) : null}
      </div>

      {status === 'loading' ? <Spinner label="Bücher werden geladen" /> : null}

      {status !== 'loading' && books.length === 0 ? (
        <EmptyState
          title="Noch keine Hörbücher"
          hint="Sobald der Hörbuch-Ordner auf dem NAS verbunden ist, erscheinen hier die Bücher."
          action={<BigLinkButton to="/bibliothek">Alle Hörbücher</BigLinkButton>}
        />
      ) : null}

      {books.length > 0 ? (
        <>
          <h2 className="pb-3 text-xl font-bold">Zuletzt dazugekommen</h2>
          <ul className="grid grid-cols-2 gap-4 pb-6 sm:grid-cols-3">
            {neueste.map((book) => (
              <li key={book.id}>
                <BookTile book={book} />
              </li>
            ))}
          </ul>
          <BigLinkButton to="/bibliothek">Alle Hörbücher</BigLinkButton>
        </>
      ) : null}
    </Screen>
  )
}
