import { type Book } from '@/features/library/catalog'
import { useLibrary } from '@/features/library/libraryContext'
import { type CoverVorschlag } from '@/features/library/mediaClient'

function quelleName(quelle: CoverVorschlag['quelle']): string {
  return quelle === 'apple' ? 'Apple' : 'MusicBrainz'
}

/**
 * Die gefundenen Bilder zur Wahl.
 *
 * Steht an zwei Stellen: unter „Cover online suchen" für alles, was der grosse
 * Lauf nicht eindeutig zuordnen konnte, und unter „Cover" an einem einzelnen
 * Hörbuch. Dasselbe zweimal abzutippen hiesse, dass es beim nächsten Mal nur
 * an einer Stelle geändert wird.
 */
export function CoverSuggestions({
  book,
  vorschlaege,
  disabled = false,
  onApply,
}: {
  book: Book
  vorschlaege: readonly CoverVorschlag[]
  disabled?: boolean
  onApply: (vorschlag: CoverVorschlag) => void
}) {
  const { client } = useLibrary()

  if (vorschlaege.length === 0) return null

  return (
    /* 16px zwischen tappbaren Elementen, KONZEPT §5.5. */
    <ul className="flex flex-wrap gap-4">
      {vorschlaege.map((vorschlag) => (
        <li key={vorschlag.imageUrl}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onApply(vorschlag)
            }}
            className="flex w-32 flex-col gap-2 rounded-tile p-1 text-left transition-transform active:scale-95 disabled:opacity-40 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {/* Über den Dienst, nicht von der Quelle: Sonst müsste die
                Content-Security-Policy fremde Bildquellen zulassen, und jeder
                Aufruf verriete dem Anbieter, wer im Adminbereich sitzt. */}
            <img
              src={client?.suggestionUrl(book.id, vorschlag.imageUrl) ?? ''}
              alt=""
              loading="lazy"
              className="aspect-square w-full rounded-tile bg-surface-sunken object-cover"
            />
            <span className="line-clamp-2 text-sm font-semibold">{vorschlag.title}</span>
            <span className="text-xs text-ink-soft">
              {quelleName(vorschlag.quelle)}
              {vorschlag.artist === null ? '' : ` · ${vorschlag.artist}`}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
