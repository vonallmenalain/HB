import { SUPPORTED_SCHEMA_VERSION } from '@/features/library/catalog'
import { libraryErrorMessage } from '@/features/library/errors'
import { buildSeries } from '@/features/library/grouping'
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
  const { status, books, error, fromCache, skipped, schemaVersion, refresh } = useLibrary()

  // Ein zu alter Dienst kennt Reihen und Gruppen noch nicht. Die Bibliothek
  // sieht dann aus, als wäre jedes Hörbuch eine eigene Reihe – und ohne diesen
  // Hinweis sucht man den Fehler in der App statt auf dem NAS.
  const dienstZuAlt = schemaVersion !== null && schemaVersion < SUPPORTED_SCHEMA_VERSION

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

      {dienstZuAlt ? (
        <Notice tone="error">
          Der Medien-Dienst auf dem NAS ist älter als die App (Katalog-Version{' '}
          {schemaVersion} statt {SUPPORTED_SCHEMA_VERSION}). Er liefert keine Reihen und
          keine Unterordner mit – deshalb steht unter „Alle Hörbücher" jedes Hörbuch
          einzeln statt in seiner Reihe. Abhilfe: den Container auf dem QNAP neu bauen
          und starten (docs/QNAP-SETUP.md).
        </Notice>
      ) : null}

      {status === 'ready' && books.length > 0 && !dienstZuAlt ? (
        <Notice>
          {buildSeries(books).length} Reihen. Wie sie heissen, steht in den Ordnernamen
          auf dem NAS.
        </Notice>
      ) : null}

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
