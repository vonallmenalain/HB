import { useCallback, useEffect, useState } from 'react'

import { libraryErrorMessage } from '@/features/library/errors'
import { useLibrary } from '@/features/library/libraryContext'
import {
  MediaRequestError,
  type ScanIssue,
  type ScanReport,
} from '@/features/library/mediaClient'
import { type RescanState, useRescan } from '@/features/parents/useRescan'
import { BigButton } from '@/ui/BigButton'
import { Notice } from '@/ui/Notice'
import { Spinner } from '@/ui/Spinner'

/** So viele Dateinamen je Eintrag – neunzehn Kapitel wären eine Liste. */
const MAX_DATEIEN = 3

type Laden =
  | { kind: 'laedt' }
  | { kind: 'da'; report: ScanReport }
  /** Der Dienst auf dem NAS kennt die Route noch nicht. */
  | { kind: 'zu-alt' }
  | { kind: 'fehler'; text: string }

function fehlerText(error: unknown): string {
  if (error instanceof MediaRequestError) {
    return error.reason === 'forbidden'
      ? 'Dieses Konto darf das nicht sehen (HB_ADMIN_UIDS auf dem NAS).'
      : libraryErrorMessage(error.reason)
  }
  return 'Die Liste liess sich nicht laden.'
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
      return 'Das Einlesen dauert länger als gewöhnlich. Es läuft weiter; die Liste hier stimmt erst danach.'
    case 'failed':
      return libraryErrorMessage(state.reason)
  }
}

function dateien(anzahl: number): string {
  return `${String(anzahl)} ${anzahl === 1 ? 'Datei' : 'Dateien'}`
}

function zeitpunkt(iso: string): string {
  return new Date(iso).toLocaleString('de-CH', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Was passiert ist – und was jetzt hilft. Ein Satz für jedes. */
function beschreibung(issue: ScanIssue): { was: string; abhilfe: string } {
  switch (issue.kind) {
    case 'unsupported-format': {
      const format = issue.extensions.join(', ')
      return issue.noPlayableAudio
        ? {
            was: `Hier liegen ${dateien(issue.files.length)} im Format ${format}. Die liest der Scanner nicht ein – der Ordner fehlt deshalb in der Bibliothek.`,
            abhilfe:
              'Das Hörbuch als MP3 oder M4B ablegen. Raumklang-Fassungen (Dolby Atmos, 5.1) spielt der Browser nicht zuverlässig ab, kopiergeschützte Dateien (.aax) gar nicht – die Stereo-Fassung ist die richtige.',
          }
        : {
            was: `${dateien(issue.files.length)} im Format ${format} ${
              issue.files.length === 1 ? 'wurde' : 'wurden'
            } übergangen. Das Hörbuch ist da, aber ohne sie.`,
            abhilfe: 'Diese Dateien als MP3 oder M4B ablegen, dann neu einlesen.',
          }
    }
    case 'unreadable-files':
      return {
        was: `${dateien(issue.files.length)} ${
          issue.files.length === 1 ? 'liess' : 'liessen'
        } sich nicht lesen (${issue.reason}). ${
          issue.bookMissing
            ? 'Das Hörbuch fehlt deshalb ganz.'
            : 'Das Hörbuch ist da, aber ohne sie.'
        }`,
        abhilfe:
          'Meist ist beim Kopieren etwas abgebrochen. Die Dateien noch einmal aufs NAS kopieren.',
      }
    case 'unreadable-folder':
      return {
        was: `Der Ordner liess sich nicht öffnen (${issue.reason}).`,
        abhilfe: 'Meist fehlen dem Container die Leserechte für diesen Ordner.',
      }
    case 'too-deep':
      return {
        was: 'Hier liegt Ton, aber tiefer, als der Scanner sucht – er liest höchstens vier Ordner unter dem Hörbuch-Ordner.',
        abhilfe: 'Den Ordner mit dem Hörbuch eine oder zwei Ebenen nach oben verschieben.',
      }
  }
}

function Eintrag({ issue }: { issue: ScanIssue }) {
  const { was, abhilfe } = beschreibung(issue)
  const liste = 'files' in issue ? issue.files : []
  const rest = liste.length - MAX_DATEIEN

  return (
    <li className="flex flex-col gap-2 rounded-tile bg-surface p-4">
      <p className="font-semibold break-words">
        {issue.folder === '' ? 'Der Hörbuch-Ordner selbst' : issue.folder}
      </p>
      <p>{was}</p>
      {liste.length > 0 ? (
        <p className="text-sm break-words text-ink-soft">
          {liste.slice(0, MAX_DATEIEN).join(' · ')}
          {rest > 0 ? ` · und ${String(rest)} weitere` : ''}
        </p>
      ) : null}
      <p className="text-sm">{abhilfe}</p>
    </li>
  )
}

/**
 * Was beim Einlesen liegen blieb.
 *
 * Der Scanner liest nur, was der Browser auch abspielen kann. Alles andere liess
 * er bisher wortlos liegen – eine Dolby-Atmos-Fassung als `.mka` erschien
 * nirgends, und niemand wusste, warum. Hier steht es jetzt: welcher Ordner,
 * welche Dateien und was dagegen hilft.
 *
 * Nur für das Administratorkonto: Die Liste nennt Ordnerpfade, und die gehen
 * kein Kind etwas an.
 */
export function ScanIssuesSection() {
  const { client, refresh } = useLibrary()
  const { state: scan, start } = useRescan(client, refresh)
  const [laden, setLaden] = useState<Laden>({ kind: 'laedt' })

  // Gesetzt wird erst, wenn die Antwort da ist – wie in den anderen
  // Abschnitten, damit der Effekt keine zweite Renderrunde anstösst.
  const holen = useCallback(() => {
    if (!client) return
    void client
      .fetchScanIssues()
      .then((report) => {
        setLaden(report === null ? { kind: 'zu-alt' } : { kind: 'da', report })
      })
      .catch((error: unknown) => {
        setLaden({ kind: 'fehler', text: fehlerText(error) })
      })
  }, [client])

  useEffect(holen, [holen])

  // Nach einem Scan ist die Liste von gestern.
  useEffect(() => {
    if (scan.kind === 'done') holen()
  }, [scan.kind, holen])

  const meldung = scanMeldung(scan)

  return (
    <section className="flex flex-col gap-4 pt-8">
      <h2 className="text-2xl font-bold">Einlesen</h2>

      <Notice>
        Der Scanner liest MP3, M4A, M4B, AAC, OGG, Opus, FLAC und WAV. Was daneben in einem
        anderen Ton- oder Filmformat liegt, steht hier – ebenso Dateien, die sich nicht
        lesen liessen. Bilder, Playlisten und Booklets bleiben still liegen; die gehören
        dazu.
      </Notice>

      {client === null ? (
        <Notice tone="error">Ohne Verbindung zum NAS lässt sich nichts nachsehen.</Notice>
      ) : null}
      {meldung !== null ? (
        <Notice tone={scan.kind === 'failed' || scan.kind === 'incomplete' ? 'error' : 'info'}>
          {meldung}
        </Notice>
      ) : null}

      {client === null ? null : laden.kind === 'laedt' ? (
        <Spinner label="Liste wird geladen" />
      ) : laden.kind === 'zu-alt' ? (
        <Notice>
          Der Medien-Dienst auf dem NAS ist älter als diese Liste. Nach dem nächsten Update des
          Containers steht hier, was beim Einlesen liegen blieb.
        </Notice>
      ) : laden.kind === 'fehler' ? (
        <Notice tone="error">{laden.text}</Notice>
      ) : (
        <>
          <p className="text-ink-soft">
            {laden.report.issues.length === 0
              ? 'Beim letzten Einlesen ist nichts liegen geblieben.'
              : laden.report.issues.length === 1
                ? '1 Ordner, in dem etwas liegen blieb'
                : `${String(laden.report.issues.length)} Ordner, in denen etwas liegen blieb`}
            {laden.report.scannedAt !== null
              ? ` · Stand ${zeitpunkt(laden.report.scannedAt)}`
              : ''}
          </p>

          {laden.report.issues.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {laden.report.issues.map((issue, index) => (
                <Eintrag key={`${String(index)}:${issue.folder}`} issue={issue} />
              ))}
            </ul>
          ) : null}
        </>
      )}

      <BigButton
        variant="secondary"
        onClick={start}
        disabled={client === null || scan.kind === 'running'}
        className="disabled:opacity-60"
      >
        {scan.kind === 'running' ? 'Wird eingelesen …' : 'Neu einlesen'}
      </BigButton>
    </section>
  )
}
