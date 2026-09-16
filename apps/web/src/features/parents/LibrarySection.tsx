import { SUPPORTED_SCHEMA_VERSION } from '@/features/library/catalog'
import { libraryErrorMessage } from '@/features/library/errors'
import { countSeries } from '@/features/library/grouping'
import { useLibrary } from '@/features/library/libraryContext'
import type { MediaError } from '@/features/library/mediaClient'
import { BigButton } from '@/ui/BigButton'
import { Notice } from '@/ui/Notice'

import { type RescanState, useRescan } from './useRescan'

/**
 * Ein 403 bedeutet hier etwas anderes als sonst: Das Konto darf hören, nur
 * nicht das Einlesen anstossen. Die übliche Meldung würde auf die falsche
 * Variable zeigen.
 */
function rescanErrorMessage(reason: MediaError): string {
  return reason === 'forbidden'
    ? 'Dieses Konto darf das Einlesen nicht anstossen (HB_ADMIN_UIDS auf dem NAS).'
    : libraryErrorMessage(reason)
}

function rescanMessage(state: RescanState): string | null {
  switch (state.kind) {
    case 'idle':
      return null
    case 'running':
      return 'Das NAS liest gerade seine Ordner. Das dauert einen Moment.'
    case 'done':
      if (state.neu === 0) {
        return `Fertig – nichts Neues gefunden. Es bleiben ${String(state.gesamt)} Hörbücher.`
      }
      return state.neu === 1
        ? 'Fertig – 1 neues Hörbuch ist dazugekommen.'
        : `Fertig – ${String(state.neu)} neue Hörbücher sind dazugekommen.`
    case 'incomplete':
      return 'Das NAS hat das Einlesen nicht abgeschlossen – der Katalog ist unverändert. Woran es lag, steht im Protokoll des Containers.'
    case 'still-running':
      return 'Das Einlesen dauert länger als gewöhnlich. Es läuft weiter; die neuen Hörbücher erscheinen von allein.'
    case 'failed':
      return rescanErrorMessage(state.reason)
  }
}

/**
 * Elternbereich: Steht die Verbindung zum NAS, und was liegt dort?
 *
 * Beantwortet die Frage, die sich stellt, wenn ein neues Hörbuch nicht
 * auftaucht: Liegt es am NAS, am Netz – oder hat die App den Katalog nur noch
 * nicht neu gelesen.
 */
export function LibrarySection() {
  // Der ganze Katalog: Die Zahl hier soll sagen, was auf dem NAS liegt – nicht,
  // was das gerade gewählte Kind davon sehen darf.
  const { status, allBooks: books, error, fromCache, skipped, schemaVersion, refresh, client } =
    useLibrary()
  const { state: rescan, start: rescanStarten } = useRescan(client, refresh)

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
          {countSeries(books)} Reihen. Wie sie heissen, steht in den Ordnernamen auf dem
          NAS. Hörbücher, die in keiner Reihe liegen, stehen einzeln im Raster.
        </Notice>
      ) : null}

      {skipped > 0 ? (
        <Notice>
          {skipped} {skipped === 1 ? 'Eintrag wurde' : 'Einträge wurden'} übersprungen – dort
          stimmt im Katalog etwas nicht.
        </Notice>
      ) : null}

      {rescanMessage(rescan) !== null ? (
        <Notice tone={rescan.kind === 'failed' || rescan.kind === 'incomplete' ? 'error' : 'info'}>
          {rescanMessage(rescan)}
        </Notice>
      ) : null}

      <BigButton
        variant="secondary"
        onClick={rescanStarten}
        disabled={rescan.kind === 'running'}
        className="disabled:opacity-60"
      >
        {rescan.kind === 'running' ? 'Wird eingelesen …' : 'Neue Hörbücher suchen'}
      </BigButton>

      <p className="text-sm text-ink-soft">
        Sucht auf dem NAS nach Ordnern, die seit dem letzten Mal dazugekommen sind. Ohne
        diesen Knopf passiert dasselbe von allein – nur eben erst beim nächsten
        selbsttätigen Durchgang.
      </p>
    </section>
  )
}
