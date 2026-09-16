import { Notice } from '@/ui/Notice'

import { BookTile } from './BookTile'
import { SeriesTile } from './SeriesTile'
import { SUPPORTED_SCHEMA_VERSION, type Book } from './catalog'
import { buildSeries } from './grouping'
import { TILE_GRID } from './grid'

/**
 * Das Raster mit allen Reihen – erst die Reihe, dann ihre Folgen.
 *
 * Steht auf der Startseite und unter „Alle Hörbücher": Beide zeigen dasselbe,
 * und zweimal dasselbe abzutippen hiesse, dass es beim nächsten Mal nur an
 * einer Stelle geändert wird.
 */
export function LibraryGrid({
  books,
  schemaVersion,
}: {
  books: readonly Book[]
  /** Schema des Medien-Dienstes; `null`, solange keins bekannt ist. */
  schemaVersion: number | null
}) {
  /**
   * Ein zu alter Medien-Dienst kennt die Reihen nicht.
   *
   * Er liefert als „Reihe" den Ordner direkt über dem Hörbuch – bei tieferen
   * Ablagen ist das die Folge selbst, und die Übersicht bestünde aus hunderten
   * Reihen mit je einem Eintrag. Dann lieber die schlichte Liste wie früher,
   * bis der Dienst auf dem NAS erneuert ist.
   */
  const reihenBekannt = schemaVersion === null || schemaVersion >= SUPPORTED_SCHEMA_VERSION

  if (!reihenBekannt) {
    return (
      <>
        <div className="pb-4">
          <Notice>
            Der Medien-Dienst auf dem NAS kennt die Reihen noch nicht – bis er erneuert ist,
            stehen hier alle Hörbücher untereinander. Woran es liegt, steht im Elternbereich.
          </Notice>
        </div>
        <ul className={`${TILE_GRID} pb-6`}>
          {books.map((book) => (
            <li key={book.id}>
              <BookTile book={book} />
            </li>
          ))}
        </ul>
      </>
    )
  }

  return (
    <ul className={`${TILE_GRID} pb-6`}>
      {buildSeries(books).map((entry) => (
        <li key={entry.slug}>
          {/* Eine „Reihe" mit einem einzigen Hörbuch ist keine Reihe. Sie führt
              direkt zum Buch, statt einen Tap für eine Liste mit einem Eintrag
              zu kosten. */}
          {entry.books.length === 1 ? (
            <BookTile book={entry.books[0]!} />
          ) : (
            <SeriesTile series={entry} />
          )}
        </li>
      ))}
    </ul>
  )
}
