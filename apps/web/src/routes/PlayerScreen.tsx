import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { useLibrary } from '@/features/library/libraryContext'
import { SKIP_SECONDS } from '@/features/player/mediaSession'
import { SleepTimerButton } from '@/features/player/SleepTimerButton'
import { usePlayer } from '@/features/player/playerContext'
import { formatCountdown, formatTime } from '@/lib/format'
import { BigLinkButton } from '@/ui/BigButton'
import { BookCover } from '@/ui/BookCover'
import { EmptyState } from '@/ui/EmptyState'
import { PlayerButton } from '@/ui/PlayerButton'
import { ProgressBar } from '@/ui/ProgressBar'
import { Screen } from '@/ui/Screen'

/**
 * Der Player.
 *
 * Grosse Knöpfe, kein ziehbarer Balken, nichts zum Kaputtmachen. Ein Kind
 * soll hier nur zwei Dinge tun: anhalten und weiterhören.
 */
export function PlayerScreen() {
  const { bookId = '' } = useParams()
  const { bookById, client } = useLibrary()
  const player = usePlayer()
  const navigate = useNavigate()

  const book = bookById(bookId)

  // Direkt aufgerufen – etwa über den Sperrbildschirm oder ein Lesezeichen –
  // startet die Seite das Buch selbst.
  useEffect(() => {
    if (book && player.book?.id !== book.id) player.playBook(book)
    // Nur beim Wechsel des Buchs, nicht bei jeder Positionsänderung.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id])

  if (!book) {
    return (
      <Screen>
        <div className="flex flex-1 items-center">
          <EmptyState
            title="Dieses Buch gibt es nicht mehr"
            action={<BigLinkButton to="/">Zum Anfang</BigLinkButton>}
          />
        </div>
      </Screen>
    )
  }

  const cover = book.cover !== null ? (client?.coverUrl(book.cover) ?? null) : null
  const remaining = Math.max(0, book.durationSec - player.positionSec)

  return (
    <Screen>
      <div className="flex items-center justify-between py-4">
        <Link
          to={`/buch/${book.id}`}
          aria-label="Zurück zum Buch"
          className="flex min-h-touch items-center gap-2 rounded-tile pr-4 text-lg focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span aria-hidden="true" className="text-3xl">
            ←
          </span>
          Zurück
        </Link>

        <SleepTimerButton />
      </div>

      <div className="mx-auto w-full max-w-xs">
        <BookCover title={book.title} color={book.coverColor} src={cover} />
      </div>

      <div className="py-6 text-center">
        <h1 className="text-2xl font-bold">{book.title}</h1>
      </div>

      <ProgressBar
        ratio={book.durationSec > 0 ? player.positionSec / book.durationSec : 0}
        label="Fortschritt im Hörbuch"
      />
      <div className="flex justify-between pt-2 pb-8 tabular-nums text-ink-soft">
        <span>{formatTime(player.positionSec)}</span>
        <span>{formatCountdown(remaining)}</span>
      </div>

      {/*
        Zwei Zeilen statt einer: Fünf Knöpfe nebeneinander bräuchten 368px plus
        die im Konzept geforderten 16px Abstand – zusammen 432px, mehr als ein
        Handy in Hochkant hergibt. Die Mindestgrössen zu unterschreiten wäre der
        falsche Ausweg, also wandert die Kapitelnavigation in eine eigene Zeile.
        Sie zeigt dort nebenbei, wo man gerade ist.
      */}
      <div className="flex items-center justify-between gap-4 pb-6">
        <PlayerButton label="Vorheriges Kapitel" onClick={player.previousChapter}>
          ⏮
        </PlayerButton>
        <p className="min-w-0 flex-1 truncate text-center text-xl text-ink-soft">
          {player.chapter?.title ?? ''}
        </p>
        <PlayerButton label="Nächstes Kapitel" onClick={player.nextChapter}>
          ⏭
        </PlayerButton>
      </div>

      <div className="flex items-center justify-center gap-6 pb-8">
        <PlayerButton
          label={`${String(SKIP_SECONDS)} Sekunden zurück`}
          onClick={() => {
            player.skip(-SKIP_SECONDS)
          }}
        >
          ↺
        </PlayerButton>
        <PlayerButton
          label={player.playing ? 'Pause' : 'Abspielen'}
          size="lg"
          onClick={player.toggle}
        >
          {player.playing ? '⏸' : '▶'}
        </PlayerButton>
        <PlayerButton
          label={`${String(SKIP_SECONDS)} Sekunden vor`}
          onClick={() => {
            player.skip(SKIP_SECONDS)
          }}
        >
          ↻
        </PlayerButton>
      </div>

      {player.error ? (
        <div className="rounded-tile bg-surface p-4 text-center">
          <p className="pb-3 text-lg">Das Hörbuch lässt sich gerade nicht laden.</p>
          <button
            type="button"
            className="min-h-touch rounded-tile px-4 underline"
            onClick={() => {
              void navigate(0)
            }}
          >
            Nochmal versuchen
          </button>
        </div>
      ) : null}
    </Screen>
  )
}
