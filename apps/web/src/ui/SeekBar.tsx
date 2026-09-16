import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import { formatTime } from '@/lib/format'

/**
 * Der Fortschrittsbalken zum Spulen – hinter einem Riegel.
 *
 * Bis M8 war er bewusst nur Anzeige – aus Sorge, ein Kind verliere beim
 * Wischen seine Stelle. In der Praxis fehlte er: Wer eine Stelle sucht, tippt
 * 30 Sekunden lang auf ⏪.
 *
 * Offen liegen darf er deswegen trotzdem nicht. Er ist ein Touch-Ziel über die
 * ganze Breite und so hoch wie ein Knopf – wer den Player in der Hand hält,
 * streift ihn. Bei einem Hörbuch von zehn Stunden bedeutet ein solcher
 * Fehlgriff, dass niemand mehr weiss, wo er war: Der Fortschritt wird ja
 * laufend gesichert, und gesichert wird dann die falsche Stelle.
 *
 * Also zwei Schritte statt einem. Der Balken ist gesperrt und zeigt nur an;
 * ein Tap auf den Riegel gibt ihn frei. Danach bleibt er offen, solange man
 * ihn bedient, und schliesst sich von selbst, sobald {@link OFFEN_MS}
 * vergangen sind – sonst wäre die Sperre nach dem ersten Mal für immer weg.
 *
 * Gezogen wird gegen einen eigenen Wert, nicht gegen die laufende Wiedergabe –
 * sonst zöge der Daumen gegen die Sekunden an, die währenddessen weiterlaufen.
 */
/** Schrittweite: fein genug zum Suchen, grob genug für Pfeiltasten. */
const SCHRITT = 5

/** So lange bleibt der Balken nach der letzten Bedienung offen. */
export const OFFEN_MS = 20_000

export function SeekBar({
  positionSec,
  durationSec,
  onSeek,
  label,
  footer,
}: {
  positionSec: number
  durationSec: number
  onSeek: (positionSec: number) => void
  label: string
  /**
   * Was unter dem Balken steht – bei uns die beiden Zeitangaben.
   *
   * Hier hinein und nicht daneben, damit es auf derselben Linie beginnt wie
   * der Balken: Der Riegel davor nimmt Platz weg, und eine Zeitangabe, die
   * darunter am Rand klebt, gehört sichtbar zu nichts.
   */
  footer?: ReactNode
}) {
  const [gezogen, setGezogen] = useState<number | null>(null)
  const [offen, setOffen] = useState(false)
  const balken = useRef<HTMLInputElement | null>(null)
  const uhr = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stoppen = (): void => {
    if (uhr.current !== null) clearTimeout(uhr.current)
    uhr.current = null
  }

  const schliessen = useCallback((): void => {
    stoppen()
    setOffen(false)
    setGezogen(null)
  }, [])

  // Jede Bedienung verlängert: Wer die Stelle noch sucht, soll nicht mitten im
  // Suchen wieder ausgesperrt werden.
  const offenHalten = useCallback((): void => {
    stoppen()
    uhr.current = setTimeout(schliessen, OFFEN_MS)
  }, [schliessen])

  useEffect(() => stoppen, [])

  // Mit der Tastatur führt nichts zum Balken, wenn er gesperrt war – der Tap
  // auf den Riegel muss also auch den Weg dorthin öffnen.
  useEffect(() => {
    if (offen) balken.current?.focus()
  }, [offen])

  const max = Math.max(1, Math.round(durationSec))
  // Auf die Schrittweite gerundet: Sonst zeigte der Browser einen anderen Wert
  // an, als React gesetzt hat, und der Daumen sässe neben der Füllung.
  const roh = Math.min(max, Math.max(0, Math.round(gezogen ?? positionSec)))
  const wert = Math.min(max, Math.round(roh / SCHRITT) * SCHRITT)
  const anteil = (wert / max) * 100

  const springen = (): void => {
    if (gezogen === null) return
    onSeek(gezogen)
    setGezogen(null)
    offenHalten()
  }

  return (
    /* 16px zwischen Riegel und Balken – beide sind tappbar, KONZEPT §5.5. */
    <div className="flex items-start gap-4">
      <button
        type="button"
        aria-label={offen ? 'Spulen wieder sperren' : 'Spulen freigeben'}
        aria-pressed={offen}
        onClick={() => {
          if (offen) schliessen()
          else {
            setOffen(true)
            offenHalten()
          }
        }}
        className="flex size-touch shrink-0 items-center justify-center rounded-full border-2 border-control bg-surface text-2xl text-ink transition-transform active:scale-95 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span aria-hidden="true">{offen ? '🔓' : '🔒'}</span>
      </button>

      <div className="min-w-0 flex-1">
        <input
          ref={balken}
          type="range"
          className="seek"
          min={0}
          max={max}
          step={SCHRITT}
          value={wert}
          disabled={!offen}
          aria-label={label}
          aria-valuetext={`${formatTime(wert)} von ${formatTime(max)}`}
          style={{ '--seek-fill': `${String(anteil)}%` } as React.CSSProperties}
          onChange={(event) => {
            setGezogen(Number(event.target.value))
            offenHalten()
          }}
          onPointerDown={offenHalten}
          onPointerUp={springen}
          onPointerCancel={(event: PointerEvent<HTMLInputElement>) => {
            // Abgebrochene Geste: Die Wiedergabe bleibt, wo sie ist.
            event.preventDefault()
            setGezogen(null)
          }}
          onKeyUp={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') {
              springen()
            }
          }}
          onBlur={springen}
        />
        {footer}
      </div>
    </div>
  )
}
