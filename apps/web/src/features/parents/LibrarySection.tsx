import { libraryErrorMessage } from '@/features/library/errors'
import { useLibrary } from '@/features/library/libraryContext'
import { BigButton } from '@/ui/BigButton'
import { Notice } from '@/ui/Notice'

/**
 * Elternbereich: Steht die Verbindung zum NAS, und was liegt dort?
 *
 * Beantwortet die Frage, die sich stellt, wenn ein neues Hörbuch nicht
 * auftaucht: Liegt es am NAS, am Netz – oder hat die App den Katalog nur noch
 * nicht neu gelesen.
 */
export function LibrarySection() {
  const { status, books, error, fromCache, skipped, refresh } = useLibrary()

  return (
    <section className="flex flex-col gap-4 pt-8">
      <h2 className="text-2xl font-bold">Bibliothek</h2>

      {error !== null ? (
        <Notice tone="error">{libraryErrorMessage(error)}</Notice>
      ) : (
        <Notice>
          {status === 'loading'
            ? 'Der Katalog wird gerade gelesen.'
            : `${String(books.length)} Hörbücher${
                fromCache ? ' – aus dem letzten bekannten Stand' : ' vom NAS'
              }.`}
        </Notice>
      )}

      {skipped > 0 ? (
        <Notice>
          {skipped} {skipped === 1 ? 'Eintrag wurde' : 'Einträge wurden'} übersprungen – dort
          stimmt im Katalog etwas nicht.
        </Notice>
      ) : null}

      <BigButton variant="secondary" onClick={refresh}>
        Katalog neu einlesen
      </BigButton>
    </section>
  )
}
