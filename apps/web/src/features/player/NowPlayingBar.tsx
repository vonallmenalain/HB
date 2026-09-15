import { Link, useLocation } from 'react-router-dom'

import { usePlayer } from './playerContext'

/**
 * Schmale Leiste, solange etwas läuft.
 *
 * Ohne sie wäre der Zurück-Knopf eine Sackgasse: Das Hörbuch liefe weiter,
 * aber es gäbe keinen Weg zurück zum Player – ausser das Buch erneut zu suchen.
 */
export function NowPlayingBar() {
  const player = usePlayer()
  const location = useLocation()

  if (!player.book) return null
  if (location.pathname.startsWith('/player/')) return null

  const book = player.book

  return (
    <div className="sticky bottom-0 z-10 px-4 pb-2">
      <div className="mx-auto flex max-w-2xl items-center gap-3 rounded-tile bg-surface p-2 shadow-lg ring-2 ring-line">
        <Link
          to={`/player/${book.id}`}
          className="flex min-h-touch flex-1 items-center gap-3 rounded-tile px-2 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span
            aria-hidden="true"
            style={{ backgroundColor: book.coverColor }}
            className="size-10 shrink-0 rounded-lg"
          />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-semibold">{book.title}</span>
            <span className="truncate text-sm text-ink-soft">
              {player.chapter?.title ?? ''}
            </span>
          </span>
        </Link>

        <button
          type="button"
          aria-label={player.playing ? 'Pause' : 'Weiterhören'}
          onClick={player.toggle}
          className="flex size-touch shrink-0 items-center justify-center rounded-full bg-primary text-3xl text-on-primary focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span aria-hidden="true">{player.playing ? '⏸' : '▶'}</span>
        </button>
      </div>
    </div>
  )
}
