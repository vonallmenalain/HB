import { Link } from 'react-router-dom'

import { useFavorites } from '@/features/favorites/favoritesContext'
import { BookShelf } from '@/features/library/BookShelf'
import { LibraryGrid } from '@/features/library/LibraryGrid'
import { useLibrary } from '@/features/library/libraryContext'
import { suggestBooks } from '@/features/library/suggestions'
import { ParentEntry } from '@/features/parents/ParentEntry'
import { ContinueTile } from '@/features/player/ContinueTile'
import { hasListened, pickRecent } from '@/features/progress/progress'
import { useProgress } from '@/features/progress/progressContext'
import { useProfiles } from '@/features/profiles/profilesContext'
import { Avatar } from '@/ui/Avatar'
import { EmptyState } from '@/ui/EmptyState'
import { Screen } from '@/ui/Screen'
import { Spinner } from '@/ui/Spinner'

/**
 * Die Startseite.
 *
 * Von oben nach unten: wer hier hört, wo es weitergeht, was sonst noch
 * angefangen ist, was gemerkt ist, was dazu passt – und ganz unten die ganze
 * Bibliothek, Reihe für Reihe. Die Reihenfolge ist die Antwort auf „was will
 * ein Kind, das die App öffnet": weiterhören, fast immer.
 *
 * Deshalb steht „Weiterhören" zweimal da: einmal gross für das zuletzt gehörte
 * Buch – ein Tap, und es läuft – und einmal als Abschnitt für alles andere, das
 * angefangen ist. Ein zweiter Name dafür („Zuletzt gehört") sagte dasselbe mit
 * anderen Worten und liess offen, was beim Antippen passiert.
 *
 * Unten stand früher ein Ausschnitt mit den sechs neuesten Folgen und darunter
 * ein Knopf in die Bibliothek. Am ersten Tag – ohne Weiterhören, ohne
 * Gemerktes, ohne Vorschläge – war die Startseite damit eine fast leere Seite
 * mit einem Knopf: Die Sammlung lag einen Tap entfernt, ohne dass etwas davon
 * zu sehen war. Jetzt stehen die Reihen gleich hier.
 */
export function HomeScreen() {
  const { selected } = useProfiles()
  const { status, books, bookById, schemaVersion } = useLibrary()
  const { entries, reset } = useProgress()
  const { ids: favoriten } = useFavorites()

  // Ohne Obergrenze im Aufruf: Wie viele Kacheln „Weiterhören" verträgt, steht
  // bei der Liste selbst (`CONTINUE_LIMIT`) und nicht hier.
  const zuletzt = pickRecent([...entries.values()], (id) => bookById(id) !== undefined)
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
  // stünde dort einfach das Neueste – und darunter, im Raster mit allen
  // Reihen, noch einmal dasselbe.
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

  return (
    <Screen wide>
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
        />
      ) : null}

      {/* Alles, was oben nicht die grosse Kachel geworden ist – dieselbe Liste,
          derselbe Name: Was angefangen ist, steht unter „Weiterhören", egal ob
          gross oben oder klein darunter.

          Nur hier steht ein Kreuz an den Kacheln: Diese Liste hat das Kind
          selbst gefüllt – Gemerktes nimmt der Stern zurück, und Vorschläge
          kommen und gehen ohnehin von allein. */}
      <BookShelf
        title="Weiterhören"
        books={weitereAngefangene}
        onRemove={(book) => {
          reset(book.id)
        }}
      />
      <BookShelf title="Gemerkt" books={gemerkt} />
      <BookShelf title="Vielleicht auch etwas für dich" books={vorschlaege} />

      {/*
        Die ganze Sammlung, Reihe für Reihe – dasselbe Raster wie unter „Alle
        Hörbücher". Ein Knopf dorthin steht hier nicht mehr: Er führte auf eine
        Seite, die dasselbe zeigt wie die Zeilen darüber.
      */}
      {books.length > 0 ? (
        <section className="pb-8">
          <h2 className="pb-3 text-xl font-bold">Alle Hörbücher</h2>
          <LibraryGrid books={books} schemaVersion={schemaVersion} />
        </section>
      ) : null}
    </Screen>
  )
}
