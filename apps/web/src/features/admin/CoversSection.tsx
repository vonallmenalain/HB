import { useCallback, useEffect, useRef, useState } from 'react'

import { type Book } from '@/features/library/catalog'
import { libraryErrorMessage } from '@/features/library/errors'
import { useLibrary } from '@/features/library/libraryContext'
import { type CoverHerkunft, MediaRequestError } from '@/features/library/mediaClient'
import { bookLabel } from '@/features/library/titles'
import { BookCover } from '@/ui/BookCover'
import { BigButton } from '@/ui/BigButton'
import { Notice } from '@/ui/Notice'
import { TextField } from '@/ui/TextField'

/** So viele Treffer auf einmal – darunter sucht man weiter, statt zu scrollen. */
const MAX_TREFFER = 12

function passt(book: Book, suche: string): boolean {
  if (suche === '') return false
  const text = `${book.title} ${book.folderName} ${book.series ?? ''} ${book.group ?? ''}`
  return text.toLowerCase().includes(suche.toLowerCase())
}

function fehlerText(error: unknown): string {
  if (error instanceof MediaRequestError) {
    return error.reason === 'forbidden'
      ? 'Dieses Konto darf keine Cover setzen (HB_ADMIN_UIDS auf dem NAS).'
      : libraryErrorMessage(error.reason)
  }
  return 'Das Bild liess sich nicht setzen.'
}

/**
 * Cover von Hand setzen.
 *
 * Die meisten Bilder kommen vom NAS – aus einer `cover.jpg` im Ordner oder aus
 * den ID3-Tags. Wo keins liegt, steht in der Bibliothek eine farbige
 * Buchstabenkachel; für ein Kind, das noch nicht liest, ist das Buch damit
 * kaum wiederzufinden. Hier lässt sich ein Bild hochladen, ohne ans NAS zu
 * müssen.
 *
 * Es landet im Cache-Volume des Dienstes, nicht im Hörbuch-Ordner: Der ist nur
 * lesend eingebunden. Ein Scan überschreibt es nicht.
 */
export function CoversSection() {
  const { books, client, refresh } = useLibrary()

  const [suche, setSuche] = useState('')
  const [laeuft, setLaeuft] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [erledigt, setErledigt] = useState<string | null>(null)
  /**
   * Die Bücher mit einem eigenen Bild – und woher es kommt.
   *
   * Ohne diese Liste stünde „Bild zurücknehmen" an jedem Buch mit Cover – auch
   * an denen, deren Bild vom NAS kommt. Der Knopf täte dort nichts, und ein
   * Knopf, der nichts tut, sieht aus wie ein Fehler.
   */
  const [eigene, setEigene] = useState<Readonly<Record<string, CoverHerkunft>>>({})
  // Ein Dateifeld je Buch – der Knopf daneben löst es aus.
  const felder = useRef(new Map<string, HTMLInputElement | null>())

  const eigeneLaden = useCallback(() => {
    if (!client) return
    void client
      .fetchOwnCovers()
      .then((covers) => {
        setEigene(covers)
      })
      .catch(() => {
        // Ohne die Liste fehlt nur der Knopf zum Zurücknehmen; das Hochladen
        // funktioniert weiter.
      })
  }, [client])

  useEffect(eigeneLaden, [eigeneLaden])

  const treffer = books.filter((book) => passt(book, suche))

  const hochladen = (book: Book, datei: File): void => {
    if (!client) return
    setFehler(null)
    setErledigt(null)
    setLaeuft(book.id)

    void client
      .uploadCover(book.id, datei)
      .then(() => {
        // Der Katalog trägt die Adresse des Covers samt Version – ohne das
        // Neuladen zeigte die App weiter das alte Bild aus dem Cache.
        refresh()
        setEigene((bisher) => ({ ...bisher, [book.id]: 'hochgeladen' }))
        setErledigt(book.id)
      })
      .catch((error: unknown) => {
        setFehler(fehlerText(error))
      })
      .finally(() => {
        setLaeuft(null)
      })
  }

  const wegnehmen = (book: Book): void => {
    if (!client) return
    setFehler(null)
    setErledigt(null)
    setLaeuft(book.id)

    void client
      .removeCover(book.id)
      .then(() => {
        refresh()
        setEigene((bisher) => {
          const { [book.id]: _weg, ...rest } = bisher
          return rest
        })
      })
      .catch((error: unknown) => {
        setFehler(fehlerText(error))
      })
      .finally(() => {
        setLaeuft(null)
      })
  }

  return (
    <section className="flex flex-col gap-4 pt-8">
      <h2 className="text-2xl font-bold">Cover</h2>

      <Notice>
        Die Bilder kommen aus dem Ordner auf dem NAS oder aus der Datei selbst. Wo keins
        liegt, steht eine farbige Kachel – hier lässt sich stattdessen ein Bild hochladen.
        Es gilt für alle Geräte, überlebt das nächste Einlesen und lässt sich jederzeit
        wieder zurücknehmen; dann gilt erneut, was auf dem NAS liegt.
      </Notice>

      {client === null ? (
        <Notice tone="error">Ohne Verbindung zum NAS lässt sich kein Bild setzen.</Notice>
      ) : null}

      {fehler !== null ? <Notice tone="error">{fehler}</Notice> : null}

      <TextField
        label="Hörbuch suchen"
        value={suche}
        onChange={(event) => {
          setSuche(event.target.value)
        }}
      />

      {suche === '' ? (
        <p className="text-ink-soft">
          Erst suchen: {books.length} Hörbücher sind zu viele für eine Liste.
        </p>
      ) : (
        <p className="text-ink-soft">
          {treffer.length} Treffer
          {treffer.length > MAX_TREFFER ? ` – die ersten ${String(MAX_TREFFER)}` : ''}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {treffer.slice(0, MAX_TREFFER).map((book) => {
          const bild = book.cover !== null ? (client?.coverUrl(book.cover) ?? null) : null
          const herkunft = eigene[book.id]

          return (
            <li key={book.id} className="flex items-center gap-4 rounded-tile bg-surface p-4">
              <div className="w-20 shrink-0">
                <BookCover title={book.title} color={book.coverColor} src={bild} />
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <p className="truncate font-semibold">{bookLabel(book)}</p>
                <p className="truncate text-sm text-ink-soft">{book.folderName}</p>
                <p className="text-sm text-ink-soft">
                  {herkunft === 'hochgeladen'
                    ? 'Eigenes Bild – gilt für alle Geräte.'
                    : herkunft === 'online'
                      ? 'Online gefunden – gilt für alle Geräte.'
                      : book.cover !== null
                        ? 'Bild vom NAS.'
                        : 'Kein Bild – es steht eine farbige Kachel.'}
                </p>

                {erledigt === book.id ? (
                  <p className="text-sm text-ink-soft">Bild gesetzt.</p>
                ) : null}

                {/* 16px Abstand zwischen tappbaren Elementen, KONZEPT §5.5. */}
                <div className="flex flex-col gap-4">
                  <input
                    ref={(element) => {
                      felder.current.set(book.id, element)
                    }}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    aria-label={`Bild für ${book.title}`}
                    className="hidden"
                    onChange={(event) => {
                      const datei = event.target.files?.[0]
                      // Das Feld wird zurückgesetzt, damit dieselbe Datei ein
                      // zweites Mal ein `change` auslöst.
                      event.target.value = ''
                      if (datei) hochladen(book, datei)
                    }}
                  />
                  <BigButton
                    variant="secondary"
                    disabled={client === null || laeuft === book.id}
                    onClick={() => {
                      felder.current.get(book.id)?.click()
                    }}
                  >
                    {laeuft === book.id ? 'Einen Moment …' : 'Bild wählen'}
                  </BigButton>

                  {herkunft !== undefined ? (
                    <BigButton
                      variant="secondary"
                      disabled={client === null || laeuft === book.id}
                      onClick={() => {
                        wegnehmen(book)
                      }}
                    >
                      {herkunft === 'online'
                        ? 'Gefundenes Bild zurücknehmen'
                        : 'Eigenes Bild zurücknehmen'}
                    </BigButton>
                  ) : null}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
