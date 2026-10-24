import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { BookCover } from '@/ui/BookCover'
import { CloseIcon } from '@/ui/PlayerIcons'

/**
 * Das Cover im Player – ein Tipp zeigt es über den ganzen Bildschirm.
 *
 * Im Player muss das Cover den Knöpfen Platz lassen und wird auf kleinen
 * Bildschirmen klein. Gross ansehen wollen es Kinder trotzdem: Auf dem Cover
 * steht, was gerade passiert.
 *
 * Zu geht es nur über das Kreuz (oder Escape). Ein Tipp aufs Bild selbst
 * schliesst nicht – Kinder tippen auf das, was sie ansehen, und das Bild
 * verschwände, kaum dass es da ist.
 *
 * Ohne Bild gibt es nichts zu vergrössern; die Kachel mit dem Buchstaben
 * bleibt dann, was sie ist.
 */
export function PlayerCover({
  title,
  color,
  src,
}: {
  title: string
  color: string
  src: string | null
}) {
  const [gross, setGross] = useState(false)
  const oeffner = useRef<HTMLButtonElement | null>(null)
  const kreuz = useRef<HTMLButtonElement | null>(null)

  const schliessen = useCallback((): void => {
    setGross(false)
    // Zurück auf das Cover: Wer mit Tastatur oder Vorleseprogramm bedient,
    // stünde sonst am Anfang der Seite.
    oeffner.current?.focus()
  }, [])

  useEffect(() => {
    if (!gross) return
    kreuz.current?.focus()
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') schliessen()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [gross, schliessen])

  if (src === null) {
    return (
      <div className="player-cover">
        <BookCover title={title} color={color} src={null} />
      </div>
    )
  }

  return (
    <>
      <button
        ref={oeffner}
        type="button"
        aria-label="Bild gross anzeigen"
        onClick={() => {
          setGross(true)
        }}
        className="player-cover block rounded-tile transition-transform active:scale-[0.98] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <BookCover title={title} color={color} src={src} />
      </button>

      {/*
        In den `body` und nicht an Ort und Stelle: Die Fläche ums Cover ist ein
        Grössen-Container, und der würde `fixed` auf seine eigenen Masse
        zurechtstutzen statt auf den Bildschirm.
      */}
      {gross
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Bild: ${title}`}
              className="fixed inset-0 z-30 flex items-center justify-center bg-black"
              style={{
                padding:
                  'calc(env(safe-area-inset-top, 0px) + 1rem) calc(env(safe-area-inset-right, 0px) + 1rem) calc(env(safe-area-inset-bottom, 0px) + 1rem) calc(env(safe-area-inset-left, 0px) + 1rem)',
              }}
            >
              {/* `object-contain` statt der natürlichen Grösse: Auch ein kleines
                  Cover füllt so den Bildschirm, ohne beschnitten zu werden. */}
              <img
                src={src}
                alt={title}
                draggable={false}
                className="size-full select-none object-contain"
              />

              <button
                ref={kreuz}
                type="button"
                aria-label="Bild schliessen"
                onClick={schliessen}
                className="absolute flex size-touch items-center justify-center rounded-full bg-surface text-ink shadow-lg transition-transform active:scale-95 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent"
                style={{
                  top: 'calc(env(safe-area-inset-top, 0px) + 1rem)',
                  right: 'calc(env(safe-area-inset-right, 0px) + 1rem)',
                }}
              >
                <span aria-hidden="true" className="size-1/2">
                  <CloseIcon />
                </span>
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
