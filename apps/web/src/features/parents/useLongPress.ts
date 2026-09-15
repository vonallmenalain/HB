import { useCallback, useEffect, useRef, useState } from 'react'

/** Wie lange gedrückt werden muss, bis der Elternbereich aufgeht. */
export const LONG_PRESS_MS = 2000

/**
 * Langer Druck statt sichtbarem Link.
 *
 * Der Elternbereich soll für ein Kind nicht auffindbar sein – zwei Sekunden
 * auf den Titel zu drücken kommt niemandem in den Sinn, der nicht weiss, dass
 * es geht.
 *
 * Bewusst **nur** Zeigergesten: Ein Tastaturweg gehört an ein Element, das
 * sich auch anspringen lässt. Den stellt der Aufrufer daneben – hier
 * mitzuhorchen, sähe nach Tastaturbedienung aus, ohne eine zu sein.
 */
export function useLongPress(onLongPress: () => void, ms: number = LONG_PRESS_MS) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [aktiv, setAktiv] = useState(false)

  const abbrechen = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    setAktiv(false)
  }, [])

  const starten = useCallback(() => {
    abbrechen()
    setAktiv(true)
    timer.current = setTimeout(() => {
      timer.current = null
      setAktiv(false)
      onLongPress()
    }, ms)
  }, [abbrechen, ms, onLongPress])

  useEffect(() => abbrechen, [abbrechen])

  return {
    /** Läuft gerade ein Druck? Für eine leise Rückmeldung. */
    aktiv,
    handlers: {
      onPointerDown: starten,
      onPointerUp: abbrechen,
      onPointerLeave: abbrechen,
      onPointerCancel: abbrechen,
    },
  }
}
