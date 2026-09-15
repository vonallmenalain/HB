import { Link } from 'react-router-dom'

import { BookTile } from '@/features/library/BookTile'
import { useLibrary } from '@/features/library/libraryContext'
import { ParentEntry } from '@/features/parents/ParentEntry'
import { ContinueTile } from '@/features/player/ContinueTile'
import { pickContinue } from '@/features/progress/progress'
import { useProgress } from '@/features/progress/progressContext'
import { useProfiles } from '@/features/profiles/profilesContext'
import { Avatar } from '@/ui/Avatar'
import { BigLinkButton } from '@/ui/BigButton'
import { EmptyState } from '@/ui/EmptyState'
import { Screen } from '@/ui/Screen'
import { Spinner } from '@/ui/Spinner'

/**
 * Startbildschirm.
 *
 * Ganz oben die „Weiterhören"-Kachel – ein Tap, und es läuft weiter. Erst
 * darunter kommt alles andere.
 */
export function HomeScreen() {
  const { selected } = useProfiles()
  const { status, books, bookById } = useLibrary()
  const { entries } = useProgress()

  const weiter = pickContinue([...entries.values()], (id) => bookById(id) !== undefined)
  const weiterBuch = weiter ? bookById(weiter.bookId) : undefined

  const neueste = [...books].sort((a, b) => b.addedAt.localeCompare(a.addedAt)).slice(0, 6)

  return (
    <Screen>
      <div className="flex items-center gap-4 py-6">
        <ParentEntry>Hörbücher</ParentEntry>
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

      {weiter && weiterBuch ? (
        <div className="pb-8">
          <ContinueTile book={weiterBuch} progress={weiter} />
        </div>
      ) : null}

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
          <h2 className="pb-3 text-xl font-bold">
            {weiter ? 'Andere Hörbücher' : 'Zuletzt dazugekommen'}
          </h2>
          <ul className="grid grid-cols-2 gap-4 pb-6 sm:grid-cols-3">
            {neueste
              .filter((book) => book.id !== weiter?.bookId)
              .map((book) => (
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
