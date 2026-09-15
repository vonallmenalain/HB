import { type Book } from '@/features/library/catalog'
import { BigButton } from '@/ui/BigButton'
import { ProgressBar } from '@/ui/ProgressBar'

import { downloadRatio, formatBytes, isDownloaded, matchesCatalog, totalBytes } from './downloads'
import { useDownloads } from './downloadsContext'

/**
 * „Auf dieses Gerät laden" – auf der Buchseite, unter dem Abspielen.
 *
 * Erscheint nur, wenn die Eltern es für dieses Kind freigegeben haben. Ohne
 * Freigabe steht dort gar nichts: Ein ausgegrauter Knopf ist für ein Kind
 * keine Erklärung, sondern nur etwas, das nicht geht.
 */
export function DownloadButton({ book }: { book: Book }) {
  const { allowed, supported, get, start, cancel, remove } = useDownloads()
  const record = get(book.id)

  if (!allowed || !supported) return null

  const veraltet = record !== null && isDownloaded(record) && !matchesCatalog(record, book)

  if (record?.status === 'queued' || record?.status === 'running') {
    const ratio = downloadRatio(record)
    return (
      <div className="flex flex-col gap-2">
        <BigButton
          variant="secondary"
          onClick={() => {
            cancel(book.id)
          }}
        >
          {record.status === 'queued'
            ? 'Wartet … abbrechen'
            : `Lädt … ${String(Math.round(ratio * 100))} %`}
        </BigButton>
        <ProgressBar ratio={ratio} label={`Download von ${book.title}`} />
      </div>
    )
  }

  if (isDownloaded(record) && !veraltet) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-center text-ink-soft">
          <span aria-hidden="true">✓ </span>
          Auf dem Gerät · {formatBytes(record?.bytesDone ?? 0)}
        </p>
        <BigButton
          variant="secondary"
          onClick={() => {
            remove(book)
          }}
        >
          Vom Gerät löschen
        </BigButton>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <BigButton
        variant="secondary"
        onClick={() => {
          start(book)
        }}
      >
        Auf dieses Gerät laden
      </BigButton>
      <p className="text-center text-ink-soft">
        {veraltet
          ? 'Das Hörbuch hat sich auf dem NAS geändert – neu laden.'
          : `Braucht ${formatBytes(totalBytes(book))}. Danach geht es ohne Internet.`}
      </p>
      {record?.status === 'failed' ? (
        <p role="alert" className="text-center text-ink-soft">
          Beim letzten Versuch hat etwas gefehlt. Ein neuer Versuch macht dort weiter, wo er
          aufgehört hat.
        </p>
      ) : null}
    </div>
  )
}
