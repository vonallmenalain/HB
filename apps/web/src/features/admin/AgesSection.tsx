import { useMemo, useState } from 'react'

import { type Book } from '@/features/library/catalog'
import { useAges } from '@/features/library/agesContext'
import { useLibrary } from '@/features/library/libraryContext'
import { bookLabel } from '@/features/library/titles'
import {
  AGE_STEPS,
  type BookAges,
  ageLabel,
  ageLabelInSentence,
} from '@/features/profiles/access'
import { Notice } from '@/ui/Notice'
import { TextField } from '@/ui/TextField'

/** So viele einzelne Hörbücher auf einmal – darunter sucht man weiter, statt zu scrollen. */
const MAX_TREFFER = 25

function passt(book: Book, suche: string): boolean {
  const text = `${book.title} ${book.folderName} ${book.series ?? ''} ${book.group ?? ''}`
  return text.toLowerCase().includes(suche.toLowerCase())
}

/**
 * Eine Reihe, wie der Abschnitt sie zur Wahl stellt.
 *
 * `bookIds` ist genau das, was der Knopf setzt – nicht mehr. Bei einer Suche
 * sind das die Treffer der Reihe und nicht die ganze Reihe: Wer „Weihnachten"
 * sucht und dort auf „ab 12" tippt, meint die drei Weihnachtsfolgen und nicht
 * zweihundert.
 */
interface Reihe {
  name: string
  bookIds: string[]
  /** Wie viele Folgen die Reihe insgesamt hat – für „3 von 209". */
  gesamt: number
}

/** Was in dieser Reihe gerade gilt, in einem Satz. */
function standDerReihe(bookIds: readonly string[], ages: BookAges): string {
  const stufen = new Set(bookIds.map((id) => ages.get(id) ?? 0))
  const einzige = [...stufen][0]
  if (stufen.size === 1 && einzige !== undefined) return ageLabel(einzige)

  // „Gemischt" allein liesse offen, was zu tun ist – die Stufen dazu sagen es.
  return `Gemischt: ${[...stufen]
    .sort((a, b) => a - b)
    .map((stufe) => (stufe <= 0 ? 'ohne' : `ab ${String(stufe)}`))
    .join(', ')}`
}

/**
 * Baut die Reihen aus den Treffern.
 *
 * Nach dem Namen der Reihe gebündelt, nicht nach dem Ordner: Auf dem NAS liegt
 * eine Reihe oft in mehreren Ordnern („Die drei ??? Kids", darin „Mini-Fälle"),
 * und eine Freigabe gilt trotzdem für die Reihe.
 */
function reihenAus(books: readonly Book[], treffer: readonly Book[]): Reihe[] {
  const gesamt = new Map<string, number>()
  for (const book of books) {
    const name = book.series?.trim() ?? ''
    if (name !== '') gesamt.set(name, (gesamt.get(name) ?? 0) + 1)
  }

  const nachReihe = new Map<string, string[]>()
  for (const book of treffer) {
    const name = book.series?.trim() ?? ''
    if (name === '') continue
    const liste = nachReihe.get(name)
    if (liste) liste.push(book.id)
    else nachReihe.set(name, [book.id])
  }

  return [...nachReihe.entries()]
    .map(([name, bookIds]) => ({ name, bookIds, gesamt: gesamt.get(name) ?? bookIds.length }))
    .sort((a, b) => b.bookIds.length - a.bookIds.length || a.name.localeCompare(b.name, 'de'))
}

/**
 * Altersfreigabe je Hörbuch – und je Reihe.
 *
 * Die Freigabe gehört zum Buch und gilt für die ganze Familie, wie der Titel.
 * Wem sie ein Buch wegnimmt, entscheidet das Alter, das im Elternbereich beim
 * Profil steht: Ein Buch „ab 12" sieht nur, wer dort 12 oder mehr eingetragen
 * hat.
 *
 * **Die Reihe ist die Einheit, in der hier gearbeitet wird.** Hier stand
 * zuerst ein Knopf „alle hier gezeigten auf einmal" – und der griff nur auf
 * die fünfundzwanzig, die die Liste zeigte. Für „Die drei ??? ab 10" war das
 * nichts: Bei zweihundert Folgen hätte man achtmal suchen und achtmal tippen
 * müssen, ohne Anzeige, was noch fehlt. Jetzt steht die Reihe selbst da, mit
 * ihrer Zahl und mit dem, was in ihr gerade gilt.
 */
export function AgesSection() {
  const { allBooks } = useLibrary()
  const { ages, setMinAge, setMinAges } = useAges()

  const [suche, setSuche] = useState('')
  const [offen, setOffen] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState<string | null>(null)
  const [erledigt, setErledigt] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  const gesucht = suche.trim()

  const treffer = useMemo(
    () => (gesucht === '' ? allBooks : allBooks.filter((book) => passt(book, gesucht))),
    [allBooks, gesucht],
  )

  // Ohne Suche stehen alle Reihen da: Das ist die Liste, in der man seine Reihe
  // sucht, und sie ist kürzer als die der Hörbücher.
  const reihen = useMemo(() => reihenAus(allBooks, treffer), [allBooks, treffer])

  const mitFreigabe = ages.size

  const setzen = (schluessel: string, bookIds: readonly string[], minAge: number): void => {
    setFehler(null)
    setErledigt(null)
    setLaeuft(schluessel)

    void setMinAges(bookIds, minAge)
      .then(() => {
        setOffen(null)
        setErledigt(
          `${String(bookIds.length)} ${
            bookIds.length === 1 ? 'Hörbuch steht' : 'Hörbücher stehen'
          } jetzt ${ageLabelInSentence(minAge)}.`,
        )
      })
      .catch(() => {
        setFehler('Die Altersfreigabe liess sich nicht speichern.')
      })
      .finally(() => {
        setLaeuft(null)
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
      {erledigt !== null ? <Notice>{erledigt}</Notice> : null}

      <p className="text-ink-soft">
        {mitFreigabe === 0
          ? `Bisher hat keines der ${String(allBooks.length)} Hörbücher eine Altersfreigabe.`
          : `${String(mitFreigabe)} von ${String(allBooks.length)} Hörbüchern haben eine Altersfreigabe.`}
      </p>

      <TextField
        label="Reihe oder Hörbuch suchen"
        value={suche}
        onChange={(event) => {
          setSuche(event.target.value)
        }}
      />

      <section className="flex flex-col gap-3">
        <h3 className="text-xl font-bold">Reihen</h3>

        <p className="text-ink-soft">
          {gesucht === ''
            ? 'Eine Reihe auf einmal setzen – die Zahl sagt, wie viele Folgen davon betroffen sind.'
            : `${String(reihen.length)} ${
                reihen.length === 1 ? 'Reihe' : 'Reihen'
              } mit Treffern. Gesetzt wird nur, was die Suche trifft.`}
        </p>

        {reihen.length === 0 ? (
          <Notice>
            Keine Reihe gefunden. Einzelne Hörbücher ohne Reihe stehen weiter unten.
          </Notice>
        ) : null}

        <ul className="flex flex-col gap-3">
          {reihen.map((reihe) => {
            const schluessel = `reihe:${reihe.name}`
            const betroffen = reihe.bookIds.length
            const teilweise = betroffen < reihe.gesamt

            return (
              <li key={schluessel} className="flex flex-col gap-3 rounded-tile bg-surface p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-lg font-semibold">{reihe.name}</span>
                  <span className="text-sm text-ink-soft">
                    {teilweise
                      ? `${String(betroffen)} von ${String(reihe.gesamt)} Folgen`
                      : `${String(reihe.gesamt)} ${reihe.gesamt === 1 ? 'Folge' : 'Folgen'}`}
                  </span>
                </div>

                <p className="text-sm text-ink-soft">{standDerReihe(reihe.bookIds, ages)}</p>

                {offen === schluessel ? (
                  <fieldset className="flex flex-col gap-2">
                    <legend className="pb-1 font-semibold">
                      Alle {betroffen} auf einmal
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {AGE_STEPS.map((stufe) => (
                        <button
                          key={stufe}
                          type="button"
                          disabled={laeuft !== null}
                          aria-label={
                            stufe === 0
                              ? `${reihe.name}: alle ${String(betroffen)} ohne Altersfreigabe`
                              : `${reihe.name}: alle ${String(betroffen)} ab ${String(stufe)} Jahren`
                          }
                          onClick={() => {
                            setzen(schluessel, reihe.bookIds, stufe)
                          }}
                          className="min-h-touch rounded-tile bg-surface-sunken px-4 disabled:opacity-50 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                          {stufe === 0 ? 'frei' : `ab ${String(stufe)}`}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="min-h-touch self-start rounded-tile px-2 text-ink-soft underline"
                      onClick={() => {
                        setOffen(null)
                      }}
                    >
                      Abbrechen
                    </button>
                  </fieldset>
                ) : (
                  <button
                    type="button"
                    aria-label={`Altersfreigabe für ${reihe.name} ändern`}
                    className="min-h-touch self-start rounded-tile px-2 underline"
                    onClick={() => {
                      setOffen(schluessel)
                      setErledigt(null)
                      setFehler(null)
                    }}
                  >
                    {laeuft === schluessel ? 'Wird gesetzt …' : 'Ändern'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-3 pt-4">
        <h3 className="text-xl font-bold">Einzelne Hörbücher</h3>

        {gesucht === '' ? (
          <p className="text-ink-soft">
            Erst suchen: {allBooks.length} Hörbücher sind zu viele für eine Liste.
          </p>
        ) : (
          <p className="text-ink-soft">
            {treffer.length} von {allBooks.length} Hörbüchern
            {treffer.length > MAX_TREFFER ? ` – die ersten ${String(MAX_TREFFER)}` : ''}
          </p>
        )}

        <ul className="flex flex-col gap-3">
          {(gesucht === '' ? [] : treffer.slice(0, MAX_TREFFER)).map((book) => {
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
                        setFehler(null)
                        setErledigt(null)
                        void setMinAge(book.id, stufe).catch(() => {
                          setFehler('Die Altersfreigabe liess sich nicht speichern.')
                        })
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
    </section>
  )
}
