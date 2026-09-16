import { useLibrary } from '@/features/library/libraryContext'
import { BigButton } from '@/ui/BigButton'
import { Notice } from '@/ui/Notice'

import { formatBytes, isDownloaded } from './downloads'
import { transferHinweis } from './transferHinweis'
import { useDownloads } from './downloadsContext'

/**
 * Elternbereich: Was liegt auf dem Gerät, und wie viel Platz ist noch da.
 *
 * Diese Liste ist der Ort, an dem aufgeräumt wird. Das Kind soll sich um
 * Speicherplatz nicht kümmern müssen – aber irgendwo muss man sehen können,
 * warum das Tablet voll ist.
 */
export function DownloadsSection() {
  const { records, supported, background, transfer, storage, remove } = useDownloads()
  // Ungefiltert: Ein gesperrtes Hörbuch, das auf dem Gerät liegt, muss hier
  // mit Namen dastehen – sonst lässt es sich nicht wieder wegräumen.
  const { allBooks } = useLibrary()

  if (!supported) return null

  const geladen = [...records.values()].filter((record) => isDownloaded(record))
  const belegt = geladen.reduce((sum, record) => sum + record.bytesDone, 0)

  return (
    <section className="flex flex-col gap-4 pt-8">
      <h2 className="text-2xl font-bold">Heruntergeladen</h2>

      <Notice>{transferHinweis(transfer, background)}</Notice>

      {geladen.length === 0 ? (
        <Notice>
          Noch nichts auf dem Gerät. Auf der Seite eines Hörbuchs steht „Auf dieses Gerät
          laden" – sofern es für das Kind freigegeben ist.
        </Notice>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {geladen.map((record) => {
              const book = allBooks.find((entry) => entry.id === record.bookId)
              return (
                <li
                  key={record.bookId}
                  className="flex flex-col gap-3 rounded-tile bg-surface p-4"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="flex-1 text-xl font-semibold">
                      {book?.title ?? 'Nicht mehr im Katalog'}
                    </span>
                    <span className="shrink-0 tabular-nums text-ink-soft">
                      {formatBytes(record.bytesDone)}
                    </span>
                  </div>
                  <BigButton
                    variant="secondary"
                    onClick={() => {
                      if (book) remove(book)
                    }}
                    disabled={book === undefined}
                  >
                    Vom Gerät löschen
                  </BigButton>
                </li>
              )
            })}
          </ul>
          <p className="text-ink-soft">
            Zusammen {formatBytes(belegt)}
            {storage !== null && storage.quotaBytes > 0
              ? ` von ${formatBytes(storage.quotaBytes)} verfügbarem Platz`
              : ''}
            .
          </p>
        </>
      )}
    </section>
  )
}
