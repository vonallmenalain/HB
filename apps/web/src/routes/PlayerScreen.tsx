import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { useLibrary } from '@/features/library/libraryContext'
import { SKIP_SECONDS } from '@/features/player/mediaSession'
import { PlayerCover } from '@/features/player/PlayerCover'
import { SleepTimerButton } from '@/features/player/SleepTimerButton'
import { usePlayer } from '@/features/player/playerContext'
import { formatCountdown, formatTime } from '@/lib/format'
import { BigLinkButton } from '@/ui/BigButton'
import { EmptyState } from '@/ui/EmptyState'
import { PlayerButton } from '@/ui/PlayerButton'
import {
  BackIcon,
  ForwardIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PreviousIcon,
  StopIcon,
} from '@/ui/PlayerIcons'
import { SeekBar } from '@/ui/SeekBar'
import { Screen } from '@/ui/Screen'

/**
 * Der Player.
 *
 * Grosse Knöpfe, nichts zum Kaputtmachen. Ein Kind soll hier vor allem zwei
 * Dinge tun: anhalten und weiterhören. Wer eine bestimmte Stelle sucht, zieht
 * am Balken oder springt in 30-Sekunden-Schritten.
 *
 * Gescrollt wird hier nie. Alle Knöpfe stehen immer im Bild, auf jedem
 * Bildschirm: Auf dem Tablet im Querformat lag der Play-Knopf früher unter
 * dem Rand, und ein Kind sucht ihn dort nicht. Platz macht das Cover – es
 * bekommt, was die Knöpfe übrig lassen. Im Querformat steht es neben den
 * Knöpfen statt darüber, und wo selbst das nicht reicht, rücken die Knöpfe
 * zusammen (`.player` in index.css).
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
    <Screen wide fit>
      {/*
        Hochformat: so breit wie jede andere Seite. Querformat: die ganze
        Breite, denn dort stehen Cover und Knöpfe nebeneinander.
      */}
      <div className="player mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col quer:max-w-none">
        <div className="flex shrink-0 items-center justify-between py-2">
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

        <div className="flex min-h-0 flex-1 flex-col gap-(--player-gap) quer:flex-row quer:gap-8">
          {/*
            Die Fläche fürs Cover. `min-h-0`/`min-w-0`, damit sie schrumpfen
            darf – sonst behauptete das Cover seine volle Grösse und schöbe die
            Knöpfe aus dem Bild.
            Bei einem Fehler steht hier die Meldung: Das Cover hilft dann
            nicht weiter, und so bleibt auch dafür Platz, ohne dass die Seite
            länger wird.
          */}
          <div className="player-cover-area flex min-h-0 min-w-0 flex-1 items-center justify-center">
            {player.error ? (
              <div className="max-h-full overflow-hidden rounded-tile bg-surface p-4 text-center">
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
            ) : (
              <PlayerCover title={book.title} color={book.coverColor} src={cover} />
            )}
          </div>

          <div className="flex shrink-0 flex-col justify-center gap-(--player-gap) quer:w-[min(30rem,55%)]">
            {/* Höchstens zwei Zeilen: Ein Ordnername vom NAS kann lang sein,
                und jede weitere Zeile ginge den Knöpfen ab. */}
            <h1 className="line-clamp-2 text-center text-2xl font-bold">{book.title}</h1>

            <SeekBar
              positionSec={player.positionSec}
              durationSec={book.durationSec}
              onSeek={player.seekTo}
              label="Stelle im Hörbuch"
              footer={
                <div className="flex justify-between tabular-nums text-ink-soft">
                  <span>{formatTime(player.positionSec)}</span>
                  <span>{formatCountdown(remaining)}</span>
                </div>
              }
            />

            {/*
              Zwei Zeilen statt einer: Fünf Knöpfe nebeneinander bräuchten 368px
              plus die im Konzept geforderten 16px Abstand – zusammen 432px,
              mehr als ein Handy in Hochkant hergibt. Die Mindestgrössen zu
              unterschreiten wäre der falsche Ausweg, also wandert die
              Kapitelnavigation in eine eigene Zeile. Sie zeigt dort nebenbei,
              wo man gerade ist.
            */}
            <div className="flex items-center justify-between gap-4">
              <PlayerButton label="Vorheriges Kapitel" onClick={player.previousChapter}>
                <PreviousIcon />
              </PlayerButton>
              <p className="min-w-0 flex-1 truncate text-center text-xl text-ink-soft">
                {player.chapter?.title ?? ''}
              </p>
              <PlayerButton label="Nächstes Kapitel" onClick={player.nextChapter}>
                <NextIcon />
              </PlayerButton>
            </div>

            <div className="flex items-center justify-center gap-6">
              <PlayerButton
                label={`${String(SKIP_SECONDS)} Sekunden zurück`}
                onClick={() => {
                  player.skip(-SKIP_SECONDS)
                }}
              >
                <BackIcon seconds={SKIP_SECONDS} />
              </PlayerButton>
              <PlayerButton
                label={player.playing ? 'Pause' : 'Abspielen'}
                size="lg"
                onClick={player.toggle}
              >
                {player.playing ? <PauseIcon /> : <PlayIcon />}
              </PlayerButton>
              <PlayerButton
                label={`${String(SKIP_SECONDS)} Sekunden vor`}
                onClick={() => {
                  player.skip(SKIP_SECONDS)
                }}
              >
                <ForwardIcon seconds={SKIP_SECONDS} />
              </PlayerButton>
            </div>

            {/*
              Schluss für heute: anhalten und zumachen. Ohne diesen Knopf bliebe
              die Leiste am unteren Rand stehen, obwohl niemand mehr hört – und
              der einzige Weg, sie loszuwerden, wäre die App neu zu starten.
              Die Stelle geht dabei nicht verloren: Sie steht danach wieder oben
              auf der Startseite unter „Weiterhören".
            */}
            <div className="flex justify-center">
              <PlayerButton
                label="Anhalten und schliessen"
                onClick={() => {
                  player.stop()
                  void navigate(`/buch/${book.id}`)
                }}
              >
                <StopIcon />
              </PlayerButton>
            </div>
          </div>
        </div>
      </div>
    </Screen>
  )
}
