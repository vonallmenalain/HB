import { useState } from 'react'

import { type Book } from '@/features/library/catalog'
import { useAges } from '@/features/library/agesContext'
import { useLibrary } from '@/features/library/libraryContext'
import { bookLabel } from '@/features/library/titles'
import { AGE_STEPS, ageLabel } from '@/features/profiles/access'
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
 * Altersfreigabe je Hörbuch.
 *
 * Die Freigabe gehört zum Buch und gilt für die ganze Familie – wie der Titel.
 * Wem sie ein Buch wegnimmt, entscheidet das Alter, das im Elternbereich beim
 * Profil steht: Ein Buch „ab 12" sieht nur, wer dort 12 oder mehr eingetragen
 * hat.
 *
 * Eine ganze Reihe auf einen Schlag geht mit: Bei neunzig Folgen wäre neunzigmal
 * dasselbe anzutippen keine Einstellung, sondern eine Strafe. Der Knopf setzt
 * dabei nur, was die Suche gerade zeigt – so bleibt sichtbar, was er anfasst.
 */
export function AgesSection() {
  const { allBooks } = useLibrary()
  const { ages, setMinAge } = useAges()

  const [suche, setSuche] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)

  const treffer = allBooks.filter((book) => passt(book, suche))
  const sichtbar = treffer.slice(0, MAX_TREFFER)
  const mitFreigabe = ages.size

  const setzen = (bookId: string, minAge: number): void => {
    setFehler(null)
    void setMinAge(bookId, minAge).catch(() => {
      setFehler('Die Altersfreigabe liess sich nicht speichern.')
    })
  }

  const alleSetzen = (minAge: number): void => {
    setFehler(null)
    void Promise.all(sichtbar.map((book) => setMinAge(book.id, minAge))).catch(() => {
      setFehler('Mindestens eine Altersfreigabe liess sich nicht speichern.')
    })
  }

  return (
    <section className="flex flex-col gap-4 pt-8">
      <h2 className="text-2xl font-bold">Altersfreigabe</h2>

      <Notice>
        Was hier steht, gilt für alle Geräte. Ein Hörbuch mit Freigabe erscheint nur bei
        Profilen, bei denen im Elternbereich ein Alter eingetragen ist, das mindestens so
        hoch ist. Ohne Alter beim Profil bleibt es verborgen. Einzelne Hörbücher für ein
        einzelnes Kind sperren geht dort ebenfalls – dafür braucht es hier nichts.
      </Notice>

      {fehler !== null ? <Notice tone="error">{fehler}</Notice> : null}

      <p className="text-ink-soft">
        {mitFreigabe === 0
          ? 'Bisher hat kein Hörbuch eine Altersfreigabe.'
          : `${String(mitFreigabe)} ${
              mitFreigabe === 1 ? 'Hörbuch hat' : 'Hörbücher haben'
            } eine Altersfreigabe.`}
      </p>

      <TextField
        label="Suchen"
        value={suche}
        onChange={(event) => {
          setSuche(event.target.value)
        }}
      />

      {suche === '' ? (
        <p className="text-ink-soft">
          Erst suchen: {allBooks.length} Hörbücher sind zu viele für eine Liste. Der Name
          einer Reihe findet alle ihre Folgen auf einmal.
        </p>
      ) : (
        <>
          <p className="text-ink-soft">
            {treffer.length} von {allBooks.length} Hörbüchern
            {treffer.length > MAX_TREFFER ? ` – die ersten ${String(MAX_TREFFER)}` : ''}
          </p>

          {sichtbar.length > 1 ? (
            <fieldset className="flex flex-col gap-2 rounded-tile bg-surface p-4">
              <legend className="px-1 font-semibold">
                Alle {sichtbar.length} hier gezeigten auf einmal
              </legend>
              <div className="flex flex-wrap gap-2">
                {AGE_STEPS.map((stufe) => (
                  <button
                    key={stufe}
                    type="button"
                    onClick={() => {
                      alleSetzen(stufe)
                    }}
                    className="min-h-touch rounded-tile bg-surface-sunken px-4 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {stufe === 0 ? 'Freigeben' : `ab ${String(stufe)}`}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}
        </>
      )}

      <ul className="flex flex-col gap-3">
        {sichtbar.map((book) => {
          const gesetzt = ages.get(book.id) ?? 0

          return (
            <li key={book.id} className="flex flex-col gap-3 rounded-tile bg-surface p-4">
              <div>
                <p className="font-semibold">{bookLabel(book)}</p>
                <p className="text-sm text-ink-soft">
                  {book.series ?? 'Ohne Reihe'}
                  {book.group !== null ? ` · ${book.group}` : ''} · {ageLabel(gesetzt)}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {AGE_STEPS.map((stufe) => (
                  <button
                    key={stufe}
                    type="button"
                    aria-pressed={gesetzt === stufe}
                    aria-label={
                      stufe === 0
                        ? `${bookLabel(book)} ohne Altersfreigabe`
                        : `${bookLabel(book)} ab ${String(stufe)} Jahren`
                    }
                    onClick={() => {
                      setzen(book.id, stufe)
                    }}
                    className={`min-h-touch rounded-tile px-4 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      gesetzt === stufe
                        ? 'bg-primary font-semibold text-on-primary'
                        : 'bg-surface-sunken'
                    }`}
                  >
                    {stufe === 0 ? 'frei' : `ab ${String(stufe)}`}
                  </button>
                ))}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
