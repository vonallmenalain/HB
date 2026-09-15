import { type Book } from '@/features/library/catalog'

/**
 * Sperrbildschirm, Kopfhörer-Tasten und Autoradio.
 *
 * Ohne die Media Session API liesse sich ein laufendes Hörbuch nur in der
 * geöffneten App bedienen – bei einer Einschlaf-App ist das der Normalfall
 * nicht. Alles hier ist optional: Fehlt die Schnittstelle, ändert sich nichts
 * ausser der Bequemlichkeit.
 */
export interface MediaSessionHandlers {
  play: () => void
  pause: () => void
  seekBackward: () => void
  seekForward: () => void
  previousChapter: () => void
  nextChapter: () => void
  seekTo: (positionSec: number) => void
}

export const SKIP_SECONDS = 30

function session(): MediaSession | null {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return null
  return navigator.mediaSession
}

export function setMediaMetadata(
  book: Book | null,
  chapterTitle: string,
  coverUrl: string | null,
): void {
  const media = session()
  if (!media) return

  if (book === null) {
    media.metadata = null
    return
  }

  media.metadata = new MediaMetadata({
    title: chapterTitle,
    // Der Buchtitel gehört auf den Sperrbildschirm an die Stelle, wo sonst das
    // Album steht – Kapitel oben, Buch darunter.
    album: book.title,
    artist: book.author ?? book.series ?? 'Hörbuch',
    artwork: coverUrl === null ? [] : [{ src: coverUrl, sizes: '600x600', type: 'image/jpeg' }],
  })
}

export function setMediaPlaybackState(playing: boolean): void {
  const media = session()
  if (!media) return
  media.playbackState = playing ? 'playing' : 'paused'
}

export function setMediaPosition(positionSec: number, durationSec: number): void {
  const media = session()
  if (!media || durationSec <= 0) return
  try {
    media.setPositionState({
      duration: durationSec,
      position: Math.min(positionSec, durationSec),
      playbackRate: 1,
    })
  } catch {
    // Manche Browser werfen bei unplausiblen Werten – die Leiste bleibt dann
    // eben ohne Fortschritt.
  }
}

export function setMediaHandlers(handlers: MediaSessionHandlers | null): void {
  const media = session()
  if (!media) return

  const actions: [MediaSessionAction, MediaSessionActionHandler | null][] =
    handlers === null
      ? [
          ['play', null],
          ['pause', null],
          ['seekbackward', null],
          ['seekforward', null],
          ['previoustrack', null],
          ['nexttrack', null],
          ['seekto', null],
        ]
      : [
          ['play', handlers.play],
          ['pause', handlers.pause],
          ['seekbackward', handlers.seekBackward],
          ['seekforward', handlers.seekForward],
          ['previoustrack', handlers.previousChapter],
          ['nexttrack', handlers.nextChapter],
          [
            'seekto',
            (details) => {
              if (typeof details.seekTime === 'number') handlers.seekTo(details.seekTime)
            },
          ],
        ]

  for (const [action, handler] of actions) {
    try {
      media.setActionHandler(action, handler)
    } catch {
      // Nicht jeder Browser kennt jede Aktion; die übrigen bleiben nutzbar.
    }
  }
}
