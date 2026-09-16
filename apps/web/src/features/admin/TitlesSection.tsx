import { useState } from 'react'

import { type Book } from '@/features/library/catalog'
import { useLibrary } from '@/features/library/libraryContext'
import { bookLabel } from '@/features/library/titles'
import { useTitles } from '@/features/library/titlesContext'
import { BigButton } from '@/ui/BigButton'
import { Notice } from '@/ui/Notice'
import { TextField } from '@/ui/TextField'

/** So viele Treffer auf einmal – darunter sucht man weiter, statt zu scrollen. */
const MAX_TREFFER = 25

function passt(book: Book, suche: string): boolean {
  // Ohne Suchbegriff nichts: Eine Liste mit neunhundert Hörbüchern ist keine
  // Übersicht, sondern ein Bildschirm, an dem man vorbeiscrollt.
  if (suche === '') return false
  const text = `${book.title} ${book.folderName} ${book.series ?? ''} ${book.group ?? ''}`
  return text.toLowerCase().includes(suche.toLowerCase())
}

/**
 * Titel von Hand ändern.
 *
 * Die App räumt Ordnernamen automatisch auf, und in den allermeisten Fällen
 * kommt dabei etwas Lesbares heraus. Für den Rest gibt es dieses Feld: Was hier
 * steht, gilt – auf jedem Gerät und für jedes Kind.
 */
export function TitlesSection() {
  const { books } = useLibrary()
  const { titles, setTitle } = useTitles()

  const [suche, setSuche] = useState('')
  const [offen, setOffen] = useState<string | null>(null)
  const [entwurf, setEntwurf] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)

  const treffer = books.filter((book) => passt(book, suche))

  const speichern = (bookId: string, text: string): void => {
    setFehler(null)
    void setTitle(bookId, text)
      .then(() => {
        setOffen(null)
      })
      .catch(() => {
        setFehler('Der Titel liess sich nicht speichern.')
      })
  }

  return (
    <section className="flex flex-col gap-4 pt-8">
      <h2 className="text-2xl font-bold">Titel</h2>

      <Notice>
        Die Titel kommen aus den Ordnernamen auf dem NAS und werden beim Anzeigen aufgeräumt.
        Wo das danebengeht, lässt sich hier eintragen, was stattdessen stehen soll.
      </Notice>

      {fehler !== null ? <Notice tone="error">{fehler}</Notice> : null}

      <TextField
        label="Suchen"
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
          {treffer.length} von {books.length} Hörbüchern
          {treffer.length > MAX_TREFFER ? ` – die ersten ${String(MAX_TREFFER)}` : ''}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {treffer.slice(0, MAX_TREFFER).map((book) => {
          const eigener = titles.get(book.id)

          return (
            <li key={book.id} className="flex flex-col gap-2 rounded-tile bg-surface p-4">
              <div>
                <p className="font-semibold">{bookLabel(book)}</p>
                <p className="text-sm text-ink-soft">
                  {book.series ?? 'Ohne Reihe'}
                  {book.group !== null ? ` · ${book.group}` : ''}
                </p>
                {/* Was auf dem NAS steht – die Antwort auf „warum heisst das so?“ */}
                <p className="pt-1 text-sm text-ink-soft">
                  Ordner: <span className="font-mono">{book.folderName}</span>
                </p>
              </div>

              {offen === book.id ? (
                <div className="flex flex-col gap-3">
                  <TextField
                    label="Neuer Titel"
                    value={entwurf}
                    maxLength={120}
                    onChange={(event) => {
                      setEntwurf(event.target.value)
                    }}
                  />
                  <div className="flex gap-2">
                    <BigButton
                      onClick={() => {
                        speichern(book.id, entwurf)
                      }}
                    >
                      Speichern
                    </BigButton>
                    <BigButton
                      variant="secondary"
                      onClick={() => {
                        setOffen(null)
                      }}
                    >
                      Abbrechen
                    </BigButton>
                  </div>
                  {eigener !== undefined ? (
                    <button
                      type="button"
                      className="min-h-touch self-start rounded-tile px-2 text-ink-soft underline"
                      onClick={() => {
                        speichern(book.id, '')
                      }}
                    >
                      Eigenen Titel entfernen
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="min-h-touch rounded-tile px-2 underline"
                    onClick={() => {
                      setOffen(book.id)
                      setEntwurf(bookLabel(book))
                      setFehler(null)
                    }}
                  >
                    Umbenennen
                  </button>
                  {eigener !== undefined ? (
                    <span className="text-sm text-ink-soft">von Hand gesetzt</span>
                  ) : null}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
