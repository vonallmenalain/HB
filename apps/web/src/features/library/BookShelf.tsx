import { type ReactNode } from 'react'

import { type Book } from './catalog'
import { BookTile } from './BookTile'

/**
 * Ein Abschnitt der Startseite: Überschrift, Kacheln, darunter optional ein Weg
 * weiter. Immer derselbe Aufbau – damit sich die Seite beim Scrollen nicht
 * jedes Mal neu erklären muss.
 */
export function BookShelf({
  title,
  books,
  action,
}: {
  title: string
  books: readonly Book[]
  action?: ReactNode
}) {
  if (books.length === 0) return null

  return (
    <section className="pb-8">
      <h2 className="pb-3 text-xl font-bold">{title}</h2>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {books.map((book) => (
          <li key={book.id}>
            <BookTile book={book} />
          </li>
        ))}
      </ul>
      {action ? <div className="pt-4">{action}</div> : null}
    </section>
  )
}
