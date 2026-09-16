import { useCallback, useEffect, useRef, useState } from 'react'

import { type Book } from '@/features/library/catalog'
import { libraryErrorMessage } from '@/features/library/errors'
import { useLibrary } from '@/features/library/libraryContext'
import {
  type CoverSuche,
  type CoverVorschlag,
  MediaRequestError,
} from '@/features/library/mediaClient'
import { bookLabel } from '@/features/library/titles'

import { CoverSuggestions } from './CoverSuggestions'
import { BigButton } from '@/ui/BigButton'
import { Notice } from '@/ui/Notice'

/** So oft wird während eines Laufs nach dem Stand gefragt. */
const NACHFRAGE_MS = 5000

/** So viele Bücher auf einmal – der Rest kommt, wenn diese erledigt sind. */
const MAX_BUECHER = 8

const LEER: CoverSuche = {
  stand: {
    laeuft: false,
    erledigt: 0,
    gesamt: 0,
    gesetzt: 0,
    offen: 0,
    hinweis: null,
    beendetAm: null,
  },
  vorschlaege: {},
}

function fehlerText(error: unknown): string {
  if (error instanceof MediaRequestError) {
    return error.reason === 'forbidden'
      ? 'Dieses Konto darf keine Cover suchen (HB_ADMIN_UIDS auf dem NAS).'
      : libraryErrorMessage(error.reason)
  }
  return 'Die Suche liess sich nicht starten.'
}

/**
 * Fehlende Cover online suchen.
 *
 * Wo auf dem NAS kein Bild liegt, steht in der Bibliothek eine farbige
 * Buchstabenkachel. Für ein Kind, das noch nicht liest, ist das Buch damit
 * kaum wiederzufinden – und hunderte von Hand hochzuladen ist keine Aufgabe
 * für einen Abend.
 *
 * Gesetzt wird nur, was eindeutig passt: Reihe, Titel *und* Folgennummer
 * müssen zusammengehen. Alles andere landet hier als Vorschlag und wartet auf
 * einen Tap. Der Grund ist derselbe wie bei der Kachel: Ein falsches Cover ist
 * schlechter als gar keines – die Kachel sagt wenigstens nichts Falsches.
 */
export function CoverSearchSection() {
  const { books, client, refresh } = useLibrary()

  const [suche, setSuche] = useState<CoverSuche>(LEER)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState<string | null>(null)
  const nachfrage = useRef<ReturnType<typeof setInterval> | null>(null)

  const abfragen = useCallback(() => {
    if (!client) return
    void client
      .fetchCoverSearch()
      .then(setSuche)
      .catch(() => {
        // Ohne den Stand fehlt nur die Fortschrittszeile.
      })
  }, [client])

  useEffect(abfragen, [abfragen])

  // Während der Lauf arbeitet, bewegt sich die Zahl – danach lohnt kein
  // Nachfragen mehr.
  useEffect(() => {
    if (!suche.stand.laeuft) {
      if (nachfrage.current !== null) clearInterval(nachfrage.current)
      nachfrage.current = null
      return
    }
    nachfrage.current ??= setInterval(abfragen, NACHFRAGE_MS)
    return () => {
      if (nachfrage.current !== null) clearInterval(nachfrage.current)
      nachfrage.current = null
    }
  }, [suche.stand.laeuft, abfragen])

  const starten = (): void => {
    if (!client) return
    setFehler(null)
    void client
      .startCoverSearch()
      .then(abfragen)
      .catch((error: unknown) => {
        setFehler(fehlerText(error))
      })
  }

  const uebernehmen = (book: Book, vorschlag: CoverVorschlag): void => {
    if (!client) return
    setFehler(null)
    setLaeuft(book.id)

    void client
      .applyCoverSuggestion(book.id, vorschlag.imageUrl)
      .then(() => {
        // Der Katalog trägt die Adresse des Covers samt Version – ohne das
        // Neuladen zeigte die App weiter die Buchstabenkachel.
        refresh()
        setSuche((bisher) => {
          const { [book.id]: _weg, ...rest } = bisher.vorschlaege
          return { ...bisher, vorschlaege: rest }
        })
      })
      .catch((error: unknown) => {
        setFehler(fehlerText(error))
      })
      .finally(() => {
        setLaeuft(null)
      })
  }

  const ohneBild = books.filter((book) => book.cover === null).length
  const offene = Object.entries(suche.vorschlaege).flatMap(([bookId, vorschlaege]) => {
    const book = books.find((eintrag) => eintrag.id === bookId)
    return book === undefined ? [] : [{ book, vorschlaege }]
  })

  return (
    <section className="flex flex-col gap-4 pt-8">
      <h2 className="text-2xl font-bold">Cover online suchen</h2>

      <Notice>
        Sucht zu jedem Hörbuch ohne Bild bei Apple und MusicBrainz. Passt ein Treffer
        eindeutig – Reihe, Titel und Folgennummer –, wird er gleich gesetzt; beim Rest steht
        hier eine Auswahl. Der Lauf dauert lange, weil die Quellen um ein ruhiges Tempo
        bitten; er läuft auf dem NAS weiter, auch wenn du diese Seite schliesst.
      </Notice>

      {client === null ? (
        <Notice tone="error">Ohne Verbindung zum NAS lässt sich nichts suchen.</Notice>
      ) : null}

      {fehler !== null ? <Notice tone="error">{fehler}</Notice> : null}

      {suche.stand.hinweis !== null && !suche.stand.laeuft ? (
        <Notice tone="error">Letzte Meldung der Suche: {suche.stand.hinweis}</Notice>
      ) : null}

      {suche.stand.laeuft ? (
        <p className="text-ink-soft" aria-live="polite">
          Läuft: {suche.stand.erledigt} von {suche.stand.gesamt} Büchern,{' '}
          {suche.stand.gesetzt} gesetzt.
        </p>
      ) : (
        <p className="text-ink-soft">
          {ohneBild === 0
            ? 'Jedes Hörbuch hat ein Bild.'
            : ohneBild === 1
              ? 'Ein Hörbuch ohne Bild.'
              : `${String(ohneBild)} Hörbücher ohne Bild.`}
          {suche.stand.beendetAm !== null
            ? ` Beim letzten Lauf wurden ${String(suche.stand.gesetzt)} gesetzt.`
            : ''}
        </p>
      )}

      <BigButton
        onClick={starten}
        disabled={client === null || suche.stand.laeuft || ohneBild === 0}
      >
        {suche.stand.laeuft ? 'Sucht …' : 'Cover suchen'}
      </BigButton>

      {offene.length > 0 ? (
        <>
          <h3 className="pt-4 text-xl font-bold">
            Zur Auswahl ({offene.length} {offene.length === 1 ? 'Hörbuch' : 'Hörbücher'})
          </h3>
          <ul className="flex flex-col gap-6">
            {offene.slice(0, MAX_BUECHER).map(({ book, vorschlaege }) => (
              <li key={book.id} className="flex flex-col gap-3 rounded-tile bg-surface p-4">
                <p className="font-semibold">{bookLabel(book)}</p>
                <p className="truncate text-sm text-ink-soft">{book.folderName}</p>

                <CoverSuggestions
                  book={book}
                  vorschlaege={vorschlaege}
                  disabled={laeuft === book.id}
                  onApply={(vorschlag) => {
                    uebernehmen(book, vorschlag)
                  }}
                />
              </li>
            ))}
          </ul>
          {offene.length > MAX_BUECHER ? (
            <p className="text-ink-soft">
              Die übrigen {offene.length - MAX_BUECHER} erscheinen, sobald diese erledigt sind.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
