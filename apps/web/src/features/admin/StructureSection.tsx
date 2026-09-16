import { useCallback, useEffect, useState } from 'react'

import { libraryErrorMessage } from '@/features/library/errors'
import { useLibrary } from '@/features/library/libraryContext'
import {
  type FolderMode,
  type MediaFolder,
  MediaRequestError,
} from '@/features/library/mediaClient'
import { type RescanState, useScanWatch } from '@/features/parents/useRescan'
import { BigButton } from '@/ui/BigButton'
import { Notice } from '@/ui/Notice'
import { Spinner } from '@/ui/Spinner'
import { TextField } from '@/ui/TextField'

/** So viele Ordner auf einmal – die langen stehen oben, der Rest ist Suche. */
const MAX_TREFFER = 15

function fehlerText(error: unknown): string {
  if (error instanceof MediaRequestError) {
    return error.reason === 'forbidden'
      ? 'Dieses Konto darf die Ordner nicht umstellen (HB_ADMIN_UIDS auf dem NAS).'
      : libraryErrorMessage(error.reason)
  }
  return 'Der Ordner liess sich nicht umstellen.'
}

function scanMeldung(state: RescanState): string | null {
  switch (state.kind) {
    case 'idle':
      return null
    case 'running':
      return 'Das NAS liest seine Ordner neu ein. Das dauert einen Moment.'
    case 'done':
      return `Fertig – die Bibliothek hat jetzt ${String(state.gesamt)} Hörbücher.`
    case 'incomplete':
      return 'Das Einlesen ist nicht durchgelaufen – es bleibt beim bisherigen Stand. Woran es lag, steht im Protokoll des Containers.'
    case 'still-running':
      return 'Das Einlesen dauert länger als gewöhnlich. Es läuft weiter; die Hörbücher erscheinen von allein.'
    case 'failed':
      return libraryErrorMessage(state.reason)
  }
}

/**
 * Ordner umstellen: ein Hörbuch – oder eines je Datei.
 *
 * Auf einem gewachsenen NAS liegen beide Ablagen nebeneinander. Ein Ordner mit
 * nummerierten Dateien ist meistens ein Hörbuch mit Kapiteln; manchmal sind es
 * aber neunzig vollständige Folgen, und dann ergibt der Ordner ein Hörbuch von
 * hundert Stunden mit neunzig „Kapiteln".
 *
 * Erkennen lässt sich das von aussen nicht zuverlässig – ein Roman mit langen,
 * benannten Kapiteln sieht genauso aus. Also fragt die App nicht die Dateien,
 * sondern den Menschen, der die Sammlung kennt. Die Wahl liegt im Dienst und
 * gilt für alle Geräte; eine `buch.json` auf dem NAS wird davon überstimmt.
 */
export function StructureSection() {
  const { client, refresh } = useLibrary()
  const { state: scan, run } = useScanWatch(client, refresh)

  const [folders, setFolders] = useState<MediaFolder[] | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [suche, setSuche] = useState('')

  // Gesetzt wird der Zustand erst, wenn die Antwort da ist: Ein synchrones
  // `setState` im Effekt stiesse eine zweite Renderrunde an, bevor überhaupt
  // etwas passiert ist.
  const laden = useCallback(() => {
    if (!client) return
    void client
      .fetchFolders()
      .then((liste) => {
        setFolders(liste)
        setFehler(null)
      })
      .catch((error: unknown) => {
        setFehler(fehlerText(error))
        setFolders([])
      })
  }, [client])

  useEffect(laden, [laden])

  // Nach einem Scan stimmen die Zahlen in der Liste nicht mehr.
  useEffect(() => {
    if (scan.kind === 'done') laden()
  }, [scan.kind, laden])

  const umstellen = (folder: MediaFolder, mode: FolderMode | null): void => {
    setFehler(null)
    run((bereit) => bereit.setFolderMode(folder.path, mode))
  }

  const treffer = (folders ?? []).filter((folder) =>
    suche === '' ? true : folder.path.toLowerCase().includes(suche.toLowerCase()),
  )
  const meldung = scanMeldung(scan)

  return (
    <section className="flex flex-col gap-4 pt-8">
      <h2 className="text-2xl font-bold">Ordner</h2>

      <Notice>
        Ein Ordner mit mehreren Dateien ist normalerweise ein Hörbuch mit Kapiteln. Liegen
        darin aber vollständige Folgen – eine Datei je Folge –, lässt sich das hier
        umstellen. Das NAS liest danach neu ein; die Hörbücher bekommen dabei neue
        Kennungen und fangen einmalig wieder von vorn an.
      </Notice>

      {client === null ? (
        <Notice tone="error">Ohne Verbindung zum NAS lässt sich nichts umstellen.</Notice>
      ) : null}
      {fehler !== null ? <Notice tone="error">{fehler}</Notice> : null}
      {meldung !== null ? (
        <Notice tone={scan.kind === 'failed' ? 'error' : 'info'}>{meldung}</Notice>
      ) : null}

      {folders === null ? (
        <Spinner label="Ordner werden geladen" />
      ) : (
        <>
          <TextField
            label="Ordner suchen"
            value={suche}
            onChange={(event) => {
              setSuche(event.target.value)
            }}
          />

          <p className="text-ink-soft">
            {treffer.length} Ordner mit mehreren Dateien
            {treffer.length > MAX_TREFFER ? ` – die ersten ${String(MAX_TREFFER)}` : ''}
          </p>

          <ul className="flex flex-col gap-3">
            {treffer.slice(0, MAX_TREFFER).map((folder) => {
              const einzeln = folder.mode === 'einzelfolgen'

              return (
                <li key={folder.path} className="flex flex-col gap-2 rounded-tile bg-surface p-4">
                  <p className="font-semibold break-words">{folder.path}</p>
                  <p className="text-sm text-ink-soft">
                    {folder.books} {folder.books === 1 ? 'Hörbuch' : 'Hörbücher'} ·{' '}
                    {folder.files} {folder.files === 1 ? 'Datei' : 'Dateien'}
                    {folder.titles.length > 0 ? ` · ${folder.titles.join(', ')}` : ''}
                  </p>

                  <p className="text-sm">
                    {einzeln
                      ? 'Jede Datei ist ein eigenes Hörbuch.'
                      : 'Ein Hörbuch, jede Datei ein Kapitel.'}
                  </p>

                  <div className="pt-2">
                    <BigButton
                      variant="secondary"
                      disabled={client === null || scan.kind === 'running'}
                      onClick={() => {
                        umstellen(folder, einzeln ? 'einBuch' : 'einzelfolgen')
                      }}
                    >
                      {einzeln ? 'Doch ein Hörbuch' : 'Jede Datei ein Hörbuch'}
                    </BigButton>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
