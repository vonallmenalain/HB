import { type KeyboardEvent, type PointerEvent, useState } from 'react'

import { formatTime } from '@/lib/format'

/**
 * Der Fortschrittsbalken zum Spulen.
 *
 * Bis M8 war er bewusst nur Anzeige – aus Sorge, ein Kind verliere beim
 * Wischen seine Stelle. In der Praxis fehlte er: Wer eine Stelle sucht, tippt
 * 30 Sekunden lang auf ⏪. Die Stelle geht dabei trotzdem nicht verloren: Der
 * Fortschritt wird laufend gesichert, und ein Sprung ist mit demselben Balken
 * sofort rückgängig zu machen.
 *
 * Gezogen wird gegen einen eigenen Wert, nicht gegen die laufende Wiedergabe –
 * sonst zöge der Daumen gegen die Sekunden an, die währenddessen weiterlaufen.
 */
export function SeekBar({
  positionSec,
  durationSec,
  onSeek,
  label,
}: {
  positionSec: number
  durationSec: number
  onSeek: (positionSec: number) => void
  label: string
}) {
  const [gezogen, setGezogen] = useState<number | null>(null)

  const max = Math.max(1, Math.round(durationSec))
  const wert = Math.min(max, Math.max(0, Math.round(gezogen ?? positionSec)))
  const anteil = (wert / max) * 100

  const springen = (): void => {
    if (gezogen === null) return
    onSeek(gezogen)
    setGezogen(null)
  }

  return (
    <input
      type="range"
      className="seek"
      min={0}
      max={max}
      step={5}
      value={wert}
      aria-label={label}
      aria-valuetext={`${formatTime(wert)} von ${formatTime(max)}`}
      style={{ '--seek-fill': `${String(anteil)}%` } as React.CSSProperties}
      onChange={(event) => {
        setGezogen(Number(event.target.value))
      }}
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
  )
}
