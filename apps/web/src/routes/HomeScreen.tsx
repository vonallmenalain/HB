import { Link } from 'react-router-dom'

import { useFavorites } from '@/features/favorites/favoritesContext'
import { BookShelf } from '@/features/library/BookShelf'
import { useLibrary } from '@/features/library/libraryContext'
import { suggestBooks } from '@/features/library/suggestions'
import { ParentEntry } from '@/features/parents/ParentEntry'
import { ContinueTile } from '@/features/player/ContinueTile'
import { hasListened, pickRecent } from '@/features/progress/progress'
import { useProgress } from '@/features/progress/progressContext'
import { useProfiles } from '@/features/profiles/profilesContext'
import { Avatar } from '@/ui/Avatar'
import { BigLinkButton } from '@/ui/BigButton'
import { EmptyState } from '@/ui/EmptyState'
import { Screen } from '@/ui/Screen'
import { Spinner } from '@/ui/Spinner'

/**
 * Die Startseite.
 *
 * Von oben nach unten: wer hier hört, wo es weitergeht, was gemerkt ist, was
 * dazu passt – und erst ganz unten die ganze Bibliothek. Die Reihenfolge ist
 * die Antwort auf „was will ein Kind, das die App öffnet": weiterhören, fast
 * immer.
 */
export function HomeScreen() {
  const { selected } = useProfiles()
  const { status, books, bookById } = useLibrary()
  const { entries, reset } = useProgress()
  const { ids: favoriten } = useFavorites()

  const zuletzt = pickRecent([...entries.values()], (id) => bookById(id) !== undefined, 5)
  const weiter = zuletzt[0] ?? null
  const weiterBuch = weiter ? bookById(weiter.bookId) : undefined

  const weitereAngefangene = zuletzt
    .slice(1)
    .map((entry) => bookById(entry.bookId))
    .filter((book) => book !== undefined)

  const gemerkt = books.filter((book) => favoriten.has(book.id))

  // Was oben schon steht, gehört nicht noch einmal in die Vorschläge.
  const schonZuSehen = new Set([
    ...zuletzt.map((entry) => entry.bookId),
    ...gemerkt.map((book) => book.id),
  ])

  // Ohne einen einzigen gehörten Satz gibt es nichts vorzuschlagen. Dann
  // stünde dort einfach das Neueste – und darunter, im Ausschnitt der
  // Bibliothek, noch einmal dasselbe.
  //
  // Gezählt werden angefangene Bücher, nicht Einträge: Nach dem Zurücksetzen
  // steht zu jedem Buch ein Eintrag auf 0, gehört wurde aber nichts.
  const vorschlaege = !hasListened(entries.values())
    ? []
    : suggestBooks({
        books,
        entries: [...entries.values()],
        exclude: schonZuSehen,
        limit: 6,
      })

  for (const book of vorschlaege) schonZuSehen.add(book.id)

  const neueste = [...books]
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
    .filter((book) => !schonZuSehen.has(book.id))
    // Sechs füllen das Raster auf Handy und Tablet – und am ersten Tag, wenn
    // sonst noch nichts auf der Seite steht, wirkt sie damit nicht leer.
    .slice(0, 6)

  return (
    <Screen>
      <div className="flex items-center gap-4 py-6">
        <ParentEntry>Hörbücher</ParentEntry>
        {selected ? (
          <Link
            to="/profil/bearbeiten"
            aria-label={`${selected.name} – Profil und Einstellungen`}
            className="flex items-center gap-3 rounded-full focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span className="hidden text-lg font-semibold sm:inline">{selected.name}</span>
            <Avatar avatar={selected.avatar} color={selected.color} size="sm" />
          </Link>
        ) : null}
      </div>

      {weiter && weiterBuch ? (
        <div className="pb-8">
          <ContinueTile
            book={weiterBuch}
            progress={weiter}
            onRemove={() => {
              reset(weiterBuch.id)
            }}
          />
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

      {/* Nur hier steht ein Kreuz an den Kacheln: „Zuletzt gehört" ist eine
          Liste, die das Kind selbst gefüllt hat – Gemerktes nimmt der Stern
          zurück, und Vorschläge kommen und gehen ohnehin von allein. */}
      <BookShelf
        title="Zuletzt gehört"
        books={weitereAngefangene}
        onRemove={(book) => {
          reset(book.id)
        }}
      />
      <BookShelf title="Gemerkt" books={gemerkt} />
      <BookShelf title="Vielleicht auch etwas für dich" books={vorschlaege} />

      {books.length > 0 ? (
        <BookShelf
          title="Alle Hörbücher"
          books={neueste}
          action={<BigLinkButton to="/bibliothek">Alle Hörbücher</BigLinkButton>}
        />
      ) : null}
    </Screen>
  )
}
