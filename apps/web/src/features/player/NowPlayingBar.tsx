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
      {/*
        Der Abstand ist 16px und nicht weniger: Zwei runde Knöpfe nebeneinander
        sind die Stelle, an der KONZEPT §5.5 („≥ 16px zwischen tappbaren
        Elementen") zählt – daneben liegt hier das Zumachen.
      */}
      <div className="mx-auto flex max-w-2xl items-center gap-4 rounded-tile bg-surface p-2 shadow-lg ring-2 ring-line">
        {/*
          `min-w-0` gehört auf jede Ebene, nicht nur auf die Schrift darunter:
          Ohne das hier ist die kleinste Breite dieses Links die volle
          Titelbreite – auf einem 390px-Handy schob das den äussersten Knopf aus
          dem Bild, statt den Titel zu kürzen. Aus demselben Grund hat der Link
          keinen eigenen Innenabstand mehr: Die 8px gehören dem Titel, die
          Leiste bringt ihren Rand mit.
        */}
        <Link
          to={`/player/${book.id}`}
          className="flex min-h-touch min-w-0 flex-1 items-center gap-3 rounded-tile focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent"
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

        {/*
          Dasselbe Viereck wie im Player (KONZEPT §5.4): anhalten und zumachen.
          Pause allein lässt die Leiste stehen, obwohl niemand mehr hört – und
          um sie loszuwerden, musste man bisher erst den Player aufmachen.
          Die Stelle geht dabei nicht verloren, sie steht danach wieder oben auf
          der Startseite unter „Weiterhören".

          Der Rand ist nicht Zierde: Ein Knopf in `bg-surface` auf einer Leiste
          in `bg-surface` wäre unsichtbar. `--color-control` ist das Token, das
          dafür die 3:1 aus WCAG 1.4.11 hält.
        */}
        <button
          type="button"
          aria-label="Anhalten und schliessen"
          onClick={player.stop}
          className="flex size-touch shrink-0 items-center justify-center rounded-full border-2 border-control bg-surface text-3xl text-ink transition-transform active:scale-95 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span aria-hidden="true">■</span>
        </button>

        <button
          type="button"
          aria-label={player.playing ? 'Pause' : 'Weiterhören'}
          onClick={player.toggle}
          className="flex size-touch shrink-0 items-center justify-center rounded-full bg-primary text-3xl text-on-primary transition-transform active:scale-95 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span aria-hidden="true">{player.playing ? '⏸' : '▶'}</span>
        </button>
      </div>
    </div>
  )
}
